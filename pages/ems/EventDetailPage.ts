import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { CommonSelectors, waitForPageLoad } from './CommonUi';
import { EntityHeaderActions } from './EntityHeaderActions';

/**
 * An Event's detail view at `/events/{id}` — the same route shows either the Draft or the
 * Live version depending on which the header actions last switched to. Confirmed against
 * `eventListCC.js`'s actual action sequence (not just the page-object file):
 *
 * - The status chip lives inside the page title element itself
 *   (`Page_Title` containing a `.MuiChip-label`), not a separate standalone element.
 * - "View draft" is a plain-text button (not a `liveDraftHeaderActions_*` testid) used to
 *   switch back from the Live view to the Draft view.
 * - Publishing can redirect back to the Events list instead of staying on the detail page —
 *   confirmed live in the reference suite's own `publishAndActivateEvent()`, which checks
 *   the URL after publish and re-opens the event from the list if redirected. Callers here
 *   should do the same (see `tests/regression/event-lifecycle.spec.ts`) rather than assuming
 *   publish always keeps you on the detail page.
 */
export class EventDetailPage extends BasePage {
  readonly headerActions: EntityHeaderActions;
  readonly pageTitle: Locator;
  readonly statusChip: Locator;
  readonly viewDraftButton: Locator;

  constructor(page: Page) {
    super(page);
    this.headerActions = new EntityHeaderActions(page);
    this.pageTitle = page.locator(CommonSelectors.pageTitle);
    this.statusChip = this.pageTitle.locator(CommonSelectors.statusChip);
    this.viewDraftButton = page.getByRole('button', { name: 'View draft', exact: true });
  }

  /** True once the URL has settled on the real `/events/{id}` detail pattern. */
  isOnDetailUrl(): boolean {
    return /\/events\/[a-f0-9]+$/.test(new URL(this.page.url()).pathname);
  }

  async viewDraft(): Promise<void> {
    await this.viewDraftButton.click();
    await waitForPageLoad(this.page);
  }

  async viewLive(): Promise<void> {
    await this.headerActions.viewLiveButton.click();
    await waitForPageLoad(this.page);
  }

  /**
   * Guarantees the page is showing the LIVE edition, failing loudly with a useful message if it
   * isn't.
   *
   * ADDED 2026-09-03 to fix EVT-009. That test did `await detailPage.viewLive().catch(() =>
   * undefined)` — swallowing any failure — and then asserted the Delete-live button was visible.
   * When the switch to Live didn't happen, the test carried on standing on the DRAFT view, where
   * `liveDraftHeaderActions_deleteLive` legitimately does not exist. The reported failure was
   * therefore "element(s) not found" for the delete button: a symptom several steps downstream of
   * the actual problem, pointing at entirely the wrong thing.
   *
   * How "am I on the Live view?" is decided: the "View draft" button only renders on the Live
   * edition (it is the way back), so its presence is the positive signal. Confirmed from real
   * captured DOM of a saved entity's Draft view, which shows Restore / Workspace / Edit /
   * View live / Publish — and no delete-live.
   *
   * Safe to call when already on the Live view: it clicks nothing and returns.
   */
  async ensureOnLiveView(): Promise<void> {
    if (await this.viewDraftButton.isVisible().catch(() => false)) return; // already on Live

    const canSwitch = await this.headerActions.viewLiveButton.isVisible().catch(() => false);
    if (!canSwitch) {
      throw new Error(
        'Cannot reach the Live view: neither the "View draft" button (which would mean we are ' +
          'already on Live) nor the "View live" button (which would switch to it) is present. ' +
          'The most likely cause is that this entity has no live edition yet — publish it first.'
      );
    }

    await this.viewLive();

    if (!(await this.viewDraftButton.isVisible().catch(() => false))) {
      throw new Error(
        'Clicked "View live" but the page is still not showing the Live edition (the "View draft" ' +
          'button never appeared). Anything asserted after this would be running against the DRAFT ' +
          'view, where live-only controls such as Delete live do not exist.'
      );
    }
  }
}
