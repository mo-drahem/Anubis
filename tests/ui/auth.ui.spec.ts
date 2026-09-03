import { test, expect } from '../../fixtures/auth.fixture';
import { EMS_ROUTES } from '../../pages/ems/emsRoutes';
import { NavBar } from '../../components/NavBar';
import { testUser } from '../../utils/testEnv';

/**
 * Auth screens — see EMS_UI_Automation_Plan.md / the UI test catalog for the full AUTH-*
 * scenario list. AUTH-002/003/004 are still "Needs Confirmation" (not built here). AUTH-006
 * (login occasionally times out) is folded into LoginPage.login()'s retry, not a separate test
 * — see that method's doc comment.
 */

test('AUTH-001 — login with valid credentials reaches the app (redirected off /auth/login)', { tag: ['@smoke', '@regression'] }, async ({
  page,
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login(testUser.email, testUser.password);

  expect(new URL(page.url()).pathname).not.toBe(EMS_ROUTES.login);
  await expect(loginPage.emsLogo).toBeVisible();
});

test('AUTH-005 — direct navigation to a protected route while logged out redirects to login', { tag: '@regression' }, async ({
  page,
}) => {
  // Deliberately no login — this page starts with no session.
  await page.goto(EMS_ROUTES.events);
  await page.waitForURL((url) => url.pathname.includes(EMS_ROUTES.login));

  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.login);
});

test('AUTH-007 — logout returns to login and blocks back-navigation into protected routes', { tag: '@regression' }, async ({
  page,
  loginPage,
}) => {
  await loginPage.goto();
  await loginPage.login(testUser.email, testUser.password);

  // Visit a protected route before logging out. This is not decoration — it is the step that
  // makes this test exercise the guard at all.
  //
  // CORRECTED 2026-09-03 from the user's manual walkthrough. Their real steps were: log in
  // (landing on /dashboard?type=EVENT&code=), open /flows, log out, then press Back — and the
  // browser went to `/auth/login?r=/dashboard&q=?type=EVENT,$$code=`. The guard caught the
  // back-navigation and appended a return-URL, exactly as it should.
  //
  // The automated version skipped that middle step: it logged in and immediately logged out.
  // Both of those REPLACE the history entry rather than pushing, so no protected page was left
  // in the stack, Back stepped off the app onto `about:blank`, and the guard was never involved.
  // The failure read as "pathname was blank, not /auth/login" — which looked like a broken guard
  // but was really a test that never set up the scenario it claimed to test.
  await page.goto(EMS_ROUTES.flows);
  await page.waitForURL((url) => url.pathname.includes(EMS_ROUTES.flows));

  const navBar = new NavBar(page);
  await navBar.logout();
  await page.waitForURL((url) => url.pathname.includes(EMS_ROUTES.login));
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.login);

  // Back now has a real protected entry to return to, so this genuinely exercises the guard.
  await page.goBack();
  await page.waitForURL((url) => url.pathname.includes(EMS_ROUTES.login), { timeout: 10_000 });

  // Asserted on PATHNAME only, deliberately. On a guarded redirect EMS appends a return-URL to
  // the login page — the user captured `?r=/dashboard&q=?type=EVENT,$$code=` — so the full URL
  // legitimately varies with wherever the session had been. The pathname is the stable part, and
  // it is the part the rule is actually about.
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.login);

  // Attach the real redirect URL on every run. The `?r=…&q=…` return-URL shape is confirmed but
  // not pinned down (note the unusual `,$$` separator inside `q`), and this is where the evidence
  // to pin it down — or to assert the user is returned to the right place after re-login — will
  // accumulate.
  await test.info().attach('capture-me: guarded back-navigation redirect URL', {
    body: Buffer.from(page.url()),
    contentType: 'text/plain',
  });

  // Belt and braces: request a protected route outright and require the redirect. This is the
  // rule in its purest form — "logged out means logged out" — and unlike a Back-button check it
  // cannot pass by accident of history shape.
  await page.goto(EMS_ROUTES.events);
  await page.waitForURL((url) => url.pathname.includes(EMS_ROUTES.login), { timeout: 10_000 });
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.login);
});
