import { Page, expect } from '@playwright/test';
import { EntityHeaderActions } from '../pages/ems/EntityHeaderActions';
import { CommonSelectors } from '../pages/ems/CommonUi';

/**
 * Reusable assertions for the Draft -> Publish -> Live -> Activate/Restore/Delete lifecycle
 * shared by every EMS configuration entity (see EntityHeaderActions). Centralizing these here
 * means each entity's spec file (events.ui.spec.ts, flows.ui.spec.ts, and — once ported —
 * connections/api-calls/mappers/scripts/global-variables) asserts the same two confirmed
 * business rules the same way, instead of re-deriving them per file.
 *
 * Both rules below are CONFIRMED at the API layer (EMS_API_Test_Scenarios.md /
 * EMS_API_Domain_Notes.md — Flow, Observer, Schema, Connection all reject a delete while
 * ACTIVE, and reject deleting a Draft while a Live twin exists, both with a real 400).
 *
 * RESOLVED 2026-09-03: how the UI surfaces the ACTIVE-blocks-delete rule is no longer an open
 * question. A real EVT-009 run against ems-dev captured it — **the Delete-live button is simply
 * not rendered while the entity is ACTIVE**. Of the three shapes previously considered plausible
 * (disabled button / hidden button / click-through error), it is the hidden one.
 * `expectDeleteLiveBlockedWhileActive` now asserts that specific behaviour instead of hedging
 * across all three. The other rule (restore/delete is one shared button whose label flips) was
 * already confirmed — see EntityHeaderActions' class doc — so `expectDraftDeleteBlockedByLiveTwin`
 * asserts that directly.
 */

export async function expectDeleteLiveBlockedWhileActive(
  page: Page,
  headerActions: EntityHeaderActions,
  revisitLiveDetail: () => Promise<void>
): Promise<void> {
  // CAPTURED AT LAST (2026-09-03, EVT-009 against ems-dev). This function used to be written
  // shape-agnostically because nobody knew HOW the UI expressed the block — hidden button,
  // disabled button, or a click that errors. Its own doc said to tighten it once a real attempt
  // was captured. It has been:
  //
  //   **While the live entity is ACTIVE, the Delete-live button is not rendered at all.**
  //
  // The evidence: EVT-009 reached the Live view successfully (EventDetailPage.ensureOnLiveView()
  // verifies that positively and throws otherwise, so this is not a "wrong page" false alarm),
  // and `liveDraftHeaderActions_deleteLive` was still "element(s) not found". Hiding is the
  // mechanism.
  //
  // That also means the OLD final assertion here was wrong: it asserted the Delete-live button
  // WAS visible after revisiting, as its proof the entity still existed. That can only hold for
  // an INACTIVE entity — so on the very rule this function exists to check, it asserted the
  // opposite of the truth.
  await expect(
    headerActions.deleteLiveButton,
    'Delete-live should be hidden while the entity is ACTIVE — that is how EMS blocks the delete'
  ).toBeHidden();

  // The entity must still be there, and still ACTIVE. The Deactivate button is the positive
  // signal for exactly that: it only renders for a live entity in the ACTIVE state (an INACTIVE
  // one offers Activate instead), so its presence proves both facts in one check — and it does
  // so without depending on the button whose absence is the thing under test.
  await revisitLiveDetail();
  await expect(
    headerActions.deactivateButton,
    'The live entity should still exist and still be ACTIVE after the blocked delete attempt'
  ).toBeVisible();
}

/**
 * Confirms the shared restore/delete button reads "Restore" (not "Delete") — the real,
 * confirmed manifestation of "delete draft is blocked while a live twin exists": ONE element
 * whose label is the only thing that changes, not two separate buttons/states (see
 * EntityHeaderActions' class doc).
 */
export async function expectDraftDeleteBlockedByLiveTwin(
  headerActions: EntityHeaderActions
): Promise<void> {
  await expect(headerActions.restoreButton).toBeVisible();
  await expect(headerActions.restoreButton).toContainText('Restore');
}

/** Publish a draft to live, then activate it — the common two-step happy path. */
export async function publishAndActivate(headerActions: EntityHeaderActions): Promise<void> {
  await headerActions.publish();
  await headerActions.activate();
}

/**
 * Deactivate a live+ACTIVE entity, then delete it — the confirmed real unblock sequence
 * (EVT-009 / FLOW-013): deactivate first, then Delete Live succeeds.
 */
export async function deactivateThenDeleteLive(headerActions: EntityHeaderActions): Promise<void> {
  await headerActions.deactivate();
  await headerActions.deleteLive();
}
