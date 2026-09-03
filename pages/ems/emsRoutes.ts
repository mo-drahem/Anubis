/**
 * Real EMS routes — confirmed against the qa-frontend-cypress Cypress suite
 * (cypress/fixtures/customHelpers/ems/emsConstants.js), not guessed. Routes are flat, with
 * no locale/POS segment — EMS is a single internal instance, not a per-market consumer
 * surface. All of them hang off BASE_URL (playwright.config.ts's `use.baseURL`, which should
 * point at UI_GATEWAY_SERVICE_URL / EMS_BASE_URL for UI projects).
 *
 * Scripts and Global Variables expose a read-only view at `/{module}/{id}`; lifecycle actions
 * are on the live sub-view reached by clicking the header "Live" button from that page
 * (CONFIRMED by the user, 2026-09-02). `/{id}/edit` is the form editor only.
 * Flows use a distinct `/{id}/edit` route for editing; Events/Mappers/Connections/API Calls
 * edit inline from their detail view instead.
 */
export const EMS_ROUTES = {
  login: '/auth/login',

  events: '/events',
  createEvent: '/events/new',

  mappers: '/mappers',
  createMapper: '/mappers/new',

  connections: '/connections',
  createConnection: '/connections/new',

  apiCalls: '/api-calls',
  createApiCall: '/api-calls/new',

  scripts: '/scripts',
  createScript: '/scripts/new',
  /** CONFIRMED by the user (2026-09-02): draft view — click header "Live" for lifecycle actions. */
  scriptDetail: (id: string) => `/scripts/${id}`,
  editScript: (id: string) => `/scripts/${id}/edit`,

  globalVariables: '/global-variables',
  createGlobalVariable: '/global-variables/new',
  /** CONFIRMED (E2E-06 live capture): view page — click header "Live" for lifecycle actions. */
  globalVariableDetail: (id: string) => `/global-variables/${id}`,
  editGlobalVariable: (id: string) => `/global-variables/${id}/edit`,

  flows: '/flows',
  createFlow: '/flows/new',
  editFlow: (id: string) => `/flows/${id}/edit`,

  vault: '/vault',

  // CONFIRMED by the user directly (2026-09-01): Observer's real UI screen lives at
  // `/observers`, under the sidebar's "Triggers" section (matching the CONFIRMED sidebar link
  // set already captured in navigation.ui.spec.ts). Resolves OBS-001 — Observer DOES have a
  // dedicated UI screen, this was previously an open question.
  observers: '/observers',

  /**
   * Execution reporting dashboard — `type` selects the layer (EVENT, FLOW, API_CALL, SCRIPT).
   * Prefer `emsJobId` to correlate one execution; `code` is an entity-code filter when needed.
   */
  dashboard: (params: { type: string; emsJobId?: string; code?: string }) => {
    const query = new URLSearchParams({ type: params.type });
    if (params.emsJobId) query.set('emsJobId', params.emsJobId);
    if (params.code) query.set('code', params.code);
    return `/dashboard?${query.toString()}`;
  },

  /**
   * CONFIRMED (2026-09-02, real captured /flows/new page body): the sidebar's Monitoring
   * accordion contains exactly two links — `/dashboard` (aria-label "Dashboard") and
   * `/data-explorer` (aria-label "Data Explorer"). Upgraded from PRESUMED.
   */
  dataExplorer: '/data-explorer',

  /**
   * CONFIRMED (2026-09-02, same capture): a real top-level sidebar link
   * `<a href="/workspaces">` with aria-label "Workspaces". This resolves the open question
   * that made navigation.ui.spec.ts's NAV-002 deliberately omit Workspaces — no route string
   * for it had ever been captured. It can now be asserted like every other entity.
   */
  workspaces: '/workspaces',

  /** CONFIRMED (2026-09-02, same capture): top-level sidebar link, aria-label "Learning Hub". */
  learningHub: '/learning-hub',

  // Detail-view routes for entities that don't have a dedicated page object yet. Same flat
  // `/{module}/{id}` convention already confirmed for Events (`/events/{id}`, see
  // EventDetailPage) — `connectionDetail` is independently CONFIRMED (observed live via a
  // real open browser tab on 2026-08-31: `ems-dev.almosafer.com/connections/<id>`).
  // `apiCallDetail`/`mapperDetail` are NOT independently observed — extended from that same
  // confirmed convention plus this file's own doc comment above ("Events/Mappers/Connections/
  // API Calls edit inline from their detail view instead"), which implies a `/{module}/{id}`
  // detail route exists for both. Flagged the same way this codebase already flags
  // EntityHeaderActions' testids as "presumed real for Mapper/API Calls/... per the reference
  // suite's own business-knowledge notes" — treat as presumed, not confirmed, until
  // independently observed.
  connectionDetail: (id: string) => `/connections/${id}`, // CONFIRMED live 2026-08-31
  apiCallDetail: (id: string) => `/api-calls/${id}`, // presumed — not independently observed
  mapperDetail: (id: string) => `/mappers/${id}`, // presumed — not independently observed
  observerDetail: (id: string) => `/observers/${id}`, // presumed — the list route above is
  // CONFIRMED, but this specific `/{id}` detail shape is extended from the same flat
  // convention, not independently observed.
};
