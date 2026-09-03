# EMS API Domain Notes

Distilled from two sources so the new Playwright framework's structure matches reality instead of guesswork:
the **`EMS Collection.json`** Postman export (191 requests), and the existing **"magpie"** Java/RestAssured QA
backend framework (`qa-backend-compass/magpie` — specifically `application-<profile>.properties`,
`client/ems/*`, `step/ems/*`, and its `.agents/skills/domain-knowledge` + `ems-api-tests` rules pack). Treat
this file as a working reference for the `ems-ui-automation` project, not a replacement for either source.

## What EMS actually is

EMS is an **event-driven integration/orchestration platform**, not a simple "event listing" dashboard. A
client pushes an event to a gateway; the event is validated against a **Schema**; a **Flow** (a node graph)
executes in response, calling out to other systems via **Api Call** nodes, transforming data via **Mapper**/
**Script** nodes, and everything is recorded for **Reporting**/**Track** lookup by a correlation id
(`emsJobId`). The `type=EVENT` dashboard URL the UI automation targets is one view into this system.

## Service map (base URL per environment)

| Domain | Entities | Config key | Dev host | Staging host |
|---|---|---|---|---|
| UI Gateway | (public dashboard + real login route) | `ems.ui-gateway.service.url` | `ems-dev.almosafer.com` | `ems-staging.almosafer.com` |
| Authentication | real login (`/auth/login`) | `ems.authentication.service.url` | `ems-authentication-svc.tajawal-dev.internal` | `...-staging.internal` |
| API Gateway | Push Event (`POST /push`) | `ems.api.gateway.service.url` | `ems-api-gateway.tajawal-dev.internal` | `...-staging.internal` |
| Input/Mapping | Schema, Observer | `ems.input.config.mapping.service.url` | `ems-input-cfg-mapping-svc.tajawal-dev.internal` | `...-staging.internal` |
| Orchestration | Flow | `ems.orchestration.config.service.url` | `ems-orchestration-config-svc.tajawal-dev.internal` | `...-staging.internal` |
| Input Core | alternate push (`/input/pushEvent`) | `ems.input.core.service.url` | `ems-input-core-svc.tajawal-dev.internal` | `...-staging.internal` |
| Track | execution tracking | `ems.track.service.url` | `ems-track-service.tajawal-dev.internal` | `...-staging.internal` |
| Configuration | Connection, Api Call, Mapper, Script, Global Variable, Workspace, ws-usr, Secret | `ems.configuration.service.url` | `ems-v1-configuration-service.tajawal-dev.internal` | `...-staging.internal` |
| Reporting | report list/generate/search | `ems.reporting.service.url` | `ems-v1-reporting-service.tajawal-dev.internal` | `...-staging.internal` |

**Production:** none of the above are confirmed — the existing framework's own `application-prod.properties`
is empty. Don't guess `*.tajawal-prod.internal` hostnames; get them from the platform team before writing any
prod automation.

**Network:** every host above except UI Gateway is internal (`*.tajawal-<env>.internal`) — only reachable
over the office network/VPN, not from an arbitrary CI runner or cloud sandbox.

## Auth: two mechanisms, used for different things

1. **Internal trust header (used for ~all direct microservice calls).** The internal services accept a
   caller-supplied identity instead of requiring a real login: header `x-user-info` is a base64-encoded JSON
   blob `{ "email": "...", "permissionsList": [{"name","roleName","source"}, ...] }`, and header `x-workspace`
   scopes the call to a workspace. This is *not* a real credential — it's a trust boundary that only holds
   because these services sit on the internal network. **Never use it against a public-facing endpoint or
   production**, and never hardcode a captured value — always generate it (`api/core/auth.ts`
   `internalHeaders(...)` in this project; `genie.ems().auth().internalHeaders(...)` in magpie).
   Permission enum (`name` / `roleName` / `source`): `EMS_ACCESS`/`ems_access`/HUB,
   `WORKSPACE_CREATOR`/`ems_create_workspace`/HUB, `DOWNLOAD_ACCESS`/`ems_download_dashboard_logs`/HUB,
   `SUPER_ADMIN`/`ems_super_admin`/HUB, `WRITE`/`write`/WORKSPACE, `LIVE`/`live`/WORKSPACE,
   `WORKSPACE_MANAGER`/`workspace_manager`/WORKSPACE, `VAULT`/`vault`/WORKSPACE. Day-to-day tests mostly need
   `WRITE`/`LIVE`/`VAULT`/`WORKSPACE_MANAGER`; hub-level permissions are out of scope unless testing
   authorization matrices explicitly.
2. **Real login (only for the public UI Gateway path).** `POST /auth/login` on the Authentication service
   with `{ email, password }` returns `{ username, hubPermssions, token }` — use `Authorization: Bearer
   <token>` from there. This is the only path that needs an actual user account.

> Security note: the shared Postman collection contained a plaintext password and a hardcoded JWT for a real
> account. Neither was copied into this project (env vars / generated headers only) — worth rotating that
> password/token given it was in a shared file, independent of anything here.

## Entity lifecycle (DRAFT / LIVE)

Most configuration entities (Schema, Observer, Flow, Connection, Api Call, Mapper, Script, Global Variable)
share one lifecycle shape: create (→ DRAFT), update, get by id/code/state, get by workspace, change workspace,
toggle ACTIVE/INACTIVE state, push-live, restore-live, delete draft, delete live. This project implements that
once as `api/core/VersionedConfigClient.ts` and subclasses it per entity.

**Exceptions:**
- **Secret** has no edition/state at all — plain CRUD (`api/domains/secret/SecretClient.ts` does not extend
  the versioned client).
- **Mapper** follows the shape but isn't meaningfully exercised on the state endpoint.
- **Flow** and **Schema** require a version bump on push-live (business rule to be aware of when asserting
  post-push-live state, not a different endpoint shape).
- **Connection** and **Schema** have had code-mutability bugs historically — code is meant to be immutable on
  update for Script/Mapper/Flow; assert this per entity rather than assuming.
- Push-to-live must respect dependency editions (e.g. can't push an Api Call live if its Connection/Mapper is
  still draft-only).

## Execution model

`Schema` = the trigger/event contract → `POST /push` (API Gateway) validates the payload against it and starts
a `Flow` → the Flow's nodes (`API_CALL`, `SCRIPT`, `IF_CONDITION`/`IF_CONDITION_ADVANCED`/`MULTI_CONDITION`,
`SPLITTER`, Multi Action, `Action`, `FAILURE_HANDLER`, ...) execute in sequence/fan-out. `Action` nodes are
terminal on their path; `SPLITTER`/Multi Action fan out; `IF_CONDITION` is legacy in the FE but still valid to
test on the backend. One pushed event produces multiple reporting rows: one EVENT row, one FLOW row, and one
row per executed node (API_CALL/SCRIPT).

**Observer** is the piece that actually listens on a broker queue/topic (`connectionCode` + `topicName`) and
maps incoming messages onto a Schema — supported broker types: `RABBITMQ`, `KAFKA`, `ACTIVEMQ`, `ARTEMIS`;
end-to-end automation should default to `RABBITMQ`/`KAFKA`.

## Reporting semantics

`GET /report?type=...` — `type` selects the **execution layer**, not a free-form filter: `EVENT` (trigger),
`FLOW` (orchestration), `API_CALL` (node), `SCRIPT` (node). All four share one paginated envelope (`data`,
`page`, `pageSize`, `pageCount`, `totalItems`, `searchAfter`). `code` is **type-specific** (event key for
EVENT, flow code for FLOW, api-call code for API_CALL, script code for SCRIPT) — to see every row for **one**
execution, filter by `emsJobId` (from the push response), not `code`.

## Negative-case dimensions (size negative coverage to these, not 2–3 ad hoc cases)

Mined from the existing human-written suite (147 negative test methods): a P0 config entity there carries
10–20+ negatives. The recurring dimensions to check per entity/endpoint:

1. Missing required field → `1005` Validation Error + `violations[]` (the single largest category).
2. Invalid field value/type (bad enum, wrong type) → `1005`, or `1008` `typeMismatch` when it's an enum on a
   path variable.
3. Duplicate code on create → `1005` "Code already used by another `<entity>`" or `1004` Duplicate key.
4. Immutable code on update → `1005` "Code cannot be changed."
5. Not-found by id → entity-specific `NOT_FOUND` code: connection `1072`, schema `1032`, flow `1191`, mapper
   `1090`, workspace `3002`, ws-user `3004`. (Api-call may use different codes — confirm, don't assume.)
6. Not-found by code (push-live/restore/fetch with a fake code) → same NOT_FOUND family, message names
   DRAFT vs LIVE vs DB.
7. Edition guard on update — updating a LIVE entity through the draft-update path → `1005` or `NOT_FOUND`.
8. Edition guard on delete — deleting a draft with a live twin → `2101` "Please delete Live edition first."
   and/or `1076` "already used."
9. Missing edition context (list/fetch-by-code-and-state without the edition header/param) → plain `400`.
10. Missing/insufficient auth context (no `x-user-info`, or missing the required permission, or wrong
    workspace) — **not covered in the human suite today; treat as a real gap to add**, not a precedent to
    skip.

**Capture-first discipline (non-negotiable):** hit the endpoint against dev, read the real `ErrorResponse`
(`code`, `status`, `message`, `violations[]`), and assert exactly that — never guess a code or message string.
This project's example negative tests are left as `test.skip` TODOs for this reason.

## Cross-cutting error contract

HTTP status and the JSON `status` field must align (4xx validation/business errors → `BAD_REQUEST`/
`NOT_FOUND`, never `INTERNAL_SERVER_ERROR` for a client mistake). Error bodies include `code`, `message`,
`timeStamp`, and `violations`/`errors` arrays where applicable.

## Where this came from

- `EMS Collection.json` (Postman export, shared in this conversation) — endpoint inventory and sample
  payloads.
- `qa-backend-compass/magpie` — `src/test/resources/application-{dev,staging}.properties` (base URLs),
  `client/ems/*` + `client/BaseServiceClientImpl.java` (endpoint paths + request-building pattern),
  `step/ems/*` (usage patterns), `data/generator/ems/auth/*` (auth header construction),
  `.agents/skills/domain-knowledge/references/ems-business-domain.md` (business rules — the authoritative
  source for anything not covered above), `.agents/skills/ems-api-tests/references/negative-catalog.md`
  (negative dimensions/error codes).
