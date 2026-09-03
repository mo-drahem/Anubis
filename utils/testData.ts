// Central place for building test data (e.g. unique event names/codes per run)
// so tests stay independent and safe to run in parallel.

import { apiConfig } from '../api/config';

export function uniqueEventName(prefix = 'QA-Event'): string {
  return `${prefix}-${Date.now()}`;
}

// Shared builders for dependency payloads needed across multiple spec files — e.g. an ApiCall,
// Mapper, Flow, or Observer test all need a Connection to exist first just to satisfy a required
// reference (`connectionCode`).
//
// This exists because two rounds of live dev runs surfaced real validation/500 errors on
// Connection creation that every inline duplicate of this payload had drifted out of sync on:
//   Round 1 (400, both types): properties.allowedHttpMethods / acceptedBodyTypes must not be
//     empty; properties.numberOfRetry / connectionTimeoutSec cannot be empty; description
//     cannot be empty.
//   Round 2 (API type, 500): "Cannot invoke java.util.List.stream() because the return value
//     of ApiConnectionInfoPropsDto.getHeaders() is null" — properties.headers must be present
//     (an empty array is enough) even though the server never says so via a clean 400.
// connection.api.spec.ts's own payload already had round 1's fields, but the *dependency-only*
// Connection creations duplicated inline in apiCall/flow/mapper/observer specs had each grown a
// different stripped-down subset — a classic copy-paste drift trap. Centralizing here means the
// next confirmed-required field only needs to be added in one place.
export function buildApiConnectionPayload(
  code: string,
  workspaceCode: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    description: 'Created by ems-ui-automation',
    workspaceCode,
    type: 'API',
    properties: {
      type: 'API',
      host: 'https://example.com',
      allowedHttpMethods: ['GET', 'POST'],
      acceptedBodyTypes: ['APPLICATION_JSON'],
      numberOfRetry: 0,
      connectionTimeoutSec: 30,
      headers: [],
    },
    ...overrides,
  };
}

// MSG_BROKER's properties.numberOfRetry/connectionTimeoutSec requirement is now confirmed live
// (same 400 as the API-type connection above — these two fields apparently apply to every
// Connection type, not just API). Everything else in `properties` below (protocol, brokerType,
// brokerLoginId/Secret, durableSubscription, reconnectIntervalSec) is still an unconfirmed
// best-effort guess from Connection.java/Properties.java — no MSG_BROKER creation has fully
// succeeded live yet, so re-check the rest of this shape once one actually does.
//
// CORRECTED (2026-08-31, real captured 400 — surfaced at Observer's push-live step, not the
// Connection's own create/push-live): `{"code": 1005, "status": "BAD_REQUEST", "message":
// "Invalid broker configuration :Bad Request!{\"code\":1005,\"status\":\"BAD_REQUEST\",
// \"message\":\"virtual-host : virtual-host cannot be empty\",...}"}`. This is a NESTED
// validation error — Observer's push-live apparently re-validates its underlying broker
// Connection's configuration at that point (not just at the Connection's own create/push-live),
// and a `virtual-host` value is required.
//
// SECOND CORRECTION (2026-08-31, live re-run): the first attempt at this fix sent camelCase
// `virtualHost` to match every other `properties` field's casing convention in this file — a
// live run proved that guess WRONG: the identical "virtual-host cannot be empty" error came
// back unchanged, meaning `virtualHost` never bound to anything. The wire key really is the
// literal kebab-case string `'virtual-host'`, matching the error message's own field-name label
// verbatim — an exception to this file's usual camelCase convention, not a case where the
// message's wording was misleading (contrast with this project's usual lesson that message
// wording ISN'T a reliable guide to the real key — here it happened to be exactly right).
// `'/'` is RabbitMQ's conventional default vhost — a reasonable default value, still not a
// captured one; confirm it's an accepted value the next time this runs live.
export function buildMsgBrokerConnectionPayload(
  code: string,
  workspaceCode: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    description: 'Created by ems-ui-automation',
    workspaceCode,
    type: 'MSG_BROKER',
    properties: {
      type: 'MSG_BROKER',
      host: 'broker.example.com',
      port: '5672',
      protocol: 'AMQP',
      brokerType: 'RABBITMQ', // (uncertain) — no literal broker-type enum values found in the reference; capture a real one
      brokerLoginId: 'qa-user',
      brokerLoginSecret: 'qa-secret',
      'virtual-host': '/', // CORRECTED (2026-08-31) — literal kebab-case key, confirmed by a repeat 400 with camelCase
      durableSubscription: true,
      reconnectIntervalSec: 5,
      numberOfRetry: 0,
      connectionTimeoutSec: 30,
    },
    ...overrides,
  };
}

