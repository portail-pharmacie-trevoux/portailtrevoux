// Explicit HTTPS origins for this Scalingo app only. No Host/forwarded-header
// inference, wildcard, suffix matching, HTTP downgrade or canonical URL change.
export const scalingoAllowedOrigins=Object.freeze([
 'https://portailplus-hds.osc-fr1.scalingo.io',
 'https://portailplus-officine.fr',
 'https://www.portailplus-officine.fr'
]);
export const isScalingoOrigin=origin=>scalingoAllowedOrigins.includes(origin);
