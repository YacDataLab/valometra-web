import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from '../dist/server/index.js';

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const origin = 'https://valometra.example';

function fixture() {
  const database = new DatabaseSync(':memory:');
  for (const file of ['0000_leads', '0001_feedback'])
    database.exec(readFileSync(new URL(`../drizzle/${file}.sql`, import.meta.url), 'utf8'));
  const insert = database.prepare(`INSERT INTO leads
    (id, requester_id, created_at, updated_at, name, consent_at, consent_version)
    VALUES (?, ?, '2026-01-01', '2026-01-01', ?, '2026-01-01', 'test')`);
  insert.run(first, 'alice', 'Alice');
  insert.run(second, 'bob', 'Bob');
  const env = {
    ADMIN_EMAIL: 'admin@example.test',
    DB: {
      prepare(sql) {
        const statement = database.prepare(sql);
        return {
          bind: (...args) => ({
            all: async () => ({ results: statement.all(...args) }),
            first: async () => statement.get(...args),
            run: async () => statement.run(...args),
          }),
        };
      },
    },
  };

  function request(path, { id, email, method = 'GET', source = origin, body } = {}) {
    const headers = { 'Content-Type': 'application/json', Origin: source };
    if (id) headers['oai-authenticated-user-id'] = id;
    if (email) headers['oai-authenticated-user-email'] = email;
    return worker.fetch(new Request(origin + path, { method, headers, body }), env);
  }
  return { request, database };
}

