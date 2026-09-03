#!/usr/bin/env node
/**
 * Generates a one-page executive summary from Playwright's JSON reporter output.
 *
 * WHY THIS EXISTS: Playwright's own HTML report is excellent for an engineer debugging a
 * failure — traces, per-step timings, video — but it is a developer tool. It opens on a flat
 * list of test titles with no pass rate, no module coverage, and no answer to "is this suite
 * healthy and what does it actually cover?", which is what a QA manager reviewing a framework
 * proposal needs in the first ten seconds. This produces that page, and links through to the
 * Playwright report for anyone who wants the detail.
 *
 * No dependencies — plain Node, reads test-results/results.json (configured in
 * playwright.config.ts's `json` reporter) and writes test-results/summary.html.
 *
 * Usage:  node scripts/generate-summary.js  (or `npm run report:summary`)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'test-results', 'results.json');
const OUTPUT = path.join(ROOT, 'test-results', 'summary.html');

if (!fs.existsSync(INPUT)) {
  console.error(
    `No results file at ${INPUT}\n` +
      `Run the suite first (e.g. \`npm test\` or \`npm run test:api\`), then re-run this.`
  );
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

/* ---------------------------------------------------------------------------------------
 * Flatten Playwright's nested suite tree into one row per test.
 * The tree nests arbitrarily deep (file suite -> describe -> nested describe -> spec), so
 * this recurses rather than assuming a fixed depth.
 * ------------------------------------------------------------------------------------- */
const rows = [];

function walk(suite, ancestry) {
  const trail = suite.title ? [...ancestry, suite.title] : ancestry;

  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      // A test can have several results (retries). The LAST one is the outcome that counts;
      // more than one result means it was retried, which is what "flaky" means here.
      const results = test.results || [];
      const final = results[results.length - 1] || {};
      const retried = results.length > 1;

      // Playwright's own `status` on the test object already accounts for expected/unexpected
      // and flakiness; fall back to the last result's status for older report shapes.
      const status = test.status || final.status || 'unknown';

      rows.push({
        title: spec.title,
        suite: trail.join(' › '),
        file: spec.file || suite.file || '',
        status,
        ok: spec.ok === true,
        retried,
        duration: results.reduce((sum, r) => sum + (r.duration || 0), 0),
        error: (final.error && (final.error.message || final.error.value)) || null,
        projectName: test.projectName || '',
      });
    }
  }

  for (const child of suite.suites || []) walk(child, trail);
}

for (const suite of report.suites || []) walk(suite, []);

/* ---------------------------------------------------------------------------------------
 * Classification
 * ------------------------------------------------------------------------------------- */
/**
 * Which of the three tiers a result belongs to.
 *
 * Keyed on the Playwright PROJECT NAME first (renamed 2026-09-03 from `api`/`chrome` to
 * Backend/Frontend/E2E Journeys, so that Allure's top-level suites name the thing under test
 * rather than a browser binary). The directory fallback keeps this working when the JSON comes
 * from a filtered run, a `--project` override, or an older results file.
 */
const TIERS = ['Backend', 'Frontend', 'E2E Journeys'];

const tierOf = (r) => {
  if (TIERS.includes(r.projectName)) return r.projectName;
  if (r.projectName === 'api' || r.file.includes('api/')) return 'Backend';       // pre-rename
  if (r.file.includes('regression/')) return 'E2E Journeys';
  return 'Frontend';
};
const passed = rows.filter((r) => r.status === 'expected' || (r.ok && r.status !== 'skipped'));
const failed = rows.filter((r) => r.status === 'unexpected');
const skipped = rows.filter((r) => r.status === 'skipped');
const flaky = rows.filter((r) => r.status === 'flaky' || (r.retried && r.ok));

const executed = rows.length - skipped.length;
const passRate = executed > 0 ? Math.round((passed.length / executed) * 1000) / 10 : 0;

// Wall-clock duration: prefer the reporter's own figure, else the longest-running worker
// approximation (sum of durations overstates it badly under parallelism, so it is reported
// separately as "total test time" rather than as elapsed time).
const totalTestMs = rows.reduce((s, r) => s + r.duration, 0);
const wallClockMs = (report.stats && report.stats.duration) || null;
const workers = (report.config && report.config.workers) || null;

