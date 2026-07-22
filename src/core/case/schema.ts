/**
 * Runtime validation and schema-version guards for the case model.
 *
 * Persisted data (and messages crossing the extension's contexts) is untrusted
 * at the boundary: these guards convert unknown values into typed domain
 * objects or fail loudly. Failing loudly is deliberate — silent acceptance of a
 * malformed record is worse than a visible error.
 *
 * @module
 */
import {
  CASE_SCHEMA_VERSION,
  type Case,
  type CaseEntry,
  type CaseEntryKind,
  type CaseStatus,
} from './types';

const CASE_STATUSES: readonly CaseStatus[] = ['open', 'closed'];
const ENTRY_KINDS: readonly CaseEntryKind[] = ['note', 'request', 'decoded-artifact', 'enrichment'];
const REQUEST_OUTCOMES = ['completed', 'error'] as const;

/** Thrown when persisted data was written by an unsupported schema version. */
export class SchemaVersionError extends Error {
  constructor(
    readonly found: number,
    readonly expected: number = CASE_SCHEMA_VERSION,
  ) {
    super(`Unsupported case schema version ${found}; this build expects ${expected}.`);
    this.name = 'SchemaVersionError';
  }
}

/**
 * Assert that a persisted `schemaVersion` is one this build can read.
 *
 * @throws {SchemaVersionError} If the version is not supported.
 */
export function assertSupportedSchema(version: number): void {
  if (version !== CASE_SCHEMA_VERSION) {
    throw new SchemaVersionError(version);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isHttpHeaderArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === 'string' &&
        typeof item.value === 'string' &&
        typeof item.redacted === 'boolean',
    )
  );
}

function isRedirectHopArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.fromUrl === 'string' &&
        typeof item.toUrl === 'string' &&
        (item.statusCode === null || typeof item.statusCode === 'number') &&
        typeof item.timestamp === 'number',
    )
  );
}

function isRequestTimings(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.startedAt === 'number' &&
    (value.responseStartedAt === null || typeof value.responseStartedAt === 'number') &&
    (value.completedAt === null || typeof value.completedAt === 'number')
  );
}

function isEnrichmentResult(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.provider === 'string' &&
    typeof value.indicator === 'string' &&
    typeof value.indicatorType === 'string' &&
    typeof value.fetchedAt === 'number' &&
    typeof value.ok === 'boolean' &&
    typeof value.summary === 'string' &&
    Array.isArray(value.facts) &&
    (value.link === null || typeof value.link === 'string')
  );
}

function isEnrichmentShape(value: Record<string, unknown>): boolean {
  return (
    typeof value.indicator === 'string' &&
    typeof value.indicatorType === 'string' &&
    Array.isArray(value.results) &&
    value.results.every(isEnrichmentResult)
  );
}

function isDecodedArtifactShape(value: Record<string, unknown>): boolean {
  return (
    typeof value.input === 'string' &&
    isStringArray(value.chain) &&
    typeof value.output === 'string' &&
    (value.sourceUrl === null || typeof value.sourceUrl === 'string') &&
    typeof value.truncated === 'boolean'
  );
}

function isRequestEntryShape(value: Record<string, unknown>): boolean {
  return (
    typeof value.method === 'string' &&
    typeof value.url === 'string' &&
    typeof value.resourceType === 'string' &&
    (value.statusCode === null || typeof value.statusCode === 'number') &&
    typeof value.fromCache === 'boolean' &&
    (value.remoteIp === null || typeof value.remoteIp === 'string') &&
    isHttpHeaderArray(value.requestHeaders) &&
    isHttpHeaderArray(value.responseHeaders) &&
    isRedirectHopArray(value.redirectChain) &&
    isRequestTimings(value.timings) &&
    REQUEST_OUTCOMES.includes(value.outcome as (typeof REQUEST_OUTCOMES)[number]) &&
    (value.error === null || typeof value.error === 'string') &&
    typeof value.sensitiveRetained === 'boolean'
  );
}

/** Type guard: is `value` a well-formed {@link Case}? */
export function isCase(value: unknown): value is Case {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.status === 'string' &&
    CASE_STATUSES.includes(value.status as CaseStatus) &&
    typeof value.createdAt === 'number' &&
    (value.closedAt === null || typeof value.closedAt === 'number') &&
    isStringArray(value.tags) &&
    typeof value.schemaVersion === 'number'
  );
}

/** Type guard: is `value` a well-formed {@link CaseEntry}? */
export function isCaseEntry(value: unknown): value is CaseEntry {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.caseId !== 'string' ||
    typeof value.kind !== 'string' ||
    !ENTRY_KINDS.includes(value.kind as CaseEntryKind) ||
    typeof value.timestamp !== 'number' ||
    !isStringArray(value.tags)
  ) {
    return false;
  }
  // Kind-specific fields.
  switch (value.kind as CaseEntryKind) {
    case 'note':
      return typeof value.text === 'string';
    case 'request':
      return isRequestEntryShape(value);
    case 'decoded-artifact':
      return isDecodedArtifactShape(value);
    case 'enrichment':
      return isEnrichmentShape(value);
    default:
      return false;
  }
}
