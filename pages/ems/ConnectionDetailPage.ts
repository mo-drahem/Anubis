import { Page, Locator } from '@playwright/test';
import { GenericEntityDetailPage } from './GenericEntityDetailPage';
import { EMS_ROUTES } from './emsRoutes';
import { CommonSelectors } from './CommonUi';

/**
 * A Connection's detail view at `/connections/{id}`.
 *
 * ALL SELECTORS CONFIRMED 2026-09-02 from a real captured page body. Until now Connection had
 * no dedicated page object at all — tests fell back to `GenericEntityDetailPage` and could only
 * assert on whole-page text (E2E-04's Vault-secret check does exactly that). This class turns
 * that into precise, field-level assertions.
 *
 * The screen is a set of MUI tables whose value cells each carry a
 * `ConnectionScreen_<field>` testid. Repeating rows (headers, query params, path variables) use
 * an indexed convention: `ConnectionScreen_<section>_<key|value|description>_<i>`.
 *
 * Note one real inconsistency in the app's own naming, preserved here verbatim because it is
 * what the DOM ships: every other field is camelCase (`connectionTimeoutInSec`) but the retry
 * count is `ConnectionScreen_NoOfRetries` — capital N. Don't "fix" it.
 */
export class ConnectionDetailPage extends GenericEntityDetailPage {
  readonly statusChip: Locator;

  // --- Details card ---
  readonly id: Locator;
  readonly name: Locator;
  readonly code: Locator;
  readonly state: Locator;
  readonly description: Locator;
  readonly createdBy: Locator;
  readonly createdDate: Locator;
  readonly modifiedBy: Locator;
  readonly modifiedDate: Locator;
  readonly workspaceCode: Locator;

  // --- Connection Properties card ---
  readonly type: Locator;
  readonly host: Locator;
  readonly allowedHttpMethods: Locator;
  readonly acceptedBodyTypes: Locator;
  readonly connectionTimeoutInSec: Locator;
  readonly numberOfRetries: Locator;

  constructor(page: Page) {
    super(page);
    const field = (name: string) => page.locator(`[data-testid="ConnectionScreen_${name}"]`);

    this.statusChip = this.pageTitle.locator(CommonSelectors.statusChip);

    this.id = field('id');
    this.name = field('name');
    this.code = field('code');
    this.state = field('state');
    this.description = field('description');
    this.createdBy = field('createdBy');
    this.createdDate = field('createdDate');
    this.modifiedBy = field('modifiedBy');
    this.modifiedDate = field('modifiedDate');
    this.workspaceCode = field('workspaceCode');

    this.type = field('type');
    this.host = field('host');
    this.allowedHttpMethods = field('allowedHttpMethods');
    this.acceptedBodyTypes = field('acceptedBodyTypes');
    this.connectionTimeoutInSec = field('connectionTimeoutInSec');
    // Capital "N" is the app's own spelling — see class doc.
    this.numberOfRetries = field('NoOfRetries');
  }

  /** Opens `/connections/{id}` directly. */
  async open(id: string): Promise<void> {
    await this.openDraft(EMS_ROUTES.connectionDetail(id));
  }

  /** A cell from one of the repeating tables, e.g. `row('headers', 'key', 0)`. */
  row(section: 'headers' | 'queryParams' | 'pathVariables', column: 'key' | 'value' | 'description', index: number): Locator {
    return this.page.locator(`[data-testid="ConnectionScreen_${section}_${column}_${index}"]`);
  }
}
