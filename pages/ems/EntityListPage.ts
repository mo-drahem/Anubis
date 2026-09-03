import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { CommonSelectors } from './CommonUi';
import { EntityHeaderActions } from './EntityHeaderActions';

/**
 * Shared base for every EMS entity LIST screen (`/events`, `/flows`, and — once ported —
 * `/mappers`, `/connections`, `/api-calls`, `/scripts`, `/global-variables`, `/observers`).
 *
 * WHY THIS EXISTS (2026-09-02 architecture pass): `EventListPage` and `FlowListPage` had
 * independently grown the same four things — a `pageTitle`/`searchInput` pair off the same
 * `CommonSelectors`, a `goto()`, a `search()`, and a retry-until-indexed `waitForSearchable()`
 * whose loop body was near-identical in both (re-navigate, re-search, check a cell, sleep 1s,
 * repeat, throw with a per-entity message). Every additional list screen would have copied it a
 * third and fourth time. The retry loop in particular encodes a real, confirmed EMS behaviour —
 * newly created records take a moment to become searchable — so it belongs in one place where
 * that knowledge can be corrected once.
 *
 * What deliberately stays per-subclass: how a row is located. Flows has a fully documented
 * indexed testid convention (`FlowsListingScreen_Flow_<field>_<i>`); Events renders a plain
 * table matched by cell text. That difference is real, so `rowLocatorFor()` is abstract rather
 * than forced into one shape.
 */
export abstract class EntityListPage extends BasePage {
  readonly headerActions: EntityHeaderActions;
  readonly pageTitle: Locator;
  readonly searchInput: Locator;

  /** The entity's list route, e.g. `EMS_ROUTES.events`. */
  protected abstract readonly route: string;
  /** Human name used in error messages, e.g. "Event". */
  protected abstract readonly entityName: string;

  constructor(page: Page) {
    super(page);
    this.headerActions = new EntityHeaderActions(page);
    this.pageTitle = page.locator(CommonSelectors.pageTitle);
    this.searchInput = page.locator(CommonSelectors.searchInput);
  }

  async goto(): Promise<void> {
    await super.goto(this.route);
  }

  /**
   * Types into the list's search box. Confirmed real: the list live-filters on input, no Enter
   * needed.
   *
   * Uses the native value setter + a dispatched `input` event rather than `.fill()`. This looks
   * unusual, so: it is the reference suite's own documented workaround (`flowListCC.js`) for a
   * CONFIRMED live behaviour where the search input flips `disabled` mid-interaction during a
   * background list auto-refresh. `.fill()` throws hard on a disabled target instead of
   * retrying; this path keeps working. Originally only FlowListPage had it — Events used a
   * plain `.fill()` and is subject to the same auto-refresh, so both now share the resilient
   * version.
   */
  async search(term: string): Promise<void> {
    await this.searchInput.evaluate((el, value) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, term);
    await this.waitUntilReady();
  }

  /**
   * How this entity's list locates a row for a given code — the one genuinely per-entity part.
   * Subclasses return whatever locator proves the record is present in the filtered list.
   */
  protected abstract rowLocatorFor(code: string): Locator;

  /**
   * Re-searches from a fresh reload on each attempt until the record shows up.
   *
   * CONFIRMED for Flows (the reference suite's own `waitForFlowSearchable()` exists for exactly
   * this indexing lag). For Events this was added defensively after a real captured E2E-08
   * failure where a freshly created event showed "No events available" immediately after
   * search — consistent with the same lag, though not independently confirmed for Events. If a
   * record never becomes searchable here, treat that as evidence AGAINST the lag theory and
   * re-open the "did the create actually succeed" question rather than raising `attempts`.
   */
  async waitForSearchable(code: string, attempts = 5): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      await this.goto();
      await this.search(code);
      const visible = await this.rowLocatorFor(code).isVisible().catch(() => false);
      if (visible) return;
      await this.page.waitForTimeout(1_000);
    }
    throw new Error(
      `${this.entityName} with code "${code}" never became searchable after ${attempts} attempts ` +
        `(searched ${this.route}). If the create itself succeeded, this is the indexing-lag path; ` +
        `if it did not, the failure is upstream of this list screen.`
    );
  }
}
