import { test } from '@playwright/test';
import { BaseApiClient } from '../BaseApiClient';

// API Gateway / Input Core — the actual event-ingestion entry point ("push an event into
// EMS"). This is probably the single most valuable API test to get right end-to-end:
// push an event, then poll TrackApi.getById(jobId) to confirm it was picked up and
// processed, mirroring what a real integration partner does.
export class EventIngestionApi {
  constructor(private readonly client: BaseApiClient) {}

  /**
   * Real required fields confirmed from live 400 responses against POST /push:
   * `eventKey` (non-empty string), `eventType` (one of MAIN, QUEUE, ACTION, NOTIFICATION), and
   * `payload` ("Payload cannot be empty" — confirmed against magpie's ApiGatewayInfo.java,
   * whose nested `Payload` class has exactly one field, `test`). Anything beyond these three
   * is still unconfirmed — pass whatever additional fields a specific event type needs.
   */
  pushEvent(
    body: {
      eventKey: string;
      eventType: 'MAIN' | 'QUEUE' | 'ACTION' | 'NOTIFICATION';
      payload: { test?: string } & Record<string, unknown>;
    } & Record<string, unknown>
  ) {
    return test.step('Push event', () => this.client.post('/push', body));
  }

  // TODO: confirm when/why you'd use this vs. plain pushEvent — name suggests a
  // client-specific variant (seen in the collection as "Trigger event new").
  pushEventVariant(body: unknown) {
    return test.step('Push event (wizzAir variant)', () => this.client.post('/push/wizzAir_event', body));
  }

  getTrackInfo(jobId: string) {
    return test.step(`Get track info (${jobId})`, () => this.client.get(`/track/${jobId}`));
  }
}
