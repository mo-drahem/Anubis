import { test, expect } from '../../fixtures/hybrid.fixture';
import { FlowListPage } from '../../pages/ems/FlowListPage';

/**
 * FLOW-001 — list loads; search finds a flow by code (tolerate indexing lag). Seeded via the
 * API (`seededFlow`) rather than the UI flow-builder: what's under test here is the list/search
 * screen, not flow creation, and this project's `tests/regression/README.md` calls out exactly
 * this case (seeding via API when the builder itself isn't what's being verified) — see also
 * that fixture's own doc comment on why this is safe (a real, confirmed-required-fields Flow
 * create payload, not a guess).
 *
 * FLOW-002 through FLOW-014 and E2E-003 (which all require building a NEW flow through the UI
 * canvas) are NOT built yet — `FlowFormPage` has the canvas-node pieces (confirmed real
 * testids), but creating a flow also requires a "Flow Details" modal to set Name/Code/
 * Description before the canvas's own Create Draft button will do anything (see
 * `FlowFormPage`'s class doc). No selector for that modal has been captured anywhere in this
 * repo or the uploaded Cypress report (the report only kept `code` strings for the small number
 * of *failed* tests, and none of the Flow suite's tests failed) — flagged to the user as a
 * blocker rather than guessed.
 */
test('FLOW-001 — list loads; search finds a flow by code (tolerate indexing lag)', { tag: '@regression' }, async ({
  authenticatedPage: page,
  seededFlow,
}) => {
  const flowListPage = new FlowListPage(page);

  await flowListPage.goto();
  await expect(flowListPage.pageTitle).toBeVisible();

  await flowListPage.waitForSearchable(seededFlow.code);

  await expect(flowListPage.codeCell(0)).toContainText(seededFlow.code);
});
