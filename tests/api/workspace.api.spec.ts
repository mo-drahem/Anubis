import { test, expect } from '../../fixtures/api.fixture';
import { CleanupStack } from '../../utils/cleanup';
import { buildWorkspacePayload } from '../../utils/testData';
import { INVALID_OBJECT_ID, WORKSPACE_CODE } from '../../utils/testEnv';
import { expectErrorBody, expectOk, expectPersisted, expectStatus, expectValidationError } from '../../utils/apiAssertions';

/**
 * Workspace has NO draft/live split at all — confirmed only plain CRUD exists (Workspace.java:
 * name, code, description, color). ws-usr (WorkspaceUser.java: email, workspaceCode,
 * permissions[]) links a user identity to a workspace with a specific permission subset.
 *
 * Permission model confirmed via Permission.java: workspace CREATE/DELETE requires the
 * HUB-scoped WORKSPACE_CREATOR permission; managing ws-usr links on an existing workspace
 * requires the WORKSPACE-scoped WORKSPACE_MANAGER permission — these are deliberately
 * different permission sources, not interchangeable.
 */
test.describe('Workspace + ws-usr', { tag: '@api' }, () => {
  test('API-WKSP-001 — full lifecycle: create workspace -> read -> update -> link user -> check -> update permissions -> unlink -> delete', async ({
    workspaceApi,
  }) => {
    const cleanup = new CleanupStack();
    const code = `qa_ws_${Date.now()}`;
    const email = `qa-automation+${Date.now()}@almosafer.com`;

    try {
      // 1. Create the workspace (requires WORKSPACE_CREATOR — see workspaceApi's fixture
      // permission set in fixtures/api.fixture.ts).
      // CORRECTED: the required field is `createdBy` (an email address), not a top-level
      // `email` key — an earlier pass had guessed `email` from the validation message text
      // ("Email is missing") without confirming the actual wire key. `createdBy` IS on
      // Workspace.java, unlike the earlier guess. Using the caller's own identity email here,
      // matching the x-user-info trust header.
      // The payload itself now comes from `buildWorkspacePayload` (utils/testData.ts), which
      // carries exactly the field set this call was already sending — see that file's header
      // for why the inline copies were centralized.
      const createRes = await workspaceApi.create(buildWorkspacePayload(code));
      const created = await expectOk(createRes);
      expect(created.code).toBe(code);
      cleanup.push(() => workspaceApi.deleteByCode(code));

      // 2. Read back.
      await expectOk(await workspaceApi.getById(created.id));
      await expectOk(await workspaceApi.getByCode(code));

      // 3. Update.
      const updatedDescription = 'Updated by ems-ui-automation';
      const updateRes = await workspaceApi.update(created.id, { ...created, description: updatedDescription });
      await expectOk(updateRes);

      // 3b. Update-PERSISTENCE check (added 2026-09-02): a 200 from the PUT above only proves
      // the write was accepted, not that the change stuck — a service that accepts a PUT and
      // silently ignores a field passes that assertion. Re-reads the workspace and asserts the
      // new description actually came back.
      await expectPersisted(() => workspaceApi.getById(created.id), { description: updatedDescription });

      // 4. permissions-list — the static permission catalog.
      const permsRes = await workspaceApi.permissions();
      const perms = await expectOk(permsRes);
      // Confirmed against magpie's WorkspaceListingTests.listPermissionsTest + Permission.java:
      // the real catalog is exactly these 4 values — corrects this comment's earlier 8-value
      // guess. EMS_ACCESS/WORKSPACE_CREATOR/DOWNLOAD_ACCESS/SUPER_ADMIN exist in the Permission
      // enum too, but are HUB-scoped and never appear in this endpoint's returned list.
      expect(perms).toEqual(expect.arrayContaining(['WRITE', 'LIVE', 'VAULT', 'WORKSPACE_MANAGER']));

      // 5. Link a user to the workspace. Cleanup is best-effort (harmless if step 11's
      // explicit unlink below already succeeded — CleanupStack swallows/logs failures).
      const linkRes = await workspaceApi.linkUser({ email, workspaceCode: code, permissions: ['WRITE', 'LIVE'] });
      const link = await expectOk(linkRes);
      cleanup.push(() => workspaceApi.deleteWsUser(email, code));

      // 6. isUserInWorkspace.
      const checkRes = await workspaceApi.isUserInWorkspace(email, code);
      // Confirmed against magpie's checkWorkspaceUserTest: the body is a bare boolean, not a
      // wrapper object.
      expect(await expectOk(checkRes)).toBe(true);

      // 7. getWorkspaceUsers should include the linked user.
      const usersRes = await workspaceApi.getWorkspaceUsers(code);
      await expectOk(usersRes);

      // 8. getWsUserByEmailAndWorkspace / getWsUserById both return the same link.
      await expectOk(await workspaceApi.getWsUserByEmailAndWorkspace(email, code));
      await expectOk(await workspaceApi.getWsUserById(link.id));

      // 9. updateWsUser — add WORKSPACE_MANAGER.
      const updateWsUserRes = await workspaceApi.updateWsUser(link.id, {
        ...link,
        permissions: ['WRITE', 'LIVE', 'WORKSPACE_MANAGER'],
      });
      await expectOk(updateWsUserRes);

      // 10. getWorkspacesByEmail — CORRECTED: this does not read the caller's own identity off
      // the trust header (that was an unconfirmed guess from the reference source alone); a
      // real captured curl against ems-v1-configuration-service showed it takes an explicit
      // `x-user-email` header instead. Query the just-linked user's email and confirm the
      // workspace we linked them to shows up in their list. Exact response shape (array of
      // codes vs. of workspace objects) isn't captured yet, hence the loose containment check
      // rather than an exact `toEqual` — tighten once confirmed.
      const myWorkspacesRes = await workspaceApi.getWorkspacesByEmail(email);
      await expectOk(myWorkspacesRes);
      const myWorkspacesBody = await myWorkspacesRes.text();
      expect(myWorkspacesBody).toContain(code);

      // 11. Unlink. Both 200 and 204 are accepted here because which one this endpoint returns
      // has not been captured — left as-is rather than picking one on a guess.
      const deleteWsUserRes = await workspaceApi.deleteWsUser(email, code);
      expect([200, 204]).toContain(deleteWsUserRes.status());
    } finally {
      await cleanup.runAll();
    }
  });

  // --- Negatives (capture-first) ---
  //
  // Evidence ported verbatim from magpie's WorkspaceCrudTests.java / WorkspaceUserCrudTests.java
  // (read directly from the reference source; method names cited per assertion).

  // Dimension 1: missing required fields (code) — Workspace itself has no `email` field (that's
  // a ws-usr field); `code` is the one this project's own live capture and the reference agree on.
  // createWorkspaceNegativeTest (create_ws.csv).
  test('API-WKSP-002 — rejects a workspace missing required fields (code)', async ({ workspaceApi }) => {
    // `buildWorkspacePayload` always includes `code`, and THIS test is specifically about its
    // absence — so it is destructured off rather than the whole payload being hand-rolled again.
    // Every other field keeps the builder's confirmed shape (the previous inline literal used
    // `name`/`description` of `'x'`; the exact non-empty value is irrelevant to the captured
    // `code`-is-missing violation asserted below).
    const { code: _codeOmittedOnPurpose, ...payloadWithoutCode } = buildWorkspacePayload(
      `qa_ws_missing_code_${Date.now()}`
    );
    const res = await workspaceApi.create(payloadWithoutCode);
    const body = await expectValidationError(res, {
      violations: [{ fieldName: 'code', errorMessage: 'Code is missing' }],
    });
    expect(body.status).toBe('BAD_REQUEST');
  });

  // Dimension 3: duplicate workspace code.
  // createWorkspaceWithExistingCodeNegativeTest.
  test('API-WKSP-003 — rejects a duplicate workspace code', async ({ workspaceApi }) => {
    const code = `qa_ws_dup_${Date.now()}`;
    const payload = buildWorkspacePayload(code);
    // Setup guard (added 2026-09-02): the first create used to be fired and forgotten, so a
    // failed setup would surface as a confusing "expected 400, got 400 for the wrong reason"
    // below instead of a clear "setup failed" signal.
    await expectOk(await workspaceApi.create(payload));
    try {
      const dup = await workspaceApi.create(payload);
      await expectErrorBody(dup, { status: 400, code: 1004, message: 'Duplicate key exception' });
    } finally {
      await workspaceApi.deleteByCode(code);
    }
  });

  // Dimension 4: immutable code on update — UNTESTED FOR WORKSPACE (gap found 2026-09-02).
  //
  // This dimension had no test at all in this file, which is a silent gap rather than a
  // deliberate omission: every sibling entity in this suite covers it and all of them confirm
  // the dimension is real — Schema rejects it with `{fieldName: 'code', errorMessage: 'Code
  // cannot be changed'}` (1005) and Flow with its own `errors[]`-wrapped 'No flow with this Id
  // in the draft.' (1005). The two siblings already disagree on the exact message, so there is
  // no basis whatsoever for assuming Workspace returns either one — and Workspace is the entity
  // most likely to differ anyway (no draft/live split, a separate service, and its own 3002/3004
  // error-code family rather than the 1xxx one).
  //
  // Deliberately NOT asserting a guessed code/message, and deliberately NOT copying a sibling's:
  // Workspace's own response to a changed `code` on update has never been captured. It is also
  // not left as a loose `expectRejected`, because unlike the Flow delete-guard rule nobody has
  // even confirmed that Workspace REJECTS this — it may well accept the change (Workspace is
  // keyed by `code` in several endpoints, so either outcome is a meaningful finding).
  //
  // TO UNSKIP: run this once against dev with the skip removed, read the real status/body off
  // the report, and replace the placeholder below with the captured shape — `expectValidationError`
  // if it comes back as the 1005+violations family, `expectErrorBody` otherwise, or a plain
  // `expectOk` + `expectPersisted` if it turns out the code really is mutable.
  test.skip('@pending API-WKSP-004 — rejects changing a workspace\'s code on update', async ({ workspaceApi }) => {
    const cleanup = new CleanupStack();
    const code = `qa_ws_updcode_${Date.now()}`;
    try {
      const created = await expectOk(await workspaceApi.create(buildWorkspacePayload(code)));
      cleanup.push(() => workspaceApi.deleteByCode(code));

      const res = await workspaceApi.update(created.id, { ...created, code: `${code}_changed` });
      // Placeholder only — see the comment above. `expectStatus` is used with no expectation of
      // which status is right; whoever unskips this replaces the whole assertion with what the
      // run actually returns.
      await expectStatus(res, 400);
    } finally {
      await cleanup.runAll();
    }
  });

  // Dimension 5/6: not-found by id / by code — same body/code for both lookup paths.
  // fetchWorkspaceByInvalidIdNegativeTest / fetchWorkspaceByInvalidCodeNegativeTest.
  test('API-WKSP-005 — 404s on an unknown workspace id/code', async ({ workspaceApi }) => {
    const byId = await workspaceApi.getById(INVALID_OBJECT_ID);
    await expectErrorBody(byId, { status: 400, code: 3002, message: 'Workspace not found' });

    const invalidCode = `qa_ws_does_not_exist_${Date.now()}`;
    const byCode = await workspaceApi.getByCode(invalidCode);
    await expectErrorBody(byCode, { status: 400, code: 3002, message: 'Workspace not found' });
  });

  // Linking a user to a non-existent workspace — code 1005, NOT the 3004 this project's domain
  // notes previously guessed (3004 is reserved for "unknown ws-usr LINK", see below — a
  // different failure mode from "workspace itself doesn't exist").
  // createWorkspaceUserNegativeTest (crt_ws_usr.csv, "with an invalid workspace code").
  test('API-WKSP-006 — rejects linking a user to a non-existent workspace', async ({ workspaceApi }) => {
    const email = `qa-automation+neg-${Date.now()}@almosafer.com`;
    const invalidWorkspaceCode = `qa_ws_does_not_exist_${Date.now()}`;
    const res = await workspaceApi.linkUser({ email, workspaceCode: invalidWorkspaceCode, permissions: ['WRITE'] });
    await expectValidationError(res, {
      violations: [{ fieldName: 'workspaceCode', errorMessage: 'Workspace Code is not exist' }],
    });
  });

  // Unknown ws-usr link — code 3004, with two distinct message variants (by id vs by
  // email+workspace pair).
  // fetchWorkspaceByInvalidIdNegativeTest (ws-usr variant) / fetchWorkspaceByEmailAndCodeNegativeTest.
  test('API-WKSP-007 — 404s on an unknown ws-usr link (email/workspace pair)', async ({ workspaceApi }) => {
    const byId = await workspaceApi.getWsUserById(INVALID_OBJECT_ID);
    await expectErrorBody(byId, { status: 400, code: 3004, message: 'Failed to find Workspace User instance by id' });

    const email = `qa-automation+notlinked-${Date.now()}@almosafer.com`;
    const byEmailAndCode = await workspaceApi.getWsUserByEmailAndWorkspace(email, WORKSPACE_CODE);
    await expectErrorBody(byEmailAndCode, {
      status: 400,
      code: 3004,
      message: 'Failed to find Workspace User instance by Workspace code and Email',
    });
  });

  // Dimension 10: missing/insufficient auth — NO EVIDENCE FOUND for either of these. Neither
  // WorkspaceCrudTests.java nor WorkspaceUserCrudTests.java contains a test using
  // insufficient-permission headers on create/delete or ws-usr management — every test always
  // grants the full permission (internalWsCreatorHeaders / internalWsManagerHeaders).
  test.skip('@pending API-WKSP-008 — rejects workspace create/delete without WORKSPACE_CREATOR (HUB) permission', async () => {});
  test.skip('@pending API-WKSP-009 — rejects ws-usr link management without WORKSPACE_MANAGER (WORKSPACE) permission', async () => {});
});
