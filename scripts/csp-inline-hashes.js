const crypto = require("crypto");
const { parseCsp } = require("./csp-common");

const INLINE_HASH_FILES = [
  "public/index.html",
  "public/grid.html",
  "public/mobile.html",
];

function normalizeScriptBody(value) {
  return String(value || "").replace(/\r\n/g, "\n");
}

function collectInlineScriptHashes(html) {
  const source = String(html || "");
  const hashes = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(source))) {
    const attrs = String(match[1] || "");
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const body = normalizeScriptBody(match[2] || "");
    if (!body.trim()) continue;
    const digest = crypto.createHash("sha256").update(body, "utf8").digest("base64");
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
}

function collectUnionInlineHashes(readFile, files = INLINE_HASH_FILES) {
  const unique = new Set();
  for (const file of files) {
    const html = readFile(file);
    for (const hash of collectInlineScriptHashes(html)) unique.add(hash);
  }
  return Array.from(unique).sort();
}

function getScriptSrcHashesFromPolicy(policy) {
  const directives = parseCsp(policy || "");
  const values = directives.get("script-src") || [];
  return values.filter(token => /^'sha256-[A-Za-z0-9+/=]+'$/.test(token));
}

module.exports = {
  INLINE_HASH_FILES,
  collectInlineScriptHashes,
  collectUnionInlineHashes,
  getScriptSrcHashesFromPolicy,
};

