const APP_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-hashes' https://cdn.jsdelivr.net https://unpkg.com https://challenges.cloudflare.com 'sha256-6FaGFcbYZxx58vmrbPvI4JVzxtCXpL0AyxtAy5kI738=' 'sha256-7dUBoc5tQpl5ed8FgNTuBd4as9f/VrUc0FHeWzeM3f8=' 'sha256-8p4qdJO42I5DlnHoNjJMaBb8ROcjBu94Pr6KZVYPEMI=' 'sha256-9vntAi16gKiGTdkBDERnP6zPl4PaJjFxCXNIEkziKFA=' 'sha256-BcC4XAYbxMMVMRif8/Sl6zQlrBwG6kIcw76lPL34mhE=' 'sha256-K6cO2UgoOXOxJ9tXwWbQjuXKhUfE/nbXFPoj6gi6syk=' 'sha256-R4CtG5jThkUzYCoEd1d0hGd34ln9p5bxSa7jIfPm2SQ=' 'sha256-UWnDXWCy9VH+rZ1fjR5jq4Qlq2HvlPDPzTpXmGwAmdg=' 'sha256-VKK6lEf6nQHZro00swh/wSJGEGLzxcrWBJ+kHls6ivA=' 'sha256-boNN535nL7jZ/45V0zX6BDbPMHCSIgCLAK/8PXoFLh4=' 'sha256-jhXvcz8VxnvxdP6ajaspQmz3iYvWCf3OgCwGLpppQvc=' 'sha256-l/qVAnEeM3lH1i6if6KcKBJz4OkkzMIvcl22//DWLXI=' 'sha256-mEg9PB6vzONp8uEgP059OBneKXUwDER/XMqoIzMOPvY=' 'sha256-pyUnfluFvlvO23hnXn/iFyOMax1IkpvHkiPWEi9aH8k=' 'sha256-ru/zD7qPA2ZA9rqWYNkaI9vE/+NbRjcfOg3xHkSwfzk=' 'sha256-wtEiKdQg1mih5Dzu8KMTvS4f5HRGL1HaKyW6rR9RXLI=' 'sha256-yDUcqxYLbr11amQKEjDrK0K6cODX/KrQSl1WV5acgdk='; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com https://unpkg.com; frame-src 'self' https://challenges.cloudflare.com https:; frame-ancestors 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
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

function stripFrameAncestors(policy) {
  const normalized = normalize(policy || "");
  if (!normalized) return normalized;
  const parts = normalized
    .split(";")
    .map((part) => normalize(part))
    .filter(Boolean)
    .filter((part) => !/^frame-ancestors\b/i.test(part));
  return normalize(parts.join("; "));
}

const APP_CSP_META = stripFrameAncestors(APP_CSP);

module.exports = {
  APP_CSP,
  APP_CSP_META,
  NOT_FOUND_CSP,
  normalize,
  parseCsp,
  stripFrameAncestors,
};
