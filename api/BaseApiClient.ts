import { APIRequestContext, APIResponse, test } from '@playwright/test';

/**
 * Thin wrapper around Playwright's APIRequestContext for one microservice base URL.
 *
 * Deliberately returns the raw APIResponse rather than parsing it — per this project's
 * QA convention (see the ems-agent workspace's bug-report rules), tests should look at
 * and assert on the exact status/body they got back, not a pre-digested version of it.
 *
 * Every call is wrapped in a `test.step` (titled `METHOD /path`) and gets the request body
 * (if any) and the response status+body attached as JSON — this is what makes the HTML
 * report useful for debugging a failure without re-running the suite with tracing on:
 * attachments show up per-test regardless of pass/fail (unlike trace/video, which are
 * `retain-on-failure` in playwright.config.ts). `APIResponse.text()`/`.json()` are safe to
 * call more than once — Playwright buffers the body server-side until `.dispose()` is
 * called (see the `APIResponse.dispose()` doc comment) — so reading it here for the
 * attachment never interferes with a test's own later `await res.json()`.
 */
export class BaseApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseURL: string,
    private readonly defaultHeaders: Record<string, string> = {}
  ) {}

  private url(path: string): string {
    return `${this.baseURL}${path}`;
  }

  private async withLogging(
    method: string,
    path: string,
    requestDetails: { body?: unknown; params?: Record<string, string | number | boolean>; extraHeaders?: Record<string, string> },
    exec: () => Promise<APIResponse>
  ): Promise<APIResponse> {
    return test.step(`${method} ${path}`, async () => {
      const info = test.info();

      const requestLog: Record<string, unknown> = {};
      if (requestDetails.body !== undefined) requestLog.body = requestDetails.body;
      if (requestDetails.params !== undefined) requestLog.params = requestDetails.params;
      if (requestDetails.extraHeaders !== undefined) requestLog.extraHeaders = requestDetails.extraHeaders;
      if (Object.keys(requestLog).length > 0) {
        await info.attach('request', {
          body: Buffer.from(JSON.stringify(requestLog, null, 2)),
          contentType: 'application/json',
        });
      }

      const response = await exec();

      let rawBody = '';
      try {
        rawBody = await response.text();
      } catch {
        // No readable body (e.g. a 204, or a connection-level failure) — nothing to attach.
      }
      let prettyBody = rawBody;
      let isJson = false;
      try {
        prettyBody = JSON.stringify(JSON.parse(rawBody), null, 2);
        isJson = true;
      } catch {
        // Not JSON (plain text, an empty body, or an HTML error page) — attach as-is.
      }
      await info.attach(`response (${response.status()})`, {
        body: Buffer.from(prettyBody || '(empty body)'),
        contentType: isJson ? 'application/json' : 'text/plain',
      });

      return response;
    });
  }

  // extraHeaders merges over (and can override) the fixture's default headers — needed for
  // calls whose real endpoint requires something beyond the standard auth headers, e.g.
  // Schema's code+state lookup requiring an `edition` header (confirmed live: 400 "Required
  // header 'edition' is not present" without it).
  get(
    path: string,
    params?: Record<string, string | number | boolean>,
    extraHeaders?: Record<string, string>
  ): Promise<APIResponse> {
    return this.withLogging('GET', path, { params, extraHeaders }, () =>
      this.request.get(this.url(path), { headers: { ...this.defaultHeaders, ...extraHeaders }, params })
    );
  }

  post(path: string, body?: unknown): Promise<APIResponse> {
    return this.withLogging('POST', path, { body }, () =>
      this.request.post(this.url(path), { headers: this.defaultHeaders, data: body })
    );
  }

  put(path: string, body?: unknown): Promise<APIResponse> {
    return this.withLogging('PUT', path, { body }, () =>
      this.request.put(this.url(path), { headers: this.defaultHeaders, data: body })
    );
  }

  patch(path: string, body?: unknown): Promise<APIResponse> {
    return this.withLogging('PATCH', path, { body }, () =>
      this.request.patch(this.url(path), { headers: this.defaultHeaders, data: body })
    );
  }

  delete(path: string): Promise<APIResponse> {
    return this.withLogging('DELETE', path, {}, () => this.request.delete(this.url(path), { headers: this.defaultHeaders }));
  }
}
