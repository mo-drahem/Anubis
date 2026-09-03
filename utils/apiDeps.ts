import { test } from '@playwright/test';
import { DraftLiveResourceApi } from '../api/resources/DraftLiveResourceApi';
import { CleanupStack } from './cleanup';
import { apiConfig } from '../api/config';
import {
  buildApiConnectionPayload,
  buildMsgBrokerConnectionPayload,
  buildApiCallPayload,
  buildEventSchemaPayload,
  buildMapperPayload,
  buildScriptPayload,
  buildGlobalVariablePayload,
  buildSecretPayload,
} from './testData';
import { expectOk } from './apiAssertions';

/**
 * Creates an API-type Connection and pushes it all the way to LIVE + ACTIVE before returning
 * its code — for use as a dependency in Api Call creation.
 *
 * CORRECTED (2026-08-25, flagged by the user's own domain knowledge): every Api Call create
 * call in this project previously referenced a merely-DRAFT Connection (created but never
 * pushed live or activated) via `connectionCode`. The real business rule is that a Connection
 * used to create an Api Call must be LIVE and ACTIVE — this mirrors the same requirement
 * `observer.api.spec.ts`'s `createObserverDeps` helper already applies for Observer's
 * MSG_BROKER connection dependency (and matches this project's own general Schema/Flow
 * activation-chain rule: create -> push live -> activate before a dependent entity can use it).
 * This is also the leading candidate for the previously-"confirmed backend bug" where every
 * single `POST /api-call` create 500'd with `{"code": 1009, "message": null}` regardless of
 * payload — a null-message 500 is consistent with the backend hitting an unhandled null (e.g.
 * a live-connection lookup returning nothing because the connection was never pushed live) — a
 * classic case of a missing-precondition test bug surfacing as what first looked like a hard
 * server defect. Re-verify against a live run before fully retracting the "backend bug" framing
 * in the project doc; this fix could go either way (confirm cause, or narrow down further).
 */
export async function createActiveApiConnection(
  connectionApi: DraftLiveResourceApi,
  cleanup: CleanupStack,
  workspaceCode: string,
  codePrefix: string
): Promise<string> {
  const cxnCode = `${codePrefix}_${Date.now()}`;
  const cxnRes = await connectionApi.create(buildApiConnectionPayload(cxnCode, workspaceCode));
  const cxn = await expectOk(cxnRes);
  cleanup.push(() => connectionApi.delete(cxn.id));

  const pushLiveRes = await connectionApi.pushLive(cxnCode);
  const live = await expectOk(pushLiveRes);
  cleanup.push(() => connectionApi.deleteLive(cxnCode));

  await expectOk(await connectionApi.updateState(live.id, 'ACTIVE'));
  // CORRECTED (2026-08-31, real captured cleanup-error evidence in a fresh test report): the
  // ACTIVE-blocks-delete rule already confirmed for Flow/Observer also applies to Connection —
  // a real cleanup attempt against a still-ACTIVE live Connection failed with `{"code": 1076,
  // "message": "Only inactive Connection can be deleted"}`. Pushed here (before deleteLive,
  // which was pushed above) so LIFO cleanup order deactivates first.
  cleanup.push(() => connectionApi.updateState(live.id, 'INACTIVE'));

  return cxnCode;
}

/**
 * Same shape as createActiveApiConnection() above, but MSG_BROKER-typed — needed wherever a
 * live+active broker Connection is the dependency (Observer, and the Vault-secret-in-a-
 * connection E2E scenario), not an API-type one.
 */
