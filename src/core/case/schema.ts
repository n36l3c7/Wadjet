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
const ENTRY_KINDS: readonly CaseEntryKind[] = ['note'];

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
    default:
      return false;
  }
}
