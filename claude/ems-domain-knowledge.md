---
name: ems-domain-knowledge
description: Confirmed domain knowledge and business rules for testing the EMS (Event Management System) integration/orchestration platform — entity lifecycles, activation-state business rules, auth mechanisms, casing/payload gotchas, and error-code conventions. Use whenever writing, reviewing, or fixing API or UI test automation against EMS (any language/framework) so tests reflect real, captured behavior instead of guesses.
---

# EMS Domain Knowledge

This is a distilled reference for testing EMS, built from direct captures against a live dev
environment, the "magpie" Java/RestAssured reference QA framework, and a Postman collection —
plus business rules confirmed directly by the EMS team. It exists so a fresh session (or a fresh
person) doesn't have to re-derive this from scratch, and doesn't accidentally re-introduce bugs
this project already found and fixed once.

**The one rule that matters more than any fact below: capture-first, never guess.** Every
specific error code, message string, or status in this document was read off a real response
(or, for business rules, stated directly by the team) — never invented to make a test pass. If
you're writing a test for behavior not covered here, hit the real endpoint, read the actual
`ErrorResponse` body, and assert exactly that. Where a fact below is explicitly marked
unconfirmed or "(uncertain)", treat it as a hypothesis to verify, not settled ground — and where
this document conflicts with something you just captured live, the live capture wins; update
this document, don't quietly work around it.

## What EMS actually is

EMS is an event-driven integration/orchestration platform, not a simple event-listing dashboard.
A client pushes an event to a gateway; the event is validated against a **Schema**; a **Flow**
(a node graph) executes in response, calling out to other systems via **Api Call** nodes,
transforming data via **Mapper**/**Script** nodes, and everything is recorded for
**Reporting**/**Track** lookup by a correlation id (`emsJobId`).

Core entities: **Schema** (the event/trigger contract), **Flow** (the node graph that executes
when a matching event arrives), **Observer** (listens on a broker queue/topic and maps incoming
messages onto a Schema), **Connection** (a reusable endpoint/broker definition), **Api Call**
(an HTTP call node's config, tied to a Connection), **Mapper** (a data-shape transform), **Script**
(arbitrary JS transform), **Global Variables** (workspace-scoped variable set), **Secret**
(vaulted credential), **Workspace** + **ws-usr** (tenancy + per-workspace user permissions).

## The core business rule: activation chains

This is the rule the team stated directly and that drives most of the "why did my flow test
fail" confusion in this domain — **it is a real business rule, separate from any payload-shape
bug (see the casing/name-field gotcha below, which is a different, unrelated problem that also
happens to hit Flow tests)**:

1. **Event (Schema) lifecycle:** create (→ DRAFT) → push live → change the LIVE record's state
   to ACTIVE. Only once a Schema is LIVE **and** ACTIVE can it be referenced (`schemaCode`) by a
   Flow.
2. **Flow lifecycle:** create (→ DRAFT, referencing an already-active Schema) → push live →
   change the LIVE record's state to ACTIVE. Only once a Flow is LIVE **and** ACTIVE can it
   actually be triggered/used.
3. **Creating a Flow that references an inactive Schema is rejected with an error.**
4. **Triggering an event linked to an inactive Flow is also rejected with an error.**

Neither error's exact status/code/message has been captured against a live response yet as of
this writing — treat both as confirmed-to-exist, unconfirmed-in-exact-shape. Write the test,
assert loosely (e.g. `status >= 400`), and tighten to the real body once you've captured it. If a
"should be rejected" case actually comes back 200, that's a real finding to report, not a reason
to loosen the assertion further — it means the API doesn't enforce the rule at that layer.

This same create → push-live → activate sequence is the general shape for every entity in the
"Entity lifecycle" section below — Schema and Flow aren't special in *how* you activate them,
only in the fact that Flow's activation state gates whether it can be used at all, and Schema's
activation state gates whether it can be referenced by a Flow.

## Entity lifecycle (DRAFT / LIVE), general shape

Most configuration entities (Schema, Observer, Flow, Connection, Api Call, Mapper, Script,
Global Variable) share one lifecycle: create (→ DRAFT), update, get by id/code/state, get by
workspace, change workspace, toggle ACTIVE/INACTIVE state, push-live, restore-live, delete draft,
delete live.

Rules confirmed to apply across (almost) all of them:

- **`updateState` (activate/deactivate) only ever operates on the LIVE edition, never the
  DRAFT.** Always push-live first, then call `updateState` using the **LIVE record's own id**
  (returned in the push-live response body) — never the draft's id. Calling it with the draft id
  produces a real "not found in LIVE DB"-style error (confirmed live, e.g. Connection's code
  `1072`).
- The activation value itself is often expected lowercase on the wire (`active`, not `ACTIVE`) —
  confirmed via the reference framework always lowercasing it before sending.
- Flow and Schema require a version bump on push-live (a real field, `version`) — the exact bump
  mechanics aren't confirmed yet; capture before asserting `expect(live.version).not.toBe(...)`.
- Push-to-live should respect dependency editions (e.g. you likely can't push an Api Call live
  while its Connection/Mapper is still draft-only) — not yet exercised as its own test; treat as
  an open question, not a confirmed behavior.

Exceptions to the general shape:

- **Secret** has no edition/state at all — plain CRUD, and requires the `VAULT` permission
  specifically (WRITE gets a real 400 "Access Denied", code `1111`).
- **Mapper** has **no `updateState` endpoint at all** — not an oversight, don't write an
  activation test for it.
- **Workspace** and **ws-usr** have no draft/live split at all either — plain CRUD.
- **Connection** and **Schema** have had code-mutability bugs historically — Schema's "code
  cannot be changed" validation is known to fire on unrelated failure paths too (e.g. updating a
  LIVE edition directly, or an unknown id), not only on a genuine code change. Treat it as an
  overreaching check, not a precise one.

