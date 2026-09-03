import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { EMS_ROUTES } from './emsRoutes';
import { waitForPageLoad } from './CommonUi';

export type SchemaFieldInput = {
  key: string;
  description: string;
  path: string;
  dataType: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  searchable?: boolean;
};

/**
 * The Event create/edit form at `/events/new`. This is a dedicated page, **not a modal** —
 * correcting an earlier placeholder (`components/CreateEventModal.ts`) that assumed
 * clicking "Create" opened a dialog. Selectors confirmed against
 * cypress/fixtures/pageClasses/desktop/ems/events/eventFormPO.js.
 *
 * Per the reference suite's own working scenarios (`testData/eventScenarios.js`), every real
 * Event creation configures at least one Schema field — the form always starts with one
 * default field row already present at `properties.exampleEntry`, ready to fill in.
 * `configureDefaultSchemaField()` below covers that one default row (enough to satisfy a
 * "create a simple event" scenario); adding further fields or nested object/array fields is
 * a separate, more involved concern (`schemaFormCC.js`'s `addNewField()` /
 * `configureObjectFieldWithNested()`) not ported here yet. Confirmed rule from the reference
 * suite: fill Description -> Path -> Type -> Required -> Searchable -> Default **before**
 * setting Key — the Key drives the field's own selector/keyPath, so renaming it first would
 * break every subsequent selector on that same row.
 *
 * Per the reference suite's own flakiness notes, Event creation is one of the more
 * hydration-error-prone screens on ems-dev — don't be surprised if a create attempt
 * occasionally needs a retry.
 *
 * CONFIRMED by the user (2026-09-01): Short Description is a MANDATORY field on this form —
 * submitting without it is blocked. `fillBasicInfo()`'s own type signature requires it (not just
 * optionally filled) so no call site can silently recreate that failure; Long Description
 * remains optional, unconfirmed either way.
 */
export class EventFormPage extends BasePage {
  readonly nameInput: Locator;
  readonly codeInput: Locator;
  readonly typeDropdown: Locator;
  readonly shortDescriptionInput: Locator;
  readonly longDescriptionInput: Locator;
  readonly submitButton: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.nameInput = page.locator('[data-testid="EventForm_Name"]');
    this.codeInput = page.locator('[data-testid="EventForm_Code"]');
    this.typeDropdown = page.locator('[data-testid="EventForm_Type"]');
    this.shortDescriptionInput = page.locator('[data-testid="EventForm_ShortDescription"]');
    this.longDescriptionInput = page.locator('[data-testid="EventForm_LongDescription"]');
    this.submitButton = page.locator('[data-testid="EventForm_SubmitButton"]');
    // CONFIRMED by the user (2026-09-02): a success message containing "event created
    // successfully" appears after a real create. No confirmed testid/class exists yet for this
    // message anywhere in this repo, so it's matched by its text content directly
    // (case-insensitive, substring) rather than a guessed selector — if this turns out wrong,
    // capture the real element and swap this locator for a precise one.
    this.successMessage = page.getByText(/event created successfully/i);
  }

  /** `type` is the dropdown's `data-value` — confirmed real values are `EVENT` and `FLOW`. */
  typeOption(type: 'EVENT' | 'FLOW'): Locator {
    return this.page.locator(`[data-value="${type}"]`);
  }

  async goto(): Promise<void> {
    await super.goto(EMS_ROUTES.createEvent);
  }

  async fillBasicInfo(fields: {
    name: string;
    code: string;
    type: 'EVENT' | 'FLOW';
    /** MANDATORY — see class doc. Submitting without it is blocked by the real form. */
    shortDescription: string;
    longDescription?: string;
  }): Promise<void> {
    await this.nameInput.fill(fields.name);
    await this.codeInput.fill(fields.code);
    await this.typeDropdown.click();
    await this.typeOption(fields.type).click();
    await this.shortDescriptionInput.fill(fields.shortDescription);
    if (fields.longDescription) {
      await this.longDescriptionInput.fill(fields.longDescription);
    }
  }

  private schemaFieldLocator(fieldType: string, keyPath: string): Locator {
    return this.page.locator(`[data-testid="SchemaForm_Field_${fieldType}_${keyPath}"]`);
  }

  /**
   * Configures the schema form's one default field row (`properties.exampleEntry`) — see
   * class doc. For a brand-new event this is enough to have a valid, non-empty schema.
   */
  async configureDefaultSchemaField(
    field: SchemaFieldInput,
    keyPath = 'properties.exampleEntry'
  ): Promise<void> {
    await this.schemaFieldLocator('Description', keyPath).fill(field.description);
    await this.schemaFieldLocator('Path', keyPath).fill(field.path);

    await this.schemaFieldLocator('Type', keyPath).click();
    await this.page.locator(`[data-value="${field.dataType}"]`).click();

    const requiredCheckbox = this.schemaFieldLocator('Required', keyPath);
    if ((await requiredCheckbox.isChecked()) !== field.required) {
      await requiredCheckbox.click({ force: true });
    }

    if (field.dataType !== 'object' && field.dataType !== 'array' && field.searchable !== undefined) {
      const searchableCheckbox = this.schemaFieldLocator('Searchable', keyPath);
      if (await searchableCheckbox.count()) {
        if ((await searchableCheckbox.isChecked()) !== field.searchable) {
          await searchableCheckbox.click({ force: true });
        }
      }
    }

    // Key LAST — renaming it changes this row's own data-testid/keyPath.
    await this.schemaFieldLocator('Key', keyPath).fill(field.key);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
    await waitForPageLoad(this.page);
  }
}