// Schema creation 400'd live with "Short Description field is empty." — `shortDescription` and
// `longDescription` (both on BaseEmsEntity, so every entity technically has them, but only
// Schema and Script have been confirmed to actually validate them as required) are needed in
// addition to `fields`. schema.api.spec.ts's own test already had both; flow.api.spec.ts's and
// observer.api.spec.ts's inline dependency-Schema creations didn't — centralized here for the
// same reason the Connection builders above exist.
// CORRECTED (2026-08-25, real captured curl from the user's own browser session creating an
// Api Call through the EMS UI): every existing Api Call create call in this project had three
// gaps against what the real UI actually sends —
//   1. `createdBy` / `modifiedBy` were never sent at all (real curl sends both, the identity
//      email).
//   2. `state` was never sent at create time (real curl sends `"state": "INACTIVE"` explicitly).
//   3. `details.path` had a leading slash (`'/ping'`); the real curl sends it WITHOUT one
//      (`'ping'`). `details.requestBody` was also omitted entirely; the real curl sends `''`.
// The user's instruction was to use this curl as the reference "in all cases" — every Api Call
// create payload in this project (apiCall/flow/mapper specs) now goes through these two
// builders instead of a hand-rolled object, so the next confirmed correction only needs to
// land in one place (same reasoning as the Connection/Schema builders above).
// CORRECTED (2026-08-25, live run): `details.handler` is required — a create call without it
// 400'd with `{"code": 1005, "violations": [{"fieldName": "handler", "errorMessage": "Handler
// section is required"}]}`, even though this project's earlier reference reading of
// Details.java/Handler.java found no validation annotations implying that. The default handler
// below uses an empty `mapperCode` in its one path entry rather than inventing one that may not
// exist — this exactly mirrors magpie's own `ApiCallDataModule`'s `handlerSupplier`, which sets
// `mapperCode` to an empty string whenever it doesn't have a real Mapper on hand
// (`isEmpty(mps) || mps.size() < 3 ? EMPTY_STRING : ...`), confirming an empty `mapperCode`
// inside a path entry is an accepted value, not something that needs a real Mapper backing it.
export function buildApiCallDetails(overrides: Record<string, unknown> = {}) {
  return {
    httpMethod: 'GET',
    path: 'ping',
    httpBodyType: 'APPLICATION_JSON',
    requestBody: '',
    headers: [],
    pathVariables: [],
    queryParams: [],
    handler: { paths: [{ codes: ['2xx'], mapperCode: '', description: 'Success response handler', title: 'Success' }] },
    ...overrides,
  };
}

export function buildApiCallPayload(
  code: string,
  workspaceCode: string,
  connectionCode: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    description: 'Created by ems-ui-automation',
    createdBy: apiConfig.identityEmail,
    modifiedBy: apiConfig.identityEmail,
    state: 'INACTIVE',
    workspaceCode,
    connectionCode,
    details: buildApiCallDetails(),
    ...overrides,
  };
}

// CORRECTED (2026-08-26, real example Flow document pasted by the user): every Flow create
// payload in flow.api.spec.ts was missing `createdBy`/`modifiedBy` — the same gap already found
// and fixed for Api Call's real curl. See that file's doc comment for why `state` is deliberately
// NOT defaulted here (the example's `"state": "ACTIVE"` looks like a live/exported document's
// current state, not a captured create-time value, unlike Api Call's directly-captured
// `state: 'INACTIVE'`).
export function buildFlowPayload(
  code: string,
  workspaceCode: string,
  schemaCode: string,
  nodes: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    description: 'Created by ems-ui-automation',
    createdBy: apiConfig.identityEmail,
    modifiedBy: apiConfig.identityEmail,
    workspaceCode,
    schemaCode,
    nodes,
    ...overrides,
  };
}

