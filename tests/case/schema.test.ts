import { describe, expect, it } from 'vitest';
import {
  assertSupportedSchema,
  isCase,
  isCaseEntry,
  SchemaVersionError,
} from '../../src/core/case/schema';
import {
  CASE_SCHEMA_VERSION,
  type Case,
  type DecodedArtifactEntry,
  type DetonationEntry,
  type EnrichmentEntry,
  type NoteEntry,
  type PageAnalysisEntry,
  type RequestEntry,
  type ToolResultEntry,
} from '../../src/core/case/types';

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

const validRequest: RequestEntry = {
  id: 'r1',
  caseId: 'c1',
  kind: 'request',
  timestamp: 1000,
  tags: [],
  method: 'GET',
  url: 'https://example.com',
  resourceType: 'main_frame',
  statusCode: 200,
  fromCache: false,
  remoteIp: '1.1.1.1',
  requestHeaders: [{ name: 'Accept', value: '*/*', redacted: false }],
  responseHeaders: [{ name: 'Set-Cookie', value: '[redacted]', redacted: true }],
  redirectChain: [{ fromUrl: 'http://x', toUrl: 'https://x', statusCode: 301, timestamp: 999 }],
  timings: { startedAt: 1000, responseStartedAt: 1010, completedAt: 1020 },
  outcome: 'completed',
  error: null,
  sensitiveRetained: false,
};

describe('isCaseEntry (request)', () => {
  it('accepts a well-formed request', () => {
    expect(isCaseEntry(validRequest)).toBe(true);
  });

  it('accepts an errored request with a null status', () => {
    expect(
      isCaseEntry({ ...validRequest, statusCode: null, outcome: 'error', error: 'NS_ERROR' }),
    ).toBe(true);
  });

  it('rejects a request missing a method', () => {
    const { method: _method, ...withoutMethod } = validRequest;
    expect(isCaseEntry(withoutMethod)).toBe(false);
  });

  it('rejects malformed headers', () => {
    expect(isCaseEntry({ ...validRequest, requestHeaders: [{ name: 'x' }] })).toBe(false);
  });

  it('rejects an unknown outcome', () => {
    expect(isCaseEntry({ ...validRequest, outcome: 'pending' })).toBe(false);
  });
});

const validDecoded: DecodedArtifactEntry = {
  id: 'd1',
  caseId: 'c1',
  kind: 'decoded-artifact',
  timestamp: 1000,
  tags: [],
  input: 'aGVsbG8=',
  chain: ['base64'],
  output: 'hello',
  sourceUrl: 'https://example.com',
  truncated: false,
};

describe('isCaseEntry (decoded-artifact)', () => {
  it('accepts a well-formed decoded artifact', () => {
    expect(isCaseEntry(validDecoded)).toBe(true);
  });

  it('accepts a null source URL', () => {
    expect(isCaseEntry({ ...validDecoded, sourceUrl: null })).toBe(true);
  });

  it('rejects a non-string chain', () => {
    expect(isCaseEntry({ ...validDecoded, chain: [1, 2] })).toBe(false);
  });

  it('rejects a missing output', () => {
    const { output: _output, ...withoutOutput } = validDecoded;
    expect(isCaseEntry(withoutOutput)).toBe(false);
  });
});

const validEnrichment: EnrichmentEntry = {
  id: 'x1',
  caseId: 'c1',
  kind: 'enrichment',
  timestamp: 1000,
  tags: [],
  indicator: 'example.com',
  indicatorType: 'domain',
  results: [
    {
      provider: 'virustotal',
      indicator: 'example.com',
      indicatorType: 'domain',
      fetchedAt: 1000,
      ok: true,
      summary: '0/90 engines flagged malicious.',
      facts: [{ label: 'Malicious', value: '0 / 90' }],
      link: 'https://www.virustotal.com/gui/domain/example.com',
    },
  ],
};

describe('isCaseEntry (enrichment)', () => {
  it('accepts a well-formed enrichment', () => {
    expect(isCaseEntry(validEnrichment)).toBe(true);
  });

  it('rejects malformed results', () => {
    expect(isCaseEntry({ ...validEnrichment, results: [{ provider: 'virustotal' }] })).toBe(false);
  });

  it('rejects a missing indicator', () => {
    const { indicator: _indicator, ...withoutIndicator } = validEnrichment;
    expect(isCaseEntry(withoutIndicator)).toBe(false);
  });
});

const validDetonation: DetonationEntry = {
  id: 't1',
  caseId: 'c1',
  kind: 'detonation',
  timestamp: 1000,
  tags: [],
  url: 'https://evil.example',
  container: 'Wadjet throwaway ab12cd34',
  cookieStoreId: 'firefox-container-9',
};

describe('isCaseEntry (detonation)', () => {
  it('accepts a well-formed detonation', () => {
    expect(isCaseEntry(validDetonation)).toBe(true);
  });

  it('rejects a missing url', () => {
    const { url: _url, ...withoutUrl } = validDetonation;
    expect(isCaseEntry(withoutUrl)).toBe(false);
  });

  it('rejects a missing cookieStoreId', () => {
    const { cookieStoreId: _cookieStoreId, ...withoutStore } = validDetonation;
    expect(isCaseEntry(withoutStore)).toBe(false);
  });
});

const validPageAnalysis: PageAnalysisEntry = {
  id: 'p1',
  caseId: 'c1',
  kind: 'page-analysis',
  timestamp: 1000,
  tags: [],
  url: 'https://example.com',
  findings: [{ header: 'Content-Security-Policy', status: 'missing', detail: 'No CSP.' }],
  tls: null,
};

describe('isCaseEntry (page-analysis)', () => {
  it('accepts a well-formed analysis with null TLS', () => {
    expect(isCaseEntry(validPageAnalysis)).toBe(true);
  });

  it('accepts an analysis with a TLS object', () => {
    expect(isCaseEntry({ ...validPageAnalysis, tls: { state: 'secure' } })).toBe(true);
  });

  it('rejects malformed findings', () => {
    expect(isCaseEntry({ ...validPageAnalysis, findings: [{ header: 'x' }] })).toBe(false);
  });

  it('rejects a missing url', () => {
    const { url: _url, ...withoutUrl } = validPageAnalysis;
    expect(isCaseEntry(withoutUrl)).toBe(false);
  });
});

const validToolResult: ToolResultEntry = {
  id: 'k1',
  caseId: 'c1',
  kind: 'tool-result',
  timestamp: 1000,
  tags: [],
  tool: 'whois',
  input: 'example.com',
  output: 'Domain Name: EXAMPLE.COM',
  exitCode: 0,
};

describe('isCaseEntry (tool-result)', () => {
  it('accepts a well-formed tool result', () => {
    expect(isCaseEntry(validToolResult)).toBe(true);
  });

  it('rejects a missing tool', () => {
    const { tool: _tool, ...withoutTool } = validToolResult;
    expect(isCaseEntry(withoutTool)).toBe(false);
  });

  it('rejects a non-numeric exit code', () => {
    expect(isCaseEntry({ ...validToolResult, exitCode: 'zero' })).toBe(false);
  });
});
