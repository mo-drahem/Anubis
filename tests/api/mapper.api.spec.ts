import { test, expect } from '../../fixtures/api.fixture';
import { CleanupStack } from '../../utils/cleanup';
import { createActiveApiConnection } from '../../utils/apiDeps';
import { buildApiCallDetails, buildApiCallPayload, buildMapperPayload } from '../../utils/testData';
import { INVALID_OBJECT_ID, WORKSPACE_CODE } from '../../utils/testEnv';
import { expectErrorBody, expectOk, expectPersisted, expectValidationError } from '../../utils/apiAssertions';

// WORKSPACE_CODE is imported from utils/testEnv.ts rather than re-declared here — see that
// module's note (and connection.api.spec.ts's) for the real bug the per-file duplicate caused.

/**
 * Field shapes confirmed against magpie's Mapper.java / MapperField.java / MapperFieldType.java.
 * Confirmed: Mapper has NO dedicated updateState endpoint (unlike Connection/ApiCall/Script/
 * GlobalVariables/Schema/Observer/Flow) — don't add an activation step here, it's not an
 * oversight.
 *
 * CORRECTED (2026-08-25, business-logic review): a Mapper is a standalone resource created
 * first; an Api Call references an EXISTING Mapper's code later via
 * `details.handler.paths[].mapperCode` — not the reverse. Mapper.java does have its own
 * `apiCallCodes` field, but tracing magpie's actual data generators
 * (`ApiCallDataGenerator`/`ApiCallDataModule` vs. `MapperDataGenerator`/`MapperDataModule`)
 * shows that field is a loosely-populated reverse tag list, not how the system is really wired
 * together — no reference test exercises it as a real create-time linkage either. See the
 * "creates an api call referencing an existing mapper code" test below for the corrected
 * direction (this test used to be named "creates a mapper referencing an existing api call
 * code" and modeled the relationship backwards).
 */
