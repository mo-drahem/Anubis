import { Locator } from '@playwright/test';
import { EMS_ROUTES } from './emsRoutes';
import { EntityListPage } from './EntityListPage';

/**
 * The Events list at `/events`. Selectors confirmed against
 * cypress/fixtures/pageClasses/desktop/ems/events/eventListPO.js AND its actual action code
 * (`eventListCC.js`) — the list renders a real table where the event **name** is a `<th>` cell
 * (clicking it opens the event's detail page at `/events/{id}`) and the **code** is a `<td>`
 * cell, per `eventListCC.js`'s own `cy.contains('th'|'td', ...)` assertions. Search does not
 * require pressing Enter — the list live-filters on input.
 *
 * The generic list behaviour (page title + search locators, `search()`, and the
 * reload-and-retry `waitForSearchable()`) now comes from `EntityListPage`; only the
 * Events-specific row cells and the click-through-to-detail path live here. Note that Events
 * now also gets the disabled-input-resilient search that only Flows had before — same
 * background auto-refresh applies to both lists.
 */
export class EventListPage extends EntityListPage {
  protected readonly route = EMS_ROUTES.events;
  protected readonly entityName = 'Event';

  /** The event-name cell — a `<th>`, confirmed real (see class doc). */
  nameCell(name: string): Locator {
    return this.page.locator('th', { hasText: name });
  }

  /** The event-code cell — a `<td>`, confirmed real (see class doc). */
  codeCell(code: string): Locator {
    return this.page.locator('td', { hasText: code });
  }

  protected rowLocatorFor(code: string): Locator {
    return this.codeCell(code);
  }

  /** Clicks the event's name cell and waits for the real `/events/{id}` detail route. */
  async openDetails(name: string): Promise<void> {
    await this.nameCell(name).click();
    await this.page.waitForURL(/\/events\/[a-f0-9]+$/);
    await this.waitUntilReady();
  }

  /**
   * Navigates to the Event create form. Uses a direct navigation rather than `super.goto()`
   * because `EntityListPage.goto()` is the no-arg "go to THIS list" override — the create route
   * is a different screen, not this list.
   */
  async openCreateForm(): Promise<void> {
    await this.page.goto(EMS_ROUTES.createEvent);
    await this.waitUntilReady();
  }
}