export async function createActiveMsgBrokerConnection(
  connectionApi: DraftLiveResourceApi,
  cleanup: CleanupStack,
  workspaceCode: string,
  codePrefix: string
): Promise<string> {
  const cxnCode = `${codePrefix}_${Date.now()}`;
  const sentPayload = buildMsgBrokerConnectionPayload(cxnCode, workspaceCode);
  const cxnRes = await connectionApi.create(sentPayload);
  const cxn = await expectOk(cxnRes);
  cleanup.push(() => connectionApi.delete(cxn.id));

  // DIAGNOSTIC added 2026-09-02 to settle a deterministic, repeating failure: every Observer
  // push-live fails with `virtual-host : virtual-host cannot be empty`, even though this
  // Connection is created with `'virtual-host': '/'` and its own create/push-live/activate all
  // return 200. The rejection comes from a DIFFERENT service (ems-input-cfg-mapping-svc)
  // re-validating this same Connection.
  //
  // Attaching what was SENT beside what the service ECHOED BACK distinguishes the two candidate
  // causes in one read of the report:
  //   - `virtual-host` ABSENT from the echo  -> the Connection service drops it on write, so the
  //                                             bug is in Connection, not Observer.
  //   - `virtual-host` PRESENT in the echo   -> the two services disagree on the wire key, or the
  //                                             validator reads some other field.
  // Cheap, always-on, and it turns a recurring mystery into evidence.
  await test.info().attach(`capture-me: MSG_BROKER connection properties (${cxnCode})`, {
    body: Buffer.from(
      JSON.stringify(
        { sentProperties: (sentPayload as Record<string, unknown>).properties, echoedProperties: cxn?.properties },
        null,
        2
      )
    ),
    contentType: 'application/json',
  });

  const pushLiveRes = await connectionApi.pushLive(cxnCode);
  const live = await expectOk(pushLiveRes);
  cleanup.push(() => connectionApi.deleteLive(cxnCode));

  await expectOk(await connectionApi.updateState(live.id, 'ACTIVE'));
  // Same ACTIVE-blocks-delete ordering as createActiveApiConnection above (Connection's captured
  // violation is `{"code": 1076, "message": "Only inactive Connection can be deleted"}`) — this
  // push must stay AFTER the deleteLive push above so LIFO cleanup order deactivates before
  // delete runs. Noted explicitly here since this function already had the correct ordering but,
  // unlike createActiveApiConnection, never explained why — making it easy to "simplify" by
  // accidentally swapping the two pushes and silently reintroducing the cleanup failure.
  cleanup.push(() => connectionApi.updateState(live.id, 'INACTIVE'));

  return cxnCode;
}

/**
 * Shared by every test that needs a real, USABLE schema (Event) to reference — creates it,
 * pushes it live, then activates the live edition. Moved here from flow.api.spec.ts's local
 * copy (mirrors observer.api.spec.ts's createObserverDeps helper) so UI/regression specs can
 * reuse it too instead of duplicating it. Returns just the schemaCode, since that's all any
 * caller (flowApi.create, observer deps) needs.
 */
export async function createActiveSchema(
  schemaApi: DraftLiveResourceApi,
  cleanup: CleanupStack,
  workspaceCode: string,
  codePrefix: string
): Promise<string> {
  const schemaCode = `${codePrefix}_${Date.now()}`;
  const schemaRes = await schemaApi.create(
    buildEventSchemaPayload(schemaCode, workspaceCode, [
      { name: 'id', type: 'STRING', required: true, description: 'id' },
    ])
  );
  const schema = await expectOk(schemaRes);
  cleanup.push(() => schemaApi.delete(schema.id));

  const pushLiveRes = await schemaApi.pushLive(schemaCode);
  const liveSchema = await expectOk(pushLiveRes);
  cleanup.push(() => schemaApi.deleteLive(schemaCode));

  await expectOk(await schemaApi.updateState(liveSchema.id, 'ACTIVE'));
  // CORRECTED (2026-08-31, real captured cleanup-error evidence — rescued from a duplicate
  // createActiveSchema that used to live in flow.api.spec.ts before this shared helper replaced
  // it, whose comment recorded this same finding): a real cleanup attempt against a still-ACTIVE
  // live Schema failed validation with a `violations[]` entry `{"fieldName": "state",
  // "errorMessage": "Only inactive schema can be deleted"}` — the same ACTIVE-blocks-delete rule
  // already confirmed for Connection/Flow/Observer, though here it surfaces as a validation
  // violation rather than Connection's flat `{"code": 1076, "message": ...}` body. Pushed here
  // (before deleteLive, which was pushed above) so LIFO cleanup order deactivates before delete
  // runs. WARNING: swapping the order of these two cleanup.push calls silently reintroduces this
  // failure — deleteLive would run first, against a still-ACTIVE record.
  cleanup.push(() => schemaApi.updateState(liveSchema.id, 'INACTIVE'));

  return schemaCode;
}

