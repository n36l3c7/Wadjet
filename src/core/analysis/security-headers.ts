/**
 * Deterministic security-header analysis.
 *
 * Given a page's response headers, evaluate a curated set of security headers.
 * Each check reports present / missing / weak with a plain-language explanation
 * — individually verifiable facts, never an aggregate grade or verdict.
 *
 * @module
 */
import type { HeaderStatus, SecurityHeaderFinding } from './types';

interface HeaderCheck {
  readonly header: string;
  evaluate(value: string | null): { status: HeaderStatus; detail: string };
}

const CHECKS: readonly HeaderCheck[] = [
  {
    header: 'Content-Security-Policy',
    evaluate: (value) =>
      value !== null
        ? { status: 'present', detail: 'A CSP is set (policy strength is not scored here).' }
        : { status: 'missing', detail: 'No CSP; the page declares no content restrictions.' },
  },
  {
    header: 'Strict-Transport-Security',
    evaluate: (value) => {
      if (value === null) {
        return { status: 'missing', detail: 'No HSTS; HTTPS is not pinned for future visits.' };
      }
      return /max-age\s*=\s*0*[1-9]/i.test(value)
        ? { status: 'present', detail: `HSTS set (${value}).` }
        : { status: 'weak', detail: `HSTS present but max-age is missing or zero (${value}).` };
    },
  },
  {
    header: 'X-Content-Type-Options',
    evaluate: (value) => {
      if (value === null) return { status: 'missing', detail: 'MIME sniffing is not disabled.' };
      return /nosniff/i.test(value)
        ? { status: 'present', detail: 'nosniff is set.' }
        : { status: 'weak', detail: `Unexpected value: ${value}.` };
    },
  },
  {
    header: 'X-Frame-Options',
    evaluate: (value) =>
      value !== null
        ? { status: 'present', detail: `${value} (CSP frame-ancestors supersedes this).` }
        : { status: 'missing', detail: 'No X-Frame-Options; rely on CSP frame-ancestors.' },
  },
  {
    header: 'Referrer-Policy',
    evaluate: (value) =>
      value !== null
        ? { status: 'present', detail: value }
        : { status: 'missing', detail: 'No Referrer-Policy; the browser default applies.' },
  },
  {
    header: 'Permissions-Policy',
    evaluate: (value) =>
      value !== null
        ? { status: 'present', detail: 'A Permissions-Policy is set.' }
        : { status: 'missing', detail: 'No Permissions-Policy restricting powerful features.' },
  },
  {
    header: 'Cross-Origin-Opener-Policy',
    evaluate: (value) =>
      value !== null
        ? { status: 'present', detail: value }
        : { status: 'missing', detail: 'No COOP; not process-isolated from openers.' },
  },
  {
    header: 'Cross-Origin-Resource-Policy',
    evaluate: (value) =>
      value !== null
        ? { status: 'present', detail: value }
        : { status: 'missing', detail: 'No CORP.' },
  },
  {
    header: 'Cross-Origin-Embedder-Policy',
    evaluate: (value) =>
      value !== null
        ? { status: 'present', detail: value }
        : { status: 'missing', detail: 'No COEP.' },
  },
];

/** A raw response header. */
export interface RawResponseHeader {
  readonly name: string;
  readonly value: string;
}

/**
 * Evaluate the curated security-header checks against a page's response headers.
 *
 * @param headers - The response headers of the analyzed document.
 * @returns One finding per checked header.
 */
export function analyzeSecurityHeaders(
  headers: readonly RawResponseHeader[],
): SecurityHeaderFinding[] {
  const values = new Map<string, string>();
  for (const header of headers) {
    const key = header.name.toLowerCase();
    const existing = values.get(key);
    values.set(key, existing === undefined ? header.value : `${existing}, ${header.value}`);
  }

  return CHECKS.map((check) => {
    const value = values.get(check.header.toLowerCase()) ?? null;
    const { status, detail } = check.evaluate(value);
    return { header: check.header, status, detail };
  });
}
