import { test, expect } from '../../fixtures/api.fixture';
import { CleanupStack } from '../../utils/cleanup';
import { WORKSPACE_CODE, SECOND_WORKSPACE_CODE, hasSecondWorkspace, INVALID_OBJECT_ID } from '../../utils/testEnv';
import { buildGlobalVariablePayload } from '../../utils/testData';
import { expectOk, expectStatus, expectValidationError, expectErrorBody, expectRejected, expectPersisted } from '../../utils/apiAssertions';

/**
 * Field shapes confirmed against magpie's GlobalVariables.java / VariableAttributes.java.
 * Despite the name, these are workspace-scoped, not truly global — confirmed via
 * `workspaceCode` always being required/resolved in the reference.
 */
test.describe('Global Variables lifecycle (DRAFT/LIVE)', { tag: '@api' }, () => {
  test('API-GVAR-001 — full lifecycle: create draft -> read -> update -> list -> push live -> activate -> change workspace -> delete', async ({
    globalVariablesApi,
  }) => {
    const cleanup = new CleanupStack();
    const code = `qa_gv_${Date.now()}`;

    try {
      // 1. Create with two variableAttributes of different types. `description` is confirmed
      // live: 400 "Global Variables document description is missed" without it — it's a default
      // of `buildGlobalVariablePayload` (utils/testData.ts), which carries that same note.
      const created = await expectOk(await globalVariablesApi.create(buildGlobalVariablePayload(code, WORKSPACE_CODE)));
      expect(created.code).toBe(code);
      cleanup.push(() => globalVariablesApi.delete(created.id));

      // 2. Read back.
      await expectOk(await globalVariablesApi.getById(created.id));
      await expectOk(await globalVariablesApi.getByCode(code));
      await expectOk(await globalVariablesApi.getDraftByCode(code));

      // 3. Update (change a value, add a key).
      const newAttribute = { key: 'timeoutMs', value: 5000, type: 'NUMBER' };
      await expectOk(
        await globalVariablesApi.update(created.id, {
          ...created,
          variableAttributes: [...created.variableAttributes, newAttribute],
        })
      );
      // A 200 on the PUT only proves the write was ACCEPTED — re-read the draft to prove the
      // newly-added attribute actually persisted. A service that accepts a PUT and silently
      // drops the added entry still passes the status assertion above.
      //
      // Matched with arrayContaining/objectContaining rather than a whole-array equality check
      // on purpose: the stored attribute entries come back server-shaped, and no capture yet
      // confirms whether the service echoes each entry back byte-for-byte or adds fields of its
      // own — asserting the exact array shape would be inventing one. What IS being asserted is
      // the thing the update changed: an entry with this key and value is now in the record.
      await expectPersisted(() => globalVariablesApi.getById(created.id), {
        variableAttributes: expect.arrayContaining([
          expect.objectContaining({ key: 'timeoutMs', value: 5000 }),
        ]),
      });

      // 4. List (global + by workspace).
      await expectOk(await globalVariablesApi.list());
      await expectOk(await globalVariablesApi.getByWorkspace(WORKSPACE_CODE));

      // 5. Push live first, THEN activate the resulting LIVE record (using its own id) —
      // updateState only operates on the LIVE edition; see connection.api.spec.ts's note for
      // the live-captured evidence (error code 1072, "not found in LIVE DB").
      const live = await expectOk(await globalVariablesApi.pushLive(code));
      cleanup.push(() => globalVariablesApi.deleteLive(code));

      await expectOk(await globalVariablesApi.updateState(live.id, 'ACTIVE'));
      await expectOk(await globalVariablesApi.getLiveByCode(code));

      // 6. Change workspace (dedicated endpoint, confirmed separate from plain update).
      //
      // CHANGED (2026-09-02): this step used to target a `${WORKSPACE_CODE}_2` placeholder —
      // a workspace that almost certainly doesn't exist — and assert `[200, 400, 403]`, which
      // passes no matter what the service does. It verified nothing while reading as coverage.
      // It now runs only when a REAL second workspace is configured
      // (EMS_QA_SECOND_WORKSPACE_CODE in .env.dev). Skipped-but-honest beats
      // passing-but-meaningless. Same treatment as connection.api.spec.ts's changeWorkspace test.
      if (hasSecondWorkspace) {
        // CORRECTED (2026-09-02, first real run with a second workspace configured): this
        // expected 200 and got {"code":1111,"status":"UNAUTHORIZED","message":"Access Denied"} —
        // the same captured result as connection.api.spec.ts's own change-workspace test. It is
        // the documented rule, not a request defect: moving an entity between workspaces needs
        // permission on BOTH, and `internalHeaders()` scopes a client to exactly one. See that
        // spec for the full write-up and the @pending test tracking the success path.
        await expectErrorBody(await globalVariablesApi.changeWorkspace(created.id, SECOND_WORKSPACE_CODE), {
          status: 400,
          code: 1111,
          message: 'Access Denied',
          bodyStatus: 'UNAUTHORIZED',
        });
      } else {
        test.info().annotations.push({
          type: 'skipped-step',
          description:
            'changeWorkspace not exercised: set EMS_QA_SECOND_WORKSPACE_CODE in .env.dev to a real second workspace.',
        });
      }
    } finally {
      await cleanup.runAll();
    }
  });

  // --- Negatives (capture-first) ---
  //
  // Evidence ported verbatim from magpie's GlobalVariableCrudTests.java (read directly from the
  // reference source; method names cited per assertion).

  // Dimension 1: missing required fields.
  // createDraftGlobalVariablesNegativeTest (crt_gv.csv), payload `{}`.
  test('API-GVAR-002 — rejects a global variables doc missing required fields', async ({ globalVariablesApi }) => {
    // Deliberately an EMPTY payload rather than a builder call — the entire point of this test
    // is that every required field is absent.
    const res = await globalVariablesApi.create({});
    await expectValidationError(res, {
      violations: [
        { fieldName: 'code', errorMessage: 'Global Variables document code is missed' },
        { fieldName: 'description', errorMessage: 'Global Variables document description is missed' },
        { fieldName: 'name', errorMessage: 'Global Variables document Name is missed' },
        { fieldName: 'variableAttributes', errorMessage: 'Global variables key(s) or value(s) is/are missed' },
      ],
    });
  });

  // Invalid variableAttributes[].type enum value — NO EVIDENCE FOUND. The reference only tests
  // a MISSING type (createGlobalVariablesWithMissingAttributeTypeNegativeTest), status-only 400,
  // never an out-of-enum value — so neither a 1005 nor a 1010 shape is evidenced for this case.
  test.skip('@pending API-GVAR-003 — rejects a variableAttributes entry with an invalid type enum value', async () => {});

  // Dimension 3: duplicate code on create — status-only 400, no body asserted in the reference.
  //
  // TODO (capture-first): sibling entities captured a REAL error body for their duplicate-code
  // rejection; Global Variables' is still status-only because nobody has looked at what this
  // endpoint actually returns. `expectRejected` below ATTACHES the real response body to the
  // test report on every run — read that attachment, then tighten this to an
  // `expectErrorBody(dup, { status: 400, code: <real>, message: '<real>' })`. Do NOT fill in a
  // code/message from another entity's capture; they are confirmed to differ per entity.
  test('API-GVAR-004 — rejects a duplicate global variables code', async ({ globalVariablesApi }) => {
    const code = `qa_gv_dup_${Date.now()}`;
    const payload = buildGlobalVariablePayload(code, WORKSPACE_CODE);
    const created = await expectOk(await globalVariablesApi.create(payload));
    try {
      const dup = await globalVariablesApi.create(payload);
      await expectRejected(dup, 'duplicate global variables code on create');
      // The exact 400 is the assertion actually ported from the reference — kept, so this test
      // does not get weaker while it waits for the body capture above.
      expect(dup.status()).toBe(400);
    } finally {
      await globalVariablesApi.delete(created.id);
    }
  });

  // Dimension 4: immutable code on update — the reference only ever tests this by OMITTING
  // `code` entirely on update (never a genuinely different code value); both violations fire
  // together for that case, mirrored here exactly.
  test('API-GVAR-005 — rejects changing the code on update', async ({ globalVariablesApi }) => {
    const code = `qa_gv_upd_code_${Date.now()}`;
    const created = await expectOk(await globalVariablesApi.create(buildGlobalVariablePayload(code, WORKSPACE_CODE)));
    try {
      // `code` is deliberately OMITTED from the update body (rather than set to a different
      // value) — that is exactly the shape the reference uses, and it's what makes both
      // captured violations fire together.
      const { code: _omit, ...withoutCode } = created;
      const res = await globalVariablesApi.update(created.id, withoutCode);
      await expectValidationError(res, {
        violations: [
          { fieldName: 'code', errorMessage: 'Global variables document code should not be changed.' },
          { fieldName: 'code', errorMessage: 'Global Variables document code is missed' },
        ],
      });
    } finally {
      await globalVariablesApi.delete(created.id);
    }
  });

  // Dimension 5/6: not-found by id / by code — confirmed 400, and literally NO body/message is
  // asserted anywhere in the reference for this (not even a bare entity code) — every not-found
  // path uses status-only assertions.
  //
  // TODO (capture-first): sibling entities DID capture real not-found bodies (e.g. code 1072
  // "not found in LIVE DB"). The two `expectRejected` calls below attach whatever this service
  // really returns to the test report on every run — read those attachments, then tighten each
  // to an `expectErrorBody(res, { status: 400, code: <real>, message: '<real>' })`. Do NOT copy
  // another entity's code/message in here.
  test('API-GVAR-006 — 404s on an unknown global variables id/code', async ({ globalVariablesApi }) => {
    const byIdRes = await globalVariablesApi.getById(INVALID_OBJECT_ID);
    await expectRejected(byIdRes, 'global variables lookup by an id that does not exist');
    await expectStatus(byIdRes, 400);

    const invalidCode = `qa_gv_does_not_exist_${Date.now()}`;
    const byCodeRes = await globalVariablesApi.getByCode(invalidCode);
    await expectRejected(byCodeRes, 'global variables lookup by a code that does not exist');
    await expectStatus(byCodeRes, 400);
  });

  // Dimension 8: edition guard — NO EVIDENCE FOUND. No test in GlobalVariableCrudTests.java
  // attempts deleting a draft that still has a live edition (both delete tests present are
  // clean positive-path 204s).
  test('API-GVAR-007 — blocks deleting a draft that has a live edition', async ({ globalVariablesApi }) => {
    const cleanup = new CleanupStack();
    try {
      const code = `qa_gv_del_live_${Date.now()}`;
      const created = await expectOk(await globalVariablesApi.create(buildGlobalVariablePayload(code, WORKSPACE_CODE)));
      cleanup.push(() => globalVariablesApi.delete(created.id));
      await expectOk(await globalVariablesApi.pushLive(code));
      cleanup.push(() => globalVariablesApi.deleteLive(code));

      const res = await globalVariablesApi.delete(created.id);
      await expectRejected(res, 'deleting a DRAFT global variables doc while a LIVE edition still exists');
    } finally {
      await cleanup.runAll();
    }
  });

  // Dimension 10: missing/insufficient auth — NO EVIDENCE FOUND. No 401/403/permission-denied
  // negative test exists anywhere in this file.
  test.skip('@pending API-GVAR-008 — rejects requests without the required permission/workspace', async () => {});
});
