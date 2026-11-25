// Identité du visiteur, telle qu'injectée par la passerelle Sites.
// Ces en-têtes ne sont fiables que derrière cette passerelle (voir README, « Espace de suivi »).
export const identity = request => ({
  id: request.headers.get('oai-authenticated-user-id'),
  email: (request.headers.get('oai-authenticated-user-email') || '').toLowerCase(),
});

// Le gestionnaire est identifié par le secret de plateforme ADMIN_EMAIL, jamais présent dans le code.
export function isAdmin(request, env) {
  const { id, email } = identity(request);
  return Boolean(id && env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.trim().toLowerCase());
}
