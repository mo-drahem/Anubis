/**
 * EMS placeholder/reference tokens for Secrets, Global Variables, etc.
 *
 * `{{secret:code}}` is CONFIRMED (see E2E-04 and secret.api.spec.ts). Global-variable
 * syntax is PRESUMED by analogy until a live capture tightens it — the display form strips
 * braces the same way Secrets do (`secret:<code>` → likely `globalVariables:<code>.<key>`).
 */

export function secretReference(code: string): string {
  return `{{secret:${code}}}`;
}

export function secretReferenceDisplay(code: string): string {
  return `secret:${code}`;
}

/** PRESUMED — mirrors the secret token shape; confirm on the first live E2E-06 run. */
export function globalVariableReference(gvCode: string, attributeKey: string): string {
  return `{{globalVariables:${gvCode}.${attributeKey}}}`;
}

/** PRESUMED display form (braces stripped), matching E2E-04's secret display rule. */
export function globalVariableReferenceDisplay(gvCode: string, attributeKey: string): string {
  return `globalVariables:${gvCode}.${attributeKey}`;
}
