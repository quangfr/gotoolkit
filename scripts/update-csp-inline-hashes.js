const fs = require("fs");
const path = require("path");

const { APP_CSP, APP_CSP_META, normalize, parseCsp, stripFrameAncestors } = require("./csp-common");
const { INLINE_HASH_FILES, collectUnionInlineHashes } = require("./csp-inline-hashes");

const repoRoot = path.resolve(__dirname, "..");
const APP_CSP_TARGETS = ["public/index.html", "public/grid.html", "public/mobile.html"];

function abs(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readFile(relativePath) {
  return fs.readFileSync(abs(relativePath), "utf8");
}

function writeFile(relativePath, content) {
  fs.writeFileSync(abs(relativePath), content, "utf8");
}

function setScriptSrcHashes(policy, hashes) {
  const directives = parseCsp(policy || "");
  const scriptTokens = directives.get("script-src");
  if (!scriptTokens || !scriptTokens.length) {
    throw new Error("Missing script-src directive in CSP");
  }
  const nonHashes = scriptTokens.filter(token => !/^'sha256-[A-Za-z0-9+/=]+'$/.test(token));
  directives.set("script-src", nonHashes.concat(hashes));
  return Array.from(directives.entries())
    .map(([name, tokens]) => `${name} ${tokens.join(" ")}`.trim())
    .join("; ");
}

function updateCspMetaInHtml(html, nextPolicy) {
  const tagRegex = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i;
  const tagMatch = html.match(tagRegex);
  if (!tagMatch) throw new Error("Missing CSP meta tag");
  const oldTag = tagMatch[0];
  if (!/content="([^"]*)"/i.test(oldTag)) {
    throw new Error("Missing CSP content attribute");
  }
  const nextTag = oldTag.replace(/content="([^"]*)"/i, `content="${nextPolicy}"`);
  return html.replace(oldTag, nextTag);
}

function updateCspCommon(nextPolicy) {
  const file = "scripts/csp-common.js";
  const source = readFile(file);
  const escaped = nextPolicy.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const next = source.replace(/const APP_CSP = "([\s\S]*?)";/, `const APP_CSP = "${escaped}";`);
  if (!/const APP_CSP = "([\s\S]*?)";/.test(source)) {
    throw new Error("Failed to locate APP_CSP in scripts/csp-common.js");
  }
  if (next !== source) {
    writeFile(file, next);
  }
}

function updateHtmlFiles(nextMetaPolicy) {
  for (const file of APP_CSP_TARGETS) {
    const source = readFile(file);
    const next = updateCspMetaInHtml(source, nextMetaPolicy);
    writeFile(file, next);
  }
}

function updateFirebase(nextPolicy) {
  const file = "firebase.json";
  const config = JSON.parse(readFile(file));
  const hostings = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
  for (const hosting of hostings.filter(Boolean)) {
    for (const group of hosting.headers || []) {
      if (group?.source !== "**/*.html" && group?.source !== "/") continue;
      for (const header of group.headers || []) {
        if (header?.key === "Content-Security-Policy") {
          header.value = nextPolicy;
        }
      }
    }
  }
  writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
}

function main() {
  const hashes = collectUnionInlineHashes(readFile, INLINE_HASH_FILES);
  const nextPolicy = normalize(setScriptSrcHashes(APP_CSP, hashes));
  const nextMetaPolicy = normalize(stripFrameAncestors(nextPolicy));
  updateCspCommon(nextPolicy);
  updateHtmlFiles(nextMetaPolicy || APP_CSP_META);
  updateFirebase(nextPolicy);
  console.log(`Updated inline CSP hashes (${hashes.length}) across csp-common, HTML mirrors, and firebase.json`);
}

main();
