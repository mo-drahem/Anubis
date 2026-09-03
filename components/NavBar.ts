import { Page, Locator } from '@playwright/test';
import { waitForPageLoad } from '../pages/ems/CommonUi';

/**
 * The top app bar (header) — account menu and logout.
 *
 * CORRECTED 2026-09-02 against a REAL captured page body. The previous version was an
 * unconfirmed placeholder ("TODO: fill in real locators once confirmed against the live app")
 * whose `logoutButton` was `getByRole('button', { name: /log ?out/i })`. That could never have
 * matched, for two reasons:
 *
 *   1. Logout is NOT a button — it is `<li role="menuitem">Logout</li>`, so its accessible role
 *      is `menuitem`, not `button`.
 *   2. It is not in the accessibility tree at all until the account menu is opened. The header
 *      carries an avatar button (`aria-haspopup="true" aria-controls="menu-appbar"`, labelled
 *      with the user's initial) that opens `#menu-appbar`; before that click the menu is
 *      `aria-hidden` with `visibility: hidden`.
 *
 * AUTH-007 (logout + back-navigation guard) depends on this, so it was resting on a locator
 * that could not resolve. Both steps are now real and confirmed.
 *
 * The menu also renders the signed-in user's email, exposed as `signedInEmail` — useful for
 * asserting WHICH account a session actually belongs to in permission scenarios.
 */
export class NavBar {
  readonly root: Locator;
  /** The avatar button that opens the account menu — identified by its aria-controls target. */
  readonly accountMenuButton: Locator;
  /** The account menu itself, rendered into a portal with this id. */
  readonly accountMenu: Locator;
  readonly logoutMenuItem: Locator;
  readonly signedInEmail: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('header');
    this.accountMenuButton = page.locator('header button[aria-controls="menu-appbar"]');
    this.accountMenu = page.locator('#menu-appbar');
    this.logoutMenuItem = this.accountMenu.getByRole('menuitem', { name: /^logout$/i });
    // The email sits in a plain <p> above the menu items — matched by shape, since the real DOM
    // carries no testid here.
    this.signedInEmail = this.accountMenu.locator('p').first();
  }

  /** Opens the account menu and waits until its items are actually interactable. */
  async openAccountMenu(): Promise<void> {
    await this.accountMenuButton.click();
    await this.logoutMenuItem.waitFor({ state: 'visible' });
  }

  async logout(): Promise<void> {
    await this.openAccountMenu();
    await this.logoutMenuItem.click();
    await waitForPageLoad(this.page);
  }
}
