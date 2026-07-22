import { describe, expect, it } from 'vitest';
import type { Case, CaseEntry } from '../../src/core/case/types';
import { buildExport } from '../../src/core/export';
import { extractIocs } from '../../src/core/export/iocs';

const caseRecord: Case = {
  id: 'c1',
  name: 'Phish Kit',
  status: 'open',
  createdAt: 1000,
  closedAt: null,
  tags: ['phishing'],
  schemaVersion: 1,
};

const entries: CaseEntry[] = [
  {
    id: 'r1',
    caseId: 'c1',
    kind: 'request',
    timestamp: 10,
    tags: [],
    method: 'GET',
    url: 'https://evil.example/login?x=1',
    resourceType: 'main_frame',
    statusCode: 200,
    fromCache: false,
    remoteIp: '203.0.113.9',
    requestHeaders: [{ name: 'Authorization', value: '[redacted]', redacted: true }],
    responseHeaders: [],
    redirectChain: [],
    timings: { startedAt: 10, responseStartedAt: 11, completedAt: 12 },
    outcome: 'completed',
    error: null,
    sensitiveRetained: false,
  },
  {
    id: 'e1',
    caseId: 'c1',
    kind: 'enrichment',
    timestamp: 20,
    tags: [],
    indicator: '8.8.8.8',
    indicatorType: 'ip',
    results: [],
  },
  {
    id: 'n1',
    caseId: 'c1',
    kind: 'note',
    timestamp: 30,
    tags: [],
    text: 'free text mentioning 1.2.3.4 should be ignored',
  },
];

describe('extractIocs', () => {
  it('extracts from structured fields only, deduplicated', () => {
    const values = extractIocs(entries).map((ioc) => ioc.value);
    expect(values).toContain('evil.example');
    expect(values).toContain('https://evil.example/login?x=1');
    expect(values).toContain('8.8.8.8');
    // Free text is not scanned.
    expect(values).not.toContain('1.2.3.4');
  });
});

describe('buildExport', () => {
  const options = { toolVersion: '0.6.0', now: 1_700_000_000_000 };

  it('builds a Markdown report', () => {
    const file = buildExport('markdown', caseRecord, entries, options);
    expect(file.filename).toBe('wadjet-phish-kit-20231114.md');
    expect(file.mimeType).toBe('text/markdown');
    expect(file.content).toContain('# Wadjet case: Phish Kit');
    expect(file.content).toContain('evil.example');
    expect(file.content).toContain('[request]');
  });

  it('builds a valid HAR with redacted headers preserved', () => {
    const file = buildExport('har', caseRecord, entries, options);
    const har = JSON.parse(file.content) as { log: { entries: { request: { url: string } }[] } };
    expect(har.log.entries).toHaveLength(1);
    expect(har.log.entries[0]?.request.url).toBe('https://evil.example/login?x=1');
    expect(file.content).toContain('[redacted]');
  });

  it('builds a CSV of IOCs', () => {
    const file = buildExport('csv', caseRecord, entries, options);
    expect(file.filename).toBe('wadjet-phish-kit-20231114-iocs.csv');
    expect(file.content.split('\r\n')[0]).toBe('type,value,sources');
    expect(file.content).toContain('8.8.8.8');
  });

  it('builds a JSON envelope with case, iocs, and entries', () => {
    const file = buildExport('json', caseRecord, entries, options);
    const parsed = JSON.parse(file.content) as {
      tool: { version: string };
      case: { id: string };
      iocs: unknown[];
      entries: unknown[];
    };
    expect(parsed.tool.version).toBe('0.6.0');
    expect(parsed.case.id).toBe('c1');
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.iocs.length).toBeGreaterThan(0);
  });
});
