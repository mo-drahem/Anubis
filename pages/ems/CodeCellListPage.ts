import { Locator, Page } from '@playwright/test';
import { EntityListPage } from './EntityListPage';

/**
 * List page for EMS entities whose rows can be located by a code `<td>` cell — the same
 * table pattern confirmed for Events (`EventListPage`). Used for Connection, Api Call,
 * Mapper, Script, Global Variable, and Observer until a dedicated indexed testid convention
 * (like Flows' `FlowsListingScreen_Flow_code_<i>`) is captured for each screen.
 */
export class CodeCellListPage extends EntityListPage {
  constructor(
    page: Page,
    protected readonly route: string,
    protected readonly entityName: string,
    private readonly createRoute?: string
  ) {
    super(page);
  }

  codeCell(code: string): Locator {
    return this.page.locator('td', { hasText: code });
  }

  protected rowLocatorFor(code: string): Locator {
    return this.codeCell(code);
  }

  async openCreateForm(): Promise<void> {
    if (!this.createRoute) {
      throw new Error(`${this.entityName} has no confirmed create route in EMS_ROUTES`);
    }
    await this.page.goto(this.createRoute);
    await this.waitUntilReady();
  }
}
