import { Page } from '@playwright/test';
import { waitForPageLoad } from './CommonUi';

/**
 * Sidebar accordion + link navigation.
 *
 * CORRECTED 2026-09-02 against a REAL captured page body (/flows/new). The previous version of
 * this file was built from the reference Cypress suite plus inference, and three of its beliefs
 * were wrong:
 *
 *   1. **Flows is NOT under Monitoring.** `<a href="/flows">` is a TOP-LEVEL sidebar item, a
 *      direct sibling of the three accordions — as are `/workspaces` and `/learning-hub`. The
 *      Monitoring accordion contains exactly two links: `/dashboard` and `/data-explorer`. The
 *      old doc asserted "Flows sits under Monitoring — confirmed against the live sidebar";
 *      that is not what the live sidebar actually contains.
 *   2. **Vault IS inside the Configurations accordion**, alongside Connections, API Calls,
 *      Mappers, Scripts and Global Variables. The old doc called it "the one exception with no
 *      accordion step at all".
 *   3. **The drawer can be collapsed and non-interactable.** On the captured page the drawer
 *      paper carried `transform: translateX(-280px); visibility: hidden` and `<main>` carried
 *      the class `menuCollapsed`, with an expand control (`[aria-label="Expand"]`) inside it.
 *      Playwright refuses to act on a `visibility: hidden` element, so a link click would hang
 *      until timeout rather than fail clearly. `ensureExpanded()` below handles that.
 *
 * NOT YET CONFIRMED: whether that collapsed state is global or specific to /flows/new (the flow
 * canvas plausibly collapses the nav to give itself room). `ensureExpanded()` is a no-op when
 * the drawer is already open, so it is safe either way — but if a navigation test still fails on
 * a hidden drawer, that distinction is the first thing to check.
 *
 * Link clicks use dblclick: a single click was unreliable live on ems-dev and the reference
 * suite always double-clicks. That behaviour is unchanged.
 */
type Accordion = 'triggers' | 'configurations' | 'monitoring';

// Exported so NAV-001 can assert the real aria-expanded toggle without re-deriving selectors.
// All three icon testids CONFIRMED in the 2026-09-02 capture.
export const ACCORDION_SELECTORS: Record<Accordion, string> = {
  triggers: 'button.MuiAccordionSummary-root:has([data-testid="SwapHorizIcon"])',
  configurations: 'button.MuiAccordionSummary-root:has([data-testid="SettingsIcon"])',
  monitoring: 'button.MuiAccordionSummary-root:has([data-testid="MonitorHeartIcon"])',
};

/**
 * Every sidebar link with the accordion it lives under (`null` = top-level, no accordion step).
 * Structure CONFIRMED verbatim from the captured page body.
 */
const SIDEBAR_LINKS = {
  // Monitoring
  dashboard: { href: '/dashboard', accordion: 'monitoring' as Accordion | null },
  dataExplorer: { href: '/data-explorer', accordion: 'monitoring' as Accordion | null },
  // Triggers
  events: { href: '/events', accordion: 'triggers' as Accordion | null },
  observers: { href: '/observers', accordion: 'triggers' as Accordion | null },
  // Configurations
  connections: { href: '/connections', accordion: 'configurations' as Accordion | null },
  apiCalls: { href: '/api-calls', accordion: 'configurations' as Accordion | null },
  mappers: { href: '/mappers', accordion: 'configurations' as Accordion | null },
  scripts: { href: '/scripts', accordion: 'configurations' as Accordion | null },
  globalVariables: { href: '/global-variables', accordion: 'configurations' as Accordion | null },
  vault: { href: '/vault', accordion: 'configurations' as Accordion | null },
  // Top-level (no accordion step)
  flows: { href: '/flows', accordion: null as Accordion | null },
  workspaces: { href: '/workspaces', accordion: null as Accordion | null },
  learningHub: { href: '/learning-hub', accordion: null as Accordion | null },
};

export type SidebarLinkKey = keyof typeof SIDEBAR_LINKS;

export class SidebarNav {
  constructor(private readonly page: Page) {}

  private get drawerPaper() {
    return this.page.locator('.MuiDrawer-paper').first();
  }

  /**
   * Opens the drawer if it is in its collapsed/hidden state — see point 3 of the class doc.
   * A no-op when the drawer is already visible, so it is always safe to call.
   */
  async ensureExpanded(): Promise<void> {
    if (await this.drawerPaper.isVisible().catch(() => false)) return;

    const expandButton = this.page.locator('[aria-label="Expand"]');
    if (await expandButton.first().isVisible().catch(() => false)) {
      await expandButton.first().click();
      await this.drawerPaper.waitFor({ state: 'visible' }).catch(() => undefined);
    }
  }

  private async expandAccordion(accordion: Accordion): Promise<void> {
    const trigger = this.page.locator(ACCORDION_SELECTORS[accordion]);
    if ((await trigger.getAttribute('aria-expanded')) === 'false') {
      await trigger.click();
    }
  }

  /** Navigates to any sidebar destination, handling drawer + accordion state for you. */
  async goTo(link: SidebarLinkKey): Promise<void> {
    const { href, accordion } = SIDEBAR_LINKS[link];

    await waitForPageLoad(this.page);
    await this.ensureExpanded();
    if (accordion) await this.expandAccordion(accordion);

    const target = this.page.locator(`.MuiDrawer-paper a[href="${href}"]`);
    await target.scrollIntoViewIfNeeded();
    await target.dblclick({ force: true });
    await this.page.waitForURL((url) => url.pathname.includes(href));
    await waitForPageLoad(this.page);
  }

  // Named shortcuts — kept so existing specs keep compiling and reading clearly.
  async goToEvents(): Promise<void> { await this.goTo('events'); }
  async goToObservers(): Promise<void> { await this.goTo('observers'); }
  async goToMappers(): Promise<void> { await this.goTo('mappers'); }
  async goToConnections(): Promise<void> { await this.goTo('connections'); }
  async goToApiCalls(): Promise<void> { await this.goTo('apiCalls'); }
  async goToScripts(): Promise<void> { await this.goTo('scripts'); }
  async goToGlobalVariables(): Promise<void> { await this.goTo('globalVariables'); }
  async goToVault(): Promise<void> { await this.goTo('vault'); }
  async goToFlows(): Promise<void> { await this.goTo('flows'); }
  async goToWorkspaces(): Promise<void> { await this.goTo('workspaces'); }
  async goToDashboard(): Promise<void> { await this.goTo('dashboard'); }
  async goToDataExplorer(): Promise<void> { await this.goTo('dataExplorer'); }
}
