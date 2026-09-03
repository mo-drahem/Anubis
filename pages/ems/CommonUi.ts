import { Page } from '@playwright/test';

/**
 * Selectors shared across every EMS screen — confirmed against
 * cypress/fixtures/pageClasses/desktop/ems/common/commonPO.js. EMS is a Material-UI React
 * SPA; where the DOM carries no usable data-testid, the Cypress suite's sanctioned fallback
 * families are MUI popup/overlay containers and the list-page search input — reused here
 * rather than inventing new fallbacks.
 */
export const CommonSelectors = {
  pageTitle: '[data-testid="Page_Title"]',
  searchInput: 'input[placeholder="Search..."]',
  dialog: '.MuiDialog-paper, [role="dialog"]',
  statusChip: '.MuiChip-label',
  loadingSpinner: '.MuiCircularProgress-root',
  loadingTestId: '[data-testid*="loading"]',
  skeleton: '.MuiSkeleton-root',

  // Shared header-actions dialogs (confirmed real across Events/Connections/Flows).
  deleteDialogConfirmButton: '[data-testid="DeleteDialog_DeleteButton"]',
  deactivateDialogConfirmButton: '[data-testid="DeactivateDialog_DeactivateButton"]',
};

/**
 * Waits out a loading spinner, any `[data-testid*="loading"]` node, and MUI skeleton
 * placeholders — the "page is actually ready" signal used throughout the Cypress suite
 * (`commonCC.js`'s `waitForPageLoad()`). Call this after every navigation and after any
 * action that triggers a re-render, instead of a fixed `page.waitForTimeout(ms)`.
 */
export async function waitForPageLoad(page: Page, timeout = 10_000): Promise<void> {
  await page.locator('body').waitFor({ state: 'visible', timeout });
  for (const selector of [CommonSelectors.loadingSpinner, CommonSelectors.loadingTestId, CommonSelectors.skeleton]) {
    // Each of these resolves immediately if the selector never appears at all — this only
    // actually waits when the node is present, matching the conditional check the Cypress
    // helper does before waiting on each one.
    await page
      .locator(selector)
      .first()
      .waitFor({ state: 'hidden', timeout })
      .catch(() => {
        // Swallow: some EMS screens never render one of these three signals at all, and a
        // strict-mode/timeout error here shouldn't fail the whole navigation.
      });
  }
}
