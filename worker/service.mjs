// Point d'entrée du Worker : l'API sous /api/, les fichiers statiques ailleurs.
// Les modules voisins sont assemblés en un seul fichier par scripts/build.py.
import { json } from './http.mjs';
import { api } from './router.mjs';
import { serveAsset } from './assets.mjs';

export async function handle(request, env, assets) {
  if (new URL(request.url).pathname.startsWith('/api/')) {
    try {
      return await api(request, env);
    } catch {
      return json({ error: 'L’opération n’a pas abouti. Réessayez dans quelques instants.' }, 503);
    }
  }
  return serveAsset(request, env, assets);
}
