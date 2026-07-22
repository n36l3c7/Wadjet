/**
 * Sensitive-header redaction for captured traffic.
 *
 * Header values whose name matches the denylist are masked **before** a request
 * is persisted, so secrets (`Authorization`, `Cookie`, API tokens, …) never
 * reach IndexedDB or an export. The denylist lives in a versioned, user-editable
 * data file (`sensitive-headers.json`).
 *
 * The policy is redact-by-default. An analyst can opt in to retaining raw values
 * for a capture session (e.g. to inspect an auth flow); that choice is recorded
 * on each entry. Redaction also fails loud: if the denylist is unusable it masks
 * everything rather than risk a leak.
 *
 * @module
 */
import type { HttpHeader } from '../case/types';
import sensitiveHeaderData from './sensitive-headers.json';

/** Placeholder substituted for a redacted header value. */
export const REDACTED_PLACEHOLDER = '[redacted]';

/** Version of the bundled sensitive-header denylist. */
export const SENSITIVE_HEADERS_VERSION: number = sensitiveHeaderData.version;

/** Lowercased sensitive-header names from the bundled data file. */
export const SENSITIVE_HEADERS: ReadonlySet<string> = new Set(
  sensitiveHeaderData.headers.map((name) => name.toLowerCase()),
);

/** A raw, un-redacted header as seen on the wire. */
export interface RawHeader {
  readonly name: string;
  readonly value: string;
}

/** Options controlling {@link redactHeaders}. */
export interface RedactionOptions {
  /** When true, keep sensitive values raw — an explicit analyst opt-in. */
  readonly retainSensitive: boolean;
  /** Denylist of lowercase header names; defaults to {@link SENSITIVE_HEADERS}. */
  readonly denylist?: ReadonlySet<string>;
}

/** Whether a header name is on the (case-insensitive) sensitive denylist. */
export function isSensitiveHeader(
  name: string,
  denylist: ReadonlySet<string> = SENSITIVE_HEADERS,
): boolean {
  return denylist.has(name.trim().toLowerCase());
}

/**
 * Redact sensitive values in a header list.
 *
 * @param headers - Raw headers observed on the wire.
 * @param options - Redaction options.
 * @returns Headers with sensitive values masked (unless retained), each flagged.
 */
export function redactHeaders(
  headers: readonly RawHeader[],
  options: RedactionOptions,
): HttpHeader[] {
  const denylist = options.denylist ?? SENSITIVE_HEADERS;
  // Fail loud: an empty denylist while not deliberately retaining values means
  // something is wrong — mask every value rather than risk leaking a secret.
  const redactEverything = denylist.size === 0 && !options.retainSensitive;

  return headers.map((header) => {
    const sensitive =
      redactEverything || (!options.retainSensitive && isSensitiveHeader(header.name, denylist));
    return sensitive
      ? { name: header.name, value: REDACTED_PLACEHOLDER, redacted: true }
      : { name: header.name, value: header.value, redacted: false };
  });
}