test('private requests are scoped to their owner', async () => {
  const { request, database } = fixture();
  assert.equal((await request('/api/my-requests')).status, 401);
  const mine = await (await request('/api/my-requests', { id: 'alice' })).json();
  assert.deepEqual(
    mine.rows.map(row => row.id),
    [first],
  );
  assert.equal(
    (await request('/api/my-requests/' + second, { id: 'alice', method: 'DELETE' })).status,
    200,
  );
  assert.equal(database.prepare('SELECT id FROM leads WHERE id = ?').get(second).id, second);
  assert.equal(
    (
      await request('/api/my-requests/' + first, {
        id: 'alice',
        method: 'DELETE',
        source: 'https://elsewhere.example',
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/api/my-requests/' + first, { id: 'alice', method: 'DELETE' })).status,
    200,
  );
  assert.equal(database.prepare('SELECT id FROM leads WHERE id = ?').get(first), undefined);
  database.close();
});

test('admin authorization, payload validation and closed submissions', async () => {
  const { request, database } = fixture();
  assert.equal((await request('/api/admin/leads', { id: 'alice' })).status, 403);
  const admin = { id: 'manager', email: 'admin@example.test' };
  assert.equal((await request('/api/admin/leads', admin)).status, 200);
  assert.equal(
    (await request('/api/admin/leads/' + first, { ...admin, method: 'PATCH', body: 'null' }))
      .status,
    400,
  );
  assert.equal(
    (await request('/api/leads', { id: 'alice', method: 'POST', body: '{}' })).status,
    410,
  );
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM leads').get().total, 2);
  database.close();
});

test('the published HTML contains the required estimation fields and no contact form', async () => {
  const { request, database } = fixture();
  const page = await request('/');
  assert.equal(page.status, 200);
  const text = await page.text();
  assert.match(text, /id="estimate-form"/);
  for (const id of ['address', 'surface', 'rooms', 'surface-definition']) {
    assert.match(text, new RegExp('id="' + id + '"[^>]* required'));
  }
  assert.doesNotMatch(text, /envisagez de vendre|lead-form|leads\.js/i);
  database.close();
});

test('a corrupted property column does not break the admin list or export', async () => {
  const { request, database } = fixture();
  const admin = { id: 'manager', email: 'admin@example.test' };
  database.prepare("UPDATE leads SET property_json = '{not json' WHERE id = ?").run(first);
  const list = await request('/api/admin/leads', admin);
  assert.equal(list.status, 200);
  const rows = (await list.json()).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(row => row.id === first).property, {});
  assert.equal((await request('/api/admin/leads/export', admin)).status, 200);
  database.close();
});

test('the session endpoint tells the page whether to show the private space link', async () => {
  const { request, database } = fixture();
  const admin = { id: 'manager', email: 'admin@example.test' };
  assert.deepEqual(await (await request('/api/session', admin)).json(), {
    signedIn: true,
    admin: true,
  });
  assert.deepEqual(await (await request('/api/session', { id: 'alice' })).json(), {
    signedIn: true,
    admin: false,
  });
  assert.deepEqual(await (await request('/api/session')).json(), {
    signedIn: false,
    admin: false,
  });
  database.close();
});

const goodFeedback = {
  verdict: 'trop_haut',
  town_code: '38185',
  surface: 64.6,
  rooms: 3,
  estimate: 154751,
  actual: 140400,
};

test('anyone can send an anonymous feedback, stored without address or identity', async () => {
  const { request, database } = fixture();
  const response = await request('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ ...goodFeedback, adresse: '12 rue Secrète', email: 'a@b.fr' }),
  });
  assert.equal(response.status, 201);
  const row = database.prepare('SELECT * FROM feedback').get();
  assert.deepEqual(Object.keys(row).sort(), [
    'actual',
    'created_at',
    'estimate',
    'id',
    'rooms',
    'surface',
    'town_code',
    'verdict',
  ]);
  assert.equal(row.surface, 65);
  assert.equal(row.estimate, 155000);
  assert.equal(row.actual, 140000);
});

test('feedback is validated, origin-checked and rate-limited', async () => {
  const { request, database } = fixture();
  const send = (data, extra = {}) =>
    request('/api/feedback', { method: 'POST', body: JSON.stringify(data), ...extra });
  assert.equal((await send({ ...goodFeedback, verdict: 'nul' })).status, 400);
  assert.equal((await send({ ...goodFeedback, town_code: 'abc' })).status, 400);
  assert.equal((await send({ ...goodFeedback, surface: 5000 })).status, 400);
  assert.equal((await send({ ...goodFeedback, actual: 'beaucoup' })).status, 400);
  assert.equal((await send(null)).status, 400);
  assert.equal((await send(goodFeedback, { source: 'https://evil.example' })).status, 403);
  assert.equal((await send({ ...goodFeedback, actual: null })).status, 201);
  assert.equal(database.prepare('SELECT COUNT(*) AS n FROM feedback').get().n, 1);
  const insert = database.prepare(
    "INSERT INTO feedback (id, created_at, verdict, town_code, surface, rooms, estimate) VALUES (?, ?, 'juste', '38185', 60, 3, 150000)",
  );
  const now = new Date().toISOString();
  for (let i = 0; i < 300; i++) insert.run('r' + i, now);
  assert.equal((await send(goodFeedback)).status, 429);
});

test('only the manager reads the feedback summary', async () => {
  const { request } = fixture();
  await request('/api/feedback', { method: 'POST', body: JSON.stringify(goodFeedback) });
  assert.equal((await request('/api/admin/feedback')).status, 401);
  assert.equal((await request('/api/admin/feedback', { id: 'alice' })).status, 403);
  const summary = await (
    await request('/api/admin/feedback', { id: 'a', email: 'admin@example.test' })
  ).json();
  assert.deepEqual(summary.counts, { trop_haut: 1 });
  assert.equal(summary.rows.length, 1);
  assert.equal('id' in summary.rows[0], false);
});

test('static pages carry a strict content security policy', async () => {
  const { request } = fixture();
  for (const path of ['/', '/index.html', '/app.js', '/sw.js']) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    const csp = response.headers.get('Content-Security-Policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    // Aucun script en ligne ni eval JavaScript : seul le WebAssembly de Pyodide est autorisé.
    const scripts = csp.split('; ').find(d => d.startsWith('script-src'));
    assert.ok(!scripts.includes('unsafe-inline') && !scripts.includes("'unsafe-eval'"), scripts);
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(response.headers.get('Permissions-Policy'), /geolocation=\(\)/);
  }
});

test('the manager search treats % and _ as plain characters', async () => {
  const { request } = fixture();
  const admin = { id: 'a', email: 'admin@example.test' };
  const total = async q =>
    (await (await request('/api/admin/leads?q=' + encodeURIComponent(q), admin)).json()).total;
  assert.equal(await total('Ali'), 1);
  assert.equal(await total('%'), 0);
  assert.equal(await total('_'), 0);
  assert.equal(await total('A_ice'), 0);
});

test('every external host named in the scripts is allowed by the content security policy', async () => {
  const { request } = fixture();
  const csp = (await request('/')).headers.get('Content-Security-Policy');
  const allowed = [...csp.matchAll(/https:\/\/[a-z0-9.-]+/g)].map(m => m[0]);
  for (const file of [
    'app.js',
    'estimate.js',
    'market.js',
    'map.js',
    'address.js',
    'enrichment.js',
    'inference-worker.js',
  ]) {
    const source = readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
    // Les liens d'attribution (href="…") ne sont pas des requêtes du navigateur.
    const hosts = [...source.matchAll(/(?<!href=")'(https:\/\/[a-z0-9.-]+)/g)].map(m => m[1]);
    for (const host of hosts) assert.ok(allowed.includes(host), `${file} : ${host}`);
  }
});
