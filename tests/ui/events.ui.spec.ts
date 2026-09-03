import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { EventListPage } from '../../pages/ems/EventListPage';
import { EventFormPage, SchemaFieldInput } from '../../pages/ems/EventFormPage';
import { EventDetailPage } from '../../pages/ems/EventDetailPage';
import { uniqueEventName } from '../../utils/testData';
import { WorkspaceSwitcher } from '../../pages/ems/WorkspaceSwitcher';
import { testUser, WORKSPACE_NAME } from '../../utils/testEnv';
import {
  expectDeleteLiveBlockedWhileActive,
  expectDraftDeleteBlockedByLiveTwin,
} from '../../utils/uiLifecycle';

/**
 * Events lifecycle — EVT-001..010 from the UI test catalog. Run as one ordered
 * (`describe.serial`) chain on a single shared page rather than 10 hermetic tests, because the
 * scenarios are inherently stateful (you can't test Activate before Publish, or "delete draft
 * blocked by live twin" after that live twin has already been deleted). Each `test()` still
 * carries its own catalog ID/title so a single scenario can be run/reported individually.
 *
 * GAP flagged directly rather than silently worked around: EVT-007's "verify change" /
 * "verify reverted" steps below reuse EventFormPage's create-form field locators against the
 * inline edit view reached via headerActions.editButton. That reuse assumes the same form
 * component renders for both create and edit (a reasonable, but NOT directly confirmed,
 * assumption — no confirmed read-only "view" selectors for the changed field exist yet on
 * EventDetailPage). If EVT-007 fails, this is the first thing to check against a real capture.
 */
