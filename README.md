# EMS Automation (Playwright + TypeScript)

Local pilot project automating EMS across dev, staging, and production. Being built as a
standalone proof of concept, not yet wired into Jenkins, so it can be evaluated side-by-side
against the existing Cypress suite before deciding whether to replace it.

EMS itself is an event-driven orchestration platform (configuration, triggers, flow
orchestration, gateway ingress, execution tracking, and reporting), not a simple event-listing
dashboard — see `EMS_API_Domain_Notes.md` for the full business/domain writeup this framework is
built against, distilled from the existing "magpie" QA backend framework (Postman collection +
Java/RestAssured suite + `.agents/skills` rules pack).

**Current phase:** API coverage is actively built out with 13 resource spec files (including Reporting
and Input Core). UI page objects exist for Events, Flows, and — newly added — Connection, Api Call,
Mapper, Script, Global Variable, Observer, and Vault list/form screens under `pages/ems/`. Hybrid
regression scenarios (`tests/regression/`) exercise cross-module flows; several E2E scenarios still
depend on selectors that need live capture against ems-dev.

## Setup

```bash
npm install
npx playwright install   # downloads the Chromium/Firefox/WebKit browsers
```

Fill in `.env.dev` / `.env.staging` / `.env.prod` from `.env.example` — these are gitignored,
never commit real values. Most API calls don't need a real login at all; they use a
caller-supplied internal identity instead (see "Auth" below).

**Network note:** almost every EMS service URL is internal (`*.tajawal-<env>.internal`) and only
resolves over the office network/VPN — tests must run from a machine that can reach it (they'll
fail with a DNS/connect error, not a test failure, otherwise).

## Running tests

```bash
npm run test:api            # pure API suite, single run, no browsers
npm run test:smoke          # @smoke UI tests against dev (default ENV)
npm run test:regression     # hybrid UI+API scenarios
npm run report              # open the last HTML report (traces, screenshots, video)
```

## API layer

