import { mergeTests } from '@playwright/test';
import { test as authTest } from './auth.fixture';
import { test as apiTest } from './api.fixture';
import { uniqueEventName } from '../utils/testData';
import { CleanupStack } from '../utils/cleanup';

// Combines the UI fixtures (authenticatedPage, sidebarNav, ...) and the API fixtures
// (flowApi, eventIngestionApi, ...) into one `test` — this is what makes the hybrid pattern
// possible: a single test can seed/tear down data via the API while driving the actual
// scenario through the UI. See README's "Hybrid UI+API tests" section for when to reach for
// this vs. the plain auth.fixture / api.fixture.
const base = mergeTests(authTest, apiTest);

type HybridFixtures = {
  /**
   * Creates a Flow via the API before the test runs and deletes it afterwards — use this to
   * skip whatever multi-step UI flow-builder would otherwise be needed just to get a flow
   * onto the Flows list, when the flow-builder itself isn't what the test is verifying.
   */
  seededFlow: { id: string; code: string };

  /**
   * Pushes an event via the API before the test runs. No cleanup: Track/event records look
   * like an append-only ingestion log in EMS (the magpie reference framework's
   * TrackServiceClient has no delete endpoint either), so there's nothing to tear down.
   */
  seededEvent: { jobId: string; name: string };
};

export const test = base.extend<HybridFixtures>({
  seededFlow: async ({ flowApi }, use) => {
    const cleanup = new CleanupStack();

    // Real required fields confirmed from a live 400 response against
    // ems-orchestration-config-svc's POST /flow (captured during an earlier local run —
    // see test-results/api-flow.api--.../error-context.md): code, description, schemaCode,
    // and nodes are all rejected as "cannot be null" when omitted. `schemaCode` is the
    // trigger Event's code — using the qa-frontend-cypress reference suite's own permanent
    // trigger-event fixture (testData/flowScenarios.js: FLOW_TRIGGER_EVENT, a real live
    // Event on ems-dev with one string field `exampleEntry`) rather than guessing, since
    // that repo already solved "which live Event can I reference safely without creating
    // one per run." `nodes: []` clears the null-check; it's still unconfirmed whether the
    // backend accepts an *empty* node list for a real save, or only rejects `null`
    // specifically — if this still 400s, the next violation message will say so.
    //
    // CASING CORRECTION: this used to send capital `Nodes`, based on a live capture that
    // (per the same reversal documented in tests/api/flow.api.spec.ts) only ever tested an
    // OMITTED-Nodes payload — that capture never actually proved the capitalized key was
    // correct. Fresh evidence from the request/response logging shows a real, non-empty
    // `Nodes` array still gets rejected as null, so the wire key is lowercase `nodes`
    // (matching the Mongo entity's own field name). Also assumes this Flow's referenced
    // schemaCode (FLOW_TRIGGER_EVENT_CODE) is already LIVE + ACTIVE on ems-dev, per the
    // team's stated business rule that an inactive schema can't be referenced by a Flow —
    // if this fixture starts 400ing, check that env's activation state first.
    const code = uniqueEventName('QA-Flow-UI').replace(/[^a-zA-Z0-9_-]/g, '_');
    const payload = {
      name: uniqueEventName('QA-Flow-UI'),
      code,
      description: 'Hybrid UI+API regression fixture — safe to delete.',
      schemaCode: process.env.FLOW_TRIGGER_EVENT_CODE || 'FLOW_TRIGGER_1786446163825',
      nodes: [],
    };
    const createRes = await flowApi.create(payload);
    // Every other entity in this suite (and this file's own seededEvent below) expects 200
    // on a successful create — 201 here was unconfirmed and is corrected to match.
    if (createRes.status() !== 200) {
      throw new Error(`Failed to seed flow via API (${createRes.status()}): ${await createRes.text()}`);
    }
    const created = await createRes.json();
    cleanup.push(() => flowApi.delete(created.id).then(() => undefined));

    try {
      await use({ id: created.id, code: created.code ?? code });
    } finally {
      await cleanup.runAll();
    }
  },

  seededEvent: async ({ eventIngestionApi }, use) => {
    const name = uniqueEventName('QA-Event-UI');
    // Real required fields confirmed from live 400 responses against ems-api-gateway's
    // POST /push: `eventKey` (non-empty), `eventType` (one of MAIN, QUEUE, ACTION,
    // NOTIFICATION), and `payload` ("Payload cannot be empty"). An earlier local run's capture
    // (see the old comment this replaced) had concluded `payload` wasn't needed — a fresh dev
    // run corrected that; matches magpie's ApiGatewayInfo.java, whose nested Payload class has
    // exactly one field, `test`.
    const pushRes = await eventIngestionApi.pushEvent({
      eventKey: name,
      eventType: 'MAIN',
      payload: { test: name },
    });
    if (pushRes.status() >= 300) {
      throw new Error(`Failed to seed event via API (${pushRes.status()}): ${await pushRes.text()}`);
    }
    const body = await pushRes.json();
    // CORRECTED (2026-08-31): real field is `emsJobId`, confirmed in
    // tests/api/track.api.spec.ts's own real captured 200 — see the same fix applied in
    // e2e-scenarios.regression.spec.ts's E2E-12 for the failure that surfaced this.
    const jobId = body.emsJobId;

    await use({ jobId, name });
  },
});

export { expect } from '@playwright/test';