/**
 * Creates a live (but not activated — Api Call has no separate business "active" concept
 * beyond LIVE per the confirmed API test suite) Api Call referencing an already-live
 * Connection. Returns the code plus the live record's id (needed for updateState/delete calls).
 */
export async function createLiveApiCall(
  apiCallApi: DraftLiveResourceApi,
  cleanup: CleanupStack,
  workspaceCode: string,
  connectionCode: string,
  codePrefix: string
): Promise<{ code: string; liveId: string }> {
  const code = `${codePrefix}_${Date.now()}`;
  const createRes = await apiCallApi.create(buildApiCallPayload(code, workspaceCode, connectionCode));
  const created = await expectOk(createRes);
  cleanup.push(() => apiCallApi.delete(created.id));

  const pushLiveRes = await apiCallApi.pushLive(code);
  const live = await expectOk(pushLiveRes);
  cleanup.push(() => apiCallApi.deleteLive(code));

  return { code, liveId: live.id };
}

/**
 * Creates a live Mapper with one field. Mapper has NO activate/deactivate endpoint (confirmed
 * in mapper.api.spec.ts's own doc comment) — LIVE is as far as its lifecycle goes.
 */
export async function createLiveMapper(
  mapperApi: DraftLiveResourceApi,
  cleanup: CleanupStack,
  workspaceCode: string,
  codePrefix: string
): Promise<string> {
  const code = `${codePrefix}_${Date.now()}`;
  // NOTE: this helper's real create call sends a single `orderId` field, not
  // buildMapperPayload's two-field default (orderId + amount) — overridden below to keep the
  // wire payload byte-identical to what this helper has always sent.
  const createRes = await mapperApi.create(
    buildMapperPayload(code, workspaceCode, {
      fields: [{ name: 'orderId', path: '$.order.id', type: 'STRING', nullable: false }],
    })
  );
  const created = await expectOk(createRes);
  cleanup.push(() => mapperApi.delete(created.id));

  const pushLiveRes = await mapperApi.pushLive(code);
  await expectOk(pushLiveRes);
  cleanup.push(() => mapperApi.deleteLive(code));

  return code;
}

/**
 * Creates a live+active Script. `scriptText` follows script.api.spec.ts's confirmed real
 * shape: a plain top-level `var output = ...;` statement (no `return`, no wrapping function —
 * see that file's doc comment for why both of those fail push-live's syntax check).
 */
export async function createActiveScript(
  scriptApi: DraftLiveResourceApi,
  cleanup: CleanupStack,
  workspaceCode: string,
  codePrefix: string
): Promise<string> {
  const code = `${codePrefix}_${Date.now()}`;
  // Field shapes copied verbatim from script.api.spec.ts's own confirmed-working create call
  // (real captured 200) — this helper originally used STRING-typed input/output items without
  // `value`/`testValue` and got a real 400 on create (not push-live) the first time this test
  // actually ran; OBJECT + the extra fields below is what's proven to work. This is exactly
  // buildScriptPayload's default shape, so no overrides are needed here.
  const createRes = await scriptApi.create(buildScriptPayload(code, workspaceCode));
  const created = await expectOk(createRes);
  cleanup.push(() => scriptApi.delete(created.id));

  // RETRY added (2026-09-01, real captured failure): a fresh run's push-live 500'd with
  // `{"code":1014,"message":"[503 Service Unavailable] ... to [.../v1/script/execute] ..."}`
  // — Script's own push-live calls out to a separate downstream JS-execution microservice to
  // validate the script, and THAT service was unavailable. This is a real backend/environment
  // issue, not a test bug — retrying here is a pragmatic mitigation for a transient downstream
  // outage, not a fix for anything wrong in this test. If this keeps failing after retries,
  // that's a signal to report the downstream service's availability, not to retry harder.
  let pushLiveRes = await scriptApi.pushLive(code);
  for (let attempt = 1; pushLiveRes.status() >= 500 && attempt < 3; attempt++) {
    await new Promise((r) => setTimeout(r, 2_000));
    pushLiveRes = await scriptApi.pushLive(code);
  }
  const live = await expectOk(pushLiveRes);
  cleanup.push(() => scriptApi.deleteLive(code));

  await expectOk(await scriptApi.updateState(live.id, 'ACTIVE'));
  cleanup.push(() => scriptApi.updateState(live.id, 'INACTIVE'));

  return code;
}

