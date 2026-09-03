import { Page } from '@playwright/test';
import { EMS_ROUTES } from './emsRoutes';
import { EntityFormPage } from './EntityFormPage';

/**
 * PRESUMED SELECTORS — NOT CAPTURED. This class inherits EntityFormPage, which builds its
 * locators from a `{Prefix}_Name` / `{Prefix}_Code` / `{Prefix}_SubmitButton` testid convention
 * extrapolated from the one form that IS confirmed (`EventForm_*`). No testid on this screen has
 * ever been observed. Nothing uses this class yet, which is the only reason it is harmless.
 *
 * BEFORE WRITING A TEST AGAINST IT: open the real create form, capture the actual testids, and
 * either confirm the convention holds or override the locators here. A test built on these
 * without that step will fail live — or worse, silently match nothing.
 */
export class ConnectionFormPage extends EntityFormPage {
  constructor(page: Page) {
    super(page, 'ConnectionForm', EMS_ROUTES.createConnection);
  }
}
