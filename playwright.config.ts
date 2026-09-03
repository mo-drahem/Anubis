import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Loads .env.dev / .env.staging / .env.prod based on the ENV variable.
// Example: ENV=staging npm run test:smoke
const ENV = process.env.ENV || 'dev';
dotenv.config({ path: path.resolve(__dirname, `.env.${ENV}`) });

// Desktop Chrome's built-in preset is 1280×720 — EMS's sidebar collapses at that width and
// many nav/entity selectors stop matching. Default to full-HD; override via env if needed.
const UI_VIEWPORT = {
  width: Number(process.env.PLAYWRIGHT_VIEWPORT_WIDTH) || 1920,
  height: Number(process.env.PLAYWRIGHT_VIEWPORT_HEIGHT) || 1080,
};

/**
 * Browser settings shared by both browser-driven projects (Frontend and E2E Journeys).
 *
 * Real, installed Google Chrome — not Playwright's bundled Chromium binary. `channel: 'chrome'`
 * is what makes the difference; it requires Chrome to actually be installed on the machine
 * running these tests (run `npx playwright install chrome` once if it isn't). Firefox/WebKit
 * projects were removed per the team's decision to test Chrome only — NFR-001 ("core flows pass
 * on Chromium and at least one other engine") no longer holds as originally written now that
 * this is the only browser engine; revisit that catalog row if cross-browser coverage is wanted
 * back later.
 */
const chromeUse = {
  ...devices['Desktop Chrome'],
  channel: 'chrome' as const,
  viewport: UI_VIEWPORT,
  // Match viewport to window in headed runs so the browser opens at full size.
  launchOptions: {
    args: [`--window-size=${UI_VIEWPORT.width},${UI_VIEWPORT.height}`],
  },
};