`api/` is organized by EMS business domain (see `EMS_API_Domain_Notes.md`'s "Service map"), not
by raw HTTP host:

- `api/config.ts` — resolves every microservice base URL, the workspace code, and the DRAFT/LIVE
  edition from `.env.<ENV>` (lazily, so a test that never touches a given service doesn't need
  its URL filled in).
- `api/BaseApiClient.ts` — thin Playwright `APIRequestContext` wrapper; headers are baked in at
  construction (not per-call), and `get/post/put/patch/delete` deliberately return the raw,
  unparsed `APIResponse` — tests assert on exactly what came back, not a pre-digested version.
- `api/AuthApi.ts` — both auth paths: `login()` (real `POST /auth/login`, for the public UI
  Gateway) and `getRealUserInfoHeader()` (fetches `/auth/user_info` for a real token).
- `api/ems/permissions.ts` + `api/ems/internalIdentity.ts` — the internal trust mechanism nearly
  every direct microservice call actually uses: `internalHeaders(permissions, workspaceCode?)`
  builds the base64 `x-user-info` + `x-workspace` headers from a fabricated identity, no real
  login required. This only works on the internal network — never use it against a
  public-facing endpoint or production.
- `api/resources/DraftLiveResourceApi.ts` — one generic class for the recurring DRAFT/LIVE CRUD
  + lifecycle shape shared by ~10 config entities (list/create/update/delete/getById/getByCode/
  getLiveByCode/getDraftByCode/getByCodeAndState/pushLive/restoreLive/deleteLive/getByWorkspace/
  changeWorkspace/updateState), parametrized by `resourcePath` — see `fixtures/api.fixture.ts` for
  how each entity (flow, schema, observer, connection, api-call, mapper, secret, script,
  global-variables) is wired up on top of it.
- `api/resources/WorkspaceApi.ts` — Workspace + ws-usr (workspace-user link) endpoints, which
  don't follow the draft/live pattern.
- `api/resources/EventIngestionApi.ts` — pushes events via the API Gateway (`POST /push`) and
  reads back track info for a pushed job.
- `api/resources/TrackApi.ts` — execution-tracking CRUD/history/data lookups.
- `api/resources/ReportingApi.ts` / `api/resources/InputCoreApi.ts` — added in this pass; both
  confirmed to exist against the magpie reference's client interfaces, but **not yet
  capture-verified against a live response** (see the TODO comment in each file) — hit them
  against dev and tighten the types/assertions before relying on them in a real test.
- `fixtures/api.fixture.ts` — the bundled per-resource Playwright fixtures (`flowApi`, `schemaApi`,
  `workspaceApi`, `reportingApi`, ...) plus `buildInternalClient(baseUrl, permissions,
  workspaceCode?)` for one-off permission-boundary tests.
- `fixtures/hybrid.fixture.ts` — merges the API fixtures above with `auth.fixture.ts`'s UI
  fixtures into one `test`, for scenarios that seed/tear down via API but verify through the UI
  (e.g. `seededFlow`, `seededEvent`).
- `utils/cleanup.ts` — `CleanupStack`, a LIFO best-effort teardown helper for scenarios that seed
  more than one interdependent resource.
- `tests/api/*.spec.ts` — one spec file per resource (see `tests/api/README.md` for the naming
  convention). **Capture-first discipline:** hit the endpoint against dev, read the real
  `ErrorResponse`, and assert exactly that — never guess a code or message string. No scenarios
  are checked in yet; add them here as they're written.

## UI layer (in progress)

- `pages/ems/` — page objects for the dashboard: Events, Flows (list + form + `FlowDetailsModal`),
  Connection/Api Call/Mapper/Script/Global Variable/Observer list+form pages (presumed `{Entity}Form_*`
  testids — confirm via `npx playwright codegen`), Vault list, shared `EntityListPage` /
  `GenericEntityDetailPage`, `SidebarNav`, `EntityHeaderActions`, `emsRoutes`.
- `pages/LoginPage.ts` — real login page object. `pages/BasePage.ts` and `pages/DashboardPage.ts`
  are earlier placeholders; `DashboardPage.ts` in particular is deprecated (there's no single
  "dashboard" screen to model — see the note in `auth.fixture.ts`).
- `components/NavBar.ts` — placeholder, not yet reconciled with `pages/ems/SidebarNav.ts`.
- `fixtures/auth.fixture.ts` — `authenticatedPage` (logs in once via `LoginPage`), `sidebarNav`.
- `tests/ui/`, `tests/regression/` — UI smoke/regression specs exist; see their READMEs for scope.

## Exploring the real app

```bash
npx playwright codegen https://ems-dev.almosafer.com
```

Use this to record real locators against the live dashboard rather than guessing; confirm/replace
any remaining placeholder locator before relying on it.

## Housekeeping

`_to_delete/` holds files superseded during a merge of two parallel builds of this project (an
earlier duplicate `api/core/` + `api/domains/` + `api/fixtures/` structure, some now-redundant
example specs, and older zip/staging artifacts) — nothing in active use references them. Safe to
delete that folder once you've confirmed nothing in it is needed.

## Status / open items

**API:**

- [ ] Fill in the negative `test.skip` TODOs in `tests/api/*.spec.ts` by running each positive
      test against dev, then capturing the real `ErrorResponse` for the negative case (see
      "capture-first" in `EMS_API_Domain_Notes.md`) — do not hand-write expected codes/messages.
- [ ] Capture real responses for `ReportingApi` and `InputCoreApi` against dev and tighten their
      request/response types accordingly.
- [ ] Confirm a real `WORKSPACE_CODE` (and any other QA fixture codes) in `.env.dev` /
      `.env.staging` so tests stop depending on empty placeholders.
- [ ] Confirm production EMS service URLs (all placeholders in `.env.prod` today — the existing
      framework doesn't have them either) before any prod automation is written.
- [ ] Expand domain coverage — Observer, Flow (node-level scenarios), Connection/Broker, Mapper,
      Script, Global Variables — following the same `test.skip` + capture-first pattern.
- [ ] Map scenarios already covered by the existing Cypress suite so this project reaches parity
      before it's presented as a replacement candidate.
- [ ] Once mature: decide on CI integration (Jenkins), Allure reporting, and running against
      staging.

**UI:**

- [ ] Reconcile `components/NavBar.ts` with `pages/ems/SidebarNav.ts` (likely redundant).
- [ ] Port remaining screens (Mapper, Connection, API Call, Script, Global Variable, Vault) to
      `pages/ems/` before writing specs that need them.
- [ ] Write the first `tests/ui/*.spec.ts` / `tests/regression/*.spec.ts` scenarios once specific
      screens/flows are shared.
