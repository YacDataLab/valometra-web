// Politique de sécurité du contenu : sources autorisées = celles que l'application
// utilise réellement (moteur Pyodide sur jsDelivr, géocodage IGN, BDNB, ADEME, fonds de
// carte OpenStreetMap, polices Google). Aucun script en ligne n'est autorisé.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: https://tile.openstreetmap.org",
  "connect-src 'self' https://cdn.jsdelivr.net https://data.geopf.fr https://api.bdnb.io https://data.ademe.fr",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const securityHeaders = {
  'Content-Security-Policy': contentSecurityPolicy,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
const verdicts = ['trop_bas', 'juste', 'trop_haut'];
const statusValues = ['nouveau', 'a_contacter', 'contacte', 'rendez_vous', 'termine'];
const j = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
const identity = r => ({
  id: r.headers.get('oai-authenticated-user-id'),
  email: (r.headers.get('oai-authenticated-user-email') || '').toLowerCase(),
});
export const isAdmin = (r, env) =>
  Boolean(
    identity(r).id && env.ADMIN_EMAIL && identity(r).email === env.ADMIN_EMAIL.trim().toLowerCase(),
  );
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const uuid = v =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function parseProperty(json) {
  try {
    const value = JSON.parse(json || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
function decode(row, admin) {
  const r = {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    timeline: row.timeline,
    message: row.message,
    status: row.status,
    property: parseProperty(row.property_json),
  };
  if (admin) {
    r.notes = row.notes;
    r.consentAt = row.consent_at;
    r.consentVersion = row.consent_version;
  }
  return r;
}
async function body(request) {
  if (Number(request.headers.get('Content-Length')) > 12000) throw Error('body');
  const t = await request.text();
  if (t.length > 12000) throw Error('body');
  return JSON.parse(t);
}
function validMutation(request) {
  const u = new URL(request.url),
    origin = request.headers.get('Origin');
  return (
    origin === u.origin && request.headers.get('Content-Type')?.split(';')[0] === 'application/json'
  );
}
// Retour anonyme sur une estimation : aucune adresse, aucune coordonnée, aucun identifiant.
function feedbackFields(b) {
  const num = (v, min, max) => {
    const n = typeof v === 'number' ? v : Number.NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };
  if (!b || typeof b !== 'object' || !verdicts.includes(b.verdict)) return null;
  if (typeof b.town_code !== 'string' || !/^\d{5}$/.test(b.town_code)) return null;
  const surface = num(b.surface, 9, 500),
    rooms = num(b.rooms, 1, 15),
    estimate = num(b.estimate, 10000, 5000000);
  if (surface === null || rooms === null || estimate === null) return null;
  const hasActual = b.actual !== undefined && b.actual !== null;
  const actual = hasActual ? num(b.actual, 10000, 5000000) : null;
  if (hasActual && actual === null) return null;
  return {
    verdict: b.verdict,
    town_code: b.town_code,
    surface: Math.round(surface),
    rooms: Math.round(rooms),
    estimate: Math.round(estimate / 1000) * 1000,
    actual: actual === null ? null : Math.round(actual / 1000) * 1000,
  };
}
const FEEDBACK_HOURLY_LIMIT = 300;
async function saveFeedback(request, env) {
  if (!env.DB) return j({ error: 'Le retour est momentanément indisponible.' }, 503);
  if (!validMutation(request)) return j({ error: 'Requête non autorisée.' }, 403);
  let fields;
  try {
    fields = feedbackFields(await body(request));
  } catch {
    fields = null;
  }
  if (!fields) return j({ error: 'Retour invalide.' }, 400);
  const since = new Date(Date.now() - 3600000).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS total FROM feedback WHERE created_at > ?')
    .bind(since)
    .first();
  // Plafond global (aucune donnée personnelle ne permet de limiter par visiteur).
  if (recent.total >= FEEDBACK_HOURLY_LIMIT)
    return j({ error: 'Trop de retours reçus. Réessayez plus tard.' }, 429);
  await env.DB.prepare(
    'INSERT INTO feedback (id, created_at, verdict, town_code, surface, rooms, estimate, actual) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      crypto.randomUUID(),
      new Date().toISOString(),
      fields.verdict,
      fields.town_code,
      fields.surface,
      fields.rooms,
      fields.estimate,
      fields.actual,
    )
    .run();
  return j({ saved: true }, 201);
}

export async function api(request, env) {
  const url = new URL(request.url),
    path = url.pathname,
    user = identity(request);
  if (path === '/api/session' && request.method === 'GET')
    return j({ signedIn: Boolean(user.id), admin: isAdmin(request, env) });
  if (path === '/api/health' && request.method === 'GET') {
    try {
      await env.DB.prepare('SELECT id FROM leads LIMIT 1').all();
      return j({ storageReady: true });
    } catch {
      return j({ storageReady: false }, 503);
    }
  }
  if (path === '/api/feedback' && request.method === 'POST') return saveFeedback(request, env);
  if (!user.id)
    return j({ error: 'Connectez-vous pour accéder à cet espace ou envoyer votre demande.' }, 401);
  if (!env.DB) return j({ error: 'L’enregistrement est momentanément indisponible.' }, 503);
  if (path.startsWith('/api/admin/') && !isAdmin(request, env))
    return j({ error: 'Accès réservé au gestionnaire.' }, 403);
  if (!['GET', 'HEAD'].includes(request.method) && !validMutation(request))
    return j({ error: 'Requête non autorisée.' }, 403);
  if (path === '/api/admin/feedback' && request.method === 'GET') {
    const counts = await env.DB.prepare(
        'SELECT verdict, COUNT(*) AS total FROM feedback GROUP BY verdict',
      )
        .bind()
        .all(),
      rows = await env.DB.prepare(
        'SELECT created_at, verdict, town_code, surface, rooms, estimate, actual FROM feedback ORDER BY created_at DESC LIMIT 50',
      )
        .bind()
        .all();
    return j({
      counts: Object.fromEntries(counts.results.map(r => [r.verdict, r.total])),
      rows: rows.results,
    });
  }
  if (path === '/api/leads' && request.method === 'POST')
    return j({ error: 'Les nouvelles demandes sont fermées.' }, 410);
  if (path === '/api/my-requests' && request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT * FROM leads WHERE requester_id = ? ORDER BY created_at DESC LIMIT 100',
    )
      .bind(user.id)
      .all();
    return j({ rows: rows.results.map(r => decode(r, false)) });
  }
  const own = path.match(/^\/api\/my-requests\/([0-9a-f-]+)$/i);
  if (own && request.method === 'DELETE' && uuid(own[1])) {
    await env.DB.prepare('DELETE FROM leads WHERE id = ? AND requester_id = ?')
      .bind(own[1], user.id)
      .run();
    return j({ deleted: true });
  }
  if (
    (path === '/api/admin/leads' || path === '/api/admin/leads/export') &&
    request.method === 'GET'
  ) {
    const status = url.searchParams.get('status') || '',
      search = text(url.searchParams.get('q'), 100),
      offset = Math.max(0, Math.min(10000, parseInt(url.searchParams.get('offset')) || 0)),
      where = [],
      args = [];
    if (statusValues.includes(status)) {
      where.push('status = ?');
      args.push(status);
    }
    if (search) {
      // Les jokers % et _ saisis par le gestionnaire sont cherchés tels quels.
      where.push(
        "(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR property_json LIKE ? ESCAPE '\\')",
      );
      const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
      for (let i = 0; i < 4; i++) args.push(pattern);
    }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    if (path.endsWith('/export')) {
      const data = await env.DB.prepare(
        'SELECT * FROM leads' + clause + ' ORDER BY created_at DESC LIMIT 10000',
      )
        .bind(...args)
        .all();
      const cell = v => {
        let s = String(v ?? '');
        if (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const rows = [
        [
          'Date',
          'Nom',
          'Email',
          'Téléphone',
          'Profil',
          'Horizon',
          'Statut',
          'Adresse',
          'Surface',
          'Estimation indicative',
          'Message',
          'Notes',
          'Consentement',
        ],
        ...data.results.map(r => {
          const p = parseProperty(r.property_json);
          return [
            r.created_at,
            r.name,
            r.email,
            r.phone,
            r.role,
            r.timeline,
            r.status,
            p.address,
            p.surface,
            p.point,
            r.message,
            r.notes,
            r.consent_at,
          ];
        }),
      ];
      return new Response('\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n'), {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': 'attachment; filename="valometra-demandes.csv"',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const rows = await env.DB.prepare(
        'SELECT * FROM leads' + clause + ' ORDER BY created_at DESC LIMIT 30 OFFSET ?',
      )
        .bind(...args, offset)
        .all(),
      count = await env.DB.prepare('SELECT COUNT(*) AS total FROM leads' + clause)
        .bind(...args)
        .first();
    return j({
      rows: rows.results.map(r => decode(r, true)),
      total: count.total,
      offset,
      limit: 30,
    });
  }
  const item = path.match(/^\/api\/admin\/leads\/([0-9a-f-]+)$/i);
  if (item && uuid(item[1])) {
    if (request.method === 'PATCH') {
      let b;
      try {
        b = await body(request);
      } catch {
        return j({ error: 'Données invalides.' }, 400);
      }
      if (
        !b ||
        typeof b !== 'object' ||
        !statusValues.includes(b.status) ||
        typeof b.notes !== 'string' ||
        b.notes.length > 4000
      )
        return j({ error: 'Statut ou notes invalides.' }, 400);
      const old = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(item[1]).first();
      if (!old) return j({ error: 'Demande introuvable.' }, 404);
      await env.DB.prepare('UPDATE leads SET status = ?, notes = ?, updated_at = ? WHERE id = ?')
        .bind(b.status, b.notes, new Date().toISOString(), item[1])
        .run();
      return j({ saved: true });
    }
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(item[1]).run();
      return j({ deleted: true });
    }
  }
  return j({ error: 'Page introuvable.' }, 404);
}
export async function handle(request, env, assets) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    try {
      return await api(request, env);
    } catch {
      return j({ error: 'L’opération n’a pas abouti. Réessayez dans quelques instants.' }, 503);
    }
  }
  let path = url.pathname;
  if (path === '/gestion' || path === '/admin.html') {
    if (!identity(request).id)
      return Response.redirect(url.origin + '/signin-with-chatgpt?return_to=%2Fgestion', 302);
    if (!isAdmin(request, env))
      return new Response('Accès réservé au gestionnaire.', {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      });
    path = '/admin.html';
  }
  if (path === '/mes-demandes' || path === '/my-requests.html') {
    if (!identity(request).id)
      return Response.redirect(url.origin + '/signin-with-chatgpt?return_to=%2Fmes-demandes', 302);
    path = '/my-requests.html';
  }
  if (path === '/') path = '/index.html';
  const asset = assets[path];
  if (!asset || !['GET', 'HEAD'].includes(request.method))
    return new Response('Page introuvable', { status: 404 });
  const privatePage = ['/admin.html', '/my-requests.html'].includes(path);
  if (!privatePage && request.headers.get('If-None-Match') === asset.etag)
    return new Response(null, { status: 304 });
  const data = asset.binary ? Uint8Array.from(atob(asset.data), c => c.charCodeAt(0)) : asset.data;
  return new Response(request.method === 'HEAD' ? null : data, {
    headers: {
      'Content-Type': asset.type,
      'Cache-Control': privatePage ? 'no-store' : 'public, max-age=0, must-revalidate',
      ETag: asset.etag,
      ...securityHeaders,
    },
  });
}
