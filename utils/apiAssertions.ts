import { APIResponse, expect, test } from '@playwright/test';

/**
 * Shared assertion helpers for EMS API responses.
 *
 * WHY THIS FILE EXISTS (2026-09-02 architecture pass): the same 4-6 line assertion block was
 * hand-repeated across all 11 API spec files — the 1005 "Validation Error" + `violations[]`
 * shape appeared verbatim in 8 of them. Centralizing does three things beyond removing the
 * repetition:
 *
 *   1. **Failure messages get better.** Every helper below attaches/echoes the REAL response
 *      body in its assertion message, so a failure tells you what the service actually said
 *      instead of just "expected 200, received 400" — which is exactly the information this
 *      project's capture-first discipline runs on.
 *   2. **A body is only parsed once the status is known**, so an unexpected non-JSON response
 *      (a gateway HTML error page, an empty body) fails as a clear status assertion rather
 *      than a cryptic `SyntaxError` from `.json()`.
 *   3. **It makes "assert the captured shape" the path of least resistance.** The old
 *      duplication is what let status-only assertions accumulate even in files whose comments
 *      recorded the real error code right above them.
 *
 * CAPTURE-FIRST STILL APPLIES: these helpers make it *easy* to assert a code/message, they do
 * not license inventing one. Pass only codes/messages actually read off a real response.
 */

/** Reads a response body as JSON, returning undefined rather than throwing on a non-JSON body. */
export async function safeJson(res: APIResponse): Promise<any | undefined> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/** Response body as text, for embedding in an assertion message. Never throws. */
async function bodyForMessage(res: APIResponse): Promise<string> {
  try {
    const text = await res.text();
    return text.length > 1_500 ? `${text.slice(0, 1_500)}… (truncated)` : text || '(empty body)';
  } catch {
    return '(body unavailable)';
  }
}

/**
 * Asserts an exact status and returns the parsed body. Use for every positive-path call —
 * it replaces the bare `expect(res.status()).toBe(200)` that used to be followed by an
 * unguarded `await res.json()`.
 */
export async function expectStatus(res: APIResponse, expected: number): Promise<any | undefined> {
  expect(res.status(), `Expected ${expected} but got ${res.status()}. Body: ${await bodyForMessage(res)}`).toBe(expected);
  return safeJson(res);
}

/** `expectStatus(res, 200)` — the overwhelmingly common case, named for readability. */
export async function expectOk(res: APIResponse): Promise<any | undefined> {
  return expectStatus(res, 200);
}

/**
 * The EMS validation-error shape: HTTP 400 + `code` (1005 by default) + a `violations[]` array.
 * Pass `violations` as the subset you actually captured — matched with `arrayContaining`, so a
 * service adding an unrelated extra violation later doesn't break the test, but a missing
 * expected one does.
 */
export async function expectValidationError(
  res: APIResponse,
  options: {
    violations?: Array<{ fieldName?: string; errorMessage?: string }>;
    code?: number;
    /**
     * Defaults to the captured `'Validation Error'` envelope. Pass `null` to assert the code and
     * violations WITHOUT asserting any message — for a response whose message string was never
     * captured. (Added 2026-09-02: all three refactor passes independently hit this. Because
     * `message` is destructured with a default, passing `undefined` re-applies the default, so
     * there was no way to stay strictly inside what a test had actually captured. `null` is the
     * explicit opt-out — capture-first means never asserting a string nobody has seen.)
     */
    message?: string | null;
    status?: number;
    /**
     * The body's own `status` field (`'BAD_REQUEST'`, `'NOT_FOUND'`, …) when it was captured.
     * EMS returns this alongside the HTTP status, and the cross-cutting domain rule is that the
     * two must agree — asserting it here is how a 4xx that says INTERNAL_SERVER_ERROR gets
     * caught instead of silently passing.
     */
    bodyStatus?: string;
  } = {}
): Promise<any> {
  const { code = 1005, message = 'Validation Error', status = 400, violations, bodyStatus } = options;
  const body = await expectStatus(res, status);
  expect(body?.code, `Expected error code ${code}. Body: ${JSON.stringify(body)}`).toBe(code);
  if (message !== null) {
    expect(body?.message).toBe(message);
  }
  if (bodyStatus !== undefined) {
    expect(body?.status, `Body's own status field. Body: ${JSON.stringify(body)}`).toBe(bodyStatus);
  }
  if (violations?.length) {
    expect(body?.violations).toEqual(expect.arrayContaining(violations.map((v) => expect.objectContaining(v))));
  }
  return body;
}

/**
 * A non-violations EMS error: `{ code, status, message }` with no `violations[]` — the shape
 * used by invalid-enum (1010), duplicate-key (1004), not-found (1072/1032/1090/1191/3002/3004)
 * and the delete-guard (2101). `message` is matched as a substring when given a string, so a
 * captured message containing a runtime-interpolated code still matches.
 */
