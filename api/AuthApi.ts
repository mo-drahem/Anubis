import { APIRequestContext } from '@playwright/test';
import { apiConfig } from './config';
import { encodeUserInfo, UserInfo } from './ems/internalIdentity';

/**
 * The "real" auth path — actually logs in and fetches a real user's permissions, rather than
 * declaring them (see api/ems/internalIdentity.ts for the default fabricated path). Confirmed
 * against the magpie reference project's AuthServiceClient: POST /auth/login against the
 * internal ems.authentication.service.url (NOT the public ems-dev.almosafer.com/api/... paths
 * from the Postman collection — those hit the public UI gateway, a different service).
 *
 * Use this when a test specifically needs to prove the real login → permissions flow works,
 * or needs a specific real user's actual granted permissions. For everyday CRUD/E2E test
 * auth, the fabricated path is faster and doesn't depend on a pre-provisioned test account.
 */
export class AuthApi {
  constructor(private readonly request: APIRequestContext, private readonly baseURL: string) {}

  async login(email: string, password: string): Promise<string> {
    const res = await this.request.post(`${this.baseURL}${apiConfig.authLoginPath}`, {
      data: { email, password },
    });

    if (!res.ok()) {
      throw new Error(
        `Login failed (${res.status()}) for ${email} against ${apiConfig.authLoginPath}: ${await res.text()}`
      );
    }

    const body = await res.json();
    // TODO: confirm the exact response field name against the real service.
    const token = body.token ?? body.accessToken;
    if (!token) {
      throw new Error(`Login succeeded but no token/accessToken field in response: ${JSON.stringify(body)}`);
    }
    return token;
  }

  /**
   * Fetches the logged-in user's real UserInfo (email + permissions) from
   * /auth/user_info and base64-encodes it exactly like the fabricated path does, so it can be
   * dropped straight into the `x-user-info` header. TODO: confirm the exact response shape and
   * whether `x-workspace` needs to be sent on this call too (magpie's commented-out reference
   * code sends it conditionally when a workspace is relevant).
   */
  async getRealUserInfoHeader(token: string, workspaceCode?: string): Promise<string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (workspaceCode) headers['x-workspace'] = workspaceCode;

    const res = await this.request.get(`${this.baseURL}${apiConfig.authUserInfoPath}`, { headers });
    if (!res.ok()) {
      throw new Error(`Fetching user_info failed (${res.status()}): ${await res.text()}`);
    }

    const userInfo = (await res.json()) as UserInfo;
    return encodeUserInfo(userInfo);
  }
}
