# Frontend  (Playwright project: `Frontend`)

Single-screen UI coverage: each test verifies one screen or one entity's behaviour. Auth
(AUTH-*), sidebar navigation (NAV-*), flow list and search (FLOW-*), and the full Events
lifecycle (EVT-*).

**What belongs here:** anything whose value is in one screen or one entity — form validation,
search, a list, a Draft → Publish → Live → Activate/Restore/Delete lifecycle for a single
entity. A scenario that spans several EMS modules and is about the hand-off between them belongs
in `tests/regression/` (the `E2E Journeys` project) instead.

Seeding setup through the API is fine and encouraged here — `fixtures/hybrid.fixture.ts` is
importable from any tier. FLOW-001 does exactly this: it seeds a Flow via the API because what
is under test is the list/search screen, not flow creation. Tests that need nothing but a
browser use `fixtures/auth.fixture.ts` (`authenticatedPage`, `sidebarNav`).

**Workspace.** `authenticatedPage` switches to the configured QA workspace before handing the
page to the test. A fresh EMS session always opens on **OMS**, so this is not optional — see
`utils/testEnv.ts`'s `WORKSPACE_NAME` doc for the incident that led to it living in the fixture.

**Browser.** Google Chrome (the installed channel, not bundled Chromium), 1920×1080. EMS's
sidebar collapses below that width and many nav selectors stop matching.

**Convention:** one spec file per entity/screen — `events.ui.spec.ts`, `flow-list.ui.spec.ts`.
Page objects live under `pages/ems/`. Mapper/Connection/Api Call/Script/Global Variable/Vault
screens are not fully ported yet — extend `pages/ems/` before writing a spec that needs them.

Run just this tier with `npm run test:ui`.
