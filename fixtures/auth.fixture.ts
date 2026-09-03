import { test as base, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { SidebarNav } from '../pages/ems/SidebarNav';
import { WorkspaceSwitcher } from '../pages/ems/WorkspaceSwitcher';
import { testUser, WORKSPACE_NAME } from '../utils/testEnv';

type Fixtures = {
  loginPage: LoginPage;
  sidebarNav: SidebarNav;
  /**
   * A Page that has already logged in. There's no single "dashboard" to hand back (see
   * DashboardPage.ts's deprecation note) — build whichever `pages/ems/*ListPage.ts` /
   * `*FormPage.ts` the test actually needs from this Page, or navigate via `sidebarNav`.
   */
  authenticatedPage: Page;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  sidebarNav: async ({ page }, use) => {
    await use(new SidebarNav(page));
  },

  /**
   * A logged-in Page, already switched to the suite's test workspace.
   *
   * THE WORKSPACE SWITCH IS PART OF THE FIXTURE ON PURPOSE (2026-09-02). A fresh EMS session
   * always opens on **OMS**, so a test that doesn't switch silently operates in the wrong
   * workspace. That was not hypothetical: `events.ui.spec.ts` had been creating, publishing and
   * deleting real Events in OMS on every run, and FLOW-001 seeded its Flow into the test
   * workspace via the API and then searched OMS's list for it.
   *
   * Doing it here means every UI test starts in the right workspace by construction — a test
   * cannot forget, and there is no per-spec boilerplate to keep in sync. Tests that deliberately
   * need a different workspace (E2E-08's cross-workspace isolation) switch explicitly, which now
   * reads as the intentional exception it is rather than being indistinguishable from the
   * accidental default.
   */
  authenticatedPage: async ({ page, loginPage }, use) => {
    await loginPage.goto();
    await loginPage.login(testUser.email, testUser.password);
    await new WorkspaceSwitcher(page).switchTo(WORKSPACE_NAME);
    await use(page);
  },
});

export { expect } from '@playwright/test';