## Observer's own activation dependency

Observer generation (per the reference test-data generator, `ObserverDataGenerator.java`) always
uses a Connection that is **ACTIVE, LIVE, and MSG_BROKER-typed**. Whether the API itself
*enforces* this (vs. it just being a test-data-generator convention) is genuinely unconfirmed —
no reference test ever submits an Observer against a draft or non-MSG_BROKER connection to check.
Build Observer tests' dependencies as if the rule is enforced (safest default), but don't assert
the enforcement itself as fact until captured.

## Flow-specific gotchas (found the hard way — read before touching Flow payloads)

These were found by adding request/response logging to the test framework and inspecting the
*actual* captured payloads for a failing create call, which overturned an earlier (wrong)
assumption already baked into the codebase:

- **The wire key for a Flow's node list is lowercase `nodes`, not `Nodes`.** An earlier "confirmed"
  live capture that had concluded capital `Nodes` was correct turned out to have only ever tested
  an *omitted*-Nodes payload — which produces the identical `"...cannot be null"` violation text
  no matter what the real required key is. A fresh capture with a real, non-empty `Nodes: [...]`
  array still got rejected as null, proving the capitalized key never bound to anything. This
  matches the Mongo storage entity's own lowercase `nodes` field. **Lesson generalized:** a
  "cannot be null" violation on an *omitted* field is evidence that field is required — it is
  **not** evidence about the correct casing/spelling of its wire key. Only a payload that actually
  *includes* a non-null value and still gets the same violation proves a key mismatch.
- **A Flow's top-level `name` field is required** and was missing from every create/update
  payload in this project for a while — a second, compounding bug, unrelated to the casing issue
  above. If you see `"Name cannot be null"` in a Flow violations list, this is why.
- Node envelope shape (confirmed): `{ id, type, parent: string[], next: string[],
  failureHandlers: string[], data: { name, code, setting: <type-specific> } }`.
- Node `type` enum (confirmed): `EVENT`, `API_CALL`, `MAPPER`, `IF_CONDITION`,
  `IF_CONDITION_ADVANCED`, `ACTION`, `SEND_EVENT_ACTION`, `SCHEDULE_EVENT_ACTION`, `DELAY`,
  `DO_NOTHING`, `SPLITTER`, `SCRIPT`, `MULTI_CONDITION`, `FAILURE_HANDLER`, `OTHER`.
- Flow's error body shape is structurally different from every other entity: violations are
  wrapped inside a top-level `errors: [{ id, violations: [...] }]` array, not a bare top-level
  `violations[]`.

## Auth: two mechanisms, used for different things

