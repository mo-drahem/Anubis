// Central place to resolve the EMS microservice base URLs and auth-context config used by
// every API client. Values come from env vars (see .env.example) which are loaded
// per-environment by playwright.config.ts.
//
// Real dev values for the *.tajawal-dev.internal hosts (from the magpie reference project's
// application-dev.properties) are already filled into .env.dev — these are internal-only
// hostnames, only reachable when running from inside the company network/VPN. This sandbox
// can't reach them; your machine/CI runner on the network can. Staging/prod values are still
// unconfirmed placeholders (magpie doesn't have them documented either).

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var "${name}". Fill it into .env.${process.env.ENV || 'dev'} — ` +
        `see .env.example for the full list and where each value comes from.`
    );
  }
  return value;
}

export const apiConfig = {
  baseUrl: process.env.BASE_URL || '',

  // Lazy (function) so importing this module doesn't blow up for tests that never touch a
  // given service — the error only fires when a test actually needs that URL.
  //
  // NOTE: these var names must match the EMS_*_SERVICE_URL keys actually filled into
  // .env.dev/.env.staging/.env.prod (sourced from magpie's application-dev.properties) — an
  // earlier reconciliation pass filled those files in with the EMS_-prefixed convention but
  // never updated this file to match, so every one of these silently threw "missing env var"
  // regardless of environment until this was caught by a real run against dev.
  apiGatewayUrl: () => requireEnv('EMS_API_GATEWAY_SERVICE_URL'),
  inputCoreUrl: () => requireEnv('EMS_INPUT_CORE_SERVICE_URL'),
  trackServiceUrl: () => requireEnv('EMS_TRACK_SERVICE_URL'),
  configMappingUrl: () => requireEnv('EMS_INPUT_CONFIG_MAPPING_SERVICE_URL'),
  // Flow's real backing service is orchestration-config-service (confirmed against magpie's
  // OrchestrationConfigServiceClient — FLOW_PATH etc. live there, not a separate "flow service").
  flowServiceUrl: () => requireEnv('EMS_ORCHESTRATION_CONFIG_SERVICE_URL'),
  reportingServiceUrl: () => requireEnv('EMS_REPORTING_SERVICE_URL'),
  configurationServiceUrl: () => requireEnv('EMS_CONFIGURATION_SERVICE_URL'),
  uiGatewayServiceUrl: () => requireEnv('EMS_UI_GATEWAY_SERVICE_URL'),

  // Only needed for the optional "real login" path (AuthApi) — not used by the default
  // fabricated-identity path in api/ems/internalIdentity.ts.
  authServiceUrl: () => requireEnv('EMS_AUTHENTICATION_SERVICE_URL'),
  authLoginPath: process.env.AUTH_LOGIN_PATH || '/auth/login',
  authUserInfoPath: process.env.AUTH_USER_INFO_PATH || '/auth/user_info',

  // Sent as the x-workspace header on every authenticated request that's workspace-scoped.
  // Optional — every current spec creates its own workspace/connection rather than relying on
  // this default, so leaving it unset in .env.* is fine.
  workspaceCode: process.env.EMS_QA_WORKSPACE_CODE || '',
  edition: process.env.EDITION || 'DRAFT',

  // Same fallback/env var as internalIdentity.ts's internalHeaders() — exposed here too so
  // tests that need to send an actual email value in a request BODY (e.g. Workspace creation's
  // confirmed-required `email` field) can reuse the same identity rather than hardcoding one.
  identityEmail: process.env.EMS_TEST_IDENTITY_EMAIL || 'ems-ui-automation@test.local',
};
