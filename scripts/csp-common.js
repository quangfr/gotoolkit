const APP_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com https://unpkg.com; frame-src 'self' https://challenges.cloudflare.com https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
const NOT_FOUND_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action 'self'";

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseCsp(cspString) {
  const directives = new Map();
  for (const part of normalize(cspString).split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const [name, ...sources] = tokens;
    directives.set(name, sources);
  }
  return directives;
}

module.exports = {
  APP_CSP,
  NOT_FOUND_CSP,
  normalize,
  parseCsp,
};
