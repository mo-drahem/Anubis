import { apiConfig } from '../api/config';

/**
 * Shared test-environment constants.
 *
 * WHY THIS FILE EXISTS (2026-09-02 architecture pass): each of these values used to be
 * copy-pasted into every spec file that needed it — `WORKSPACE_CODE` in 8 files, the invalid
 * ObjectId literal in 10+. `connection.api.spec.ts` even documents a REAL bug this shape
 * already caused once: the env var name behind `WORKSPACE_CODE` was wrong, and because the
 * declaration was duplicated per file, every one of the 9 copies silently fell back to a
 * placeholder string instead of failing loudly. The fix applied at the time corrected each
 * copy in place, which left the same copy-paste-drift shape that caused the bug. Centralizing
 * here means the next correction lands once.
 */

/**
 * The workspace every spec creates its resources inside. Sourced from EMS_QA_WORKSPACE_CODE
 * (see .env.example). Deliberately kept as a shared, pre-existing workspace rather than one
 * created per run — the team's decision (2026-09-02); resource codes are all `Date.now()`-
 * suffixed, which is what keeps parallel workers from colliding inside it.
 */
export const WORKSPACE_CODE = apiConfig.workspaceCode || 'TODO_workspace_code';

/**
 * The same workspace's DISPLAY name — what the header dropdown shows, as opposed to the
 * API-facing code above. The two genuinely differ (code `drahem-1` renders as
 * `drahem-workspace`), which is why both exist.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS (2026-09-02): a fresh EMS session always opens on **OMS**,
 * not on this workspace. Any UI test that does not explicitly switch is therefore operating in
 * OMS — and three specs (events.ui, navigation.ui, auth.ui) plus flow-list (now flow-list.ui) never did.
 * `events.ui.spec.ts` was creating, publishing and deleting real Events in OMS on every run, and
 * FLOW-001 was seeding a Flow into this workspace via the API and then searching for it in OMS's
 * list, which is a strong candidate for why it failed.
 *
 * The switch now lives in the `authenticatedPage` fixture, so every UI test starts here by
 * construction and no individual test can forget it.
 */
export const WORKSPACE_NAME = process.env.EMS_QA_WORKSPACE_NAME || 'drahem-workspace';

/**
 * A second, DIFFERENT real workspace — needed only by `changeWorkspace` tests, which move a
 * resource from WORKSPACE_CODE into this one.
 *
 * UNRESOLVED: there is no real second workspace code on dev in this project's config yet. The
 * previous `${WORKSPACE_CODE}_2` placeholder (duplicated in connection + globalVariables specs)
 * describes a workspace that almost certainly does not exist, which is why both changeWorkspace
 * tests could only ever assert a loose `[200, 400, 403]` catch-all — they were structurally
 * incapable of exercising the success path. Fill EMS_QA_SECOND_WORKSPACE_CODE into .env.dev and
 * those tests can assert a real 200. Until then they are skipped rather than left as
 * always-passing catch-alls (see each spec's own comment).
 */
export const SECOND_WORKSPACE_CODE = process.env.EMS_QA_SECOND_WORKSPACE_CODE || '';

/** True only when a real second workspace has been configured — gates the changeWorkspace tests. */
export const hasSecondWorkspace = Boolean(SECOND_WORKSPACE_CODE);

/**
 * The second workspace's DISPLAY name, for the UI dropdown (the code above is the API-facing
 * value). Defaults to the code, which is correct for workspaces whose code and display name
 * match (OMS is one) but wrong for those where they differ (`drahem-1` vs `drahem-workspace`) —
 * set EMS_QA_SECOND_WORKSPACE_NAME explicitly if yours is one of those.
 *
 * Only cross-workspace scenarios need this. E2E-08 (create an Event in one workspace, prove it
 * is invisible from another) genuinely requires two workspaces — that is the whole assertion —
 * so it cannot be collapsed onto the single test workspace. It previously hardcoded 'OMS' as
 * the other side, which meant a test suite scoped to `drahem-workspace` was nonetheless
 * creating and moving records into OMS. It now uses whatever second workspace is configured
 * here, and skips when none is.
 */
export const SECOND_WORKSPACE_NAME = process.env.EMS_QA_SECOND_WORKSPACE_NAME || SECOND_WORKSPACE_CODE;

/**
 * A syntactically-valid Mongo ObjectId that is guaranteed not to exist — the standard input for
 * every "not found by id" negative test. Valid hex/length (so it passes any format validation
 * and actually reaches the lookup) while being all zeroes (so it never matches a real record).
 */
export const INVALID_OBJECT_ID = '000000000000000000000000';

/** A code that is guaranteed not to exist — the "not found by code" counterpart. */
export const INVALID_CODE = 'qa_does_not_exist_code';

/** UI test credentials — one place, so a spec never re-derives `process.env.X || ''` inline. */
export const testUser = {
  email: process.env.TEST_USER_EMAIL || '',
  password: process.env.TEST_USER_PASSWORD || '',
};
