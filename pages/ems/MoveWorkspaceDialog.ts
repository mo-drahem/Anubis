import { Page, Locator } from '@playwright/test';
import { waitForPageLoad } from './CommonUi';

/**
 * The "Move this <Entity> to another workspace" dialog, opened by the shared
 * `liveDraftHeaderActions_updateWorkspace` header button (visible label: "Workspace").
 *
 * FULLY CONFIRMED 2026-09-02 from a real captured Connection details page with the dialog open.
 * Per the user, this same dialog is used for EVERY configuration type, which is consistent with
 * it hanging off the shared header-actions component.
 *
 * Real structure:
 *   <h2>Move this Connection to another workspace</h2>       <- title names the entity type
 *   <form data-testid="MoveWorkspaceDialog">
 *     [From] MUI Select, DISABLED, showing the current workspace
 *     [To]   MUI Select (listbox), initially empty
 *     <button data-testid="MoveWorkspaceDialog_SubmitButton">Save</button>
 *     <button data-testid="MoveWorkspaceDialog_CancelButton">Cancel</button>
 *
 * TWO THINGS THE PREVIOUS (guessed) IMPLEMENTATION GOT WRONG, both of which would have failed:
 *
 *   1. **"To" is a SELECT, not a text field.** The earlier code clicked a picker and TYPED the
 *      workspace name into it. This is an MUI Select whose options come from a listbox — typing
 *      into it does nothing. (The verbal description of "an empty field to enter the new
 *      workspace" reads like a text input; the DOM says otherwise. Worth knowing, since typing
 *      would fail silently rather than loudly.)
 *   2. **Options carry the workspace CODE in `data-value` and the DISPLAY NAME as text.**
 *      e.g. `<li role="option" data-value="drahem-1">drahem-workspace</li>`. So a caller can
 *      select by either, and this class supports both — `selectTargetByCode()` is the safer one
 *      for automation, since codes are what the API layer already works in.
 *
 * The Save button starts non-interactive: it is wrapped in a
 * `<div style="opacity: 0.5; pointer-events: none">` until a target workspace is chosen. A
 * click before then hits the wrapper and does nothing, so `submit()` waits for the wrapper to
 * become interactive rather than clicking blindly.
 */
export class MoveWorkspaceDialog {
  readonly form: Locator;
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  constructor(private readonly page: Page) {
    this.form = page.locator('[data-testid="MoveWorkspaceDialog"]');
    this.submitButton = page.locator('[data-testid="MoveWorkspaceDialog_SubmitButton"]');
    this.cancelButton = page.locator('[data-testid="MoveWorkspaceDialog_CancelButton"]');
  }

  /** The dialog's own container (the MUI Dialog paper wrapping the form). */
  private get dialog() {
    return this.page.locator('[role="dialog"]').filter({ has: this.form });
  }

  async waitForOpen(): Promise<void> {
    await this.form.waitFor({ state: 'visible' });
  }

  async isOpen(): Promise<boolean> {
    return this.form.isVisible().catch(() => false);
  }

  /**
   * The disabled "From" select, showing the workspace the entity currently belongs to.
   * Useful as an assertion target: it proves the dialog opened against the right record.
   */
  get fromSelect(): Locator {
    return this.form.locator('.MuiFormControl-root').first().locator('[role="combobox"]');
  }

  /** The "To" select — the second FormControl in the form. */
  get toSelect(): Locator {
    return this.form.locator('.MuiFormControl-root').nth(1).locator('[role="combobox"]');
  }

  /** Current workspace as rendered in the disabled "From" field. */
  async currentWorkspaceText(): Promise<string> {
    return (await this.fromSelect.innerText()).trim();
  }

  /** Opens the "To" dropdown and returns its options (they render in a portal, not in the form). */
  private async openTargetOptions(): Promise<Locator> {
    await this.toSelect.click();
    const options = this.page.locator('[role="listbox"] [role="option"]');
    await options.first().waitFor({ state: 'visible' });
    return options;
  }

  /**
   * Selects the target workspace by its API CODE (`data-value`) — preferred, because codes are
   * what the API layer and this suite's fixtures already use, and they are unambiguous.
   */
  async selectTargetByCode(workspaceCode: string): Promise<void> {
    await this.openTargetOptions();
    await this.page.locator(`[role="option"][data-value="${workspaceCode}"]`).click();
  }

  /** Selects the target workspace by its DISPLAY name (the option's visible text). */
  async selectTargetByName(workspaceName: string): Promise<void> {
    const options = await this.openTargetOptions();
    await options.filter({ hasText: workspaceName }).first().click();
  }

  /** Every selectable target workspace, as `{ code, name }` — handy for assertions. */
  async availableTargets(): Promise<Array<{ code: string; name: string }>> {
    const options = await this.openTargetOptions();
    const count = await options.count();
    const targets: Array<{ code: string; name: string }> = [];
    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      targets.push({
        code: (await option.getAttribute('data-value')) ?? '',
        name: (await option.innerText()).trim(),
      });
    }
    await this.page.keyboard.press('Escape');
    return targets;
  }

  /**
   * Clicks Save. Waits for the button to actually become interactive first — it sits inside a
   * `pointer-events: none` wrapper until a target is chosen, so an early click silently does
   * nothing instead of failing.
   */
  async submit(): Promise<void> {
    await this.submitButton.waitFor({ state: 'visible' });
    await this.submitButton.click();
    await this.form.waitFor({ state: 'hidden' }).catch(() => undefined);
    await waitForPageLoad(this.page);
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.form.waitFor({ state: 'hidden' }).catch(() => undefined);
  }
}
