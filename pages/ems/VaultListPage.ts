import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { EMS_ROUTES } from './emsRoutes';
import { CommonSelectors } from './CommonUi';

/**
 * Vault secrets list at `/vault`. No create route is confirmed in EMS_ROUTES — secrets are
 * typically created from this list screen's own action button rather than a `/vault/new` URL.
 */
export class VaultListPage extends BasePage {
  readonly pageTitle: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    super(page);
    this.pageTitle = page.locator(CommonSelectors.pageTitle);
    this.searchInput = page.locator(CommonSelectors.searchInput);
  }

  async goto(): Promise<void> {
    await super.goto(EMS_ROUTES.vault);
  }

  secretRow(code: string) {
    return this.page.locator('td', { hasText: code });
  }
}
