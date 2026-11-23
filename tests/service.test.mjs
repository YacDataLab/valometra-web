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
  database.exec(readFileSync(new URL('../drizzle/0000_leads.sql', import.meta.url), 'utf8'));
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
  assert.deepEqual(mine.rows.map(row => row.id), [first]);
  assert.equal((await request('/api/my-requests/' + second, { id: 'alice', method: 'DELETE' })).status, 200);
  assert.equal(database.prepare('SELECT id FROM leads WHERE id = ?').get(second).id, second);
  assert.equal((await request('/api/my-requests/' + first, { id: 'alice', method: 'DELETE', source: 'https://elsewhere.example' })).status, 403);
  assert.equal((await request('/api/my-requests/' + first, { id: 'alice', method: 'DELETE' })).status, 200);
  assert.equal(database.prepare('SELECT id FROM leads WHERE id = ?').get(first), undefined);
  database.close();
});

test('admin authorization, payload validation and closed submissions', async () => {
  const { request, database } = fixture();
  assert.equal((await request('/api/admin/leads', { id: 'alice' })).status, 403);
  const admin = { id: 'manager', email: 'admin@example.test' };
  assert.equal((await request('/api/admin/leads', admin)).status, 200);
  assert.equal((await request('/api/admin/leads/' + first, { ...admin, method: 'PATCH', body: 'null' })).status, 400);
  assert.equal((await request('/api/leads', { id: 'alice', method: 'POST', body: '{}' })).status, 410);
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
