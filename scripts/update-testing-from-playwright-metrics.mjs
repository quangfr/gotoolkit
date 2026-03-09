import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.env.PW_SUITE_METRICS_ROOT_DIR || ".");
const metricsPath = path.resolve(process.argv[2] || path.join(rootDir, ".tmp", "playwright-suite-metrics.json"));
const testingDocPath = path.join(rootDir, "docs", "TESTING.md");

const tierMap = {
  "Tier 1": [
    "cloud-switch-persist.spec.ts",
    "cloud-sync-persist.spec.ts",
    "microsoft-oauth-proxy.spec.ts"
  ],
  "Tier 1b": [
    "private-switch-persist.spec.ts",
    "cloud-rapid-switch-large.spec.ts",
    "cloud-draft-archive-ops.spec.ts",
    "cloud-private-transfer-sync.spec.ts",
    "cloud-spacecode-bootstrap.spec.ts"
  ],
  "Tier 2": [
    "cloud-history-explicit-sync.spec.ts",
    "memo-history-isolation.spec.ts",
    "excalidraw-regression.spec.ts"
  ],
  "Tier 3": [
    "space-code-rotate.spec.ts"
  ]
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function formatDateTime(isoValue) {
  const date = new Date(isoValue);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function totalTests(counts) {
  return Number(counts.passed || 0) + Number(counts.failed || 0) + Number(counts.skipped || 0);
}

function testLabel(count) {
  return `${count} test${count === 1 ? "" : "s"}`;
}

function suiteStatus(counts) {
  if (counts.failed > 0) return "failing";
  if (counts.passed > 0) return "passing";
  return "skipped";
}

function countsSummary(counts) {
  return `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`;
}

function inferScopeLabel(suiteNames) {
  const normalized = [...suiteNames].sort();
  for (const [tierName, specs] of Object.entries(tierMap)) {
    const target = [...specs].sort();
    if (target.length === normalized.length && target.every((spec, index) => spec === normalized[index])) {
      return tierName;
    }
  }
  const allSuites = Object.values(tierMap).flat().sort();
  if (allSuites.length === normalized.length && allSuites.every((spec, index) => spec === normalized[index])) {
    return "Full suite";
  }
  return normalized.join(" + ");
}

function autoDetail(counts, kind = "suite") {
  const suffix = "Auto-synced from Playwright suite metrics.";
  if (counts.failed > 0) {
    return kind === "tier"
      ? `Latest run has failures. ${suffix}`
      : `Latest run failed. ${suffix}`;
  }
  if (counts.skipped > 0 && counts.passed > 0) {
    return `Latest run passed with ${counts.skipped} skipped. ${suffix}`;
  }
  if (counts.skipped > 0) {
    return `Latest run skipped. ${suffix}`;
  }
  return `Latest run passed. ${suffix}`;
}

function updateLatestRunBlock(content, metrics, scopeLabel) {
  const replacement = [
    "Latest targeted Playwright run:",
    "",
    `- \`Last execution\`: \`${formatDateTime(metrics.summary.finishedAt)}\``,
    `- \`Scope\`: \`${scopeLabel}\``,
    `- \`Execution length\`: \`${testLabel(totalTests(metrics.summary.counts))}\``,
    `- \`Execution time\`: \`${formatDuration(metrics.summary.durationMs)}\``,
    `- \`Result\`: \`${countsSummary(metrics.summary.counts)}\``,
    `- \`Details\`: \`${autoDetail(metrics.summary.counts, "tier")}\``
  ].join("\n");
  return content.replace(/Latest targeted Playwright run:\n(?:\n|- .*\n)+?(?=\nTier suites:)/, `${replacement}\n`);
}

function updateTierResult(content, tierName, suites, finishedAt) {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  let durationMs = 0;
  for (const suite of suites) {
    counts.passed += suite.counts.passed;
    counts.failed += suite.counts.failed;
    counts.skipped += suite.counts.skipped;
    durationMs += suite.durationMs;
  }
  const line = `  - results: \`${countsSummary(counts)}\` (\`${testLabel(totalTests(counts))}\`, \`${formatDuration(durationMs)}\`) on \`${formatDateTime(finishedAt)}\``;
  const tierLinePattern = new RegExp("(^- `" + escapeRegex(tierName) + "`.*\\n)([\\s\\S]*?)(^  - results: ).*$", "m");
  content = content.replace(tierLinePattern, (_, head, middle, prefix) => `${head}${middle}${prefix}${line.slice("  - results: ".length)}`);
  const tierDetailPattern = new RegExp("(^- `" + escapeRegex(tierName) + "`.*\\n(?:[\\s\\S]*?)^  - details: ).*$", "m");
  return content.replace(tierDetailPattern, (_, prefix) => `${prefix}\`${autoDetail(counts, "tier")}\``);
}

function updateSuiteResult(content, suite, finishedAt) {
  const suiteName = path.basename(suite.file);
  const line = `    - results: \`${suiteStatus(suite.counts)}\` (\`${testLabel(totalTests(suite.counts))}\`, \`${formatDuration(suite.durationMs)}\`) on \`${formatDateTime(finishedAt)}\``;
  const escaped = escapeRegex(suiteName);
  const pattern = new RegExp("(^\\s*- `" + escaped + "`\\n(?:.*\\n)*?^\\s*- description: .*\\n)(^\\s*- results: ).*$", "m");
  content = content.replace(pattern, (_, head, prefix) => `${head}${prefix}${line.trimStart().slice("- results: ".length)}`);
  const detailPattern = new RegExp("(^\\s*- `" + escaped + "`\\n(?:.*\\n)*?^\\s*- details: ).*$", "m");
  return content.replace(detailPattern, (_, prefix) => `${prefix}\`${autoDetail(suite.counts)}\``);
}

if (!fs.existsSync(metricsPath)) {
  console.error(`Metrics file not found: ${metricsPath}`);
  process.exit(1);
}
if (!fs.existsSync(testingDocPath)) {
  console.error(`Testing doc not found: ${testingDocPath}`);
  process.exit(1);
}

const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
const suiteNames = metrics.suites.map((suite) => path.basename(suite.file));
let content = fs.readFileSync(testingDocPath, "utf8");
const scopeLabel = inferScopeLabel(suiteNames);

content = updateLatestRunBlock(content, metrics, scopeLabel);

for (const suite of metrics.suites) {
  content = updateSuiteResult(content, suite, metrics.summary.finishedAt);
}

const runSuiteSet = new Set(suiteNames);
const allSuiteSet = new Set(Object.values(tierMap).flat());
for (const [tierName, specs] of Object.entries(tierMap)) {
  const tierCovered = specs.every((spec) => runSuiteSet.has(spec));
  const fullCovered = specs.every((spec) => allSuiteSet.has(spec)) && runSuiteSet.size === allSuiteSet.size;
  if (!tierCovered && !fullCovered) continue;
  const tierSuites = metrics.suites.filter((suite) => specs.includes(path.basename(suite.file)));
  content = updateTierResult(content, tierName, tierSuites, metrics.summary.finishedAt);
}

fs.writeFileSync(testingDocPath, content);