/* Module coverage — derived from the spec filename, which maps 1:1 to an EMS module here. */
const moduleOf = (r) => {
  const base = path.basename(r.file || '');
  if (base.includes('e2e-scenarios')) return 'Cross-module E2E';
  if (base.includes('flow-list')) return 'Flow (list/search)';
  const m = base.match(/^([a-zA-Z]+)\./);
  if (!m) return 'Other';
  const name = m[1];
  const pretty = {
    apiCall: 'Api Call',
    globalVariables: 'Global Variables',
    connection: 'Connection',
    mapper: 'Mapper',
    schema: 'Schema (Events)',
    observer: 'Observer',
    script: 'Script',
    secret: 'Secret (Vault)',
    workspace: 'Workspace',
    flow: 'Flow',
    track: 'Track',
    auth: 'Auth',
    events: 'Events (UI)',
    navigation: 'Navigation (UI)',
  };
  return pretty[name] || name;
};

const byModule = new Map();
for (const r of rows) {
  const key = moduleOf(r);
  const entry = byModule.get(key) || { total: 0, passed: 0, failed: 0, skipped: 0, ms: 0 };
  entry.total += 1;
  entry.ms += r.duration;
  if (r.status === 'unexpected') entry.failed += 1;
  else if (r.status === 'skipped') entry.skipped += 1;
  else entry.passed += 1;
  byModule.set(key, entry);
}
const modules = [...byModule.entries()].sort((a, b) => b[1].total - a[1].total);

const slowest = [...rows].filter((r) => r.status !== 'skipped').sort((a, b) => b.duration - a.duration).slice(0, 8);

const fmtMs = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
};

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const stripAnsi = (s) => String(s || '').replace(/\[[0-9;]*m/g, '');

const env = process.env.ENV || 'dev';
const generatedAt = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' });

const healthColor = passRate >= 95 ? 'ok' : passRate >= 80 ? 'warn' : 'bad';

/* ---------------------------------------------------------------------------------------
 * Render
 * ------------------------------------------------------------------------------------- */
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EMS Test Automation — Run Summary</title>
<style>
  :root {
    --bg: #f6f7f9; --panel: #ffffff; --ink: #16191d; --muted: #5b6572; --line: #e3e7ec;
    --ok: #1a7f4b; --ok-bg: #e8f5ee; --bad: #c0392b; --bad-bg: #fdecea;
    --warn: #b26a00; --warn-bg: #fff4e5; --accent: #2b5fd9; --accent-bg: #eaf0fe;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14171a; --panel: #1c2024; --ink: #e8eaed; --muted: #9aa3ad; --line: #2c3238;
      --ok: #4ade80; --ok-bg: #10291c; --bad: #f87171; --bad-bg: #2c1616;
      --warn: #fbbf24; --warn-bg: #2a2113; --accent: #7ea2ff; --accent-bg: #16203a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 24px 64px; background: var(--bg); color: var(--ink);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  header { margin-bottom: 28px; }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .sub { color: var(--muted); font-size: 14px; }
  .sub strong { color: var(--ink); font-weight: 600; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted);
       margin: 34px 0 12px; font-weight: 600; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .kpi { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; }
  .kpi .n { font-size: 30px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.1; }
  .kpi .l { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 6px; }
  .kpi.ok .n { color: var(--ok); } .kpi.bad .n { color: var(--bad); } .kpi.warn .n { color: var(--warn); }
  .bar { height: 10px; border-radius: 999px; background: var(--line); overflow: hidden; display: flex; margin-top: 14px; }
  .bar i { display: block; height: 100%; }
  .bar .p { background: var(--ok); } .bar .f { background: var(--bad); } .bar .s { background: var(--muted); opacity: .4; }
  table { width: 100%; border-collapse: collapse; background: var(--panel);
          border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 14px; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pill.ok { background: var(--ok-bg); color: var(--ok); }
  .pill.bad { background: var(--bad-bg); color: var(--bad); }
  .pill.warn { background: var(--warn-bg); color: var(--warn); }
  .pill.info { background: var(--accent-bg); color: var(--accent); }
  .scroll { overflow-x: auto; }
  .fail { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--bad);
          border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; }
  .fail .t { font-weight: 600; margin-bottom: 4px; }
  .fail .s { color: var(--muted); font-size: 12px; margin-bottom: 8px; }
  pre { margin: 0; padding: 10px 12px; background: var(--bg); border-radius: 6px; overflow-x: auto;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--ink); }
  footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--line);
           color: var(--muted); font-size: 13px; }
  a { color: var(--accent); }
  .note { background: var(--accent-bg); border: 1px solid var(--line); border-radius: 10px;
          padding: 14px 16px; font-size: 14px; color: var(--ink); }
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>EMS Test Automation — Run Summary</h1>
  <div class="sub">
    Playwright + TypeScript · environment <strong>${esc(env)}</strong> · generated ${esc(generatedAt)}
    ${workers ? ` · <strong>${workers}</strong> parallel workers` : ''}
  </div>
</header>

