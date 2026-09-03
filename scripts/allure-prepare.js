#!/usr/bin/env node
/**
 * Prepares `allure-results/` for report generation. Runs AFTER the test run and BEFORE
 * `allure generate` (see the `demo` npm script).
 *
 * It does two things the Playwright reporter cannot do on its own:
 *
 * 1. CARRIES HISTORY FORWARD — which is what turns Allure from a snapshot into a trend.
 *    Allure's trend graphs, the "retries" view, and the per-test "was this flaky before?"
 *    history all come from a `history/` folder that the PREVIOUS report left behind. Allure
 *    reads it from `allure-results/history/`, but writes it to `allure-report/history/`, and
 *    nothing moves it between the two — so out of the box every run renders as if it were the
 *    first one ever, with a flat trend line and no memory. This copies the last report's
 *    history back into the results before generating.
 *
 *    This is the single highest-value thing in this file for a framework review: "we are at
 *    100% and here are the last ten runs" is a materially different claim from "we are at 100%
 *    right now", and it is the one a manager will ask for.
 *
 * 2. RECORDS WHO RAN IT (`executor.json`) — so the report says whether it came from someone's
 *    laptop or from CI, and links back to the build when it did.
 *
 * The Environment widget and the defect Categories are NOT written here: those are configured
 * directly on the allure-playwright reporter in `playwright.config.ts`, which keeps them next to
 * the values they describe.
 *
 * No dependencies — plain Node.
 * Usage:  node scripts/allure-prepare.js   (or `npm run report:allure:prepare`)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'allure-results');
const REPORT = path.join(ROOT, 'allure-report');

if (!fs.existsSync(RESULTS)) {
  console.error(
    `No results at ${RESULTS}\nRun the suite first (e.g. \`npm test\`), then re-run this.`
  );
  process.exit(1);
}

/* -- 1. history ------------------------------------------------------------------------- */
const previousHistory = path.join(REPORT, 'history');

if (fs.existsSync(previousHistory)) {
  fs.cpSync(previousHistory, path.join(RESULTS, 'history'), { recursive: true });
  // trend files are named history-trend.json, duration-trend.json, retry-trend.json, ...
  const carried = fs.readdirSync(previousHistory).length;
  console.log(`allure-prepare: carried ${carried} history file(s) forward — trends will render.`);
} else {
  console.log(
    'allure-prepare: no previous allure-report/history — this run becomes the first data point. ' +
      'Trends appear from the second run onward.'
  );
}

/* -- 2. executor ------------------------------------------------------------------------ */
const isCi = Boolean(process.env.CI);
const executor = {
  name: isCi ? 'CI' : 'Local run',
  type: isCi ? 'ci' : 'local',
  reportName: 'EMS Test Automation',
  buildName: `EMS ${process.env.ENV || 'dev'} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  buildUrl: process.env.BUILD_URL || undefined,
  buildOrder: process.env.BUILD_NUMBER ? Number(process.env.BUILD_NUMBER) : undefined,
};

fs.writeFileSync(
  path.join(RESULTS, 'executor.json'),
  JSON.stringify(executor, null, 2),
  'utf8'
);

console.log(`allure-prepare: executor recorded as "${executor.name}" (${executor.buildName}).`);
