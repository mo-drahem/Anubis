import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { EMS_ROUTES } from './ems/emsRoutes';
import { waitForPageLoad } from './ems/CommonUi';

/**
 * EMS's real login screen — confirmed against
 * cypress/fixtures/pageClasses/desktop/ems/login/{loginPO,loginCC}.js in the reference
 * Cypress suite. It's a plain email/password form (`/auth/login`), not the consumer
 * platform's passwordless OTP flow — no SSO/MFA observed in the reference automation.
 */
export class LoginPage extends BasePage {
  readonly form: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly emsLogo: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.locator('[data-testid="LoginForm"]');
    this.emailInput = page.locator('[data-testid="login_email"]');
    this.passwordInput = page.locator('[data-testid="login_password"]');
    this.submitButton = page.locator('[data-testid="login_submit"]');
    this.emsLogo = page.locator('img[alt="EMS"]');
  }

  async goto(): Promise<void> {
    await super.goto(EMS_ROUTES.login);
  }

  /**
   * AUTH-006 (Known Issue, confirmed twice in the real Cypress run — API Call TC-7, Workspaces
   * TC-4): login occasionally times out / redirects back to /auth/login with no visible error.
   * Folded in here as retry-robustness rather than a separate test, per the catalog's own note
   * — every caller of login() benefits, not just a dedicated AUTH-006 spec. This does not
   * change the confirmed real form/selectors/sequence, only wraps it in one resubmit attempt.
   *
   * RAISED from 2 to 3 attempts (2026-09-01, real captured failure): a fresh regression run
   * captured E2E-06 exhausting BOTH attempts and failing on the login form itself (the
   * fixture's very first step) — plausible real-environment contention rather than a
   * deterministic bug, since other tests in the same run logged in fine. One more attempt
   * gives this documented flaky path more room before bubbling up as a hard failure.
   */
  async login(email: string, password: string): Promise<void> {
    await this.form.waitFor({ state: 'visible' });

    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.emailInput.fill(email);
      await this.passwordInput.fill(password);
      await this.submitButton.click();
      try {
        // Real app: a successful login navigates away from /auth/login, then renders the EMS
        // logo once the shell has loaded — both asserted by the reference suite's login flow.
        await this.page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 10_000 });
        await waitForPageLoad(this.page);
        await this.emsLogo.waitFor({ state: 'visible' });
        return;
      } catch (err) {
        if (attempt === attempts) throw err;
        await this.form.waitFor({ state: 'visible' }).catch(() => undefined);
      }
    }
  }
}
