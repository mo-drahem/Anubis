import { Locator } from '@playwright/test';
import { EMS_ROUTES } from './emsRoutes';
import { EntityListPage } from './EntityListPage';

/**
 * The Flows list at `/flows`. Selectors confirmed against
 * cypress/fixtures/pageClasses/desktop/ems/flows/flowListPO.js — unlike Events, Flows has a
 * fully documented indexed row-cell testid convention (`FlowsListingScreen_Flow_<field>_<i>`),
 * so row lookups here are exact rather than best-effort text matching.
 *
 * Known live flakiness (see the reference suite's flows.md topic file): the search input can
 * flip `disabled` mid-interaction (tied to a background list auto-refresh, sometimes a full
 * React hydration error — not this suite's bug), and a newly created flow can take a moment to
 * become searchable (indexing lag). Both are handled by `EntityListPage` now — its `search()`
 * carries the disabled-input workaround this class used to own, and its `waitForSearchable()`
 * carries the reload-and-retry loop.
 */
export class FlowListPage extends EntityListPage {
  protected readonly route = EMS_ROUTES.flows;
  protected readonly entityName = 'Flow';

  nameCell(index: number): Locator {
    return this.page.locator(`[data-testid="FlowsListingScreen_Flow_name_${index}"]`);
  }

  codeCell(index: number): Locator {
    return this.page.locator(`[data-testid="FlowsListingScreen_Flow_code_${index}"]`);
  }

  stateCell(index: number): Locator {
    return this.page.locator(`[data-testid="FlowsListingScreen_Flow_state_${index}"]`);
  }

  triggerEventCell(index: number): Locator {
    return this.page.locator(`[data-testid="FlowsListingScreen_Flow_schemaCode_${index}"]`);
  }

  rowMenuButton(index: number): Locator {
    return this.page.locator(`[data-testid="FlowsListingScreen_Flow_editButton_${index}"]`);
  }

  /** A filtered list's first row, matched on the searched code — see EntityListPage. */
  protected rowLocatorFor(code: string): Locator {
    return this.codeCell(0).filter({ hasText: code });
  }
}
