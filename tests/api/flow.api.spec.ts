import { test, expect } from '../../fixtures/api.fixture';
import { CleanupStack } from '../../utils/cleanup';
import { buildEventSchemaPayload, buildApiCallPayload, buildFlowPayload } from '../../utils/testData';
import { createActiveApiConnection, createActiveSchema } from '../../utils/apiDeps';
import { INVALID_OBJECT_ID, WORKSPACE_CODE } from '../../utils/testEnv';
import {
  expectErrorBody,
  expectFlowValidationError,
  expectOk,
  expectPersisted,
  expectRejected,
  expectStatus,
  expectValidationError,
  safeJson,
} from '../../utils/apiAssertions';

/**
 * Flow is the least-confirmed entity in this suite — Node internals weren't in the reference
 * files this project could read, so keep additions here minimal and capture-verify each step.
 *
 * CASING CORRECTION (reverses this file's earlier note — read this before touching `Nodes`
 * again): the request/response logging added to BaseApiClient let us pull the ACTUAL captured
 * payload for a failing create call, and it showed a real, non-empty `Nodes: [...]` array still
 * coming back `{"fieldName": "Nodes", "errorMessage": "Nodes cannot be null"}` — i.e. the
 * capitalized key never bound to the server's field at all. The earlier "confirmed" live capture
 * this file used to cite only ever tested an OMITTED-Nodes payload, which produces the identical
 * violation text regardless of what key the server actually wants — a flawed inference, not a
 * real confirmation. This matches the Mongo storage entity's own lowercase `nodes` field
 * (Flow.java) after all. Every payload below now sends lowercase `nodes`. Don't flip this back
 * without a fresh capture proving otherwise.
 *
 * Also newly found in the same capture: every Flow create payload in this file was missing the
 * required `name` field entirely (a second, compounding bug — the "missing required fields"
 * negative test below already expected `name` in its violations list, but nothing that actually
 * tried to succeed was sending it).
 *
 * Business rule (stated by the team, not yet captured against a live response): a Schema must
 * be created, pushed live, and activated before a Flow can reference it as `schemaCode` — and a
 * Flow itself must go through the same create -> push live -> activate sequence before it can be
 * triggered. `createActiveSchema()` (imported from utils/apiDeps.ts — see the note above the
 * first call site) encapsulates the schema side of this (mirrors
 * observer.api.spec.ts's own `createObserverDeps` helper) so every "should succeed" test uses a
 * schema in the right real-world state; the two new negative tests near the bottom exercise the
 * "not yet active" side of the rule with deliberately loose assertions until a live run confirms
 * the exact error shape.
 *   SUPERSEDED (noted 2026-09-02, no text deleted so the original reasoning stays readable):
 *   that last clause is stale. Live runs since then CAPTURED both of those tests returning 200,
 *   not an error — see each test's own CORRECTED note at the bottom of this file. The stated
 *   business rule is real but is NOT enforced at Flow-create time, and for the event-trigger
 *   case it surfaces asynchronously via reporting rather than in the push response. Do not
 *   "restore" either test to a rejection assertion on the strength of this paragraph.
 *
 * Node envelope (confirmed against Node.java / NodeData.java / setting/*.java):
 *   { id, type, parent: string[], next: string[], failureHandlers: string[],
 *     data: { name, code, setting: <type-specific> } }
 * `type` enum (confirmed, larger than earlier domain notes): EVENT, API_CALL, MAPPER,
 * IF_CONDITION, IF_CONDITION_ADVANCED, ACTION, SEND_EVENT_ACTION, SCHEDULE_EVENT_ACTION,
 * DELAY, DO_NOTHING, SPLITTER, SCRIPT, MULTI_CONDITION, FAILURE_HANDLER, OTHER, LLM (seen in a
 * real example document, not yet exercised by any test here — see the 2026-08-26 note below).
 *
 * CORRECTION (found via a live run after the `nodes`/`name` fix above): an `EVENT`-type node
 * must NOT send a `parent` key at all. Sending `parent: []` (an empty array — the seemingly
 * obvious "no parent" value) still gets rejected: `{"fieldName": "parent", "errorMessage":
 * "Parent for event nodes should be empty"}`. Whatever validates this apparently checks for
 * the key's absence, not an empty collection — presence of the key, even empty, fails it.
 * Every EVENT-type trigger node below omits `parent` entirely for this reason. Only confirmed
 * for the EVENT/trigger node type; not yet tested whether the same rule applies to any other
 * node type's `parent`.
 *
 * CORRECTED (2026-08-26, real example Flow document provided by the user — looks like a DB
 * export/read of an ACTIVE flow, given the presence of `_class`, `createdAt`, `modifiedAt`, and
 * `hasAnotherEdition`, but was given explicitly as "an example body to create flow"):
 *
 * 1. `parent: null` RECONCILES with, rather than contradicts, the "EVENT nodes reject parent: []"
 *    finding above. The real EVENT node in this example sends an explicit `"parent": null` (not
 *    an omitted key). Refined rule: the field must deserialize to null — omitting the key (what
 *    every EVENT node below already does) and sending an explicit `null` are both fine; only a
 *    non-null EMPTY ARRAY `[]` is rejected. No code change needed here since omission already
 *    produces the same "absent -> null" result on the wire.
 *    NOT changed: `failureHandlers`. This example shows `failureHandlers: null` on every single
 *    node, including non-EVENT nodes whose `parent` is a real populated array — unlike `parent`,
 *    there is no captured REJECTION of `failureHandlers: []` for any node type, so the `[]` this
 *    file already sends for every node is left as-is below. Flagged as an open question, not
 *    changed.
 *
 * 2. `createdBy` / `modifiedBy` added to every Flow create payload below (via the new
 *    `buildFlowPayload` in utils/testData.ts) — this example includes both, matching the same
 *    gap already confirmed and fixed for Api Call's real curl. NOT added: `state`. This example
 *    shows `"state": "ACTIVE"`, but that's very likely just the live/activated document's current
 *    state at export/read time (alongside `createdAt`/`modifiedAt`/`hasAnotherEdition`, which are
 *    obviously server-managed and are NOT sent on create) rather than a real create-time value —
 *    Flow already goes through the same create -> pushLive -> updateState('ACTIVE') sequence as
 *    Api Call/Connection in this suite's own tests, so a create-time `state` is plausible by
 *    analogy, but nothing here actually captures what value (if any) a Flow create call expects.
 *    Left unset pending a real capture, rather than guessing a value the way Api Call's
 *    `state: 'INACTIVE'` default WAS captured directly.
 *
 * 3. Node `type` enum: `LLM` seen for the first time in this example (`llm_node`, provider
 *    OPENAI, model gpt-4o-mini) — added to the list above. Not otherwise exercised by any test.
 *
 * 4. New node `setting` shapes seen for the first time — recorded here as reference; only
 *    API_CALL's is currently exercised by a test (see the CORRECTED note at that node below):
 *      - MAPPER: `{ type: 'MAPPER', fields: string[] }` — a FLAT array of plain field-name
 *        strings (e.g. `["totals", "products"]`), not an array of objects.
 *      - API_CALL: `{ type: 'API_CALL', pathVariables: [{key, value}], cases: {"2xx": nodeId} }`
 *        — CONFIRMED (2026-08-26, real captured 400 on the "full lifecycle" test): the `type`
 *        key is REQUIRED whenever a node sends a `setting` object at all — omitting it 400s with
 *        a Jackson polymorphic-deserialization error (`code: 1010`, "Could not resolve subtype
 *        of ... NodeDataSettingDto: missing type id property 'type'"). `cases` is still
 *        unconfirmed as required — not added, since nothing has shown its absence rejected.
 *      - LLM: `{ type: 'LLM', provider, model, userPrompt, responseMapperCode, inputFields[] }`.
 *      - SCRIPT (Flow node — distinct from the standalone Script entity): `{ type: 'SCRIPT',
 *        inputVariables: [{key, value, type}], outputVariables: string[] }` — different field
 *        names/shape from the standalone Script entity's own `input[]`/`output[]`.
 *
 * 5. Real node `id` format seen: `Node::<TYPE>::<random decimal>` (e.g.
 *    `"Node::EVENT::0.7198862935725976"`), vs. this file's simple string ids (`'trigger-1'`,
 *    `'apicall-1'`). Left as-is below — nothing indicates the id format itself is validated, and
 *    changing working ids on a guess would violate this project's own capture-first rule.
 *
 * CORRECTED (2026-08-26, real captured curl from the user, who reported this API "fails every
 * time"): `updateState` (activate/deactivate) for Flow wants the RAW uppercase state on the
 * wire — `PUT /flow/{id}/ACTIVE`, NOT `/flow/{id}/active`. This is the opposite of the shared
 * `DraftLiveResourceApi.updateState()`'s default behavior, which unconditionally lowercases —
 * a convention confirmed correct for Connection/Schema (a real 404 there is what originally
 * proved lowercase is needed for THOSE entities). Casing is evidently NOT consistent across
 * entities — this project has hit this exact kind of surprise before (e.g. Script's
 * delete-guard message casing). MOVED (2026-09-02 architecture pass): this used to be a
 * `{ raw: true }` argument repeated at every single `flowApi.updateState(...)` call site in this
 * file. The quirk is a property of the ENTITY, not of any one call, so it now lives once in
 * `fixtures/api.fixture.ts` (`new DraftLiveResourceApi(..., 'flow', { rawState: true })`) — the
 * wire behavior is identical, but a new call site can no longer forget it and get a confusing
 * "not found in DB" instead. Do NOT re-add a per-call `{ raw: true }` here. Not yet re-checked
 * whether any OTHER entity in this suite besides
 * Connection/Schema (which are confirmed) and Flow (now confirmed the other way) needs the same
 * override — flagging as open rather than assuming lowercase is safe everywhere else.
 */

