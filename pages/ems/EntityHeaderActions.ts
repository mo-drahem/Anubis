import { Page } from '@playwright/test';
import { CommonSelectors, waitForPageLoad } from './CommonUi';
import { MoveWorkspaceDialog } from './MoveWorkspaceDialog';

/**
 * The shared Draft -> Publish -> Live -> Activate/Restore/Delete lifecycle actions that
 * every EMS configuration entity (Events, Mappers, Connections, API Calls, Scripts, Global
 * Variables, Flows) exposes on its detail view, via one shared header-actions component.
 * Testids confirmed real for Events and Connections (identical
 * `liveDraftHeaderActions_*` family in both `eventListPO.js` and `connectionListPO.js`);
 * presumed identical for Mappers/API Calls/Scripts/Global Variables since they share the
 * same component, per the reference suite's own business-knowledge notes.
 *
 * CONFIRMED via the reference suite's actual action code (`eventListCC.js`), not just its
 * page-object file: Delete-draft and Restore are the SAME element/testid
 * (`liveDraftHeaderActions_restore`) for Events too — `eventListCC.js`'s own
 * `deleteDraftEvent()` clicks `restoreButton`, not the separately-defined
 * `deleteDraftButton` testid, which exists in the page-object file but isn't what the real
 * automation actually clicks. Only the button's label text ("Delete" vs "Restore")
 * distinguishes the two behaviours. This was previously assumed to be a Flows/Mappers-only
 * quirk with Events/Connections using genuinely separate elements — that assumption was
 * wrong for Events specifically, now corrected. `restoreOrDelete()` below is the one real
 * mechanism; `deleteDraftButton` is kept only because it's a real testid in the reference
 * page-object file, in case some entity genuinely does use it independently — don't reach
 * for it as your default.
 */
export class EntityHeaderActions {
  constructor(private readonly page: Page) {}

