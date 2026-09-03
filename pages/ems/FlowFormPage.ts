import { Page, Locator } from '@playwright/test';
import { BasePage } from '../BasePage';
import { EMS_ROUTES } from './emsRoutes';
import { CommonSelectors, waitForPageLoad } from './CommonUi';
import { FlowDetailsModal, FlowDetailsInput } from './FlowDetailsModal';

/**
 * React Flow internal node-type strings, keyed by the label shown in the "Add Node" menu.
 * Captured live from ems-dev.almosafer.com by the reference suite (flowFormPO.js) — several
 * do NOT match their menu label: Switch -> MULTI_CONDITION, If Condition ->
 * IF_CONDITION_ADVANCED, Multi Action -> SPLITTER, AI Node -> LLM, No Action -> DO_NOTHING.
 *
 * INDEPENDENTLY RE-CONFIRMED 2026-09-02 against a real captured `/flows/{id}/edit` page body
 * holding a populated flow. Five of these mappings were verified from live DOM, including both
 * of the counter-intuitive ones:
 *   - `rf__node-Node::MULTI_CONDITION::…` renders with the visible label **"Switch"**
 *   - `rf__node-Node::DO_NOTHING::…`      renders with the visible label **"No Action"**
 *   - plus EVENT / API_CALL / SCRIPT / ACTION, each matching its label directly.
 * The remaining entries (IF_CONDITION_ADVANCED, DELAY, SPLITTER, LLM) come from the reference
 * suite only and have not appeared in a live capture yet.
 *
 * FLOW_ADD_NODE_MENU_LABELS below is a DIFFERENT thing — the text of the items in the menu that
 * opens after clicking "Add node". Those remain reference-only: no capture of that open menu
 * exists. The node labels above being right is encouraging but is not proof the menu items use
 * the same strings.
 */
export const FLOW_NODE_TYPES = {
  EVENT: 'EVENT',
  API_CALL: 'API_CALL',
  SWITCH: 'MULTI_CONDITION',
  IF_CONDITION: 'IF_CONDITION_ADVANCED',
  DELAY: 'DELAY',
  ACTION: 'ACTION',
  MULTI_ACTION: 'SPLITTER',
  SCRIPT: 'SCRIPT',
  AI_NODE: 'LLM',
  NO_ACTION: 'DO_NOTHING',
} as const;

export const FLOW_ADD_NODE_MENU_LABELS = {
  API_CALL: 'API Call',
  SWITCH: 'Switch',
  IF_CONDITION: 'If Condition',
  DELAY: 'Delay',
  ACTION: 'Action',
  MULTI_ACTION: 'Multi Action',
  SCRIPT: 'Script',
  AI_NODE: 'AI Node',
  NO_ACTION: 'No Action',
} as const;

/**
 * The Flow builder canvas at `/flows/new` and `/flows/{id}/edit`. Selectors confirmed
 * against cypress/fixtures/pageClasses/desktop/ems/flows/flowFormPO.js and the reference
 * suite's flows.md topic file. Only the pieces needed to reach and save a minimal flow are
 * ported here — node-specific configuration (Action's target-event/Path pickers, Multi
 * Action's two branches, etc.) is real and documented in flows.md but not yet built out as
 * Playwright locators/actions.
 *
 * The Flow Details modal's save is confirmed to be two real steps: the modal's own Save
 * button only stages Name/Code/Description into local canvas state (no network call); the
 * actual create/update request fires from the canvas's own "Create Draft"/"Update Draft"
 * button afterward. `submit()` below only implements the second click — call
 * `openFlowDetailsModal()` / fill the modal fields / close it first.
 */
