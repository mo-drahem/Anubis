# E2E Journeys  (Playwright project: `E2E Journeys`)

Cross-module user journeys — the scenarios that walk several EMS modules end to end inside a
single test. E2E-01, for example, creates a Connection, wires an Api Call, builds a Mapper, then
creates, publishes and activates an Event, each step a real UI navigation against ems-dev.

**What belongs here:** a scenario is an E2E journey when it spans MORE THAN ONE EMS module and
its value is in the hand-off between them. If it verifies one screen or one entity's behaviour,
it belongs in `tests/ui/` instead — FLOW-001 (flow list + search) was moved out of this folder
for exactly that reason on 2026-09-03. The fixture a test uses is NOT the criterion:
`hybrid.fixture.ts` is importable from anywhere, and single-screen tests are welcome to seed
their setup via the API.

**Setup via API, verification via UI.** `fixtures/hybrid.fixture.ts` merges `auth.fixture.ts`
(UI) and `api.fixture.ts` (API) into one `test`. Use the API for whatever isn't itself under
test — creating a Flow through the full canvas builder, pushing an Event — and drive the UI for
the part the scenario is actually asserting. This is what keeps a 12-step journey to minutes
rather than tens of minutes.

**Time budget.** This project carries `timeout: 180_000`, three times the suite default, because
a journey is minutes of real UI work. That budget is scoped to this tier alone — see the
`projects` block in `playwright.config.ts` for why the split exists.

**Teardown.** `utils/cleanup.ts`'s `CleanupStack` runs teardown LIFO for a scenario that seeds
several interdependent resources; a plain `try/finally` around `use()` is enough for one.

Run just this tier with `npm run test:e2e`.
