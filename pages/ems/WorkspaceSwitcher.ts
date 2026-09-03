import { Page, Locator } from '@playwright/test';
import { waitForPageLoad } from './CommonUi';

/**
 * The workspace selector in the app's top banner, present on every authenticated page.
 *
 * REWRITTEN 2026-09-02 against real captured DOM. The previous version was built from an ARIA
 * snapshot plus inference, and its own doc said as much ("NOT YET independently confirmed: the
 * exact click sequence"). Two things in it were wrong, and they matter more than usual because
 * this class now runs inside the `authenticatedPage` fixture — i.e. on the critical path of
 * every single UI test.
 *
 *   1. **It is an MUI Select, not an Autocomplete.** The old code did `combobox.click()` then
 *      `keyboard.type(workspaceName)` to "filter the options list". A Select has no text input:
 *      typing does nothing useful, and the keystrokes land on the page. This is the identical
 *      wrong assumption that the Move-Workspace dialog carried, corrected the same day.
 *   2. **`getByRole('combobox').first()` is not safe page-wide.** The flow canvas renders
 *      several comboboxes (Event / API Call / Script / Global Variable pickers) and the
 *      Move-Workspace dialog renders two more. The app also reuses `id="select"` on both the
 *      header selector and the dialog's selects, so an id-based match is ambiguous too. It is
 *      now scoped to `header`, which is unambiguous.
 *
 * Real captured structure:
 *   <header>… <div role="combobox" aria-haspopup="listbox" id="select"><li>OMS</li></div>
 *             <input class="MuiSelect-nativeInput" value="OMS"> …
 * and once open:
 *   <li role="option" data-value="drahem-1">drahem-workspace</li>
 *
 * Note each option carries the workspace CODE in `data-value` and the DISPLAY name as its text,
 * and the two genuinely differ. Both lookups are supported; prefer `switchToCode()` in new code,
 * since codes are what the API layer and fixtures already work in.
 *
 * WHY THIS RUNS EVERYWHERE: a fresh EMS session always opens on "OMS", while this suite seeds
 * its entities into its own workspace. An entity outside the session's selected workspace does
 * not behave correctly in the UI (Activate and friends stop working), and every list screen
 * shows a different workspace's contents.
 */
export class WorkspaceSwitcher {
  constructor(private readonly page: Page) {}

  /** The banner's workspace select — scoped to `header` so it can't collide with page selects. */
  get combobox(): Locator {
    return this.page.locator('header [role="combobox"]').first();
  }

  /** The hidden native input mirroring the selection; its `value` is the workspace CODE. */
  private get nativeInput(): Locator {
    return this.page.locator('header input.MuiSelect-nativeInput').first();
  }

  /** The currently-selected workspace CODE, read from the native input. */
  async currentCode(): Promise<string> {
    return (await this.nativeInput.inputValue()).trim();
  }

  /** The currently-selected workspace DISPLAY name, as rendered in the banner. */
  async currentName(): Promise<string> {
    return (await this.combobox.innerText()).trim();
  }

  private async openOptions(): Promise<Locator> {
    await this.combobox.click();
    const options = this.page.locator('[role="listbox"] [role="option"]');
    await options.first().waitFor({ state: 'visible' });
    return options;
  }

  /**
   * Switches by workspace CODE (the option's `data-value`) — the precise form, and the one that
   * matches what `WORKSPACE_CODE` and the API fixtures already use.
   */
  async switchToCode(workspaceCode: string): Promise<void> {
    if ((await this.currentCode()) === workspaceCode) return; // already there
    await this.openOptions();
    await this.page.locator(`[role="option"][data-value="${workspaceCode}"]`).click();
    await waitForPageLoad(this.page);
  }

  /**
   * Switches by DISPLAY name (e.g. "drahem-workspace"), which is what the dropdown shows.
   * Kept as the default entry point because existing call sites pass the display name.
   */
  async switchTo(workspaceName: string): Promise<void> {
    if ((await this.currentName()) === workspaceName) return; // already there
    const options = await this.openOptions();
    await options.filter({ hasText: workspaceName }).first().click();
    await waitForPageLoad(this.page);
  }

  /** Every selectable workspace as `{ code, name }` — useful for assertions and debugging. */
  async availableWorkspaces(): Promise<Array<{ code: string; name: string }>> {
    const options = await this.openOptions();
    const count = await options.count();
    const result: Array<{ code: string; name: string }> = [];
    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      result.push({
        code: (await option.getAttribute('data-value')) ?? '',
        name: (await option.innerText()).trim(),
      });
    }
    await this.page.keyboard.press('Escape');
    return result;
  }
}
