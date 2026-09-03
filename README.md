# Anubis

_EMS test automation framework._

**Playwright + TypeScript** automation for the EMS (Event Management System) platform — covering API services, UI screens, and end-to-end user journeys across dev, staging, and production.

> **Status:** Active pilot project. Built as a standalone proof of concept to evaluate replacing the existing Cypress suite. Not yet integrated into Jenkins CI.

---

## Executive Summary

EMS is an event-driven orchestration platform — configuration, triggers, flow orchestration, gateway ingress, execution tracking, and reporting. This framework automates validation of that platform at three levels:

| Tier | What it tests | Speed | Command |
|------|---------------|-------|---------|
| **Backend** | EMS microservice APIs (CRUD, lifecycle, permissions) | ~1 min | `npm run test:api` |
| **Frontend** | Individual UI screens (auth, navigation, events, flows) | ~5 min | `npm run test:ui` |
| **E2E Journeys** | Cross-module workflows (Connection → Api Call → Mapper → Event) | ~15 min | `npm run test:e2e` |

**Current coverage:** 13 API resource suites, 4 UI spec files, and 10 end-to-end journey scenarios — with page objects for all major EMS entity screens.

---

## Why This Project

| Goal | Detail |
|------|--------|
| **Modernise the test stack** | Evaluate Playwright + TypeScript as a successor to the existing Cypress suite |
| **Broader coverage** | API-first design lets tests seed data in seconds instead of clicking through multi-step UI flows |
| **Management-ready reporting** | Executive summary, Allure reports, and environment provenance built in |
| **Low-risk evaluation** | Runs locally alongside the current suite — no CI disruption until the pilot is approved |

Domain knowledge is grounded in the existing QA backend framework (Postman collection, Java/RestAssured suite). See [`EMS_API_Domain_Notes.md`](EMS_API_Domain_Notes.md) for the full business and service map.

---

## Coverage Overview

### API (Backend)

One spec file per EMS resource — full lifecycle paths (create → read → update → publish → activate → delete) plus permission-boundary cases.

| Resource | Spec file | Status |
|----------|-----------|--------|
| Connection | `connection.api.spec.ts` | Active |
| Api Call | `apiCall.api.spec.ts` | Active |
| Mapper | `mapper.api.spec.ts` | Active |
| Flow | `flow.api.spec.ts` | Active |
| Schema | `schema.api.spec.ts` | Active |
| Observer | `observer.api.spec.ts` | Partial — blocked on backend config |
| Script | `script.api.spec.ts` | Active |
| Secret / Vault | `secret.api.spec.ts` | Active |
| Global Variables | `globalVariables.api.spec.ts` | Active |
| Workspace | `workspace.api.spec.ts` | Active |
| Track | `track.api.spec.ts` | Active |
| Reporting | `reporting.api.spec.ts` | Active |
| Input Core | `inputCore.api.spec.ts` | Active |

### UI (Frontend)

Single-screen tests — each verifies one entity or one screen in isolation.

| Area | Spec file | Scenarios |
|------|-----------|-----------|
| Authentication | `auth.ui.spec.ts` | Login, session, logout |
| Navigation | `navigation.ui.spec.ts` | Sidebar, workspace switcher |
| Events | `events.ui.spec.ts` | Full Draft → Publish → Live → Activate lifecycle |
| Flow list | `flow-list.ui.spec.ts` | List, search, API-seeded data |

Page objects exist for Connection, Api Call, Mapper, Script, Global Variable, Observer, and Vault screens under `pages/ems/`.

### E2E Journeys (Regression)

Cross-module scenarios that walk several EMS modules in a single test.

| ID | Scenario | Status |
|----|----------|--------|
| E2E-01 | Build a pipeline: Connection + Api Call + Mapper → Event | Active |
| E2E-02 | Publish an API call while its connection is still draft | Active |
| E2E-03 | Delete a full pipeline in the correct order | Active |
| E2E-04 | Create a connection using a Vault secret | Active |
| E2E-05 | Create flow with API Call and Delay nodes | Pending — selectors needed |
| E2E-06 | Create API call referencing a Global Variable | Pending — token syntax unconfirmed |
| E2E-07 | Create flow with Script node, then delete live script | Active |
| E2E-08 | Cross-workspace event visibility | Active |
| E2E-10 | Event with searchable fields, then edit schema | Active |
| E2E-11 | Observer on broker connection | Pending — backend issue |
| E2E-12 | Push event and verify in reporting | Active |

Scenarios tagged `@pending` are documented blockers — they stay in the repo but are excluded from default runs so a green result means green.

---

## Reporting

The framework produces reports for both engineers and reviewers.

```bash
npm run demo          # Full run + executive summary + Allure report
npm run report        # Open Playwright HTML report (traces, screenshots, video)
npm run report:summary   # One-page executive summary (pass rate, module coverage)
npm run report:allure    # Industry-standard Allure report with environment context
```

