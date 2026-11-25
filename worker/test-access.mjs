import { createHash, timingSafeEqual } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest();

export default {
  fetch(request, env) {
    const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
    const { TEST_PASSWORD_OWNER: owner, TEST_PASSWORD_YACINE: yacine } = env;
    if (!owner || !yacine || owner === yacine) {
      return new Response('Accès de test indisponible.', { status: 503, headers });
    }
    const match = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(request.headers.get('Authorization') || '');
    if (match && match[1].length <= 1024) {
      const supplied = digest(Buffer.from(match[1], 'base64'));
      const ownerMatches = timingSafeEqual(supplied, digest(`valometra:${owner}`));
      const yacineMatches = timingSafeEqual(supplied, digest(`yacine:${yacine}`));
      if (ownerMatches || yacineMatches) {
        return env.ASSETS.fetch(request).then(asset => {
          const response = new Response(asset.body, asset);
          for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
          return response;
        });
      }
    }
    headers['WWW-Authenticate'] = 'Basic realm="Valometra test"';
    return new Response('Connexion requise.', { status: 401, headers });
  },
};
