import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { CommonSelectors, waitForPageLoad } from './CommonUi';
import { EntityHeaderActions } from './EntityHeaderActions';

/**
 * A generic detail-view page object for EMS configuration entities that don't yet have their
 * own dedicated page object (Connection, Api Call, Observer, Global Variable, Script edit-view).
 * All of these share the same `EntityHeaderActions` lifecycle component on their detail view
 * (see that class's doc) — this class exists so regression tests drive that shared lifecycle
 * through real page-object methods instead of the free functions / raw locators this file used
 * to duplicate at every call site (POM refactor, 2026-09-01, per the user's explicit request).
 * Mirrors EventDetailPage's shape (`headerActions` + `viewLive()`) for the entities that don't
 * have an Event-style dedicated class of their own.
 *
 * CONFIRMED by the user directly: reaching a real, interactive "Live" view requires opening
 * the entity's DRAFT detail route first, then clicking the header's "Live" button — a direct
 * deep-link to the live record's own id loads correct data but with non-interactive buttons.
 * `openLiveView()` encodes that exact flow so no call site has to re-derive it.
 */
export class GenericEntityDetailPage extends BasePage {
  readonly headerActions: EntityHeaderActions;
  readonly pageTitle: Locator;

  constructor(page: Page) {
    super(page);
    this.headerActions = new EntityHeaderActions(page);
    this.pageTitle = page.locator(CommonSelectors.pageTitle);
  }

  /** Opens an entity's detail view directly by route (e.g. `EMS_ROUTES.connectionDetail(id)`). */
  async openDraft(route: string): Promise<void> {
    await super.goto(route);
  }

  /**
   * Clicks through to the real, interactive Live view from an already-open draft/detail page —
   * use this when Publish just happened and the "Live" button appeared on the SAME page,
   * without re-navigating (see EntityHeaderActions.publish() callers in the regression spec).
   */
  async viewLive(): Promise<void> {
    await this.headerActions.viewLiveButton.click();
    await waitForPageLoad(this.page);
  }

  /** Opens the DRAFT route, then clicks through to the Live view — see class doc. */
  async openLiveView(draftRoute: string): Promise<void> {
    await this.openDraft(draftRoute);
    await this.viewLive();
  }

  // bodyText() is inherited from BasePage — it applies to any screen, not just this one.
}