<div class="kpis">
  <div class="kpi ${healthColor}"><div class="n">${passRate}%</div><div class="l">Pass rate</div></div>
  <div class="kpi"><div class="n">${executed}</div><div class="l">Tests executed</div></div>
  <div class="kpi ok"><div class="n">${passed.length}</div><div class="l">Passed</div></div>
  <div class="kpi ${failed.length ? 'bad' : ''}"><div class="n">${failed.length}</div><div class="l">Failed</div></div>
  ${flaky.length ? `<div class="kpi warn"><div class="n">${flaky.length}</div><div class="l">Flaky</div></div>` : ''}
  <div class="kpi"><div class="n">${fmtMs(wallClockMs)}</div><div class="l">Wall clock</div></div>
</div>

<div class="bar">
  <i class="p" style="width:${executed ? (passed.length / rows.length) * 100 : 0}%"></i>
  <i class="f" style="width:${rows.length ? (failed.length / rows.length) * 100 : 0}%"></i>
  <i class="s" style="width:${rows.length ? (skipped.length / rows.length) * 100 : 0}%"></i>
</div>

<h2>Coverage by tier</h2>
<div class="scroll">
<table>
  <tr><th>Tier</th><th class="num">Tests</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Test time</th></tr>
  ${TIERS.filter((t) => rows.some((r) => tierOf(r) === t))
    .map((t) => [t, rows.filter((r) => tierOf(r) === t)])
    .map(
      ([label, set]) => `<tr>
        <td>${label}</td>
        <td class="num">${set.length}</td>
        <td class="num">${set.filter((r) => r.status !== 'unexpected' && r.status !== 'skipped').length}</td>
        <td class="num">${set.filter((r) => r.status === 'unexpected').length}</td>
        <td class="num">${fmtMs(set.reduce((s, r) => s + r.duration, 0))}</td>
      </tr>`
    )
    .join('')}
</table>
</div>

<h2>Coverage by EMS module</h2>
<div class="scroll">
<table>
  <tr><th>Module</th><th class="num">Tests</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Time</th><th>Status</th></tr>
  ${modules
    .map(
      ([name, m]) => `<tr>
      <td>${esc(name)}</td>
      <td class="num">${m.total}</td>
      <td class="num">${m.passed}</td>
      <td class="num">${m.failed}</td>
      <td class="num">${fmtMs(m.ms)}</td>
      <td>${m.failed ? '<span class="pill bad">failing</span>' : '<span class="pill ok">green</span>'}</td>
    </tr>`
    )
    .join('')}
</table>
</div>

${
  failed.length
    ? `<h2>Failures</h2>
${failed
  .map(
    (f) => `<div class="fail">
    <div class="t">${esc(f.title)}</div>
    <div class="s">${esc(f.suite)} · ${esc(f.file)}</div>
    <pre>${esc(stripAnsi(f.error).split('\n').slice(0, 12).join('\n'))}</pre>
  </div>`
  )
  .join('')}`
    : `<h2>Failures</h2><div class="note">No failures in this run.</div>`
}

<h2>Slowest tests</h2>
<div class="scroll">
<table>
  <tr><th>Test</th><th>Module</th><th class="num">Duration</th></tr>
  ${slowest
    .map(
      (r) => `<tr><td>${esc(r.title)}</td><td>${esc(moduleOf(r))}</td><td class="num">${fmtMs(r.duration)}</td></tr>`
    )
    .join('')}
</table>
</div>

${
  skipped.length
    ? `<h2>Skipped in this run</h2>
<div class="scroll"><table>
  <tr><th>Test</th><th>Reason</th></tr>
  ${skipped.map((r) => `<tr><td>${esc(r.title)}</td><td>Conditional skip — see the test's own annotation</td></tr>`).join('')}
</table></div>`
    : ''
}

<footer>
  Total test time <strong>${fmtMs(totalTestMs)}</strong> across ${rows.length} tests${
    wallClockMs ? `, completed in <strong>${fmtMs(wallClockMs)}</strong> of wall clock${workers ? ` on ${workers} parallel workers` : ''}` : ''
  }.<br>
  Tests blocked on uncaptured evidence are tagged <code>@pending</code> and excluded from this run by design —
  run <code>npm run test:pending</code> to see that backlog.<br>
  Full drill-down with traces, screenshots and per-step timings: <a href="../playwright-report/index.html">Playwright HTML report</a>.
</footer>

</div>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, html);

console.log(`Executive summary written to ${path.relative(ROOT, OUTPUT)}`);
console.log(`  ${executed} executed · ${passed.length} passed · ${failed.length} failed · ${passRate}% pass rate`);
if (wallClockMs) console.log(`  wall clock ${fmtMs(wallClockMs)}${workers ? ` on ${workers} workers` : ''}`);
