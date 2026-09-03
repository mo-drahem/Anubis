import { test } from '@playwright/test';
import { BaseApiClient } from '../BaseApiClient';

// Workspace resource — close to the draft/live CRUD shape but keyed by code/id without a
// draft/live split, plus a couple of workspace-specific endpoints (permissions, ws-usr).
export class WorkspaceApi {
  constructor(private readonly client: BaseApiClient) {}

  list() {
    return test.step('List workspace', () => this.client.get('/workspace'));
  }

  create(body: unknown) {
    return test.step('Create workspace', () => this.client.post('/workspace', body));
  }

  getById(id: string) {
    return test.step(`Get workspace by id (${id})`, () => this.client.get(`/workspace/${id}`));
  }

  getByCode(code: string) {
    return test.step(`Get workspace by code (${code})`, () => this.client.get(`/workspace/code/${code}`));
  }

  update(id: string, body: unknown) {
    return test.step(`Update workspace (id=${id})`, () => this.client.put(`/workspace/${id}`, body));
  }

  deleteByCode(code: string) {
    return test.step(`Delete workspace by code (${code})`, () => this.client.delete(`/workspace/code/${code}`));
  }

  permissions() {
    return test.step('Get workspace permissions list', () => this.client.get('/workspace/permissions-list'));
  }

  // ws-usr — links users to a workspace
  linkUser(body: unknown) {
    return test.step('Link user to workspace', () => this.client.post('/ws-usr', body));
  }

  getWorkspaceUsers(workspaceCode: string) {
    return test.step(`Get workspace users (${workspaceCode})`, () => this.client.get(`/ws-usr/workspace/${workspaceCode}`));
  }

  isUserInWorkspace(email: string, workspaceCode: string) {
    return test.step(`Check user in workspace (${email}, ${workspaceCode})`, () =>
      this.client.get(`/ws-usr/check/${email}/${workspaceCode}`)
    );
  }

  /** Confirmed against the magpie reference's ConfigurationServiceClient
   *  (getFetchWorkspaceUserByIdExchange): plain `/ws-usr/{id}` GET. */
  getWsUserById(id: string) {
    return test.step(`Get ws-usr by id (${id})`, () => this.client.get(`/ws-usr/${id}`));
  }

  /** Confirmed against the magpie reference (getFetchWorkspaceUserByEmailAndCodeExchange):
   *  `email` + workspace `code` together, not `id`, is the other lookup key for a ws-usr link. */
  getWsUserByEmailAndWorkspace(email: string, workspaceCode: string) {
    return test.step(`Get ws-usr by email+workspace (${email}, ${workspaceCode})`, () =>
      this.client.get(`/ws-usr/${email}/${workspaceCode}`)
    );
  }

  /** Confirmed against the magpie reference (getUpdateWorkspaceUserExchange): PUT by id, same
   *  shape as `update()` above but on the `/ws-usr` resource. */
  updateWsUser(id: string, body: unknown) {
    return test.step(`Update ws-usr (id=${id})`, () => this.client.put(`/ws-usr/${id}`, body));
  }

  /** Confirmed against the magpie reference (getDeleteWorkspaceUserExchange): deleted by
   *  `email` + workspace `code`, not by id — there is no `DELETE /ws-usr/{id}`. */
  deleteWsUser(email: string, workspaceCode: string) {
    return test.step(`Delete ws-usr (${email}, ${workspaceCode})`, () => this.client.delete(`/ws-usr/${email}/${workspaceCode}`));
  }

  /** CORRECTED (was wrong): this was assumed to read the *caller's own identity* off the
   *  `x-user-info` trust header, taking no argument. A real captured curl against
   *  ems-v1-configuration-service disproved that — the endpoint takes an explicit `email` via
   *  a dedicated `x-user-email` header, not identity derived from `x-user-info`:
   *    GET /ws-usr/workspace-list
   *    x-user-email: <email>
   *  `x-user-info`/`x-workspace` (this client's usual default headers) are still sent
   *  alongside it since nothing has shown they're rejected — but `x-user-email` is the header
   *  that actually selects whose workspace list comes back. Always pass the target email. */
  getWorkspacesByEmail(email: string) {
    return test.step(`Get workspaces by email (${email})`, () =>
      this.client.get('/ws-usr/workspace-list', undefined, { 'x-user-email': email })
    );
  }
}
