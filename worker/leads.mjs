// Demandes d'accompagnement. La création est fermée : restent la lecture, le suivi et la suppression.
import { json, readBody, cleanText } from './http.mjs';
import { csvResponse, leadsCsv } from './csv.mjs';
import { parseProperty } from './property.mjs';

export const LEAD_STATUSES = ['nouveau', 'a_contacter', 'contacte', 'rendez_vous', 'termine'];
const PAGE_SIZE = 30;
const EXPORT_LIMIT = 10000;
const MAX_OFFSET = 10000;
const MAX_NOTES_LENGTH = 4000;

// Ligne SQL -> objet de l'API. Notes et consentement sont réservés au gestionnaire.
function decodeLead(row, admin) {
  const lead = {
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
    lead.notes = row.notes;
    lead.consentAt = row.consent_at;
    lead.consentVersion = row.consent_version;
  }
  return lead;
}

export const closedSubmissions = () =>
  json({ error: 'Les nouvelles demandes sont fermées.' }, 410);

// --- Espace du demandeur : ses propres demandes uniquement.

export async function listOwn({ env, user }) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM leads WHERE requester_id = ? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(user.id)
    .all();
  return json({ rows: results.map(row => decodeLead(row, false)) });
}

export async function deleteOwn({ env, user, params }) {
  await env.DB.prepare('DELETE FROM leads WHERE id = ? AND requester_id = ?')
    .bind(params.id, user.id)
    .run();
  return json({ deleted: true });
}

// --- Espace du gestionnaire.

// Filtres de la liste et de l'export : clause SQL et paramètres liés.
function leadFilters(searchParams) {
  const status = searchParams.get('status') || '',
    search = cleanText(searchParams.get('q'), 100),
    where = [],
    args = [];
  if (LEAD_STATUSES.includes(status)) {
    where.push('status = ?');
    args.push(status);
  }
  if (search) {
    // Les jokers % et _ saisis par le gestionnaire sont cherchés tels quels.
    where.push(
      "(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR property_json LIKE ? ESCAPE '\\')",
    );
    const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
    args.push(pattern, pattern, pattern, pattern);
  }
  return { clause: where.length ? ' WHERE ' + where.join(' AND ') : '', args };
}

export async function listLeads({ env, url }) {
  const { clause, args } = leadFilters(url.searchParams),
    offset = Math.max(0, Math.min(MAX_OFFSET, parseInt(url.searchParams.get('offset')) || 0)),
    rows = await env.DB.prepare(
      `SELECT * FROM leads${clause} ORDER BY created_at DESC LIMIT ${PAGE_SIZE} OFFSET ?`,
    )
      .bind(...args, offset)
      .all(),
    count = await env.DB.prepare('SELECT COUNT(*) AS total FROM leads' + clause)
      .bind(...args)
      .first();
  return json({
    rows: rows.results.map(row => decodeLead(row, true)),
    total: count.total,
    offset,
    limit: PAGE_SIZE,
  });
}

export async function exportLeads({ env, url }) {
  const { clause, args } = leadFilters(url.searchParams),
    { results } = await env.DB.prepare(
      `SELECT * FROM leads${clause} ORDER BY created_at DESC LIMIT ${EXPORT_LIMIT}`,
    )
      .bind(...args)
      .all();
  return csvResponse(leadsCsv(results));
}

export async function updateLead({ request, env, params }) {
  let body;
  try {
    body = await readBody(request);
  } catch {
    return json({ error: 'Données invalides.' }, 400);
  }
  if (
    !body ||
    typeof body !== 'object' ||
    !LEAD_STATUSES.includes(body.status) ||
    typeof body.notes !== 'string' ||
    body.notes.length > MAX_NOTES_LENGTH
  )
    return json({ error: 'Statut ou notes invalides.' }, 400);
  const existing = await env.DB.prepare('SELECT id FROM leads WHERE id = ?')
    .bind(params.id)
    .first();
  if (!existing) return json({ error: 'Demande introuvable.' }, 404);
  await env.DB.prepare('UPDATE leads SET status = ?, notes = ?, updated_at = ? WHERE id = ?')
    .bind(body.status, body.notes, new Date().toISOString(), params.id)
    .run();
  return json({ saved: true });
}

export async function deleteLead({ env, params }) {
  await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(params.id).run();
  return json({ deleted: true });
}
