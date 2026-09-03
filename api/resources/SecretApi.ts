import { test } from '@playwright/test';
import { BaseApiClient } from '../BaseApiClient';

/**
 * Secret is the one Configuration Service resource that does NOT follow the shared
 * draft/live lifecycle — plain CRUD only (no state/edition, no push-live/restore-live/
 * change-workspace). Confirmed against the magpie reference's `ConfigurationServiceClient`
 * path constants (`SECRET_PATH`, `SECRET_PATH_FORMAT`, `SECRET_CODE_PATH_FORMAT`,
 * `SECRET_CHECK_PATH_FORMAT`, `SECRET_PRIVATE_CODE_PATH_FORMAT`,
 * `SECRET_WORKSPACE_CODE_PATH_FORMAT`) — this is a deliberately separate, smaller class
 * rather than forcing Secret through `DraftLiveResourceApi`, which would otherwise expose
 * methods (`pushLive`, `getByCodeAndState`, `updateState`, ...) that don't apply here and
 * would just 404/400 by design, confusing anyone reading the spec later.
 *
 * `secretValue` is confirmed (from the reference's `SecretSteps.java`) to be stripped out
 * of LIST responses before returning. Whether get-by-id / get-by-code / get-private also
 * mask it is NOT confirmed — capture a real response before asserting either way.
 */
export class SecretApi {
  constructor(private readonly client: BaseApiClient) {}

  list(params?: Record<string, string | number | boolean>) {
    return test.step('List secret', () => this.client.get('/secret', params));
  }

  create(body: unknown) {
    return test.step('Create secret', () => this.client.post('/secret', body));
  }

  getById(id: string) {
    return test.step(`Get secret by id (${id})`, () => this.client.get(`/secret/${id}`));
  }

  update(id: string, body: unknown) {
    return test.step(`Update secret (id=${id})`, () => this.client.put(`/secret/${id}`, body));
  }

  delete(id: string) {
    return test.step(`Delete secret (id=${id})`, () => this.client.delete(`/secret/${id}`));
  }

  getByCode(code: string) {
    return test.step(`Get secret by code (${code})`, () => this.client.get(`/secret/code/${code}`));
  }

  /** Whether this returns a boolean, the secret itself, or something else is unconfirmed —
   *  capture a real response before writing an assertion beyond status code. */
  check(workspaceCode: string, secretCode: string) {
    return test.step(`Check secret (${workspaceCode}, ${secretCode})`, () =>
      this.client.get(`/secret/check/${workspaceCode}/${secretCode}`)
    );
  }

  /** "Private" fetch by code — name suggests this may be the one path that returns the
   *  unmasked `secretValue`, but that's not confirmed. Requires the `VAULT` permission per
   *  this project's domain notes (not confirmed against reference source for Secret
   *  specifically — flag as a negative-dimension case to capture). */
  getPrivateByCode(code: string) {
    return test.step(`Get private secret by code (${code})`, () => this.client.get(`/secret/private/code/${code}`));
  }

  getByWorkspace(workspaceCode: string) {
    return test.step(`Get secret by workspace (${workspaceCode})`, () => this.client.get(`/secret/workspace/${workspaceCode}`));
  }
}
