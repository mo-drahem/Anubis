import { test } from '@playwright/test';
import { BaseApiClient } from '../BaseApiClient';

/**
 * Reporting service — three endpoints, all confirmed to exist against the magpie reference's
 * `ReportingServiceClient` interface (`REPORT_PATH`, `GENERATE_REPORT_PATH`,
 * `EXPLORER_SEARCH_PATH`). The HTTP verbs below are inferred from magpie's method-naming
 * convention (`get...Exchange` taking `queryParams` -> GET; taking a body -> POST) and from
 * EMS_API_Domain_Notes.md's confirmed `GET /report?type=...` shape — magpie's own
 * `ReportingServiceClientImpl` wasn't available to double-check directly, so **capture a real
 * response for each of these against dev before asserting on anything beyond status 200/shape**,
 * per this project's capture-first discipline.
 *
 * See EMS_API_Domain_Notes.md's "Reporting semantics" section: `type` selects the execution
 * layer (`EVENT` | `FLOW` | `API_CALL` | `SCRIPT`), and filtering by `emsJobId` (not `code`) is
 * how you get every row for one pushed event.
 */
export class ReportingApi {
  constructor(private readonly client: BaseApiClient) {}

  /** `GET /report` — e.g. `{ type: 'EVENT', emsJobId: '...' }`. */
  list(queryParams: Record<string, string | number | boolean>) {
    return test.step('List report', () => this.client.get('/report', queryParams));
  }

  /** `GET /report/generate` — same query-param shape as `list()`; unconfirmed how the response
   *  differs from the plain list endpoint (report-generation job vs. inline data?) — verify
   *  against a live call before relying on this in a test. */
  generate(queryParams: Record<string, string | number | boolean>) {
    return test.step('Generate report', () => this.client.get('/report/generate', queryParams));
  }

  /** `POST /report/explorer/search` — body shape mirrors magpie's `ReportExplorer` domain
   *  object, not yet ported here; pass whatever shape a captured request/response confirms. */
  explorerSearch(body: unknown) {
    return test.step('Search report explorer', () => this.client.post('/report/explorer/search', body));
  }
}
