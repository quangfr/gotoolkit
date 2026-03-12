const fs = require("fs");
const path = require("path");

const { APP_CSP, APP_CSP_META, NOT_FOUND_CSP, normalize, stripFrameAncestors } = require("./csp-common");
const {
  INLINE_HASH_FILES,
  collectUnionInlineHashes,
  getScriptSrcHashesFromPolicy,
} = require("./csp-inline-hashes");

const repoRoot = path.resolve(__dirname, "..");

const APP_HTML_FILES = [
  "public/index.html",
  "public/grid.html",
  "public/home.html",
  "public/mobile.html",
];

const SPECIAL_CASES = [
  {
    file: "public/legal.html",
    expected: "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com https://unpkg.com https://gotoolkit.fr; frame-src 'self' https://challenges.cloudflare.com https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { file: "public/404.html", expected: NOT_FOUND_CSP },
];

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function extractMetaCsp(html, file) {
  const tagMatch = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i);
  if (!tagMatch) {
    throw new Error(`Missing CSP meta tag in ${file}`);
  }

  const contentMatch = tagMatch[0].match(/content="([^"]*)"/i);
  if (!contentMatch) {
    throw new Error(`Missing CSP content attribute in ${file}`);
  }

  return normalize(contentMatch[1]);
}

function getFirebasePolicies() {
  const firebaseConfig = JSON.parse(readFile("firebase.json"));
  const hostingEntries = Array.isArray(firebaseConfig.hosting) ? firebaseConfig.hosting : [firebaseConfig.hosting];
  const policyEntries = [];

  for (const hosting of hostingEntries.filter(Boolean)) {
    for (const headerGroup of hosting.headers || []) {
      for (const header of headerGroup.headers || []) {
        if (header.key === "Content-Security-Policy") {
          policyEntries.push({
            source: headerGroup.source,
            value: normalize(header.value),
          });
        }
      }
    }
  }

  return policyEntries;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} does not match the canonical CSP.\nExpected: ${expected}\nActual:   ${actual}`);
  }
}

function main() {
  for (const file of APP_HTML_FILES) {
    if (!fileExists(file)) continue;
    const actual = stripFrameAncestors(extractMetaCsp(readFile(file), file));
    const expected = APP_CSP_META;
    assertEqual(actual, expected, `${file} CSP`);
  }

  for (const entry of SPECIAL_CASES) {
    const actual = stripFrameAncestors(extractMetaCsp(readFile(entry.file), entry.file));
    const expected = stripFrameAncestors(entry.expected);
    assertEqual(actual, expected, `${entry.file} CSP`);
  }

  const firebasePolicies = getFirebasePolicies();
  const htmlHeader = firebasePolicies.find((entry) => entry.source === "**/*.html");
  const rootHeader = firebasePolicies.find((entry) => entry.source === "/");

  if (!htmlHeader || !rootHeader) {
    throw new Error("firebase.json is missing required Hosting CSP headers for **/*.html or /");
  }

  assertEqual(htmlHeader.value, APP_CSP, "firebase.json **/*.html CSP");
  assertEqual(rootHeader.value, APP_CSP, "firebase.json / CSP");

  const requiredInlineHashes = collectUnionInlineHashes(readFile, INLINE_HASH_FILES);
  const policyHashes = new Set(getScriptSrcHashesFromPolicy(APP_CSP));
  const missing = requiredInlineHashes.filter(hash => !policyHashes.has(hash));
  if (missing.length) {
    throw new Error(
      `APP_CSP is missing ${missing.length} inline script hash(es):\n`
      + missing.join("\n")
      + "\nRun: npm run csp:inline:sync"
    );
  }

  console.log(`CSP definitions are aligned. Inline hashes verified (${requiredInlineHashes.length}).`);
}

main();
