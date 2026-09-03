import { Permissions, PermissionKey } from './permissions';
import { apiConfig } from '../config';

export type UserInfo = {
  email: string;
  permissionsList: { name: string; roleName: string; source: string }[];
};

/**
 * Base64-encodes a UserInfo object exactly the way magpie's `UserInfo.toBase64()` does
 * (JSON.stringify then base64) — this is the reusable core shared by both the fabricated
 * identity below and the "real" login-derived identity in AuthApi.getUserInfo().
 */
export function encodeUserInfo(userInfo: UserInfo): string {
  return Buffer.from(JSON.stringify(userInfo)).toString('base64');
}

/**
 * Builds the headers EMS's internal microservices trust for automated callers, mirroring
 * magpie's default `AuthDataGenerator`/`AuthDataModule` behavior exactly: a synthetic email +
 * a declared permissions list, base64-encoded into `x-user-info`, plus `x-workspace` when a
 * workspace is relevant. No real login involved — the services trust whatever is declared
 * here, which is why this only works from inside the internal network (these are
 * `*.tajawal-dev.internal` hosts, not reachable over the public internet).
 *
 * This is the default/fast path — reach for `AuthApi.realInternalHeaders()` instead when a
 * test specifically needs to prove the real login → permissions flow works end-to-end (e.g.
 * testing the auth service itself, or a scenario tied to a specific real user's actual
 * granted permissions rather than a declared set).
 */
export function internalHeaders(
  permissionKeys: PermissionKey[],
  workspaceCode?: string
): Record<string, string> {
  // NOTE: .env.dev/.env.staging/.env.prod all fill this in as EMS_TEST_IDENTITY_EMAIL (not
  // EMS_INTERNAL_IDENTITY_EMAIL) — aligned here so the real qa-automation@almosafer.com value
  // you filled in is actually picked up instead of silently falling back to the placeholder.
  const email = process.env.EMS_TEST_IDENTITY_EMAIL || 'ems-ui-automation@test.local';
  const userInfo: UserInfo = {
    email,
    permissionsList: permissionKeys.map((key) => Permissions[key]),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-info': encodeUserInfo(userInfo),
  };

  const code = workspaceCode ?? apiConfig.workspaceCode;
  if (code) headers['x-workspace'] = code;

  return headers;
}