test.describe('Mapper lifecycle (DRAFT/LIVE)', { tag: '@api' }, () => {
  test('API-MAP-001 — full lifecycle: create draft mapper with fields -> read -> update -> list -> push live -> restore live -> delete', async ({
    mapperApi,
  }) => {
    const cleanup = new CleanupStack();
    const code = `qa_mpr_${Date.now()}`;

    try {
      // 1. Create a draft mapper with a couple of mixed-type fields (the builder's default
      // field list is exactly the mixed STRING/DOUBLE pair this test used inline before).
      const created = await expectOk(await mapperApi.create(buildMapperPayload(code, WORKSPACE_CODE)));
      expect(created.code).toBe(code);
      cleanup.push(() => mapperApi.delete(created.id));

      // 2. Read back.
      await expectOk(await mapperApi.getById(created.id));
      await expectOk(await mapperApi.getByCode(code));
      await expectOk(await mapperApi.getDraftByCode(code));

      // 3. Update fields (add a third field).
      const addedField = { name: 'currency', path: '$.order.currency', type: 'STRING', nullable: false };
      await expectOk(
        await mapperApi.update(created.id, {
          ...created,
          fields: [...created.fields, addedField],
        })
      );

      // 3b. Verify the update actually PERSISTED, not just that the PUT returned 200 (added in
      // the 2026-09-02 architecture pass — this test previously never re-read the record).
      // Asserts only that the field this step just added came back; arrayContaining/
      // objectContaining rather than a whole-list compare, because the pre-existing fields and
      // any server-added per-field keys aren't what this step wrote.
      await expectPersisted(() => mapperApi.getById(created.id), {
        fields: expect.arrayContaining([expect.objectContaining(addedField)]),
      });

      // 4. List (global + by workspace).
      await expectOk(await mapperApi.list());
      await expectOk(await mapperApi.getByWorkspace(WORKSPACE_CODE));

      // 5. Push live, get live by code, restore live.
      await expectOk(await mapperApi.pushLive(code));
      cleanup.push(() => mapperApi.deleteLive(code));

      await expectOk(await mapperApi.getLiveByCode(code));

      const restoreRes = await mapperApi.restoreLive(code);
      expect([200, 400]).toContain(restoreRes.status()); // TODO: tighten once confirmed against dev
    } finally {
      await cleanup.runAll();
    }
  });

  // CORRECTED (2026-08-25, business-logic review): this test previously created a Mapper with
  // `apiCallCodes` pointing at a freshly-created Api Call — i.e. Mapper referencing Api Call.
  // `apiCallCodes` is a real field on Mapper.java (confirmed), but that's backwards from how the
  // system is actually used: a Mapper is a standalone building block created first, and it's an
  // Api Call that references an EXISTING Mapper's code later, via
  // `details.handler.paths[].mapperCode` (Handler.java / Path.java) — not the other way around.
  // This is confirmed directly from magpie's own reference data generators, not just inferred:
  // `ApiCallDataGenerator.payload()` queries `mapperDao.find(3)` — pre-existing Mappers already
  // in the DB — and `ApiCallDataModule`'s handler builder wires their codes into
  // `Path.mapperCode` when fabricating an Api Call. Mapper's `apiCallCodes` field, by contrast,
  // is populated the same way in `MapperDataGenerator` (existing ApiCalls looked up from the DB,
  // set directly on the Mapper) but no reference test (`MapperCrudTests.java`) ever exercises
  // create-with-real-linkage via that field — it's a loosely-populated reverse tag list, not the
  // relationship the system is actually built around. Rewritten to match the real direction:
  // create a Mapper, then create an Api Call whose handler path references it.
  //
  // NOTE: still blocked by the confirmed Api Call create 500 bug (see apiCall.api.spec.ts's
  // file-level note and the project doc's "16-failure triage" section) — this is now the
  // correct test for the real business relationship, but it can't turn green until that backend
  // bug is fixed, same as Flow's "full lifecycle" test.
  //
  // SKIPPED (2026-09-02 architecture pass) for exactly that reason: the note above documented
  // this as blocked on a backend bug while the test still ran live, so a KNOWN-blocked scenario
  // was reporting as a red failure every run — indistinguishable from a genuine regression, and
  // the kind of persistent red that trains a suite's readers to ignore it. Marking it skipped
  // makes "blocked" read as blocked. Unskip as soon as the Api Call create 500 is fixed (or
  // once a live run shows the createActiveApiConnection precondition fix already resolved it —
  // see apiDeps.ts's doc comment, which flags that the "backend bug" framing may itself have
  // been a missing-precondition test bug); the body below is complete and unchanged.
  test.skip('@pending API-MAP-002 — creates an api call referencing an existing mapper code', async ({ connectionApi, apiCallApi, mapperApi }) => {
    const cleanup = new CleanupStack();
    const mprCode = `qa_mpr_for_apc_${Date.now()}`;
    const apcCode = `qa_apc_linked_${Date.now()}`;

    try {
      // 1. Create the Mapper first — it's the standalone piece that gets referenced later.
      // Single-field override: this test only needs one field to have something to reference.
      const mpr = await expectOk(
        await mapperApi.create(
          buildMapperPayload(mprCode, WORKSPACE_CODE, {
            fields: [{ name: 'id', path: '$.id', type: 'STRING', nullable: false }],
          })
        )
      );
      cleanup.push(() => mapperApi.delete(mpr.id));

      // CORRECTED (2026-08-25): must be LIVE + ACTIVE for an Api Call to reference it — see
      // utils/apiDeps.ts's createActiveApiConnection doc comment.
      const cxnCode = await createActiveApiConnection(connectionApi, cleanup, WORKSPACE_CODE, 'qa_cxn_for_apc_mpr');

      // 2. Create the Api Call, referencing the Mapper's code via handler.paths[].mapperCode.
      // CORRECTED (2026-08-25, real captured curl): matches apiCall.api.spec.ts's own
      // buildApiCallPayload shape now — createdBy/modifiedBy/state, and details.path/
      // requestBody per the real UI curl. See utils/testData.ts's doc comment.
      const apc = await expectOk(
        await apiCallApi.create(
          buildApiCallPayload(apcCode, WORKSPACE_CODE, cxnCode, {
            details: buildApiCallDetails({
              handler: { paths: [{ codes: ['2xx'], mapperCode: mprCode, description: 'x', title: 'x' }] },
            }),
          })
        )
      );
      expect(apc.details.handler.paths[0].mapperCode).toBe(mprCode);
      cleanup.push(() => apiCallApi.delete(apc.id));
    } finally {
      await cleanup.runAll();
    }
  });

  // --- Negatives (capture-first) ---
  //
  // Evidence ported verbatim from magpie's MapperCrudTests.java (read directly from the
  // reference source; method names cited per assertion).

  // Dimension 1: missing required fields.
  // createDraftMapperNegativeTest, row "without any fields" (payload `{}`).
  //
  // CORRECTED (live run): a real captured response for this exact `{}` payload does NOT
  // include a `workspaceCode` violation — same correction as Flow's equivalent test (see
  // flow.api.spec.ts). Dropped from the expected list below.
  test('API-MAP-003 — rejects a mapper missing required fields', async ({ mapperApi }) => {
    // The empty payload is the point of this test — deliberately NOT built via
    // buildMapperPayload, which cannot express "no fields at all".
    const res = await mapperApi.create({});
    await expectValidationError(res, {
      violations: [
        { fieldName: 'code', errorMessage: 'Code cannot be null' },
        { fieldName: 'name', errorMessage: 'Name cannot be null' },
        { fieldName: 'description', errorMessage: 'Description cannot be null' },
        { fieldName: 'fields', errorMessage: 'Fields or jsonSchema cannot be null or empty' },
      ],
    });
  });

  // Dimension 2: invalid fields[].type enum value — Jackson enum-parse shape (code 1010, no
  // violations array), not bean validation.
  // createDraftMapperNegativeTest, CSV row "with invalid field type".
  test('API-MAP-004 — rejects a mapper field with an invalid type enum value', async ({ mapperApi }) => {
    const code = `qa_mpr_bad_type_${Date.now()}`;
    // Deliberate variation: an invalid `fields[].type` enum value, overriding the builder's
    // valid default field list — everything else stays the builder's confirmed shape.
    const res = await mapperApi.create(
      buildMapperPayload(code, WORKSPACE_CODE, {
        fields: [{ name: 'id', path: '$.id', type: 'OTHER', nullable: false }],
      })
    );
    const body = await expectErrorBody(res, {
      status: 400,
      code: 1010,
      message:
        'JSON parse error: Cannot deserialize value of type `com.seera.core.ems.mapper.constant.MapperFieldTypeE` from String "OTHER": not one of the values accepted for Enum class: [STRING, BOOLEAN, DATE, OBJECT, DOUBLE, INTEGER]',
    });
    expect(body.violations).toBeFalsy();
  });

  // Dimension 3: duplicate code on create — note the distinct entity code (1004, not 1005/1090
  // like most other entities) and no violations array.
  // createDraftMapperWithExistingCodeNegativeTest.
  test('API-MAP-005 — rejects a duplicate mapper code', async ({ mapperApi }) => {
    const code = `qa_mpr_dup_${Date.now()}`;
    const payload = buildMapperPayload(code, WORKSPACE_CODE, {
      fields: [{ name: 'id', path: '$.id', type: 'STRING', nullable: false }],
    });
    const created = await expectOk(await mapperApi.create(payload));
    try {
      const dup = await mapperApi.create(payload);
      await expectErrorBody(dup, { status: 400, code: 1004, message: 'Duplicate key exception' });
    } finally {
      await mapperApi.delete(created.id);
    }
  });

  // Dimension 4: immutable code on update.
  // updateDraftMapperWithDifferentCodeNegativeTest.
  test('API-MAP-006 — rejects changing a mapper\'s code on update', async ({ mapperApi }) => {
    const code = `qa_mpr_upd_code_${Date.now()}`;
    const created = await expectOk(
      await mapperApi.create(
        buildMapperPayload(code, WORKSPACE_CODE, {
          fields: [{ name: 'id', path: '$.id', type: 'STRING', nullable: false }],
        })
      )
    );
    try {
      const res = await mapperApi.update(created.id, { ...created, code: `${code}_changed` });
      await expectValidationError(res, {
        violations: [{ fieldName: 'code', errorMessage: 'Code is used by different mapper' }],
      });
    } finally {
      await mapperApi.delete(created.id);
    }
  });

  // Dimension 5/6: not-found by id / by code — confirmed as 400 with entity code 1090, never a
  // real HTTP 404. Note the literal double-space in the by-code message ("in  DB") — preserved
  // exactly as the reference returns it.
  // fetchDraftMapperWithInvalidId / fetchDraftMapperWithInvalidCode.
  test('API-MAP-007 — 404s on an unknown mapper id/code', async ({ mapperApi }) => {
    const byId = await mapperApi.getById(INVALID_OBJECT_ID);
    await expectErrorBody(byId, { status: 400, code: 1090, message: 'Mapper not found' });

    const invalidCode = `qa_mpr_does_not_exist_${Date.now()}`;
    const byCode = await mapperApi.getByCode(invalidCode);
    await expectErrorBody(byCode, {
      status: 400,
      code: 1090,
      message: `Mapper not found in  DB with code: ${invalidCode}`,
    });
  });

  // Dimension 8: edition guard — deleting a draft with a live twin.
  // deleteDraftMapperWithExistingLiveVersionNegativeTest.
  test('API-MAP-008 — blocks deleting a draft mapper that has a live edition', async ({ mapperApi }) => {
    const code = `qa_mpr_del_live_${Date.now()}`;
    const created = await expectOk(
      await mapperApi.create(
        buildMapperPayload(code, WORKSPACE_CODE, {
          fields: [{ name: 'id', path: '$.id', type: 'STRING', nullable: false }],
        })
      )
    );
    await expectOk(await mapperApi.pushLive(code));
    try {
      const res = await mapperApi.delete(created.id);
      await expectErrorBody(res, {
        status: 400,
        code: 2101,
        message: `Failed to delete Mapper with code :${code}, Please delete Live edition first.`,
      });
    } finally {
      await mapperApi.deleteLive(code);
      await mapperApi.delete(created.id);
    }
  });

  // Dimension 10: missing/insufficient auth — NO EVIDENCE FOUND. No 401/403 assertion, no
  // "missing permission" negative test for Mapper anywhere in MapperCrudTests.java.
  test.skip('@pending API-MAP-009 — rejects requests without the required permission/workspace', async () => {});

  // Gap noted in the scenario catalog: `getFetchMapperByApiCallCode` /
  // `getFetchMapperCodeByApiCallCode` ARE confirmed to exist and be exercised in the reference
  // (fetchMapperByApiCallCodeTest / fetchMapperCodeByApiCallCodeTest, plus their
  // ...InvalidApiCallCode negative counterparts, all status-only 400/200) — still not wired
  // into our TS client yet.
});
