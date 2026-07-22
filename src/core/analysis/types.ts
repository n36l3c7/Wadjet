/**
 * Types for per-page analysis (security headers and TLS).
 *
 * @module
 */

/** How a single security-header check evaluated. */
export type HeaderStatus = 'present' | 'missing' | 'weak';

/** The result of one deterministic, explainable security-header check. */
export interface SecurityHeaderFinding {
  readonly header: string;
  readonly status: HeaderStatus;
  /** Plain-language explanation of what was found and why it matters. */
  readonly detail: string;
}

/** Normalized TLS/certificate information for a connection. */
export interface TlsInfo {
  /** `secure` | `insecure` | `broken` | `weak`. */
  readonly state: string;
  readonly protocol: string | null;
  readonly cipher: string | null;
  /** Leaf certificate subject. */
  readonly subject: string | null;
  readonly issuer: string | null;
  /** Certificate validity window (epoch milliseconds). */
  readonly validFrom: number | null;
  readonly validTo: number | null;
  readonly fingerprintSha256: string | null;
}