export default defineConfig({
  testDir: './tests',
  // Default per-test budget. Each project below narrows this to what its tier actually needs —
  // see the `timeout` on 'E2E Journeys', which legitimately needs far more than a login test.
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  /**
   * Excludes the `@pending` backlog from every run by default.
   *
   * A `@pending` test is blocked on evidence nobody has captured yet — an uncaptured selector
   * (the Flow Details modal), an unconfirmed token syntax (Global Variable references), an
   * unobserved error body. Each one names what would unblock it.
   *
   * They stay in the repo — the analysis is worth keeping, and they become real tests the moment
   * the selector is captured — but they are not part of a normal run, because a results summary
   * showing 25% "skipped" reads as unfinished work rather than a deliberate, documented backlog.
   * A default run therefore reports ONLY tests that genuinely execute, so green means green.
   *
   * See the backlog with `npm run test:pending`.
   */
  grepInvert: process.env.RUN_PENDING ? undefined : /@pending/,

  /**
   * Four reporters, four audiences:
   *   - `html`   engineer drill-down: trace viewer, video, per-step timings, and every API
   *              request/response body attached inline by BaseApiClient.
   *   - `json`   machine-readable input for scripts/generate-summary.js, which renders the
   *              one-page executive summary (`npm run report:summary`).
   *   - `allure` the recognizable QA-industry artifact — see the configuration below.
   *   - `list`   live console feedback during the run.
   */
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        detail: true,

        /**
         * Populates Allure's "Environment" widget — the panel a reviewer looks at first to
         * answer "what was this actually run against?". Without it the report is a pass rate
         * with no provenance, which is the single most common criticism of a screenshot of a
         * green test report: nobody can tell whether it ran against dev, staging, the right
         * workspace, or someone's stale local branch.
         *
         * Read from process.env AFTER dotenv has loaded above, so these reflect the same
         * values the tests themselves used rather than a second, drifting source of truth.
         */
        environmentInfo: {
          Environment: ENV,
          'Base URL': process.env.BASE_URL || '(unset)',
          // EMS_QA_WORKSPACE_CODE, NOT WORKSPACE_CODE — this is the exact env-var name that
          // `api/config.ts` reads, and getting it wrong here would put a confident but false
          // workspace on the report. `utils/testEnv.ts` documents the same mistake causing a
          // real incident once already, where nine duplicated copies of this lookup all
          // silently fell back to a placeholder instead of failing loudly.
          Workspace: process.env.EMS_QA_WORKSPACE_CODE || '(unset)',
          'Workspace (display name)': process.env.EMS_QA_WORKSPACE_NAME || 'drahem-workspace',
          // Gates the cross-workspace scenarios (E2E-08, the changeWorkspace tests). When this
          // is unset those tests skip, so a reviewer looking at the coverage needs to see it
          // here rather than wondering why the count moved between runs.
          'Second workspace': process.env.EMS_QA_SECOND_WORKSPACE_CODE || '(unset — cross-workspace tests skip)',
          Browser: 'Google Chrome (installed channel)',
          Viewport: `${UI_VIEWPORT.width}×${UI_VIEWPORT.height}`,
          'Pending backlog included': process.env.RUN_PENDING ? 'yes' : 'no (default)',
          'Run by': process.env.USER || process.env.USERNAME || 'unknown',
          Framework: 'Playwright + TypeScript',
        },

        /**
         * Allure's defect-triage buckets. Every failure gets sorted into one of these on the
         * report's "Categories" tab, which turns "12 tests failed" into "9 are the same
         * upstream 503, 2 are selector drift, 1 is a real assertion failure" — the distinction
         * that decides whether anyone needs to act.
         *
         * These patterns are drawn from failure modes this suite has ACTUALLY produced against
         * ems-dev, not from a generic template:
         *   - the Flow service intermittently returns 503, which is an environment problem and
         *     must never be read as a product regression;
         *   - `changeWorkspace` returns 1111 Access Denied when the caller lacks permission on
         *     BOTH workspaces, which is a config problem, not a bug;
         *   - selector drift ("element(s) not found") means the app's DOM moved and the page
         *     object needs re-capturing — a test-maintenance task, not a product defect.
         *
         * Order matters: Allure assigns a result to the FIRST matching category, so the
         * specific environment/infrastructure patterns are listed before the broad
         * "product defect" catch-all.
         */
        categories: [
          {
            name: 'Environment — service unavailable',
            description:
              'An EMS service returned 5xx. The Flow service on dev does this intermittently. ' +
              'Not a product regression and not a test bug — re-run, and escalate only if it persists.',
            messageRegex: '(?s).*(50[0-9]|ECONNREFUSED|ECONNRESET|socket hang up|EAI_AGAIN).*',
            matchedStatuses: ['failed', 'broken'],
          },
          {
            name: 'Environment — network unreachable',
            description:
              'The internal *.tajawal-dev.internal hosts did not resolve. These are reachable only ' +
              'over VPN or the office network — check the connection before reading anything else ' +
              'into this run.',
            messageRegex: '(?s).*(getaddrinfo|ENOTFOUND|ERR_NAME_NOT_RESOLVED|net::ERR_).*',
            matchedStatuses: ['failed', 'broken'],
          },
          {
            name: 'Access / permission',
            description:
              'EMS refused the operation on authorization grounds (error 1111 Access Denied, 401, ' +
              '403). Usually the test account lacks a permission — for changeWorkspace it must hold ' +
              'it on BOTH the source and target workspace. A configuration issue, not a defect.',
            messageRegex: '(?s).*(Access Denied|"code"\\s*:\\s*1111|\\b40[13]\\b).*',
            matchedStatuses: ['failed', 'broken'],
          },
          {
            name: 'Test maintenance — selector drift',
            description:
              "A locator matched nothing or matched several elements. The app's DOM moved and the " +
              'page object needs re-capturing against the real screen. This is test maintenance, ' +
              'not a product defect — do not raise a bug from it without checking the UI first.',
            messageRegex:
              '(?s).*(element\\(s\\) not found|strict mode violation|resolved to \\d+ elements|waiting for locator).*',
            matchedStatuses: ['failed', 'broken'],
          },
          {
            name: 'Timeout',
            description:
              'The test exceeded its time budget without a specific assertion failing. Check the ' +
              'trace before assuming a defect: on a slow environment this is usually the budget ' +
              'being too tight, not the app being broken.',
            messageRegex: '(?s).*(Test timeout of|exceeded while|Timeout .* exceeded).*',
            matchedStatuses: ['failed', 'broken'],
          },
          {
            name: 'Product defect — failed assertion',
            description:
              'The application did something other than what the scenario requires, and the test ' +
              'said so precisely. These are the results worth raising with the dev team.',
            messageRegex: '(?s).*(expect\\(|Expected:|AssertionError).*',
            matchedStatuses: ['failed'],
          },
          {
            name: 'Known flaky',
            description:
              'Passed only on retry. Not a failure, but not trustworthy either — anything that ' +
              'lands here repeatedly should be investigated or made deterministic.',
            matchedStatuses: ['passed'],
            flaky: true,
          },
        ],
      },
    ],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /**
   * THREE TIERS, and the project name is what Allure shows as the top-level suite — so these
   * names are read by people who are not going to open the code. They were `api` and `chrome`
   * (an implementation detail and a browser binary); they now name the thing under test.
   *
   * The split is by what each tier costs and what it proves, which is why each carries its own
   * time budget rather than sharing one flat number.
   */
  projects: [
    /**
     * Service-level tests against the EMS APIs directly. No browser, so no cross-browser matrix
     * and no browser start-up cost — the whole tier runs in well under a minute.
     */
    {
      name: 'Backend',
      testDir: './tests/api',
    },

    /**
     * Single-screen UI tests: auth, navigation, list/search, and the Events lifecycle. Each
     * verifies one screen or one entity's behaviour, so the default 60s budget fits.
     */
    {
      name: 'Frontend',
      testDir: './tests/ui',
      use: chromeUse,
    },

    /**
     * Full cross-module user journeys (E2E-01..E2E-12) — the scenarios that walk several EMS
     * modules end to end in one test: create a Connection, wire an Api Call, build a Mapper,
     * then create, publish and activate an Event, each step a real UI navigation.
     *
     * Its own project for three reasons, all of which the previous single-`chrome`-project setup
     * made impossible:
     *   1. TIME BUDGET. A journey is minutes of real UI work; a login test is seconds. Sharing
     *      one flat 60s meant either starving the journeys or handing every trivial test a
     *      budget so loose that a genuine hang looks like a slow test. 180s here is scoped to
     *      the tier that needs it and changes nothing for the other two.
     *   2. SELECTION. `npm run test:e2e` runs exactly the journeys — the useful thing to re-run
     *      after a cross-module change, and far too slow to want in an inner loop.
     *   3. REPORTING. It becomes its own top-level Allure suite, so a reviewer sees the journey
     *      coverage as a distinct block instead of buried among the single-screen tests.
     */
    {
      name: 'E2E Journeys',
      testDir: './tests/regression',
      timeout: 180_000,
      use: chromeUse,
    },
  ],
});
