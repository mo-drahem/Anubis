# Backend  (Playwright project: `Backend`)

Pure API coverage — no browser, uses Playwright's `request` fixture via `fixtures/api.fixture.ts`.
Runs under the headless `Backend` project (see `playwright.config.ts`); no browser means no
cross-browser matrix and no start-up cost, so the whole tier finishes in well under a minute.
Run just this tier with `npm run test:api`.

Goal: cover every EMS microservice endpoint this project has a client for for under `api/`
(`connection`, `api-call`, `mapper`, `secret`, `script`, `global-variables`, `schema`,
`observer`, `flow`, `track`, `workspace`, event ingestion, auth) — CRUD + lifecycle
(draft/publish/live/activate/restore/delete where applicable) + permission-boundary cases.

Convention: one spec file per resource, e.g. `connection.api.spec.ts`, `flow.api.spec.ts`.
Reuse `fixtures/api.fixture.ts`'s per-resource fixtures (`connectionApi`, `flowApi`, ...) or
`buildInternalClient(baseUrl, permissions, workspaceCode?)` for a custom permission set.

First pass of spec files landed 2026-08-24 for all 11 resources listed above — each covers the
positive "full lifecycle" path (create → read → update → list → activate → push live →
restore/change-workspace where applicable → delete) plus `test.skip` stubs for the standard
negative-case dimensions (see `EMS_API_Domain_Notes.md`). None have been run against a live
environment yet — every field/payload shape was confirmed against the magpie reference's actual
Java entity classes, but response-body assertions beyond status codes are still hypotheses. See
the `EMS_API_Test_Scenarios.md` project doc for the full scenario catalog and known gaps/open
questions per entity before extending any of these files.
