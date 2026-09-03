import { test as base, APIRequestContext } from '@playwright/test';
import { apiConfig } from '../api/config';
import { BaseApiClient } from '../api/BaseApiClient';
import { AuthApi } from '../api/AuthApi';
import { internalHeaders } from '../api/ems/internalIdentity';
import { PermissionKey } from '../api/ems/permissions';
import { DraftLiveResourceApi } from '../api/resources/DraftLiveResourceApi';
import { TrackApi } from '../api/resources/TrackApi';
import { WorkspaceApi } from '../api/resources/WorkspaceApi';
import { EventIngestionApi } from '../api/resources/EventIngestionApi';
import { ReportingApi } from '../api/resources/ReportingApi';
import { InputCoreApi } from '../api/resources/InputCoreApi';
import { SecretApi } from '../api/resources/SecretApi';
import { testUser } from '../utils/testEnv';

type ApiFixtures = {
  /**
   * Builds a raw BaseApiClient against any service URL with a specific permission set —
   * use this directly for permission-boundary tests (e.g. "no WRITE permission -> 403")
   * rather than the convenience fixtures below, which default to WRITE + LIVE.
   */
  buildInternalClient: (
    baseUrl: string,
    permissions: PermissionKey[],
    workspaceCode?: string
  ) => BaseApiClient;

  /** Real login + real user_info token, for testing the auth service itself — see AuthApi. */
  authToken: string;

  trackApi: TrackApi;
  flowApi: DraftLiveResourceApi;
  schemaApi: DraftLiveResourceApi;
  observerApi: DraftLiveResourceApi;
  workspaceApi: WorkspaceApi;
  connectionApi: DraftLiveResourceApi;
  apiCallApi: DraftLiveResourceApi;
  mapperApi: DraftLiveResourceApi;
  scriptApi: DraftLiveResourceApi;
  globalVariablesApi: DraftLiveResourceApi;
  secretApi: SecretApi;
  eventIngestionApi: EventIngestionApi;
  /** Unconfirmed against live dev yet — see ReportingApi.ts's capture-first TODO. */
  reportingApi: ReportingApi;
  /** Unconfirmed against live dev yet — see InputCoreApi.ts's capture-first TODO. */
  inputCoreApi: InputCoreApi;
};

// Sensible default for most CRUD/E2E resource tests — matches what magpie's steps use most
// often. Tests needing something narrower (or a boundary/negative case) should build their
// own client via `buildInternalClient` instead of relying on these fixtures.
const DEFAULT_PERMISSIONS: PermissionKey[] = ['WRITE', 'LIVE'];
const WORKSPACE_PERMISSIONS: PermissionKey[] = ['WORKSPACE_MANAGER', 'WORKSPACE_CREATOR', 'WRITE', 'LIVE'];

export const test = base.extend<ApiFixtures>({
  buildInternalClient: async ({ request }, use) => {
    await use((baseUrl, permissions, workspaceCode) =>
      new BaseApiClient(request, baseUrl, internalHeaders(permissions, workspaceCode))
    );
  },

  authToken: async ({ request }, use) => {
    const authApi = new AuthApi(request, apiConfig.authServiceUrl());
    const token = await authApi.login(testUser.email, testUser.password);
    await use(token);
  },

  trackApi: async ({ buildInternalClient }, use) => {
    await use(new TrackApi(buildInternalClient(apiConfig.trackServiceUrl(), DEFAULT_PERMISSIONS)));
  },

  // `rawState: true` on Flow and Observer — CONFIRMED from real captured curls: those two
  // entities' updateState endpoints want the RAW uppercase state (`PUT /flow/{id}/ACTIVE`),
  // while Connection and Schema want it lowercased (`/connection/{id}/active`). Declared once
  // per entity here instead of being remembered at every call site — see
  // DraftLiveResourceOptions' doc comment for why that move matters. ApiCall/Mapper/Script/
  // Global Variables are still UNVERIFIED either way; they keep the lowercase default that
  // Connection/Schema confirmed, and a call site can still override per call if a capture
  // proves otherwise.
  flowApi: async ({ buildInternalClient }, use) => {
    await use(
      new DraftLiveResourceApi(buildInternalClient(apiConfig.flowServiceUrl(), DEFAULT_PERMISSIONS), 'flow', {
        rawState: true,
      })
    );
  },

  schemaApi: async ({ buildInternalClient }, use) => {
    await use(new DraftLiveResourceApi(buildInternalClient(apiConfig.configMappingUrl(), DEFAULT_PERMISSIONS), 'schema'));
  },

  observerApi: async ({ buildInternalClient }, use) => {
    await use(
      new DraftLiveResourceApi(buildInternalClient(apiConfig.configMappingUrl(), DEFAULT_PERMISSIONS), 'observer', {
        rawState: true,
      })
    );
  },

  workspaceApi: async ({ buildInternalClient }, use) => {
    await use(new WorkspaceApi(buildInternalClient(apiConfig.configurationServiceUrl(), WORKSPACE_PERMISSIONS)));
  },

  connectionApi: async ({ buildInternalClient }, use) => {
    await use(new DraftLiveResourceApi(buildInternalClient(apiConfig.configurationServiceUrl(), DEFAULT_PERMISSIONS), 'connection'));
  },

  apiCallApi: async ({ buildInternalClient }, use) => {
    await use(new DraftLiveResourceApi(buildInternalClient(apiConfig.configurationServiceUrl(), DEFAULT_PERMISSIONS), 'api-call'));
  },

  mapperApi: async ({ buildInternalClient }, use) => {
    await use(new DraftLiveResourceApi(buildInternalClient(apiConfig.configurationServiceUrl(), DEFAULT_PERMISSIONS), 'mapper'));
  },

  secretApi: async ({ buildInternalClient }, use) => {
    // Secret has no draft/live/state/workspace-change per EMS business rules. Confirmed live
    // (a real 400 "Access Denied" against WRITE-only headers) and confirmed in the reference —
    // magpie's AuthDataGenerator has a dedicated internalVaultHeaders() used by every single
    // SecretCrudTests call, never internalWriteHeaders(). VAULT, not WRITE, is what gates Secret.
    // Uses the dedicated SecretApi (not DraftLiveResourceApi) — see SecretApi.ts for why.
    await use(new SecretApi(buildInternalClient(apiConfig.configurationServiceUrl(), ['VAULT'])));
  },

  scriptApi: async ({ buildInternalClient }, use) => {
    await use(new DraftLiveResourceApi(buildInternalClient(apiConfig.configurationServiceUrl(), DEFAULT_PERMISSIONS), 'script'));
  },

  globalVariablesApi: async ({ buildInternalClient }, use) => {
    await use(new DraftLiveResourceApi(buildInternalClient(apiConfig.configurationServiceUrl(), DEFAULT_PERMISSIONS), 'global_variables'));
  },

  eventIngestionApi: async ({ buildInternalClient }, use) => {
    await use(new EventIngestionApi(buildInternalClient(apiConfig.apiGatewayUrl(), ['WRITE'])));
  },

  reportingApi: async ({ buildInternalClient }, use) => {
    await use(new ReportingApi(buildInternalClient(apiConfig.reportingServiceUrl(), DEFAULT_PERMISSIONS)));
  },

  inputCoreApi: async ({ buildInternalClient }, use) => {
    await use(new InputCoreApi(buildInternalClient(apiConfig.inputCoreUrl(), ['WRITE'])));
  },
});

export { expect } from '@playwright/test';
