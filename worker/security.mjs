// En-têtes de sécurité des pages statiques.
// Politique de sécurité du contenu : sources autorisées = celles que l'application
// utilise réellement (moteur Pyodide sur jsDelivr, géocodage IGN, BDNB, ADEME, fonds de
// carte Plan IGN). Aucun script en ligne n'est autorisé.
// Toute nouvelle source externe doit être ajoutée ici, avec son test.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: https://data.geopf.fr",
  "connect-src 'self' https://cdn.jsdelivr.net https://data.geopf.fr https://api.bdnb.io https://data.ademe.fr",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders = {
  'Content-Security-Policy': contentSecurityPolicy,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};
