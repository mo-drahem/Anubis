import { Page } from '@playwright/test';
import { CommonSelectors, waitForPageLoad } from './CommonUi';

export type FlowDetailsInput = {
  name: string;
  code: string;
  description: string;
};

/**
 * The Flow Details modal that stages Name/Code/Description into local canvas state before
 * `FlowFormPage.submit()` fires the real create/update request. Selectors use MUI dialog
 * labels first (visible text confirmed on ems-dev for similar modals) with presumed testids
 * as a fallback — tighten to captured testids once codegen confirms them.
 */
export class FlowDetailsModal {
  constructor(private readonly page: Page) {}

  private get dialog() {
    return this.page.locator(CommonSelectors.dialog).last();
  }

  private field(label: RegExp, testId: string) {
    return this.dialog
      .getByLabel(label)
      .or(this.dialog.locator(`[data-testid="${testId}"]`))
      .first();
  }

  async waitForOpen(): Promise<void> {
    await this.dialog.waitFor({ state: 'visible' });
  }

  async isOpen(): Promise<boolean> {
    return this.dialog.isVisible().catch(() => false);
  }

  async fillAndSave(details: FlowDetailsInput): Promise<void> {
    await this.waitForOpen();
    await this.field(/^Name/i, 'FlowDetailsModal_Name').fill(details.name);
    await this.field(/^Code/i, 'FlowDetailsModal_Code').fill(details.code);
    await this.field(/^Description/i, 'FlowDetailsModal_Description').fill(details.description);
    const saveButton = this.dialog
      .getByRole('button', { name: /^Save$/i })
      .or(this.dialog.locator('[data-testid="FlowDetailsModal_SaveButton"]'));
    await saveButton.click();
    await this.dialog.waitFor({ state: 'hidden' });
    await waitForPageLoad(this.page);
  }
}