1. **Internal trust header** (used for ~all direct microservice calls). Header `x-user-info` is
   a base64-encoded JSON blob `{ email, permissionsList: [{name, roleName, source}, ...] }`;
   header `x-workspace` scopes the call to a workspace. This is a trust boundary that only holds
   because these services sit on the internal network — never use it against a public-facing
   endpoint or production, and never hardcode a captured value; always generate it fresh.
   Permission enum: `EMS_ACCESS`/HUB, `WORKSPACE_CREATOR`/HUB, `DOWNLOAD_ACCESS`/HUB,
   `SUPER_ADMIN`/HUB, `WRITE`/WORKSPACE, `LIVE`/WORKSPACE, `WORKSPACE_MANAGER`/WORKSPACE,
   `VAULT`/WORKSPACE. The `/workspace/permissions-list` endpoint returns a *smaller*,
   WORKSPACE-scoped-only catalog (`[WRITE, LIVE, VAULT, WORKSPACE_MANAGER]`) — don't conflate the
   two lists.
2. **Real login** (only for the public UI Gateway path). `POST /auth/login` with
   `{ email, password }` returns `{ username, hubPermssions, token }`; use
   `Authorization: Bearer <token>` from there.

## Reporting semantics

`GET /report?type=...` — `type` selects the execution layer, not a free-form filter: `EVENT`
(trigger), `FLOW` (orchestration), `API_CALL` (node), `SCRIPT` (node). `code` is type-specific
(event key for EVENT, flow code for FLOW, etc.) — to see every row for **one** execution, filter
by `emsJobId` (from the push response), not `code`.

## Negative-test dimensions and error-code conventions

Size negative coverage to these ten dimensions per entity, not 2–3 ad hoc cases — a mature P0
entity test carries 10–20+ negatives in the reference suite this was mined from:

1. **Missing required field** → usually code `1005` "Validation Error" + a `violations[]` array
   (the single largest category).
2. **Invalid field value/type** (bad enum, wrong type) → a *distinct* shape, code `1010`, **no**
   `violations[]` — the message names the Java enum class and lists every accepted value
   verbatim. A bad enum on a *path variable* is a third shape again: `1008`,
   `status: "typeMismatch"`.
3. **Duplicate code on create** → usually `1005` with entity-specific wording, but **Mapper,
   Flow, and Workspace use a distinct `1004` "Duplicate key exception"** with no `violations[]`
   at all.
4. **Immutable code on update** → `1005` with entity-specific wording (varies per entity — check
   before asserting).
   5/6. **Not-found by id/code** → status is **not uniform** across entities:
    - Real HTTP 404: Connection (`1072`), Schema (`1032`, "Schema not found in DB"), Observer.
    - 400 with an entity-specific code, body asserted: ApiCall (`1003`), Mapper (`1090`, note the
      literal double space in "Mapper not found in  DB..."), Flow (`1191`, "Flow not found",
      by-id only), Workspace (`3002`), ws-usr (`3004`).
    - 400, status-only, no body asserted: Script, GlobalVariables, Secret.
7. **Edition guard on update** — updating a LIVE entity through the draft-update path → `1005`
   (sometimes paired with a second, unrelated-looking violation) or, for Flow, "not found"
   (`1191`).
8. **Edition guard on delete** — deleting a draft with a live twin → `2101` "Failed to delete
   `<Entity>` with code :%s, Please delete Live edition first." and/or, for Connection
   specifically, `1076` "Connection is already used."
9. **Missing edition context** (list/fetch-by-code-and-state without the edition header/param) →
   plain `400`, status-only.
10. **Missing/insufficient auth context** — historically a real gap in the human-written
    reference suite for almost every entity; worth adding via a fresh live capture rather than
    treating the gap as precedent to keep skipping.

Cross-cutting: HTTP status and the JSON `status` field must align (4xx validation/business
errors → `BAD_REQUEST`/`NOT_FOUND`, never `INTERNAL_SERVER_ERROR` for a client mistake). Error
bodies generally include `code`, `message`, `timeStamp`, and `violations`/`errors` where
applicable.

## Working principle recap

- Never assert an error code, message, or status you haven't actually observed from a real
  response — a "should fail" test with a loose assertion (status range only) is fine and
  preferred over a guessed exact body.
- A "cannot be null" violation on an omitted field only proves the field is required — it proves
  nothing about the correct casing or spelling of that field's real wire key. To prove a key
  binds correctly, send a real, non-empty value under that key and confirm the violation goes
  away.
- When a test's setup does several sequential creates (schema → connection → api call → flow,
  etc.), guard each one with an explicit status assertion before using its result — an
  unguarded, silently-failed setup step produces a confusing, unrelated-looking mismatch several
  lines later instead of a clear signal.
- Business rules stated directly by the team (like the activation chain above) are a trustworthy,
  citable source even before they're captured against a live response — write the test now with a
  loose assertion, and tighten it once you've captured the real error shape.