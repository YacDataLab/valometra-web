// Service des fichiers statiques de public/, embarqués dans le Worker par scripts/build.py.
import { identity, isAdmin } from './auth.mjs';
import { securityHeaders } from './security.mjs';

const PRIVATE_PAGES = ['/admin.html', '/my-requests.html'];
const SIGN_IN = '/signin-with-chatgpt';

// Polices, Leaflet, charte et pictogrammes changent rarement : une journée de cache, puis revalidation.
const isStable = path => /^\/(fonts|vendor|brand)\//.test(path) || path === '/icons.svg';

const cacheControl = (path, privatePage) =>
  privatePage
    ? 'no-store'
    : isStable(path)
      ? 'public, max-age=86400, must-revalidate'
      : 'public, max-age=0, must-revalidate';

const signIn = (url, returnTo) =>
  Response.redirect(`${url.origin}${SIGN_IN}?return_to=${encodeURIComponent(returnTo)}`, 302);

// URL publique -> fichier ; null si l'accès est refusé et que `denied` contient la réponse.
function resolvePage(request, env, url) {
  const path = url.pathname;
  if (path === '/gestion' || path === '/admin.html') {
    if (!identity(request).id) return { denied: signIn(url, '/gestion') };
    if (!isAdmin(request, env))
      return {
        denied: new Response('Accès réservé au gestionnaire.', {
          status: 403,
          headers: { 'Cache-Control': 'no-store' },
        }),
      };
    return { path: '/admin.html' };
  }
  if (path === '/mes-demandes' || path === '/my-requests.html') {
    if (!identity(request).id) return { denied: signIn(url, '/mes-demandes') };
    return { path: '/my-requests.html' };
  }
  return { path: path === '/' ? '/index.html' : path };
}

export function serveAsset(request, env, assets) {
  const url = new URL(request.url),
    { path, denied } = resolvePage(request, env, url);
  if (denied) return denied;
  const asset = assets[path];
  if (!asset || !['GET', 'HEAD'].includes(request.method))
    return new Response('Page introuvable', { status: 404 });
  const privatePage = PRIVATE_PAGES.includes(path);
  if (!privatePage && request.headers.get('If-None-Match') === asset.etag)
    return new Response(null, { status: 304 });
  // Les fichiers binaires (polices, images) sont décodés une fois, puis gardés en mémoire.
  asset.bytes ??= asset.binary
    ? Uint8Array.from(atob(asset.data), c => c.charCodeAt(0))
    : asset.data;
  return new Response(request.method === 'HEAD' ? null : asset.bytes, {
    headers: {
      'Content-Type': asset.type,
      'Cache-Control': cacheControl(path, privatePage),
      ETag: asset.etag,
      ...securityHeaders,
    },
  });
}
