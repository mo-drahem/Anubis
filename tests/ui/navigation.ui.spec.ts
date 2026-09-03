import { test, expect } from '../../fixtures/auth.fixture';
import { EMS_ROUTES } from '../../pages/ems/emsRoutes';
import { ACCORDION_SELECTORS } from '../../pages/ems/SidebarNav';
import { waitForPageLoad } from '../../pages/ems/CommonUi';

/**
 * Sidebar/navigation screens — see EMS_UI_Automation_Plan.md / the UI test catalog for the
 * NAV-* scenario list. Workspaces is deliberately NOT included in NAV-002: the reference
 * Cypress suite confirms it's a real, navigable screen, but no real route string or sidebar
 * link selector for it has been captured into this repo (only the reference suite's own
 * page-object file would have that, and it isn't accessible from this environment) — adding
 * one here would mean guessing, which this project's capture-first discipline forbids. Once a
 * real `/workspaces`-style route is captured, add it alongside the other entries below.
 */

test('NAV-001 — each sidebar accordion (Triggers/Configurations/Monitoring) expands on click', { tag: '@regression' }, async ({
  authenticatedPage: page,
}) => {
  for (const selector of Object.values(ACCORDION_SELECTORS)) {
    const trigger = page.locator(selector);
    await trigger.scrollIntoViewIfNeeded();

    const before = await trigger.getAttribute('aria-expanded');
    if (before === 'true') {
      // Already expanded from a previous iteration/prior state — collapse first so this
      // iteration actually exercises the click-to-expand transition.
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  }
});

test('NAV-002 — every entity link navigates to its real route', { tag: ['@smoke', '@regression'] }, async ({ authenticatedPage: page, sidebarNav }) => {
  await sidebarNav.goToEvents();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.events);

  await sidebarNav.goToMappers();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.mappers);

  await sidebarNav.goToConnections();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.connections);

  await sidebarNav.goToApiCalls();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.apiCalls);

  await sidebarNav.goToScripts();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.scripts);

  await sidebarNav.goToGlobalVariables();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.globalVariables);

  await sidebarNav.goToObservers();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.observers);

  await sidebarNav.goToFlows();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.flows);

  // ADDED 2026-09-02. This test deliberately omitted Workspaces because no route string for the
  // screen had ever been captured — adding one would have been a guess. A real captured page
  // body now confirms it: a top-level sidebar link `<a href="/workspaces">`, aria-label
  // "Workspaces". The gap is closed with evidence rather than an assumption.
  await sidebarNav.goToWorkspaces();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.workspaces);

  // CORRECTED 2026-09-02: Vault is NOT accordion-less. The same capture shows it inside the
  // Configurations accordion alongside Connections / API Calls / Mappers / Scripts / Global
  // Variables, so it navigates like every other entity instead of needing a direct page.goto.
  await sidebarNav.goToVault();
  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.vault);
});

test('NAV-003 — Vault navigates directly with no accordion step', { tag: '@regression' }, async ({ authenticatedPage: page }) => {
  await page.goto(EMS_ROUTES.vault);
  await waitForPageLoad(page);

  expect(new URL(page.url()).pathname).toBe(EMS_ROUTES.vault);
});