export function buildEventSchemaPayload(
  code: string,
  workspaceCode: string,
  fields: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    workspaceCode,
    type: 'EVENT',
    shortDescription: 'Created by ems-ui-automation',
    longDescription: 'Created by ems-ui-automation',
    fields,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------
// Builders added in the 2026-09-02 architecture pass.
//
// Every payload below was previously an inline object literal repeated across its own spec
// file — Observer 6x, Script 6x, Mapper 5x, Global Variables 3x, Workspace 3x, Secret 3x. That
// is the exact copy-paste-drift shape this file's own header comment was written about after it
// bit the Connection payloads twice (rounds 1 and 2 of live validation errors, where each
// inline copy had grown a different stripped-down subset of required fields). The field sets
// below are lifted verbatim from each spec's own already-working create call — no field was
// added, removed, or renamed in the move, so these carry exactly the same confirmed shape the
// specs were already sending.
// ---------------------------------------------------------------------------------------

/** Observer — field shapes confirmed against magpie's Observer.java (see observer.api.spec.ts). */
export function buildObserverPayload(
  code: string,
  workspaceCode: string,
  connectionCode: string,
  schemaCode: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    shortDescription: 'Created by ems-ui-automation',
    longDescription: 'Created by ems-ui-automation',
    workspaceCode,
    connectionCode,
    schemaCode,
    topicName: 'qa.observer.topic',
    skipEventMapping: false,
    ...overrides,
  };
}

/**
 * Script — `type: 'JS'` and the input/output item shapes are confirmed live (script.api.spec.ts's
 * own passing lifecycle test). `scriptText` must be syntactically valid JS: push-live runs a real
 * syntax check downstream (the confirmed 4009 error chain documented in that spec).
 */
export function buildScriptPayload(code: string, workspaceCode: string, overrides: Record<string, unknown> = {}) {
  return {
    code,
    name: code,
    workspaceCode,
    type: 'JS',
    shortDescription: 'Created by ems-ui-automation',
    longDescription: 'Created by ems-ui-automation',
    scriptText: 'var output = input;',
    input: [{ key: 'input', value: null, testValue: { foo: 'bar' }, type: 'OBJECT' }],
    output: [{ key: 'output', type: 'OBJECT' }],
    ...overrides,
  };
}

/** Mapper — mixed-type field list, confirmed live in mapper.api.spec.ts's lifecycle test. */
export function buildMapperPayload(
  code: string,
  workspaceCode: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    description: 'Created by ems-ui-automation',
    workspaceCode,
    fields: [
      { name: 'orderId', path: '$.order.id', type: 'STRING', nullable: false },
      { name: 'amount', path: '$.order.amount', type: 'DOUBLE', nullable: true },
    ],
    ...overrides,
  };
}

/**
 * Global Variables — `description` is CONFIRMED required live (400 "Global Variables document
 * description is missed" without it).
 */
export function buildGlobalVariablePayload(
  code: string,
  workspaceCode: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    description: 'Created by ems-ui-automation',
    workspaceCode,
    variableAttributes: [
      { key: 'maxRetries', value: 3, type: 'NUMBER' },
      { key: 'featureFlag', value: true, type: 'BOOLEAN' },
    ],
    ...overrides,
  };
}

/**
 * Workspace — no draft/live split, plain CRUD. `createdBy` IS a real field on Workspace.java
 * (confirmed); it carries the same identity as the x-user-info trust header.
 */
export function buildWorkspacePayload(code: string, overrides: Record<string, unknown> = {}) {
  return {
    code,
    name: code,
    description: 'Created by ems-ui-automation',
    color: '#3366ff',
    createdBy: apiConfig.identityEmail,
    ...overrides,
  };
}

/** Secret — no edition/state at all, and gated by the VAULT permission (not WRITE). */
export function buildSecretPayload(
  code: string,
  workspaceCode: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    code,
    name: code,
    workspaceCode,
    secretValue: 'qa-initial-value',
    ...overrides,
  };
}
