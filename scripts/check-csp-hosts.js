const fs = require("fs");
const path = require("path");

const { APP_CSP, parseCsp } = require("./csp-common");

const repoRoot = path.resolve(__dirname, "..");
const URL_REGEX = /https:\/\/[^\s"'`<>)\]} ;,]+/g;
const DIRECTIVES = ["script-src", "style-src", "font-src", "connect-src", "frame-src", "img-src", "media-src", "worker-src"];
const SCAN_ROOTS = ["public", "src"];
const IGNORE_SUFFIXES = [".map", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".woff", ".woff2", ".ttf"];

function walk(dirPath, files = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function shouldSkipFile(filePath) {
  return IGNORE_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
}

function classifyDirective(line, url) {
  const lower = line.toLowerCase();
  const lowerUrl = url.toLowerCase();

  if (lower.includes("content-security-policy") || lower.includes("font-src") || lower.includes("script-src") || lower.includes("style-src") || lower.includes("connect-src")) {
    return null;
  }
  if (lower.includes("go_toolkit_") || lower.includes("default_api_base") || lower.includes("token_url") || lower.includes("endpoint")) return "connect-src";
  if (lower.includes("font-src") || /\.(woff2?|ttf)(\?|$)/.test(lowerUrl) || lowerUrl.includes("excalidraw-assets/")) return "font-src";
  if (lower.includes("<script") || lower.includes("script.src") || lower.includes("await import(") || lower.includes("import(")) return "script-src";
  if (lower.includes("rel=\"stylesheet\"") || lower.includes("rel='stylesheet'") || lower.includes("styles/") || lower.includes(".css")) return "style-src";
  if (lower.includes("<iframe") || lower.includes("embedurl") || lower.includes("allowfullscreen")) return "frame-src";
  if (lower.includes("<img") || lower.includes("image") || lower.includes(".png") || lower.includes(".jpg") || lower.includes(".jpeg") || lower.includes(".gif") || lower.includes(".webp") || lower.includes(".svg")) return "img-src";
  if (lower.includes("<video") || lower.includes("<audio") || lower.includes("media") || lower.includes(".mp4") || lower.includes(".webm") || lower.includes(".mp3") || lower.includes(".wav")) return "media-src";
  if (lower.includes("new worker(") || lower.includes("sharedworker(") || lower.includes("serviceworker.register(")) return "worker-src";
  if (lower.includes("fetch(") || lower.includes("xmlhttprequest") || lower.includes(".open(") || lower.includes("api_url") || lower.includes("api base") || lower.includes("endpoint")) return "connect-src";
  return "connect-src";
}

function sourceAllowsUrl(sources, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (err) {
    return false;
  }

  const origin = parsed.origin;
  const schemeSource = `${parsed.protocol}`;

  return sources.some((source) => {
    if (source === "'self'") return false;
    if (source === schemeSource) return true;
    return source === origin || source === url;
  });
}

function main() {
  const directives = parseCsp(APP_CSP);
  const findings = [];

  for (const root of SCAN_ROOTS) {
    const fullRoot = path.join(repoRoot, root);
    if (!fs.existsSync(fullRoot)) continue;

    for (const filePath of walk(fullRoot)) {
      if (shouldSkipFile(filePath)) continue;
      const relativePath = path.relative(repoRoot, filePath);
      const text = fs.readFileSync(filePath, "utf8");
      const lines = text.split(/\r?\n/);

      lines.forEach((line, index) => {
        const matches = line.match(URL_REGEX);
        if (!matches) return;
        for (const rawUrl of matches) {
          const directive = classifyDirective(line, rawUrl);
          if (!directive || !DIRECTIVES.includes(directive)) continue;
          const allowed = sourceAllowsUrl(directives.get(directive) || [], rawUrl);
          if (allowed) continue;
          findings.push({
            file: relativePath,
            line: index + 1,
            directive,
            url: rawUrl,
          });
        }
      });
    }
  }

  if (!findings.length) {
    console.log("No CSP host mismatches found in scanned browser code.");
    return;
  }

  console.error("Potential CSP host mismatches:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.directive} -> ${finding.url}`);
  }
  process.exitCode = 1;
}

main();
