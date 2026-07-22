import { describe, expect, it } from 'vitest';
import {
  assertSupportedSchema,
  isCase,
  isCaseEntry,
  SchemaVersionError,
} from '../../src/core/case/schema';
import { CASE_SCHEMA_VERSION, type Case, type NoteEntry } from '../../src/core/case/types';

const validCase: Case = {
  id: 'c1',
  name: 'Suspicious login page',
  status: 'open',
  createdAt: 1000,
  closedAt: null,
  tags: ['phishing'],
  schemaVersion: CASE_SCHEMA_VERSION,
};

const validNote: NoteEntry = {
  id: 'e1',
  caseId: 'c1',
  kind: 'note',
  timestamp: 1000,
  tags: [],
  text: 'Landing page mimics the SSO portal.',
};

describe('isCase', () => {
  it('accepts a well-formed case', () => {
    expect(isCase(validCase)).toBe(true);
  });

  it('accepts a closed case with a numeric closedAt', () => {
    expect(isCase({ ...validCase, status: 'closed', closedAt: 2000 })).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(isCase({ ...validCase, status: 'archived' })).toBe(false);
  });

  it('rejects non-string tags', () => {
    expect(isCase({ ...validCase, tags: ['ok', 42] })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isCase(null)).toBe(false);
    expect(isCase('nope')).toBe(false);
  });
});

describe('isCaseEntry', () => {
  it('accepts a well-formed note', () => {
    expect(isCaseEntry(validNote)).toBe(true);
  });

  it('rejects a note without text', () => {
    const { text: _text, ...withoutText } = validNote;
    expect(isCaseEntry(withoutText)).toBe(false);
  });

  it('rejects unknown kinds', () => {
    expect(isCaseEntry({ ...validNote, kind: 'screenshot' })).toBe(false);
  });
});

describe('assertSupportedSchema', () => {
  it('passes for the current version', () => {
    expect(() => assertSupportedSchema(CASE_SCHEMA_VERSION)).not.toThrow();
  });

  it('throws SchemaVersionError for other versions', () => {
    expect(() => assertSupportedSchema(CASE_SCHEMA_VERSION + 1)).toThrow(SchemaVersionError);
  });
});