test.describe.serial('Events lifecycle (EVT-001..010)', { tag: '@regression' }, () => {
  let page: Page;
  let eventListPage: EventListPage;
  let eventFormPage: EventFormPage;
  let detailPage: EventDetailPage;

  let primaryName: string;
  let primaryCode: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(testUser.email, testUser.password);

    // ADDED 2026-09-02 — REAL DEFECT, not a tidy-up. This describe.serial block builds its own
    // Page (it needs one shared across an ordered chain, which the per-test `authenticatedPage`
    // fixture cannot give it), and in doing so it bypassed the fixture's workspace switch. A
    // fresh EMS session opens on OMS, so every Event this file created, published, activated and
    // deleted — EVT-003 alone creates five — was being written to OMS rather than the suite's
    // own test workspace.
    //
    // Any spec that hand-rolls its Page instead of using `authenticatedPage` has to do this
    // itself; the fixture covers every other UI test.
    await new WorkspaceSwitcher(page).switchTo(WORKSPACE_NAME);

    eventListPage = new EventListPage(page);
    eventFormPage = new EventFormPage(page);
    detailPage = new EventDetailPage(page);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  /** Opens the given event's detail page via the confirmed list->search->openDetails path. */
  async function openEventDetail(name: string, code: string): Promise<void> {
    await eventListPage.goto();
    await eventListPage.search(code);
    await eventListPage.openDetails(name);
  }

  test('EVT-001 — list loads with expected columns', { tag: '@smoke' }, async () => {
    await eventListPage.goto();
    await expect(eventListPage.pageTitle).toBeVisible();
    // No confirmed column-header testids exist yet (only per-row name/code cell locators) —
    // the search box's presence is the confirmed proxy that the list screen itself rendered.
    await expect(eventListPage.searchInput).toBeVisible();
  });

  test('EVT-003 — create an event with ALL schema field data types', async () => {
    // RAISED (2026-09-03, real captured failure: "Test timeout of 60000ms exceeded"). This is
    // not flakiness — the test genuinely performs FIVE complete create-and-verify cycles, one
    // per schema data type (string, number, boolean, object, array). Each is: open the form,
    // fill it, configure the schema field, submit, then find the new Event through the list
    // (which itself retries up to 5x with a reload to ride out indexing lag) and open it. The
    // run died partway through the third. Five lifecycles never fitted in a 60s budget sized
    // for one; it had simply been passing on faster days.
    //
    // NOTE this test is also the head of the serial chain, so when it times out it takes the
    // whole block with it — this run skipped 8 tests, including EVT-002/004/005 which have no
    // dependency on it whatsoever. Splitting these into independent tests is the real fix and
    // is queued; this budget stops the cascade in the meantime.
    test.setTimeout(240_000);

    const dataTypes: SchemaFieldInput['dataType'][] = ['string', 'number', 'boolean', 'object', 'array'];

    for (const dataType of dataTypes) {
      const name = uniqueEventName(`QA-Event-${dataType}`);
      const code = name.replace(/[^a-zA-Z0-9_-]/g, '_').toUpperCase();

      await eventFormPage.goto();
      await eventFormPage.fillBasicInfo({
        name,
        code,
        type: 'EVENT',
        shortDescription: 'Created by ems-ui-automation UI tests',
        longDescription: 'Created by ems-ui-automation UI tests',
      });
      await eventFormPage.configureDefaultSchemaField({
        key: 'exampleField',
        description: `Example ${dataType} field`,
        path: 'exampleField',
        dataType,
        required: false,
        searchable: dataType !== 'object' && dataType !== 'array' ? true : undefined,
      });
      await eventFormPage.submit();

      // Confirm it was actually created, regardless of where submit() redirects to (that
      // destination isn't confirmed) — via the confirmed list search + openDetails path.
      await openEventDetail(name, code);
      expect(detailPage.isOnDetailUrl()).toBe(true);

      if (dataType === 'string') {
        // Carried through the rest of this lifecycle (EVT-002, EVT-004..010).
        primaryName = name;
        primaryCode = code;
      } else {
        // Not needed further — clean it up now via the shared restore/delete button (a fresh
        // draft-only event's button reads "Delete").
        await detailPage.headerActions.deleteDraft();
      }
    }
  });

  test('EVT-002 — search live-filters the list by name/code', async () => {
    await eventListPage.goto();
    await eventListPage.search(primaryCode);

    await expect(eventListPage.codeCell(primaryCode)).toBeVisible();
    await expect(eventListPage.nameCell(primaryName)).toBeVisible();
  });

  test('EVT-004 — missing a required field blocks submit', async () => {
    await eventFormPage.goto();
    // Deliberately leave Name/Code empty and attempt submit.
    await eventFormPage.submit();

    // Defensive assertion: exact error-message copy isn't confirmed, so this checks the
    // real observable outcome instead — an invalid submit does not leave the create form.
    expect(new URL(page.url()).pathname.includes('/new')).toBe(true);
    await expect(eventFormPage.nameInput).toBeVisible();
  });

  test('EVT-005 — duplicate event code is rejected', async () => {
    await eventFormPage.goto();
    await eventFormPage.fillBasicInfo({
      name: uniqueEventName('QA-Event-dup'),
      code: primaryCode, // reuse the already-created primary event's code
      type: 'EVENT',
      // Mandatory (see EventFormPage class doc) — filled here so this test's rejection is
      // isolated to the duplicate-code dimension it's actually targeting, not confounded by a
      // separate missing-required-field block.
      shortDescription: 'Created by ems-ui-automation',
    });
    await eventFormPage.configureDefaultSchemaField({
      key: 'exampleField',
      description: 'Duplicate-code attempt',
      path: 'exampleField',
      dataType: 'string',
      required: false,
      searchable: true,
    });
    await eventFormPage.submit();

    // Same defensive signal as EVT-004: a rejected submit does not leave the create form.
    expect(new URL(page.url()).pathname.includes('/new')).toBe(true);
  });

  test('EVT-006 — publish a draft event to live; status updates', async () => {
    await openEventDetail(primaryName, primaryCode);
    await detailPage.headerActions.publish();

    // publish() can redirect back to the Events list instead of staying on the detail page
    // (confirmed real in the reference suite) — re-open from the list either way.
    if (!detailPage.isOnDetailUrl()) {
      await openEventDetail(primaryName, primaryCode);
    }
    await expect(detailPage.statusChip).toBeVisible();
  });

  test('EVT-007 — edit event, verify change, restore, verify reverted', async () => {
    await openEventDetail(primaryName, primaryCode);

    const updatedDescription = `Updated by ems-ui-automation @ ${Date.now()}`;
    await detailPage.headerActions.editButton.click();
    // GAP (see file-level doc): assumes the inline edit view reuses EventFormPage's testids.
    await eventFormPage.longDescriptionInput.fill(updatedDescription);
    await eventFormPage.submit();

    // "Verify change": no confirmed read-only selector exists yet for the displayed
    // description, so this confirms the edit completed without error (still a valid detail
    // page) rather than the field's displayed value — flagged as a gap in the file-level doc.
    if (!detailPage.isOnDetailUrl()) {
      await openEventDetail(primaryName, primaryCode);
    }
    expect(detailPage.isOnDetailUrl()).toBe(true);

    await detailPage.headerActions.restore();

    // "Verify reverted": same gap — confirms restore completed without error.
    if (!detailPage.isOnDetailUrl()) {
      await openEventDetail(primaryName, primaryCode);
    }
    expect(detailPage.isOnDetailUrl()).toBe(true);
  });

  test('EVT-008 — activate / deactivate a live event', async () => {
    await openEventDetail(primaryName, primaryCode);
    await detailPage.ensureOnLiveView();

    await detailPage.headerActions.activate();
    await expect(detailPage.statusChip).toContainText(/ACTIVE/i);

    await detailPage.headerActions.deactivate();
    await expect(detailPage.statusChip).toContainText(/INACTIVE/i);

    // Leave it ACTIVE again — EVT-009 needs an ACTIVE live entity to test the delete block.
    await detailPage.headerActions.activate();
    await expect(detailPage.statusChip).toContainText(/ACTIVE/i);
  });

  test('EVT-010 — delete draft is blocked while a live twin exists (shared button reads Restore)', async () => {
    await openEventDetail(primaryName, primaryCode);
    await expectDraftDeleteBlockedByLiveTwin(detailPage.headerActions);
  });

  test('EVT-009 — delete live is blocked while ACTIVE; deactivate then delete succeeds', async () => {
    await openEventDetail(primaryName, primaryCode);
    await detailPage.ensureOnLiveView();

    await expectDeleteLiveBlockedWhileActive(page, detailPage.headerActions, async () => {
      await openEventDetail(primaryName, primaryCode);
      await detailPage.ensureOnLiveView();
    });

    // Confirmed real unblock sequence: deactivate, then Delete Live succeeds.
    await detailPage.headerActions.deactivate();
    await detailPage.headerActions.deleteLive();

    // Teardown: the draft copy created by EVT-007's edit may still remain — remove it too so
    // this run doesn't leave an orphaned draft behind.
    if (!detailPage.isOnDetailUrl()) {
      await openEventDetail(primaryName, primaryCode).catch(() => undefined);
    }
    await detailPage.headerActions.deleteDraft().catch(() => undefined);
  });
});
