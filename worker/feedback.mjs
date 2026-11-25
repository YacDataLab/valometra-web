// Retour anonyme sur une estimation : aucune adresse, aucune coordonnée, aucun identifiant.
import { json, readBody, isSameOriginJson } from './http.mjs';

const VERDICTS = ['trop_bas', 'juste', 'trop_haut'];
const HOURLY_LIMIT = 300;
const PRICE_RANGE = [10000, 5000000];

// Nombre dans l'intervalle, sinon null.
function inRange(value, min, max) {
  const n = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const roundToThousand = n => Math.round(n / 1000) * 1000;

// Champs validés et arrondis (prix au millier), ou null si le retour est invalide.
export function feedbackFields(body) {
  if (!body || typeof body !== 'object' || !VERDICTS.includes(body.verdict)) return null;
  if (typeof body.town_code !== 'string' || !/^\d{5}$/.test(body.town_code)) return null;
  const surface = inRange(body.surface, 9, 500),
    rooms = inRange(body.rooms, 1, 15),
    estimate = inRange(body.estimate, ...PRICE_RANGE);
  if (surface === null || rooms === null || estimate === null) return null;
  const hasActual = body.actual !== undefined && body.actual !== null,
    actual = hasActual ? inRange(body.actual, ...PRICE_RANGE) : null;
  if (hasActual && actual === null) return null;
  return {
    verdict: body.verdict,
    town_code: body.town_code,
    surface: Math.round(surface),
    rooms: Math.round(rooms),
    estimate: roundToThousand(estimate),
    actual: actual === null ? null : roundToThousand(actual),
  };
}

export async function saveFeedback({ request, env }) {
  if (!env.DB) return json({ error: 'Le retour est momentanément indisponible.' }, 503);
  if (!isSameOriginJson(request)) return json({ error: 'Requête non autorisée.' }, 403);
  let fields;
  try {
    fields = feedbackFields(await readBody(request));
  } catch {
    fields = null;
  }
  if (!fields) return json({ error: 'Retour invalide.' }, 400);
  const since = new Date(Date.now() - 3600000).toISOString(),
    recent = await env.DB.prepare('SELECT COUNT(*) AS total FROM feedback WHERE created_at > ?')
      .bind(since)
      .first();
  // Plafond global (aucune donnée personnelle ne permet de limiter par visiteur).
  if (recent.total >= HOURLY_LIMIT)
    return json({ error: 'Trop de retours reçus. Réessayez plus tard.' }, 429);
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
  return json({ saved: true }, 201);
}

// Résumé réservé au gestionnaire : décompte par avis et 50 derniers retours.
export async function feedbackSummary({ env }) {
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
  return json({
    counts: Object.fromEntries(counts.results.map(row => [row.verdict, row.total])),
    rows: rows.results,
  });
}
