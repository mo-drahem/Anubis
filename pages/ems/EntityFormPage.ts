import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { waitForPageLoad } from './CommonUi';

export type EntityFormDetails = {
  name: string;
  code: string;
  description?: string;
  shortDescription?: string;
  longDescription?: string;
};

/**
 * Shared create/edit form fields for EMS configuration entities. Selectors follow the
 * confirmed `{Prefix}_Name` / `{Prefix}_Code` convention from `EventFormPage`
 * (`EventForm_*`) and are PRESUMED identical for other entities until independently
 * captured — update the `testIdPrefix` per subclass if a live run disagrees.
 */
export class EntityFormPage extends BasePage {
  readonly nameInput: Locator;
  readonly codeInput: Locator;
  readonly descriptionInput: Locator;
  readonly shortDescriptionInput: Locator;
  readonly longDescriptionInput: Locator;
  readonly submitButton: Locator;

  constructor(
    page: Page,
    private readonly testIdPrefix: string,
    private readonly createRoute: string
  ) {
    super(page);
    this.nameInput = page.locator(`[data-testid="${testIdPrefix}_Name"]`);
    this.codeInput = page.locator(`[data-testid="${testIdPrefix}_Code"]`);
    this.descriptionInput = page.locator(`[data-testid="${testIdPrefix}_Description"]`);
    this.shortDescriptionInput = page.locator(`[data-testid="${testIdPrefix}_ShortDescription"]`);
    this.longDescriptionInput = page.locator(`[data-testid="${testIdPrefix}_LongDescription"]`);
    this.submitButton = page.locator(`[data-testid="${testIdPrefix}_SubmitButton"]`);
  }

  async goto(): Promise<void> {
    await super.goto(this.createRoute);
  }

  async fillBasicInfo(details: EntityFormDetails): Promise<void> {
    await this.nameInput.fill(details.name);
    await this.codeInput.fill(details.code);
    if (details.description !== undefined) {
      await this.descriptionInput.fill(details.description);
    }
    if (details.shortDescription !== undefined) {
      await this.shortDescriptionInput.fill(details.shortDescription);
    }
    if (details.longDescription !== undefined) {
      await this.longDescriptionInput.fill(details.longDescription);
    }
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
    await waitForPageLoad(this.page);
  }
}
