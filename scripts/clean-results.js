#!/usr/bin/env node
/**
 * Wipes the previous run's raw results so a fresh run cannot inherit stale ones.
 *
 * Deliberately does NOT touch `allure-report/`. That folder holds `history/`, which is the only
 * record of previous runs — `scripts/allure-prepare.js` copies it forward to draw the trend
 * graphs. Deleting it here would silently reset the trend to a single point on every run, which
 * is exactly the failure mode this script exists to avoid re-introducing.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
for (const dir of ['test-results', 'allure-results']) {
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
}
console.log('clean-results: cleared test-results/ and allure-results/ (allure-report/history kept).');