export class FlowFormPage extends BasePage {
  readonly pageTitle: Locator;
  readonly submitButton: Locator;
  readonly eventAutoCompleteInput: Locator;
  readonly addNodeSelectorAll: Locator;
  readonly flowDetails: FlowDetailsModal;
  /**
   * The pencil icon-button inside the page title, next to the flow name.
   * CONFIRMED 2026-09-02 from real captured page bodies — this is what opens the flow's
   * name/code/description editor. (The previously-guessed "Flow Details" button does not exist.)
   *
   * IMPORTANT, also confirmed: this button is **disabled on a saved flow's View Draft page**
   * (`/flows/{id}/edit` renders it with `class="Mui-disabled" disabled`), and enabled on
   * `/flows/new`. So it is only clickable while creating, or presumably after entering edit mode
   * via `liveDraftHeaderActions_edit`. Clicking it on a View Draft page will not work.
   */
  readonly flowDetailsEditIcon: Locator;
  /**
   * Node-content locators, all CONFIRMED 2026-09-02 from a populated flow's real DOM. These let
   * a test assert what a built flow actually contains, rather than only that it exists.
   */
  readonly switchNodeValue: Locator;
  readonly actionNodeValues: Locator;
  readonly scriptNodeAutoCompleteInput: Locator;
  /** The "Add node" buttons rendered inside each ADD_NODE_SELECTOR placeholder node. */
  readonly addNodeButtons: Locator;
  /**
   * Flow-level Global Variable picker — CONFIRMED in the same capture:
   * `[data-testid="GlobalVariablesAutoComplete"]`, labelled "Search global variable". Worth
   * noting for E2E-06: a Global Variable is attached to a FLOW here, which may well be the real
   * mechanism that scenario should exercise rather than string-interpolating a token into an
   * Api Call field (the presumed syntax in utils/emsReferences.ts).
   */
  readonly globalVariableAutoCompleteInput: Locator;

  constructor(page: Page) {
    super(page);
    this.flowDetails = new FlowDetailsModal(page);
    this.pageTitle = page.locator(CommonSelectors.pageTitle);
    // "Create Draft" / "Update Draft" — the real, second, network-firing save step.
    // CONFIRMED 2026-09-02: `data-testid="FlowForm_SubmitButton"`, visible label "Create Draft".
    this.submitButton = page.locator('[data-testid="FlowForm_SubmitButton"]');
    this.flowDetailsEditIcon = page.locator('[data-testid="FlowFormEditIcon"]');
    // All CONFIRMED 2026-09-02 from a populated flow's captured DOM.
    this.switchNodeValue = page.locator('[data-testid="SwitchNode_ContentValue"]');
    this.actionNodeValues = page.locator('[data-testid="ActionNode_ContentValue"]');
    this.scriptNodeAutoCompleteInput = page.locator('[data-testid="ScriptNode_AutoComplete"] input');
    // The ADD_NODE_SELECTOR placeholder's own button. Visible label is "Add node".
    this.addNodeButtons = page.locator('[data-testid^="rf__node-Node::ADD_NODE_SELECTOR"] button');
    this.globalVariableAutoCompleteInput = page.locator('[data-testid="GlobalVariablesAutoComplete"] input');
    // CONFIRMED 2026-09-02: `[data-testid="EventNode_AutoComplete"]`, input labelled
    // "Search events", inside the default EVENT node (`rf__node-Node::EVENT::<random>`).
    this.eventAutoCompleteInput = page.locator('[data-testid="EventNode_AutoComplete"] input');
    // Visible label is lowercase "Add node" despite the testid/menu convention using
    // "Add Node" — find it by testid prefix, not by text.
    this.addNodeSelectorAll = page.locator('[data-testid^="rf__node-Node::ADD_NODE_SELECTOR"]');
  }

  async gotoCreate(): Promise<void> {
    await super.goto(EMS_ROUTES.createFlow);
  }

  nodeByType(internalType: (typeof FLOW_NODE_TYPES)[keyof typeof FLOW_NODE_TYPES]): Locator {
    return this.page.locator(`[data-testid^="rf__node-Node::${internalType}"]`);
  }

  /** "Add node" does not appear at all until a trigger event is chosen. */
  async selectTriggerEvent(eventName: string): Promise<void> {
    await this.eventAutoCompleteInput.click();
    await this.eventAutoCompleteInput.fill(eventName);
    await this.page.getByRole('option', { name: eventName }).click();
  }