**What reviewers see in Allure:**

- Environment provenance (target env, workspace, browser, viewport)
- Failure categorisation (environment issue vs selector drift vs product defect)
- Per-tier suite breakdown (Backend / Frontend / E2E Journeys)

---

## Architecture

```
tests/
├── api/           → Backend tier   (no browser, direct microservice calls)
├── ui/            → Frontend tier  (single-screen UI, Chrome 1920×1080)
└── regression/    → E2E Journeys   (cross-module flows, 3× time budget)

api/               → API clients organised by EMS business domain
pages/ems/         → Page objects for dashboard screens
fixtures/          → Shared test setup (auth, API seeding, hybrid UI+API)
utils/             → Test data, cleanup, environment helpers
```

**Hybrid pattern:** E2E scenarios seed data via API (fast, reliable) and verify through the UI (what the user actually sees). This keeps a 12-step journey to minutes instead of tens of minutes.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Google Chrome (installed locally — tests use the Chrome channel, not bundled Chromium)
- VPN or office network access to `*.tajawal-<env>.internal` hosts

### Setup

```bash
npm install
npx playwright install chrome
```

Copy `.env.example` to `.env.dev` (and `.env.staging` / `.env.prod` as needed) and fill in real values. These files are gitignored — never commit credentials.

### Run tests

```bash
npm run test:api            # API suite only (~1 min)
npm run test:ui             # UI screens only
npm run test:e2e            # End-to-end journeys only
npm run test:smoke          # @smoke-tagged tests
npm run test:dev            # All tiers against dev (default)
npm run test:staging        # All tiers against staging
npm run test:prod           # Smoke only against production
npm run test:pending        # List @pending backlog (excluded from default runs)
```

### Demo for stakeholders

```bash
npm run demo
```

Runs the full suite, generates the executive summary and Allure report, and prints paths to all artifacts.

---

## Roadmap

### Near term

- [ ] Complete negative-case coverage in API specs (capture-first: assert on real error responses from dev, never guess)
- [ ] Resolve Observer backend/config blockers (E2E-11, API-OBS-*)
- [ ] Capture remaining UI selectors for Flow Details modal and Global Variable references (E2E-05, E2E-06)
- [ ] Map scenarios from the existing Cypress suite to reach parity before presenting as a replacement

### Before production use

- [ ] Confirm production EMS service URLs in `.env.prod`
- [ ] Validate Reporting and Input Core response shapes against live dev responses
- [ ] Decide on CI integration (Jenkins), scheduled staging runs, and Allure publishing

---

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| [`EMS_API_Domain_Notes.md`](EMS_API_Domain_Notes.md) | Engineers + QA | EMS business domain, service map, API patterns |
| [`tests/api/README.md`](tests/api/README.md) | Engineers | API tier conventions and fixture usage |
| [`tests/ui/README.md`](tests/ui/README.md) | Engineers | UI tier conventions and page object guide |
| [`tests/regression/README.md`](tests/regression/README.md) | Engineers | E2E journey conventions and hybrid fixture pattern |
| [`.env.example`](.env.example) | Engineers | Required environment variables per target env |

---

## Technical Reference

<details>
<summary><strong>API layer structure</strong> (for engineers)</summary>

- `api/config.ts` — resolves microservice URLs, workspace code, and DRAFT/LIVE edition from `.env.<ENV>`
- `api/BaseApiClient.ts` — Playwright `APIRequestContext` wrapper; returns raw responses for precise assertions
- `api/AuthApi.ts` — real login (`POST /auth/login`) and user-info header for UI Gateway
- `api/ems/internalIdentity.ts` — internal trust headers (`x-user-info`) for direct microservice calls (internal network only)
- `api/resources/DraftLiveResourceApi.ts` — generic CRUD + lifecycle for ~10 config entities (flow, schema, observer, connection, etc.)
- `fixtures/api.fixture.ts` — per-resource Playwright fixtures (`flowApi`, `schemaApi`, `connectionApi`, …)
- `fixtures/hybrid.fixture.ts` — merges API + UI fixtures for cross-tier scenarios

</details>

<details>
<summary><strong>UI layer structure</strong> (for engineers)</summary>

- `pages/ems/` — page objects for all major entity screens (list, form, detail, sidebar nav)
- `fixtures/auth.fixture.ts` — `authenticatedPage` (logs in once, switches to QA workspace)
- `components/NavBar.ts` — legacy placeholder; use `pages/ems/SidebarNav.ts` instead

Record real locators against the live app:

```bash
npx playwright codegen https://ems-dev.almosafer.com
```

</details>

<details>
<summary><strong>Auth model</strong> (for engineers)</summary>

Most API tests use **internal identity headers** — a fabricated `x-user-info` + `x-workspace` pair that EMS microservices trust on the internal network. No real login required.

UI tests use **real credentials** via `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` in `.env.<ENV>`.

Internal identity must never be used against public-facing endpoints or production.

</details>
