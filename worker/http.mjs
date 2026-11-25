// Utilitaires HTTP partagés par les routes de l'API.
const MAX_BODY_LENGTH = 12000;

// Réponse JSON : jamais mise en cache, jamais interprétée comme autre chose que du JSON.
export const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

// Lit un corps JSON de taille bornée ; lève une erreur s'il est trop grand ou invalide.
export async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_LENGTH) throw Error('body');
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) throw Error('body');
  return JSON.parse(text);
}

// Écriture acceptée seulement depuis le site lui-même, avec un corps JSON.
export function isSameOriginJson(request) {
  const { origin } = new URL(request.url);
  return (
    request.headers.get('Origin') === origin &&
    request.headers.get('Content-Type')?.split(';')[0] === 'application/json'
  );
}

// Texte nettoyé et borné ; toute autre valeur devient une chaîne vide.
export const cleanText = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

// Motif d'un identifiant de demande (UUID), à insérer dans les routes.
export const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