export async function expectErrorBody(
  res: APIResponse,
  options: { status: number; code?: number; message?: string | RegExp; bodyStatus?: string }
): Promise<any> {
  const body = await expectStatus(res, options.status);
  if (options.code !== undefined) {
    expect(body?.code, `Expected error code ${options.code}. Body: ${JSON.stringify(body)}`).toBe(options.code);
  }
  if (options.bodyStatus !== undefined) {
    // See expectValidationError's `bodyStatus` doc — HTTP status and the body's own status
    // field must agree; a mismatch is a real finding, not a test bug.
    expect(body?.status, `Body's own status field. Body: ${JSON.stringify(body)}`).toBe(options.bodyStatus);
  }
  if (options.message !== undefined) {
    if (options.message instanceof RegExp) {
      expect(String(body?.message)).toMatch(options.message);
    } else {
      expect(String(body?.message)).toContain(options.message);
    }
  }
  return body;
}

/**
 * A "should be rejected" assertion for a rule this project knows is real but has NOT captured
 * the exact body for yet — the domain rules explicitly sanction this over a guessed exact body
 * ("write the test, assert loosely, tighten once captured").
 *
 * It deliberately also asserts the response is a CLIENT error (4xx), not merely `>= 400`: a 5xx
 * for a client mistake is itself a real finding per the cross-cutting rule that HTTP status and
 * the JSON `status` field must align. Pass `allowServerError: true` only where a 5xx is the
 * genuine captured behavior.
 *
 * Always attaches the real body to the report, so the first run of a new test like this
 * CAPTURES the evidence needed to tighten it.
 */
export async function expectRejected(
  res: APIResponse,
  reason: string,
  options: { allowServerError?: boolean } = {}
): Promise<any | undefined> {
  const body = await safeJson(res);
  await test.info().attach(`capture-me: ${reason} (${res.status()})`, {
    body: Buffer.from(JSON.stringify(body ?? (await bodyForMessage(res)), null, 2)),
    contentType: 'application/json',
  });
  expect(res.status(), `Expected a rejection (${reason}) but got ${res.status()}. Body: ${JSON.stringify(body)}`)
    .toBeGreaterThanOrEqual(400);
  if (!options.allowServerError) {
    expect(res.status(), `Expected a 4xx client error for "${reason}", got a ${res.status()} — a 5xx for a client mistake is a real finding, not a test bug. Body: ${JSON.stringify(body)}`)
      .toBeLessThan(500);
  }
  return body;
}

/**
 * Verifies an update actually PERSISTED, not merely that the write returned 200.
 *
 * WHY: before this pass, every one of the 11 lifecycle tests asserted `expect(updateRes.status())
 * .toBe(200)` and then never re-read the record — the single most consistent assertion gap in
 * the suite. A service that accepts a PUT and silently ignores a field passes that assertion.
 * Pass the fields you just wrote; this re-fetches and asserts each one came back.
 *
 * NESTED / UNCAPTURED SHAPES: comparison is `toEqual`, which accepts Playwright's asymmetric
 * matchers — so a field whose full server-echoed shape has never been captured can still be
 * verified on the part that HAS been:
 *
 *   expectPersisted(() => connectionApi.getById(id), {
 *     properties: expect.objectContaining({ host: 'https://example.com/v2' }),
 *   });
 *   expectPersisted(() => mapperApi.getById(id), {
 *     fields: expect.arrayContaining([expect.objectContaining({ name: 'addedField' })]),
 *   });
 *
 * Prefer that over asserting a whole nested object you haven't seen come back — deep-equality on
 * an uncaptured shape is a guess wearing an assertion's clothes.
 */
/**
 * Flow's validation-error shape: HTTP 400 + code 1005 + `errors: [{ id, violations[] }]`
 * instead of a top-level `violations[]`. Pass the expected violations for `errors[0]`; `id`
 * defaults to null (omit assertion) unless the capture shows a specific value.
 */
export async function expectFlowValidationError(
  res: APIResponse,
  options: {
    violations?: Array<{ fieldName?: string; errorMessage?: string }>;
    errorsIndex?: number;
    errorId?: string | null;
    code?: number;
    message?: string | null;
    status?: number;
    bodyStatus?: string;
  } = {}
): Promise<any> {
  const { code = 1005, message = 'Validation Error', status = 400, violations, errorsIndex = 0, errorId = null, bodyStatus } =
    options;
  const body = await expectStatus(res, status);
  expect(body?.code, `Expected error code ${code}. Body: ${JSON.stringify(body)}`).toBe(code);
  if (message !== null) {
    expect(body?.message).toBe(message);
  }
  if (bodyStatus !== undefined) {
    expect(body?.status, `Body's own status field. Body: ${JSON.stringify(body)}`).toBe(bodyStatus);
  }
  expect(body?.errors?.length, `Expected errors[] on Flow validation body. Body: ${JSON.stringify(body)}`).toBeGreaterThan(
    errorsIndex
  );
  if (errorId !== null) {
    expect(body.errors[errorsIndex].id).toBe(errorId);
  }
  if (violations?.length) {
    expect(body.errors[errorsIndex].violations).toEqual(
      expect.arrayContaining(violations.map((v) => expect.objectContaining(v)))
    );
  }
  return body;
}

export async function expectPersisted(
  refetch: () => Promise<APIResponse>,
  expectedFields: Record<string, unknown>
): Promise<any> {
  return test.step(`Verify persisted: ${Object.keys(expectedFields).join(', ')}`, async () => {
    const res = await refetch();
    const body = await expectOk(res);
    for (const [field, value] of Object.entries(expectedFields)) {
      expect(body?.[field], `Field "${field}" did not persist. Full record: ${JSON.stringify(body)}`).toEqual(value);
    }
    return body;
  });
}
