import { test } from '@playwright/test';
import { BaseApiClient } from '../BaseApiClient';

/**
 * Input Core service — an alternate event-push route alongside the API Gateway's `POST /push`
 * (see `EventIngestionApi.pushEvent`). Confirmed to exist against the magpie reference's
 * `InputCoreServiceClient` interface (`PUSH_EVENT_PATH = "/input/pushEvent"`), but magpie's own
 * `InputCoreServiceClientImpl` and any step definitions that call it weren't available to
 * confirm the HTTP verb or required payload shape — POST is inferred from the "push" naming and
 * from the sibling `EventIngestionApi.pushEvent`, not yet capture-verified. Hit this against dev
 * and update this comment (and the negative-case TODOs) once you've seen a real response, per
 * this project's capture-first discipline.
 */
export class InputCoreApi {
  constructor(private readonly client: BaseApiClient) {}

  pushEvent(body: Record<string, unknown>) {
    return test.step('Push event (Input Core)', () => this.client.post('/input/pushEvent', body));
  }
}