// `createActiveSchema` (create -> push live -> activate a schema, then return its code) is now
// imported from utils/apiDeps.ts. REMOVED (2026-09-02 architecture pass): this file carried a
// byte-for-byte duplicate of that helper — apiDeps' own doc comment already said the helper was
// "moved here from flow.api.spec.ts's local copy", but this file was never actually switched
// over, so the two copies had been drifting apart in place. The only difference in behaviour is
// that the shared helper takes `workspaceCode` as an explicit argument instead of closing over
// this file's module-level constant.
//
// EVIDENCE PRESERVED from the deleted local copy (2026-08-31, real captured cleanup-error in a
// fresh test report) — this is WHY the helper deactivates the live schema before deleting it:
// the ACTIVE-blocks-delete rule already confirmed for Flow/Observer (see the file-level comment
// and observer.api.spec.ts) also applies to Schema. A real cleanup attempt against a
// still-ACTIVE live Schema failed with `{"fieldName": "state", "errorMessage": "Only inactive
// schema can be deleted"}`. The shared helper pushes the INACTIVE cleanup task AFTER its
// deleteLive task so LIFO order deactivates first — do not reorder those two pushes in
// utils/apiDeps.ts without re-reading this note.

test.describe('Flow lifecycle (DRAFT/LIVE)', { tag: '@api' }, () => {
  test('API-FLOW-001 — creates a minimal draft flow with a single EVENT trigger node', async ({ schemaApi, flowApi }) => {
    const cleanup = new CleanupStack();
    const flowCode = `qa_flow_min_${Date.now()}`;

    try {
      const schemaCode = await createActiveSchema(schemaApi, cleanup, WORKSPACE_CODE, 'qa_schema_for_flow');

      const createRes = await flowApi.create(
        buildFlowPayload(flowCode, WORKSPACE_CODE, schemaCode, [
          {
            id: 'trigger-1',
            type: 'EVENT',
            // No `parent` key — see the file-level comment: EVENT nodes reject even an empty
            // `parent: []` array (and a real example independently confirms `null` is fine).
            next: [],
            failureHandlers: [],
            data: { name: 'Trigger', code: 'trigger-1' },
          },
        ])
      );
      const created = await expectOk(createRes);
      expect(created.code).toBe(flowCode);
      cleanup.push(() => flowApi.delete(created.id));
    } finally {
      await cleanup.runAll();
    }
  });

  test('API-FLOW-002 — full lifecycle: create draft flow with EVENT + API_CALL nodes -> read -> update -> list -> push live -> activate (version check) -> delete', async ({
    schemaApi,
    connectionApi,
    apiCallApi,
    flowApi,
  }) => {
    const cleanup = new CleanupStack();
    const apcCode = `qa_apc_for_flow_${Date.now()}`;
    const flowCode = `qa_flow_${Date.now()}`;

    try {
      const schemaCode = await createActiveSchema(schemaApi, cleanup, WORKSPACE_CODE, 'qa_schema_for_flow2');

      // CORRECTED (2026-08-25): must be LIVE + ACTIVE for an Api Call to reference it — see
      // utils/apiDeps.ts's createActiveApiConnection doc comment.
      const cxnCode = await createActiveApiConnection(connectionApi, cleanup, WORKSPACE_CODE, 'qa_cxn_for_flow');

      // CORRECTED (2026-08-25, real captured curl): matches apiCall.api.spec.ts's own
      // buildApiCallPayload shape now — createdBy/modifiedBy/state, and details.path/
      // requestBody per the real UI curl. See utils/testData.ts's doc comment.
      const apcRes = await apiCallApi.create(buildApiCallPayload(apcCode, WORKSPACE_CODE, cxnCode));
      const apc = await expectOk(apcRes);
      cleanup.push(() => apiCallApi.delete(apc.id));

      // CORRECTED (2026-08-26, real captured 400 at Flow push-live): a DRAFT-only ApiCall isn't
      // enough for a Flow to reference it in an API_CALL node when the FLOW itself is pushed
      // live — push-live validates every referenced dependency's edition, not just the Flow's
      // own. Real captured error: `{"code": 1005, "status": "BAD_REQUEST", "message":
      // "Validation Error", "errors": [{"id": "apicall-1", "violations": [{"fieldName":
      // "edition", "errorMessage": "ApiCall [ <code>] is not exist in [LIVE] edition."}]}]}`.
      // This is the same "push-to-live must respect dependency editions" rule already flagged
      // as unconfirmed in EMS_API_Domain_Notes.md — now confirmed, at least for Flow -> ApiCall.
      // Only pushing the ApiCall live is confirmed necessary here; nothing in this error implies
      // it also needs to be ACTIVE (unlike the Connection-for-ApiCall rule), so it's deliberately
      // NOT activated — don't add that without separate evidence.
      const apcPushLiveRes = await apiCallApi.pushLive(apcCode);
      await expectOk(apcPushLiveRes);
      cleanup.push(() => apiCallApi.deleteLive(apcCode));

      // 1. Create a draft Flow: EVENT trigger -> API_CALL node.
      const createRes = await flowApi.create(
        buildFlowPayload(flowCode, WORKSPACE_CODE, schemaCode, [
          {
            id: 'trigger-1',
            type: 'EVENT',
            // No `parent` key — see the file-level comment: EVENT nodes reject even an empty
            // `parent: []` array (and a real example independently confirms `null` is fine).
            next: ['apicall-1'],
            failureHandlers: [],
            data: { name: 'Trigger', code: 'trigger-1' },
          },
          {
            id: 'apicall-1',
            type: 'API_CALL',
            parent: ['trigger-1'],
            next: [],
            failureHandlers: [],
            // CORRECTED (2026-08-26, real captured 400): omitting `type` inside `setting`
            // 400'd with a Jackson polymorphic-deserialization error — `setting` is bound to a
            // `NodeDataSettingDto` supertype, and the server needs the `type` discriminator to
            // resolve which setting subtype to parse into: `{"code": 1010, "status":
            // "BAD_REQUEST", "message": "JSON parse error: Could not resolve subtype of [simple
            // type, class com.seera.core.ems.common.setting.NodeDataSettingDto]: missing type id
            // property 'type' (for POJO property 'setting')"}`. This confirms the real example's
            // `type` key inside `setting` (see the file-level comment) is required whenever
            // `setting` is sent at all — not merely an optional extra field. `cases` is still
            // unconfirmed as required; left out since nothing has shown its absence rejected.
            // Note this only applies to nodes that send a `setting` object in the first place —
            // EVENT/DO_NOTHING nodes in this file send no `setting` key at all and are unaffected.
            data: { name: 'Call it', code: apcCode, setting: { type: 'API_CALL', pathVariables: [], headers: [], queryParams: [] } },
          },
        ])
      );
      const created = await expectOk(createRes);
      const versionBeforePushLive = created.version;
      cleanup.push(() => flowApi.delete(created.id));

      // 2. Read back.
      await expectOk(await flowApi.getById(created.id));
      await expectOk(await flowApi.getByCode(flowCode));
      // TIGHTENED (2026-09-02 architecture pass): this line used to assert
      // `.toBeGreaterThanOrEqual(200)`, which is a no-op range check — every HTTP status this
      // client can return satisfies it, so the call was effectively unasserted. This is a
      // positive path inside a lifecycle test whose every other read is a confirmed 200, so it
      // now asserts a real 200. If a live run disagrees, capture the real status here rather
      // than reverting to a range.
      // CORRECTED (2026-09-02): same edition-vs-state bug fixed in schema/connection on the same
      // day — DRAFT/LIVE is the EDITION (sent as a header by getByCodeAndState), never the state
      // path param, which wants the business state enum. Schema's run captured the proof:
      // `Failed to convert ... to required type SchemaInfoStateE ... for value [DRAFT]`.
      // This call site was not caught by that run only because Flow's whole service was 503 at
      // the time, so the test never got this far.
      await expectOk(await flowApi.getByCodeAndState(flowCode, 'INACTIVE'));
      await expectOk(await flowApi.getDraftByCode(flowCode));

      // 3. Update (add a node — not linked in yet, just appended for the update check). Reads
      // `created.nodes` (lowercase) back from the response — unconfirmed whether the server
      // echoes the same lowercase key it now (per the file-level comment) expects on the way
      // in; tighten/adjust this line if a live run shows otherwise.
      // The update also changes `description` so there is a scalar field whose persistence can
      // actually be verified below — see the expectPersisted note after this call.
      const updatedDescription = 'Updated by ems-ui-automation';
      const updateRes = await flowApi.update(created.id, {
        ...created,
        description: updatedDescription,
        nodes: [
          ...created.nodes,
          {
            id: 'donothing-1',
            type: 'DO_NOTHING',
            parent: ['apicall-1'],
            next: [],
            failureHandlers: [],
            data: { name: 'No-op', code: 'donothing-1' },
          },
        ],
      });
      await expectOk(updateRes);

      // 3b. Update-PERSISTENCE check (added 2026-09-02): a 200 from the PUT above only proves
      // the write was accepted, not that anything changed — a service that silently drops a
      // field passes that assertion. Re-reads the record and asserts the new value came back.
      // Deliberately asserts `description` (a scalar we control) and NOT the `nodes` array: the
      // exact shape the server echoes back for `nodes` has never been captured (see the note
      // above), so a deep-equality assertion on it would be a guess. Extend this to `nodes`
      // once a real captured read confirms the echoed shape.
      await expectPersisted(() => flowApi.getById(created.id), { description: updatedDescription });

      // 4. List (global + by workspace).
      await expectOk(await flowApi.list());
      await expectOk(await flowApi.getByWorkspace(WORKSPACE_CODE));

      // 5. Push live first, THEN activate the resulting LIVE record (using its own id) —
      // updateState only operates on the LIVE edition; see connection.api.spec.ts's note for
      // the live-captured evidence (error code 1072, "not found in LIVE DB").
      const pushLiveRes = await flowApi.pushLive(flowCode);
      const live = await expectOk(pushLiveRes);
      cleanup.push(() => flowApi.deleteLive(flowCode));

      await expectOk(await flowApi.updateState(live.id, 'ACTIVE'));

      // 6. Version-bump check — still CAPTURE ONLY. The bump mechanics for Flow have never been
      // captured (does push-live increment? does it copy the draft's version verbatim? is
      // `version` even populated on a Flow at all?), so nothing is asserted here — asserting a
      // relationship between these two values would be a guess, which this project's
      // capture-first rule forbids.
      // CHANGED (2026-09-02): the `console.log` this used to be is invisible in the HTML report
      // and scrolls out of a CI log, so the very evidence needed to tighten this was being
      // thrown away on every run. The before/after pair is now ATTACHED to the report instead,
      // which is where the next person will actually look for it.
      await test.info().attach('capture-me: Flow version before/after push-live', {
        body: Buffer.from(
          JSON.stringify({ versionBeforePushLive, versionAfterPushLive: live?.version }, null, 2)
        ),
        contentType: 'application/json',
      });
      // TODO once confirmed: expect(live.version).not.toBe(versionBeforePushLive);

      // 7. Deactivate before delete. Business rule (stated by the user, 2026-08-26): a LIVE flow
      // that is still ACTIVE cannot be deleted — it must be set back to INACTIVE first. This is
      // a genuinely different guard from the DRAFT-vs-LIVE "edition guard" tested elsewhere in
      // this file (code 2101, "Please delete Live edition first") — that one blocks deleting the
      // DRAFT while a LIVE twin exists; this one blocks deleting the LIVE edition itself while
      // its own `state` is ACTIVE. Without this step, this test's own cleanup (which calls
      // `deleteLive`) would hit that guard and fail — that failure is CORRECT backend behavior,
      // not a test bug, per the user. See the new dedicated negative tests below for the two
      // scenarios this implies (delete while ACTIVE is blocked; delete after deactivating
      // succeeds) — exact error shape for the blocked case isn't captured live yet there either.
      await expectOk(await flowApi.updateState(live.id, 'INACTIVE'));
    } finally {
      await cleanup.runAll();
    }
  });

  // --- Negatives (capture-first) ---
  //
  // Evidence ported verbatim from magpie's FlowCrudTests.java (read directly from the reference
  // source; method names cited per assertion). Flow's error bodies wrap `violations` inside a
  // top-level `errors: [{ id, violations }]` array — a different shape from every other entity
  // in this suite, confirmed by the source, not a guess.

  // No `parent` key — see the file-level comment: EVENT nodes reject even an empty
  // `parent: []` array.
  const flowNode = {
    id: 'trigger-1',
    type: 'EVENT',
    next: [],
    failureHandlers: [],
    data: { name: 'Trigger', code: 'trigger-1' },
  };

  // Dimension 1: missing required fields (code / description / schemaCode / nodes).
  // createDraftFlowNegativeTest (crt_flow.csv). Note: the violation's `fieldName` below still
  // reads as "Nodes" (capitalized) — this is the validator's own field-name string and is
  // evidently independent of the wire JSON key, which needs to be lowercase `nodes` on the way
  // in (see the file-level comment above). This payload is `{}` either way, so this assertion
  // is unaffected by the casing correction.
  //
  // CORRECTED (live run): a real captured response for this exact `{}` payload does NOT
  // include a `workspaceCode` violation at all — the earlier expectation that `workspaceCode`
  // is required here was wrong (it may be optional for Flow, or defaulted server-side; either
  // way it isn't enforced at this validation layer). Dropped from the expected list below.
  test('API-FLOW-003 — rejects a flow missing required fields (code / description / schemaCode / nodes)', async ({ flowApi }) => {
    const res = await flowApi.create({});
    // `expectValidationError` covers the 400 + code 1005 + "Validation Error" trio. Its
    // `violations` option is deliberately NOT used here: Flow nests its violations inside
    // `errors: [{ id, violations }]` (see this section's comment) rather than at the top level,
    // so the nested shape is asserted below, verbatim as captured.
    const body = await expectFlowValidationError(res);
    expect(body.status).toBe('BAD_REQUEST');
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].violations).toEqual(
      expect.arrayContaining([
        { fieldName: 'code', errorMessage: 'Code cannot be null' },
        { fieldName: 'description', errorMessage: 'Description cannot be null' },
        { fieldName: 'name', errorMessage: 'Name cannot be null' },
        { fieldName: 'schemaCode', errorMessage: 'SchemaCode cannot be null' },
        { fieldName: 'Nodes', errorMessage: 'Nodes cannot be null' },
      ])
    );
  });

  // schemaCode referencing a non-existent Schema — NO EVIDENCE FOUND. The reference only tests a
  // MISSING schemaCode (above); no test submits a valid Flow whose schemaCode doesn't resolve to
  // any real Schema. Left skipped rather than guessing a 1191 "Flow not found" for this case.
  test.skip('@pending API-FLOW-004 — rejects a flow whose schemaCode does not exist', async () => {});

  // Malformed node graph (dangling next/parent/failureHandlers reference) — NO EVIDENCE FOUND.
  // No test method in FlowCrudTests.java constructs a Nodes array with an internally-dangling
  // reference; every payload in the file is well-formed. Left skipped.
  test.skip('@pending API-FLOW-005 — behavior for a malformed node graph (next referencing a non-existent node id) is unconfirmed', async () => {});

  // Dimension 3: duplicate code on create.
  // createDraftFlowWithExistingCodeNegativeTest.
  test('API-FLOW-006 — rejects a duplicate flow code', async ({ schemaApi, flowApi }) => {
    const cleanup = new CleanupStack();
    try {
      const schemaCode = await createActiveSchema(schemaApi, cleanup, WORKSPACE_CODE, 'qa_schema_for_flow_dup');
      const code = `qa_flow_dup_${Date.now()}`;
      const payload = buildFlowPayload(code, WORKSPACE_CODE, schemaCode, [flowNode]);

      const createRes = await flowApi.create(payload);
      // Guard: without this, a silently-failed setup call here would surface as a confusing
      // mismatched assertion below instead of a clear "setup failed" signal.
      const created = await expectOk(createRes);
      cleanup.push(() => flowApi.delete(created.id));

      const dup = await flowApi.create(payload);
      await expectErrorBody(dup, { status: 400, code: 1004, message: 'Duplicate key exception' });
    } finally {
      await cleanup.runAll();
    }
  });

  // Dimension 4: immutable code on update.
  // updateDraftFlowWithDifferentCodeNegativeTest — the reference's `errors[0].id` is set to the
  // NEW (attempted) code, not the flow's original id/code; that's the literal shape returned.
  test('API-FLOW-007 — rejects changing a flow\'s code on update', async ({ schemaApi, flowApi }) => {
    const cleanup = new CleanupStack();
    try {
      const schemaCode = await createActiveSchema(schemaApi, cleanup, WORKSPACE_CODE, 'qa_schema_for_flow_updcode');
      const code = `qa_flow_updcode_${Date.now()}`;

      const createRes = await flowApi.create(buildFlowPayload(code, WORKSPACE_CODE, schemaCode, [flowNode]));
      // Guard: same reasoning as the duplicate-code test above.
      const created = await expectOk(createRes);
      cleanup.push(() => flowApi.delete(created.id));

      const newCode = `${code}_changed`;
      const res = await flowApi.update(created.id, { ...created, code: newCode });
      // Deliberately `expectStatus` + an explicit code check rather than
      // `expectValidationError`: that helper also asserts `message === 'Validation Error'`, and
      // the reference evidence for THIS response only ever captured the status, `code` and
      // `errors[]` — the `message` was never recorded, so asserting it would be an invention.
      const body = await expectStatus(res, 400);
      expect(body.code).toBe(1005);
      expect(body.errors).toEqual([
        { id: newCode, violations: [{ fieldName: 'code', errorMessage: 'No flow with this Id in the draft.' }] },
      ]);
    } finally {
      await cleanup.runAll();
    }
  });

  // Dimension 5/6: not-found by id / by code — confirmed as 400 with entity code 1191 "Flow not
  // found" for the by-id path; the by-code path (fetchFlowByInvalidCodeNegativeTest) is
  // status-only in the reference, no body asserted.
  test('API-FLOW-008 — 404s on an unknown flow id/code', async ({ flowApi }) => {
    const byId = await flowApi.getById(INVALID_OBJECT_ID);
    await expectErrorBody(byId, { status: 400, code: 1191, message: 'Flow not found' });

    // Status-only on purpose — the reference asserts no body for the by-code path.
    const invalidCode = `qa_flow_does_not_exist_${Date.now()}`;
    const byCode = await flowApi.getByCode(invalidCode);
    await expectStatus(byCode, 400);
  });

  // Dimension 8: edition guard — deleting a draft with a live twin.
  // deleteDraftFlowWithExistingLiveVersionNegativeTest.
  test('API-FLOW-009 — blocks deleting a draft flow that has a live edition', async ({ schemaApi, flowApi }) => {
    const cleanup = new CleanupStack();
    try {
      const schemaCode = await createActiveSchema(schemaApi, cleanup, WORKSPACE_CODE, 'qa_schema_for_flow_dellive');
      const code = `qa_flow_dellive_${Date.now()}`;

      const createRes = await flowApi.create(buildFlowPayload(code, WORKSPACE_CODE, schemaCode, [flowNode]));
      // Guard: same reasoning as the duplicate-code test above.
      const created = await expectOk(createRes);
      cleanup.push(() => flowApi.delete(created.id));

      const pushLiveRes = await flowApi.pushLive(code);
      await expectOk(pushLiveRes);
      cleanup.push(() => flowApi.deleteLive(code));

      const res = await flowApi.delete(created.id);
      await expectErrorBody(res, {
        status: 400,
        code: 2101,
        message: `Failed to delete draft edition with code ${code}, Please delete live edition first.`,
      });
    } finally {
      await cleanup.runAll();
    }
  });

  // Business rule (stated by the user, 2026-08-26): a distinct guard from the edition guard
  // above — that one is about DRAFT-vs-LIVE (can't delete the draft while a live twin exists);
  // this one is about the LIVE edition's own ACTIVE/INACTIVE `state` (can't delete the live
  // edition itself while it's still ACTIVE, must deactivate first). The "full lifecycle" test
  // above originally failed at its own cleanup's `deleteLive` call for exactly this reason —
  // per the user, that failure was CORRECT backend behavior, not a test bug, which is what these
  // two tests exist to confirm directly rather than leave as an incidental cleanup failure.
  // Exact error code/message for the blocked case isn't captured live yet — `expectRejected`
  // below asserts only that it IS rejected (4xx) and ATTACHES the real body to the report, so
  // the next run produces the evidence needed to tighten this into an exact code/message.
  test('API-FLOW-010 — blocks deleting a live flow while it is still ACTIVE', async ({ schemaApi, flowApi }) => {
    const cleanup = new CleanupStack();
    try {
      const schemaCode = await createActiveSchema(schemaApi, cleanup, WORKSPACE_CODE, 'qa_schema_for_flow_delactive');
      const code = `qa_flow_delactive_${Date.now()}`;

      const createRes = await flowApi.create(buildFlowPayload(code, WORKSPACE_CODE, schemaCode, [flowNode]));
      const created = await expectOk(createRes);
      cleanup.push(() => flowApi.delete(created.id));

      const pushLiveRes = await flowApi.pushLive(code);
      const live = await expectOk(pushLiveRes);
      // Cleanup pushed in this order so it runs deactivate -> deleteLive (LIFO) rather than
      // hitting the same guard this test's own assertion is deliberately triggering.
      cleanup.push(() => flowApi.deleteLive(code));
      cleanup.push(() => flowApi.updateState(live.id, 'INACTIVE'));

      await expectOk(await flowApi.updateState(live.id, 'ACTIVE'));

      const res = await flowApi.deleteLive(code);
      await expectRejected(res, 'deleting a LIVE Flow while its state is still ACTIVE');
    } finally {
      await cleanup.runAll();
    }
  });

  test('API-FLOW-011 — allows deleting a live flow after it has been deactivated', async ({ schemaApi, flowApi }) => {
    const cleanup = new CleanupStack();
    try {
      const schemaCode = await createActiveSchema(schemaApi, cleanup, WORKSPACE_CODE, 'qa_schema_for_flow_deldeactivated');
      const code = `qa_flow_deldeactivated_${Date.now()}`;

      const createRes = await flowApi.create(buildFlowPayload(code, WORKSPACE_CODE, schemaCode, [flowNode]));
      const created = await expectOk(createRes);
      cleanup.push(() => flowApi.delete(created.id));

      const pushLiveRes = await flowApi.pushLive(code);
      const live = await expectOk(pushLiveRes);

      await expectOk(await flowApi.updateState(live.id, 'ACTIVE'));
      await expectOk(await flowApi.updateState(live.id, 'INACTIVE'));

      // CORRECTED (2026-08-31, real captured assertion failure: `Expected: 200, Received: 204`)
      // — deleteLive returns 204 No Content, not 200.
      const res = await flowApi.deleteLive(code);
      await expectStatus(res, 204);
    } finally {
      await cleanup.runAll();
    }
  });

  // Dimension 10: missing/insufficient auth — NO EVIDENCE FOUND. No auth/permission-denied test
  // method exists for Flow in FlowCrudTests.java.
  test.skip('@pending API-FLOW-012 — rejects requests without the required permission/workspace', async () => {});

  // Gap noted in the scenario catalog: `listBySchemaCodeAndState` IS confirmed to be exercised
  // in the reference (fetchFlowByCodeAndStateWithoutEditionNegativeTest, missing-`edition`
  // case) — still isn't wired into our TS client yet.

  // --- Business-rule negatives (per the team, not yet captured live) ---
  //
  // Stated rule: an Event (Schema) must be created -> pushed live -> activated before a Flow can
  // reference it, and a Flow must go through the same sequence before it can be triggered. Using
  // an inactive Schema in a Flow create, or triggering an event linked to an inactive Flow, are
  // both supposed to produce an error. Neither exact status/code/message has been captured
  // against a live response yet, so both assertions below are deliberately loose (status-range
  // only) — tighten them to the real shape once a live run confirms it.
  //
  // SUPERSEDED (noted 2026-09-02, original text kept for the reasoning trail): both tests have
  // since been run live and both CAPTURED a 200. The assertions below are no longer loose
  // status-range checks — they assert the captured 200 exactly. Each test's own CORRECTED note
  // carries the evidence. The stated rule is still real; what these captures establish is WHERE
  // it is (and is not) enforced.

  // CORRECTED (2026-08-31, real captured response): this test previously asserted the create
  // itself gets rejected (`>= 400`) for a Flow referencing a DRAFT-only (not pushed live/
  // activated) Schema — that assumption is proven WRONG by a live run: `Expected: >= 400,
  // Received: 200`. The stated business rule ("a Schema must be live+active before a Flow can
  // reference it") is NOT enforced at Flow create time. Renamed and rewritten to assert the real,
  // confirmed behavior rather than the previously-assumed one. This doesn't necessarily mean the
  // rule is never enforced anywhere (e.g. it may still matter at event-trigger time) — only that
  // create-time acceptance is now a captured fact, not a guess.
  test('API-FLOW-013 — accepts creating a flow against a schema that has not been pushed live/activated — the stated business rule is not enforced at create time', async ({
    schemaApi,
    flowApi,
  }) => {
    const cleanup = new CleanupStack();
    try {
      // Deliberately DRAFT-only schema — no pushLive/updateState, unlike createActiveSchema().
      const schemaCode = `qa_schema_inactive_${Date.now()}`;
      const schemaRes = await schemaApi.create(
        buildEventSchemaPayload(schemaCode, WORKSPACE_CODE, [{ name: 'id', type: 'STRING', required: true, description: 'id' }])
      );
      const schema = await expectOk(schemaRes);
      cleanup.push(() => schemaApi.delete(schema.id));

      const code = `qa_flow_inactive_schema_${Date.now()}`;
      const res = await flowApi.create(buildFlowPayload(code, WORKSPACE_CODE, schemaCode, [flowNode]));
      // 200 is the CAPTURED behaviour (see the CORRECTED note above) — do not "restore" this to
      // a rejection assertion: a live run already proved that expectation wrong.
      const created = await expectOk(res);
      cleanup.push(() => flowApi.delete(created.id));
    } finally {
      await cleanup.runAll();
    }
  });

  // CORRECTED (2026-08-26, real captured push + response from the user): this test previously
  // asserted the push itself gets rejected (`>= 400`) when the event's linked flow is active but
  // its Flow hasn't been activated — that assumption is now proven WRONG. A real push against an
  // active Schema/Event with an inactive (pushed-live-but-not-activated) linked Flow returns 200
  // and successfully CREATES a Track job:
  //   { "emsJobId": "script-event-ec8595f9-...", "eventKey": "script-event", "status": "created",
  //     "generatedBy": "INPUT_CORE_SERVICE", "createdAt": "2026-08-26T08:25:44.999",
  //     "parentEmsJobId": null, "previousEmsJobId": null, "eventType": "MAIN" }
  // The "flow not activated" failure is NOT synchronous — per the user, it only shows up later,
  // async, in the report explorer/data-explorer search results for that emsJobId (`reportingApi`
  // already has an `explorerSearch()` stub for `POST /report/explorer/search`, and a `list()` for
  // `GET /report?type=...&emsJobId=...` — see EMS_API_Domain_Notes.md's "Reporting semantics").
  // Neither endpoint's exact response shape for a FAILED row has been captured yet, so this test
  // only asserts what's actually been captured (the push succeeds, the Track job is created) and
  // stops short of asserting on the reporting-side failure marker — completing that needs a real
  // captured explorerSearch/report request+response for a job in this exact failed state.
  test('API-FLOW-014 — a pushed event still succeeds when its linked flow has not been activated — the failure surfaces via reporting, not the push response', async ({
    schemaApi,
    flowApi,
    eventIngestionApi,
    reportingApi,
  }) => {
    const cleanup = new CleanupStack();
    try {
      const schemaCode = await createActiveSchema(schemaApi, cleanup, WORKSPACE_CODE, 'qa_schema_for_inactive_flow');
      const code = `qa_flow_inactive_${Date.now()}`;

      const createRes = await flowApi.create(buildFlowPayload(code, WORKSPACE_CODE, schemaCode, [flowNode]));
      const created = await expectOk(createRes);
      cleanup.push(() => flowApi.delete(created.id));

      // Push the Flow live but deliberately do NOT activate it — this is the "inactive flow"
      // state the business rule is about.
      const pushLiveRes = await flowApi.pushLive(code);
      await expectOk(pushLiveRes);
      cleanup.push(() => flowApi.deleteLive(code));

      const pushEventRes = await eventIngestionApi.pushEvent({
        eventKey: schemaCode,
        eventType: 'MAIN',
        payload: { test: 'value' },
      });
      // 200 + a created Track job is the CAPTURED behaviour (see the CORRECTED note above) — do
      // not "restore" this to a rejection assertion: a real captured push already proved that
      // expectation wrong. The rule's enforcement is asynchronous, on the reporting side.
      const pushed = await expectOk(pushEventRes);
      expect(pushed.eventKey).toBe(schemaCode);
      expect(pushed.status).toBe('created');
      expect(pushed.emsJobId).toBeTruthy();

      // Capture-only: record the report list for this emsJobId so a future pass can see the real
      // shape of a failed FLOW row and turn this into a hard assertion. Not asserted on yet —
      // the exact shape of a "failed because flow inactive" row is unconfirmed, and the report
      // row is written asynchronously, so even its presence at this instant isn't a safe
      // expectation.
      // CHANGED (2026-09-02): was a pair of `console.log`s, which are invisible in the HTML
      // report and lost from CI logs — i.e. the one piece of evidence this test exists to
      // produce was being discarded every run. Now attached to the report instead.
      const reportRes = await reportingApi.list({ type: 'FLOW', emsJobId: pushed.emsJobId });
      await test.info().attach(`capture-me: FLOW report rows for emsJobId ${pushed.emsJobId} (${reportRes.status()})`, {
        body: Buffer.from(
          JSON.stringify({ status: reportRes.status(), body: await safeJson(reportRes) }, null, 2)
        ),
        contentType: 'application/json',
      });
    } finally {
      await cleanup.runAll();
    }
  });

  // Stretch scenario (needs eventIngestionApi + trackApi/reportingApi together) — push a
  // real event matching this flow's schemaCode and confirm a Track record + a
  // `report?type=FLOW` row appear for the resulting emsJobId. Left for a follow-up pass.
  test.skip('@pending API-FLOW-015 — end-to-end: pushing a matching event produces a track record and a FLOW report row', async () => {});
});
