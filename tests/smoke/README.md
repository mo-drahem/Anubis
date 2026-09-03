# Smoke tests

Fast, critical-path UI checks (login, dashboard renders) — run under the browser projects, same
as `tests/ui/`. The original two placeholder specs here (`dashboard.spec.ts`, `login.spec.ts`)
were written before `fixtures/auth.fixture.ts`/`pages/ems/*` reached their current shape and no
longer matched it (they called `DashboardPage`-style methods on what `authenticatedPage` now
returns as a plain Playwright `Page`) — moved to `_to_delete/` rather than fixed in place, since
the real dashboard locators still need to be confirmed via codegen either way.

No scenarios yet — add spec files here once specific test cases are planned, using the real
`pages/ems/*` page objects.