  async addNode(menuLabel: string, placeholderIndex = 0): Promise<void> {
    await this.addNodeSelectorAll.nth(placeholderIndex).click();
    await this.page.getByRole('menuitem', { name: menuLabel, exact: true }).click();
  }

  /**
   * Stages a new flow on the canvas: Flow Details modal (when shown) + trigger event selection.
   * Does NOT submit — call `submit()` after adding any nodes.
   */
  async stageNewFlow(details: {
    name: string;
    code: string;
    description: string;
    triggerEventName: string;
  }): Promise<void> {
    await this.ensureFlowDetailsFilled(details);
    await this.selectTriggerEvent(details.triggerEventName);
  }

  /**
   * Opens the Flow Details modal if it isn't already showing, fills it, and saves.
   *
   * FIXED (2026-09-02) — this method used to SILENTLY DO NOTHING and return successfully when
   * neither the open-button nor the modal matched:
   *
   *     if (await openButton.first().isVisible().catch(() => false)) { await ...click(); }
   *     if (await this.flowDetails.isOpen()) { await this.flowDetails.fillAndSave(details); }
   *
   * Both guards fail closed, so a selector mismatch meant Name/Code/Description were never
   * staged — and `submit()` then fired anyway. The caller had no way to know: the flow either
   * failed several steps later with an unrelated-looking error, or (in a test with no
   * post-condition, which is exactly what E2E-01 and E2E-05 were) PASSED having created
   * nothing. That is a false green, the worst failure mode a suite can have, and it is
   * specifically what this repo's own rule about unguarded setup steps warns against.
   *
   * It now fails loudly and names the uncaptured selector, so a mismatch is diagnosable in one
   * read of the error instead of a trace hunt.
   */
  async ensureFlowDetailsFilled(details: FlowDetailsInput): Promise<void> {
    if (!(await this.flowDetails.isOpen())) {
      // CORRECTED 2026-09-02 from a REAL captured /flows/new page body. There is no "Flow
      // Details" button and no `FlowForm_DetailsButton` testid — both were invented. The real
      // control is a pencil icon-button sitting inside the page title next to the placeholder
      // name "Untitled Flow":
      //     <h2 data-testid="Page_Title"><span>Untitled Flow</span>
      //       <button data-testid="FlowFormEditIcon"><svg data-testid="EditIcon">…
      await this.flowDetailsEditIcon.click();
    }

    if (!(await this.flowDetails.isOpen())) {
      throw new Error(
        'Flow Details modal never opened, so Name/Code/Description were never staged and any ' +
          'subsequent submit() would save an incomplete flow.\n' +
          'This is the known uncaptured selector (see FlowDetailsModal\'s class doc): neither the ' +
          '"Flow Details" button (role=button, name=/flow details/i, or ' +
          '[data-testid="FlowForm_DetailsButton"]) nor the modal itself matched anything on the page.\n' +
          'TO FIX: open /flows/new on ems-dev, capture the REAL selectors for the modal, its ' +
          'Name/Code/Description fields and its save button, and replace the presumed ones in ' +
          'FlowDetailsModal.ts. Until then the flow-building scenarios are tagged @pending.'
      );
    }

    await this.flowDetails.fillAndSave(details);
  }

  /**
   * Fills the Flow Details modal when it is open, selects the trigger, then submits the draft.
   */
  async createMinimalFlow(details: {
    name: string;
    code: string;
    description: string;
    triggerEventName: string;
  }): Promise<void> {
    await this.stageNewFlow(details);
    await this.submit();
  }

  /** The real network-firing save — assumes the Flow Details modal has already been filled and closed. */
  async submit(): Promise<void> {
    await this.submitButton.click();
    await this.page.waitForURL((url) => url.pathname.includes(EMS_ROUTES.flows));
    await waitForPageLoad(this.page);
  }
}