  get publishButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_publish"]');
  }

  get viewLiveButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_viewLive"]');
  }

  get activateButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_activate"]');
  }

  get deactivateButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_deactivate"]');
  }

  get deleteLiveButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_deleteLive"]');
  }

  /** Real testid, but NOT what the reference suite's own action code clicks — see class doc. */
  get deleteDraftButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_deleteDraft"]');
  }

  /** The actual shared Delete-draft/Restore element — see class-level doc for the evidence. */
  get restoreButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_restore"]');
  }

  get editButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_edit"]');
  }

  get updateWorkspaceButton() {
    return this.page.locator('[data-testid="liveDraftHeaderActions_updateWorkspace"]');
  }

  get deleteDialogConfirmButton() {
    return this.page.locator(CommonSelectors.deleteDialogConfirmButton);
  }

  get deactivateDialogConfirmButton() {
    return this.page.locator(CommonSelectors.deactivateDialogConfirmButton);
  }

  /**
   * Click Publish, then confirm in the dialog that appears — confirmed real sequence from
   * `eventListCC.js`'s `publishEvent()`: the confirm dialog has a button whose visible text
   * is literally "Publish" (not the generic delete/deactivate dialog testids).
   */
  async publish(): Promise<void> {
    await this.publishButton.click();
    const dialog = this.page.locator(CommonSelectors.dialog);
    await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
    // ADDED (2026-09-01, real captured failure): a caller reading the page's rendered content
    // right after this returned (e.g. E2E-04's bodyText() check) got back only the banner +
    // toast notification, with the actual Details/Fields content missing — a real capture,
    // not a hypothesis. The page hadn't settled yet: the toast fires immediately but the
    // underlying re-render lags behind it. Waiting out the page-load signal here, same as
    // every navigation elsewhere in this codebase, closes that race.
    await waitForPageLoad(this.page);
  }

  /**
   * Click Activate, then confirm in the dialog — confirmed real sequence from
   * `eventListCC.js`'s `activateEvent()`, same shape as publish() but the dialog's button
   * reads "Activate".
   */
  async activate(): Promise<void> {
    await this.activateButton.click();
    const dialog = this.page.locator(CommonSelectors.dialog);
    await dialog.getByRole('button', { name: 'Activate', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' }).catch(() => undefined);
    // See publish()'s comment above — same real race, same fix.
    await waitForPageLoad(this.page);
  }

  async deactivate(): Promise<void> {
    await this.deactivateButton.click();
    await this.deactivateDialogConfirmButton.click();
    await waitForPageLoad(this.page);
  }

  /** The "Move this <Entity> to another workspace" dialog — see MoveWorkspaceDialog. */
  get moveWorkspaceDialog(): MoveWorkspaceDialog {
    return new MoveWorkspaceDialog(this.page);
  }

  /**
   * Moves this entity to another workspace, addressed by the target workspace's API CODE.
   *
   * REWRITTEN 2026-09-02 against the real captured dialog. Every selector in the previous
   * implementation was guessed, and two of those guesses were wrong in ways that would have
   * failed on a live run:
   *   - it treated the target field as a TEXT input and typed into it. The real control is an
   *     MUI Select backed by a listbox — typing into it does nothing.
   *   - it looked for a confirm button named /^(Update|Save|Confirm)$/ or a
   *     `UpdateWorkspaceDialog_ConfirmButton` testid. The real one is
   *     `MoveWorkspaceDialog_SubmitButton`.
   *
   * Takes a CODE rather than a display name because each option carries the code in
   * `data-value` and the display name as its text, and codes are what the rest of this suite
   * already works in. Reach for `moveWorkspaceDialog` directly to select by display name,
   * read the current workspace, or assert on the list of available targets.
   */
  async updateWorkspace(targetWorkspaceCode: string): Promise<void> {
    await this.updateWorkspaceButton.click();
    const dialog = this.moveWorkspaceDialog;
    await dialog.waitForOpen();
    await dialog.selectTargetByCode(targetWorkspaceCode);
    await dialog.submit();
  }

  /**
   * Attempts Publish only if the button is actually present and enabled, tolerating either the
   * button or its confirm dialog not behaving as expected — used to probe a permission-
   * restricted user's UI (E2E-09) without hard-failing on whichever shape "blocked" takes
   * (hidden button, disabled button, or a click that silently does nothing). The real,
   * unambiguous check for whether the block worked belongs at the API layer in the caller, same
   * as this project's other permission-block scenarios (see E2E-02's own doc). Returns whether
   * a click was actually attempted, in case a caller wants to distinguish the two paths.
   */
  async publishIfAvailable(): Promise<boolean> {
    const visible = await this.publishButton.isVisible().catch(() => false);
    if (!visible) return false;
    const disabled = await this.publishButton.isDisabled().catch(() => true);
    if (disabled) return false;
    await this.publish().catch(() => undefined);
    return true;
  }

  async deleteLive(): Promise<void> {
    await this.deleteLiveButton.click();
    await this.deleteDialogConfirmButton.click();
    await waitForPageLoad(this.page);
  }

  /**
   * Deletes a draft-only entity (never published, or live version already removed) via the
   * shared restore/delete button — see class-level doc. Verifies the button actually reads
   * "Delete" first so this doesn't silently restore instead when called at the wrong time.
   */
  async deleteDraft(): Promise<void> {
    await this.restoreOrDelete('Delete');
  }

  /**
   * Reverts a draft's edits back to its last-published values via the same shared button —
   * only valid once the entity has a live version. Verifies the label first, same reason.
   */
  async restore(): Promise<void> {
    await this.restoreOrDelete('Restore');
  }

  /**
   * The one real mechanism behind both deleteDraft() and restore(): one button/testid
   * (`liveDraftHeaderActions_restore`), whose label ("Delete" vs "Restore") depends on
   * whether the entity currently has a live version. Required pattern from the reference
   * suite — assert the label before clicking, so a stale assumption about entity state
   * doesn't silently do the wrong thing.
   */
  async restoreOrDelete(expected: 'Delete' | 'Restore'): Promise<void> {
    const button = this.restoreButton;
    await button.waitFor({ state: 'visible' });
    const label = (await button.textContent())?.trim() ?? '';
    if (!label.includes(expected)) {
      throw new Error(
        `Expected the shared restore/delete button to read "${expected}", but it read "${label}" — ` +
          "refusing to click blind (see EntityHeaderActions' class-level doc)."
      );
    }
    await button.click();
    if (expected === 'Delete') {
      await this.deleteDialogConfirmButton.click();
    } else {
      // Restore sometimes shows a confirm dialog and sometimes doesn't (observed in the
      // reference suite's restoreEvent()) — click through only if one actually appears.
      const dialog = this.page.locator(CommonSelectors.dialog);
      if (await dialog.isVisible().catch(() => false)) {
        await dialog.getByRole('button', { name: 'Restore', exact: true }).click();
      }
    }
    await waitForPageLoad(this.page);
  }
}
