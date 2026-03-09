import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.env.PW_SUITE_METRICS_ROOT_DIR || ".");
const metricsPath = path.resolve(process.argv[2] || path.join(rootDir, ".tmp", "playwright-suite-metrics.json"));
const testingDocPath = path.join(rootDir, "docs", "TESTING.md");

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

function parseCountsSummary(value) {
  const match = String(value || "").match(/(\d+)\s+passed,\s+(\d+)\s+failed,\s+(\d+)\s+skipped/);
  if (!match) return null;
  return {
    passed: Number(match[1] || 0),
    failed: Number(match[2] || 0),
    skipped: Number(match[3] || 0)
  };
}

function parseTestingStructure(content) {
  const lines = String(content || "").split("\n");
  const tiers = [];
  let currentTier = null;
  let currentSuite = null;

  for (const line of lines) {
    const tierMatch = line.match(/^- `(Tier \d+)` /);
    if (tierMatch) {
      currentTier = {
        name: tierMatch[1],
        suites: []
      };
      tiers.push(currentTier);
      currentSuite = null;
      continue;
    }

    const suiteMatch = line.match(/^  - `T\d+\.\d+` `([^`]+\.spec\.ts)`/);
    if (suiteMatch && currentTier) {
      currentSuite = {
        name: suiteMatch[1],
        resultsText: ""
      };
      currentTier.suites.push(currentSuite);
      continue;
    }

    const suiteResultsMatch = line.match(/^    - results: `(.*)`$/);
    if (suiteResultsMatch && currentSuite) {
      currentSuite.resultsText = suiteResultsMatch[1];
    }
  }

  return tiers;
}

function parseSuiteResultsText(resultsText) {
  const normalized = String(resultsText || "").trim();
  if (!normalized || /^not run yet$/i.test(normalized)) return null;
  const match = normalized.match(/^(passing|failing|skipped)`? \(`?(\d+)\s+tests?`?, `?(\d{2}:\d{2})`?\) on `?([^`]+)`?$/);
  if (!match) return null;
  const counts = { passed: 0, failed: 0, skipped: 0 };
  const status = match[1];
  const testCount = Number(match[2] || 0);
  if (status === "passing") counts.passed = testCount;
  if (status === "failing") counts.failed = testCount;
  if (status === "skipped") counts.skipped = testCount;
  return {
    counts,
    durationMs: durationToMs(match[3]),
    finishedAt: match[4]
  };
}

function durationToMs(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[1] || 0);
  const seconds = Number(match[2] || 0);
  return ((minutes * 60) + seconds) * 1000;
}

function inferScopeLabel(suiteNames, tiers) {
  const normalized = [...suiteNames].sort();
  const tierMap = Object.fromEntries(tiers.map((tier) => [tier.name, tier.suites.map((suite) => suite.name)]));
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
  const pattern = new RegExp("(^\\s*- `T\\d+\\.\\d+` `" + escaped + "`\\n(?:.*\\n)*?^\\s*- description: .*\\n)(^\\s*- results: ).*$", "m");
  content = content.replace(pattern, (_, head, prefix) => `${head}${prefix}${line.trimStart().slice("- results: ".length)}`);
  const detailPattern = new RegExp("(^\\s*- `T\\d+\\.\\d+` `" + escaped + "`\\n(?:.*\\n)*?^\\s*- details: ).*$", "m");
  return content.replace(detailPattern, (_, prefix) => `${prefix}\`${autoDetail(suite.counts)}\``);
}

function recomputeTierResult(content, tierName) {
  const tiers = parseTestingStructure(content);
  const tier = tiers.find((entry) => entry.name === tierName);
  if (!tier || !tier.suites.length) return content;

  const parsedSuites = tier.suites
    .map((suite) => ({ ...suite, parsed: parseSuiteResultsText(suite.resultsText) }))
    .filter((suite) => suite.parsed);
  if (!parsedSuites.length) return content;

  const counts = { passed: 0, failed: 0, skipped: 0 };
  let durationMs = 0;
  let latestFinishedAt = parsedSuites[0].parsed.finishedAt;
  for (const suite of parsedSuites) {
    counts.passed += suite.parsed.counts.passed;
    counts.failed += suite.parsed.counts.failed;
    counts.skipped += suite.parsed.counts.skipped;
    durationMs += suite.parsed.durationMs;
    if (new Date(suite.parsed.finishedAt) > new Date(latestFinishedAt)) {
      latestFinishedAt = suite.parsed.finishedAt;
    }
  }

  const executedLabel = parsedSuites.length === tier.suites.length ? "Latest suite entries are" : "Latest executed suite entries are";
  const details = counts.failed > 0
    ? `${executedLabel} not all passing. Aggregate summary refreshed from the latest recorded ${tierName} suite results.`
    : `${executedLabel} all passing${counts.skipped > 0 ? "/skipped as expected" : ""}. Aggregate summary refreshed from the latest recorded ${tierName} suite results.`;

  const line = `  - results: \`${countsSummary(counts)}\` (\`${testLabel(totalTests(counts))}\`, \`${formatDuration(durationMs)}\`) on \`${latestFinishedAt}\``;
  const tierLinePattern = new RegExp("(^- `" + escapeRegex(tierName) + "`.*\\n)([\\s\\S]*?)(^  - results: ).*$", "m");
  content = content.replace(tierLinePattern, (_, head, middle, prefix) => `${head}${middle}${prefix}${line.slice("  - results: ".length)}`);
  const tierDetailPattern = new RegExp("(^- `" + escapeRegex(tierName) + "`.*\\n(?:[\\s\\S]*?)^  - details: ).*$", "m");
  return content.replace(tierDetailPattern, (_, prefix) => `${prefix}\`${details}\``);
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
let tiers = parseTestingStructure(content);
const scopeLabel = inferScopeLabel(suiteNames, tiers);

content = updateLatestRunBlock(content, metrics, scopeLabel);

for (const suite of metrics.suites) {
  content = updateSuiteResult(content, suite, metrics.summary.finishedAt);
}

tiers = parseTestingStructure(content);
const touchedSuites = new Set(suiteNames);
for (const tier of tiers) {
  if (!tier.suites.some((suite) => touchedSuites.has(suite.name))) continue;
  content = recomputeTierResult(content, tier.name);
}

fs.writeFileSync(testingDocPath, content);
