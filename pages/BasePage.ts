import { Page } from '@playwright/test';
import { waitForPageLoad } from './ems/CommonUi';

/**
 * Base for every page object.
 *
 * EXPANDED in the 2026-09-02 architecture pass. It used to be a 6-line class with a bare
 * `goto(path)` that did NOT wait for the page to settle — which is why every subclass
 * independently wrote `await super.goto(route); await waitForPageLoad(this.page);`, and why
 * URL checks were re-derived inline as `new URL(page.url()).pathname` across five spec files.
 * Both now live here once:
 *
 *   - `goto()` waits for the real "page is ready" signal by default (the same spinner/skeleton
 *     check the reference Cypress suite uses), so no subclass has to remember it. Pass
 *     `{ wait: false }` for the rare case that needs the raw navigation.
 *   - `pathname()` / `isOnRoute()` give specs a real page-object method instead of URL parsing
 *     in the test body.
 *   - `bodyText()` lives here rather than on one subclass, since "assert this value never
 *     appears anywhere on the page" (E2E-04's Vault-secret check) applies to any screen.
 *
 * Subclasses that already call `waitForPageLoad` after `super.goto(...)` are harmless — the
 * helper is idempotent and resolves immediately when no loading signal is present.
 */
export class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Navigates, then waits for the app's own readiness signal.
   *
   * `waitUntil: 'domcontentloaded'` is deliberate (2026-09-03, real captured failure). Playwright
   * defaults to `'load'`, which waits for EVERY subresource — images, fonts, analytics — so a
   * single slow or hanging asset stalls the navigation even when the app is fully interactive.
   * That is exactly what killed E2E-04:
   *
   *   Test timeout of 60000ms exceeded while setting up "authenticatedPage".
   *   Error: page.goto: navigating to ".../auth/login", waiting until "load"
   *
   * and the failure's own page snapshot shows the login form present and rendered. The page was
   * ready; `load` simply never fired inside the budget.
   *
   * For an SPA, `load` is the wrong readiness signal anyway. `waitForPageLoad()` below is the
   * right one — it waits out the spinner / skeleton / loading-testid that this app actually uses
   * to say "I am ready", which is the same check the reference Cypress suite relies on. So this
   * is not a weakened wait; it is a more accurate one, applied to every navigation in the suite.
   */
  async goto(path: string = '/', options: { wait?: boolean } = {}): Promise<void> {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' });
    if (options.wait !== false) {
      await waitForPageLoad(this.page);
    }
  }

  /** The current URL's pathname — so specs don't re-derive `new URL(page.url()).pathname`. */
  pathname(): string {
    return new URL(this.page.url()).pathname;
  }

  /** True when the current pathname matches `route` exactly (string) or by pattern (RegExp). */
  isOnRoute(route: string | RegExp): boolean {
    const path = this.pathname();
    return route instanceof RegExp ? route.test(path) : path === route;
  }

  /** Waits out the app's real loading signals — exposed so a spec can settle after an action. */
  async waitUntilReady(): Promise<void> {
    await waitForPageLoad(this.page);
  }

  /**
   * The page's full rendered body text. Used to assert a credential-shaped value never appears
   * in plaintext anywhere on the screen (E2E-04's Vault-secret check).
   */
  async bodyText(): Promise<string> {
    return this.page.locator('body').innerText();
  }
}
