#!/usr/bin/env node
/**
 * Prints where the three reports are and exactly how to open each one.
 *
 * WHY THIS EXISTS: the reports have different opening requirements and getting one wrong looks
 * like a broken report. The Playwright HTML report and the executive summary open straight off
 * disk, but **Allure does not** — its report is a single-page app that loads its data over
 * fetch(), which a `file://` URL blocks. Double-clicking `allure-report/index.html` therefore
 * shows a permanently empty "Loading..." screen even though the report generated perfectly.
 * `allure open` serves it over http and is the only supported way in.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const line = '─'.repeat(74);
const out = [];

out.push('', line, '  REPORTS READY', line, '');

out.push('  1. Executive summary — one page, start here');
out.push(exists('test-results/summary.html')
  ? '     open test-results/summary.html'
  : '     (not generated — run `npm run report:summary`)');
out.push('');

out.push('  2. Allure — suites, trends, defect categories, environment');
out.push(exists('allure-report/index.html')
  ? '     npm run report:allure       ← must be served; opening the file directly shows a blank page'
  : '     (not generated — run `npm run report:allure`)');
out.push('');

out.push('  3. Playwright HTML — traces, video, per-step timings for debugging a failure');
out.push(exists('playwright-report/index.html')
  ? '     npm run report'
  : '     (not generated)');
out.push('', line, '');

console.log(out.join('\n'));
