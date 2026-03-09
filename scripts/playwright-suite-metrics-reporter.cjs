const fs = require("node:fs");
const path = require("node:path");

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function addCounts(target, source) {
  target.passed += source.passed || 0;
  target.failed += source.failed || 0;
  target.skipped += source.skipped || 0;
}

class SuiteMetricsReporter {
  constructor() {
    this.outputPath = process.env.PW_SUITE_METRICS_PATH
      ? path.resolve(process.env.PW_SUITE_METRICS_PATH)
      : path.resolve(".tmp/playwright-suite-metrics.json");
    this.startedAt = new Date().toISOString();
    this.suites = new Map();
  }

  onTestEnd(test, result) {
    const file = test.location?.file ? String(test.location.file).replace(/\\/g, "/") : "unknown";
    const entry = this.suites.get(file) || {
      file,
      counts: { passed: 0, failed: 0, skipped: 0 },
      durationMs: 0
    };
    entry.durationMs += Number(result.duration || 0);

    const outcome = result.status;
    if (outcome === "passed") {
      entry.counts.passed += 1;
    } else if (outcome === "skipped" || outcome === "interrupted") {
      entry.counts.skipped += 1;
    } else {
      entry.counts.failed += 1;
    }
    this.suites.set(file, entry);
  }

  async onEnd(fullResult) {
    const suiteEntries = Array.from(this.suites.values()).sort((a, b) => a.file.localeCompare(b.file));
    const summary = {
      status: fullResult.status,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      counts: { passed: 0, failed: 0, skipped: 0 },
      durationMs: suiteEntries.reduce((sum, entry) => sum + entry.durationMs, 0),
      suiteCount: suiteEntries.length
    };
    for (const entry of suiteEntries) {
      addCounts(summary.counts, entry.counts);
    }
    ensureDir(this.outputPath);
    fs.writeFileSync(this.outputPath, JSON.stringify({ summary, suites: suiteEntries }, null, 2));
  }
}

module.exports = SuiteMetricsReporter;