/** Creates a live+active Global Variable with one NUMBER attribute. */
export async function createActiveGlobalVariable(
  globalVariablesApi: DraftLiveResourceApi,
  cleanup: CleanupStack,
  workspaceCode: string,
  codePrefix: string
): Promise<{ code: string; liveId: string }> {
  const code = `${codePrefix}_${Date.now()}`;
  // NOTE: this helper's real create call sends a single `maxRetries` NUMBER attribute, not
  // buildGlobalVariablePayload's two-attribute default (maxRetries + featureFlag) — overridden
  // below to keep the wire payload byte-identical to what this helper has always sent.
  const createRes = await globalVariablesApi.create(
    buildGlobalVariablePayload(code, workspaceCode, {
      variableAttributes: [{ key: 'maxRetries', value: 3, type: 'NUMBER' }],
    })
  );
  const created = await expectOk(createRes);
  cleanup.push(() => globalVariablesApi.delete(created.id));

  const pushLiveRes = await globalVariablesApi.pushLive(code);
  const live = await expectOk(pushLiveRes);
  cleanup.push(() => globalVariablesApi.deleteLive(code));

  await expectOk(await globalVariablesApi.updateState(live.id, 'ACTIVE'));
  cleanup.push(() => globalVariablesApi.updateState(live.id, 'INACTIVE'));

  return { code, liveId: live.id };
}

/**
 * A live+active MSG_BROKER Connection plus a live+active Schema — the two dependencies every
 * Observer needs (mirrors observer.api.spec.ts's own local createObserverDeps helper, shared
 * here so the E2E regression spec can reuse it too).
 */
export async function createObserverDeps(
  connectionApi: DraftLiveResourceApi,
  schemaApi: DraftLiveResourceApi,
  cleanup: CleanupStack,
  workspaceCode: string,
  codePrefix: string
): Promise<{ cxnCode: string; schemaCode: string }> {
  const cxnCode = await createActiveMsgBrokerConnection(connectionApi, cleanup, workspaceCode, `${codePrefix}_cxn`);
  const schemaCode = await createActiveSchema(schemaApi, cleanup, workspaceCode, `${codePrefix}_schema`);
  return { cxnCode, schemaCode };
}

/** Plain CRUD Secret (no draft/live/state) — see SecretApi.ts / secret.api.spec.ts. */
export async function createSecret(
  secretApi: any,
  cleanup: CleanupStack,
  workspaceCode: string,
  codePrefix: string,
  secretValue: string
): Promise<{ code: string; id: string }> {
  const code = `${codePrefix}_${Date.now()}`;
  // `secretValue` is overridden below since it's this helper's own parameter, not
  // buildSecretPayload's default 'qa-initial-value' — passing the actual argument through keeps
  // the wire payload byte-identical to what this helper has always sent.
  const createRes = await secretApi.create(buildSecretPayload(code, workspaceCode, { secretValue }));
  const created = await expectOk(createRes);
  cleanup.push(() => secretApi.delete(created.id));
  return { code, id: created.id };
}
