import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { EMS_ROUTES } from './emsRoutes';
import { CommonSelectors, waitForPageLoad } from './CommonUi';

/**
 * The execution reporting / data-explorer dashboard at `/dashboard?type=...`.
 * CONFIRMED shape from EMS_API_Domain_Notes.md and the product URL
 * (`/dashboard?type=EVENT&code=...`); filtering by `emsJobId` is the API-confirmed
 * correlation key (see claude/ems-domain-knowledge.md "Reporting semantics").
 *
 * No dedicated testids captured yet — assertions use page text and the shared search
 * input where present.
 */
export class DashboardPage extends BasePage {
  readonly pageTitle: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator(CommonSelectors.pageTitle);
    this.searchInput = page.locator(CommonSelectors.searchInput);
  }

  async openForJob(type: 'EVENT' | 'FLOW' | 'API_CALL' | 'SCRIPT', emsJobId: string): Promise<void> {
    await super.goto(EMS_ROUTES.dashboard({ type, emsJobId }));
    await waitForPageLoad(this.page);
  }

  async openDataExplorer(): Promise<void> {
    await super.goto(EMS_ROUTES.dataExplorer);
    await waitForPageLoad(this.page);
  }

  /** Best-effort: type into search if the explorer exposes the shared list search box. */
  async search(term: string): Promise<void> {
    if (await this.searchInput.isVisible().catch(() => false)) {
      await this.searchInput.fill(term);
      await waitForPageLoad(this.page);
    }
  }

  async expectTextVisible(text: string): Promise<void> {
    await this.page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
  }
}
