// API : table des routes et contrôles d'accès communs.
// Ajouter une route : une ligne dans ROUTES, son gestionnaire dans le module du domaine concerné.
import { identity, isAdmin } from './auth.mjs';
import { json, isSameOriginJson, UUID } from './http.mjs';
import { saveFeedback, feedbackSummary } from './feedback.mjs';
import {
  closedSubmissions,
  listOwn,
  deleteOwn,
  listLeads,
  exportLeads,
  updateLead,
  deleteLead,
} from './leads.mjs';

async function health({ env }) {
  try {
    await env.DB.prepare('SELECT id FROM leads LIMIT 1').all();
    return json({ storageReady: true });
  } catch {
    return json({ storageReady: false }, 503);
  }
}

const session = ({ request, user, env }) =>
  json({ signedIn: Boolean(user.id), admin: isAdmin(request, env) });

// `open` : accessible sans connexion. Les autres routes exigent une identité et une base ;
// celles sous /api/admin/ exigent en plus le gestionnaire.
const ROUTES = [
  { method: 'GET', path: '/api/session', open: true, handle: session },
  { method: 'GET', path: '/api/health', open: true, handle: health },
  { method: 'POST', path: '/api/feedback', open: true, handle: saveFeedback },
  { method: 'GET', path: '/api/admin/feedback', handle: feedbackSummary },
  { method: 'POST', path: '/api/leads', handle: closedSubmissions },
  { method: 'GET', path: '/api/my-requests', handle: listOwn },
  { method: 'DELETE', path: `/api/my-requests/:id`, handle: deleteOwn },
  { method: 'GET', path: '/api/admin/leads', handle: listLeads },
  { method: 'GET', path: '/api/admin/leads/export', handle: exportLeads },
  { method: 'PATCH', path: '/api/admin/leads/:id', handle: updateLead },
  { method: 'DELETE', path: '/api/admin/leads/:id', handle: deleteLead },
].map(route => ({
  ...route,
  pattern: new RegExp('^' + route.path.replace(':id', `(?<id>${UUID})`) + '$', 'i'),
}));

function findRoute(method, pathname) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(pathname);
    if (match) return { route, params: { ...match.groups } };
  }
  return null;
}

const errors = {
  signIn: 'Connectez-vous pour accéder à cet espace ou envoyer votre demande.',
  storage: 'L’enregistrement est momentanément indisponible.',
  admin: 'Accès réservé au gestionnaire.',
  origin: 'Requête non autorisée.',
  notFound: 'Page introuvable.',
};

export async function api(request, env) {
  const url = new URL(request.url),
    user = identity(request),
    found = findRoute(request.method, url.pathname);
  const context = { request, env, url, user, params: found?.params ?? {} };
  if (found?.route.open) return found.route.handle(context);
  if (!user.id) return json({ error: errors.signIn }, 401);
  if (!env.DB) return json({ error: errors.storage }, 503);
  if (url.pathname.startsWith('/api/admin/') && !isAdmin(request, env))
    return json({ error: errors.admin }, 403);
  if (!['GET', 'HEAD'].includes(request.method) && !isSameOriginJson(request))
    return json({ error: errors.origin }, 403);
  if (!found) return json({ error: errors.notFound }, 404);
  return found.route.handle(context);
}
