import { beforeEach, describe, expect, it } from 'vitest';
import {
  CaseClosedError,
  CaseNotFoundError,
  CaseService,
  EmptyValueError,
  MAX_ARTIFACT_FIELD_CHARS,
} from '../../src/core/case/service';
import { CASE_SCHEMA_VERSION } from '../../src/core/case/types';
import { LocalMetadataStore } from '../../src/core/storage/metadata-store';
import type { EnrichmentResult } from '../../src/core/enrich/types';
import type { CapturedRequest } from '../../src/core/traffic/request-tracker';
import { InMemoryContentStore, InMemoryKeyValueArea, sequentialIds, steppingClock } from '../fakes';

function enrichmentResult(): EnrichmentResult {
  return {
    provider: 'virustotal',
    indicator: 'example.com',
    indicatorType: 'domain',
    fetchedAt: 1000,
    ok: true,
    summary: '0/90 engines flagged malicious.',
    facts: [],
    link: null,
  };
}

function capturedRequest(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    method: 'GET',
    url: 'https://example.com',
    resourceType: 'main_frame',
    statusCode: 200,
    fromCache: false,
    remoteIp: null,
    requestHeaders: [],
    responseHeaders: [],
    redirectChain: [],
    timings: { startedAt: 5000, responseStartedAt: 5010, completedAt: 5020 },
    outcome: 'completed',
    error: null,
    sensitiveRetained: false,
    ...overrides,
  };
}

function makeService(): CaseService {
  const metadata = new LocalMetadataStore(new InMemoryKeyValueArea());
  const content = new InMemoryContentStore();
  return new CaseService({
    metadata,
    content,
    now: steppingClock(),
    newId: sequentialIds(),
  });
}

describe('CaseService', () => {
  let service: CaseService;

  beforeEach(() => {
    service = makeService();
  });

  it('creates an open case and makes it active', async () => {
    const created = await service.createCase('  Phishing kit  ');
    expect(created).toMatchObject({
      id: 'id-1',
      name: 'Phishing kit',
      status: 'open',
      closedAt: null,
      tags: [],
      schemaVersion: CASE_SCHEMA_VERSION,
    });
    expect(await service.getActiveCase()).toMatchObject({ id: 'id-1' });
  });

  it('rejects a blank case name', async () => {
    await expect(service.createCase('   ')).rejects.toBeInstanceOf(EmptyValueError);
  });

  it('lists cases most-recent first', async () => {
    await service.createCase('first');
    await service.createCase('second');
    const cases = await service.listCases();
    expect(cases.map((c) => c.name)).toEqual(['second', 'first']);
  });

  it('throws when opening an unknown case', async () => {
    await expect(service.openCase('missing')).rejects.toBeInstanceOf(CaseNotFoundError);
  });

  it('closes a case, clears the active pointer, and is idempotent', async () => {
    const created = await service.createCase('to close');
    const closed = await service.closeCase(created.id);
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect(await service.getActiveCase()).toBeUndefined();

    const closedAgain = await service.closeCase(created.id);
    expect(closedAgain.closedAt).toBe(closed.closedAt);
  });

  it('adds notes to an open case, ordered on the timeline', async () => {
    const created = await service.createCase('active');
    await service.addNote(created.id, 'first observation', ['Phishing', 'phishing']);
    await service.addNote(created.id, 'second observation');

    const timeline = await service.getTimeline(created.id);
    expect(timeline).toHaveLength(2);
    const [first, second] = timeline;
    expect(first?.kind).toBe('note');
    expect(second?.kind).toBe('note');
    if (first?.kind === 'note') {
      expect(first.text).toBe('first observation');
      expect(first.tags).toEqual(['Phishing']);
    }
    if (second?.kind === 'note') {
      expect(second.text).toBe('second observation');
    }
    expect(first!.timestamp).toBeLessThan(second!.timestamp);
  });

  it('refuses to add a note to a closed case', async () => {
    const created = await service.createCase('closed case');
    await service.closeCase(created.id);
    await expect(service.addNote(created.id, 'late note')).rejects.toBeInstanceOf(CaseClosedError);
  });

  it('rejects a blank note', async () => {
    const created = await service.createCase('active');
    await expect(service.addNote(created.id, '   ')).rejects.toBeInstanceOf(EmptyValueError);
  });

  it('throws when adding a note to an unknown case', async () => {
    await expect(service.addNote('missing', 'note')).rejects.toBeInstanceOf(CaseNotFoundError);
  });
});

describe('CaseService — requests and entry queries', () => {
  let service: CaseService;

  beforeEach(() => {
    service = makeService();
  });

  it('binds a captured request to the case, timestamped at its start', async () => {
    const created = await service.createCase('capture');
    const entry = await service.addRequest(
      created.id,
      capturedRequest({ timings: { startedAt: 7000, responseStartedAt: 7005, completedAt: 7009 } }),
    );
    expect(entry.kind).toBe('request');
    expect(entry.caseId).toBe(created.id);
    expect(entry.timestamp).toBe(7000);
  });

  it('refuses to add a request to a closed case', async () => {
    const created = await service.createCase('capture');
    await service.closeCase(created.id);
    await expect(service.addRequest(created.id, capturedRequest())).rejects.toBeInstanceOf(
      CaseClosedError,
    );
  });

  it('returns entries newest-first, kind-filtered and paginated', async () => {
    const created = await service.createCase('capture');
    await service.addNote(created.id, 'a note'); // clock timestamp 2000
    await service.addRequest(
      created.id,
      capturedRequest({ timings: { startedAt: 100, responseStartedAt: 100, completedAt: 100 } }),
    );
    await service.addRequest(
      created.id,
      capturedRequest({ timings: { startedAt: 200, responseStartedAt: 200, completedAt: 200 } }),
    );

    const all = await service.getEntries(created.id, { kinds: null, limit: 10, before: null });
    expect(all.entries.map((entry) => entry.kind)).toEqual(['note', 'request', 'request']);
    expect(all.hasMore).toBe(false);

    const requests = await service.getEntries(created.id, {
      kinds: ['request'],
      limit: 10,
      before: null,
    });
    expect(requests.entries).toHaveLength(2);
    expect(requests.entries.every((entry) => entry.kind === 'request')).toBe(true);

    const page1 = await service.getEntries(created.id, { kinds: null, limit: 1, before: null });
    expect(page1.entries).toHaveLength(1);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextBefore).toBe(page1.entries[0]?.timestamp);

    const page2 = await service.getEntries(created.id, {
      kinds: null,
      limit: 1,
      before: page1.nextBefore,
    });
    expect(page2.entries[0]?.timestamp).toBeLessThan(page1.entries[0]?.timestamp ?? 0);
  });
});

describe('CaseService — decoded artifacts', () => {
  let service: CaseService;

  beforeEach(() => {
    service = makeService();
  });

  it('adds a decoded artifact to an open case', async () => {
    const created = await service.createCase('decode');
    const entry = await service.addDecodedArtifact(created.id, {
      input: 'aGk=',
      chain: ['base64'],
      output: 'hi',
      sourceUrl: 'https://example.com',
    });
    expect(entry.kind).toBe('decoded-artifact');
    expect(entry.chain).toEqual(['base64']);
    expect(entry.output).toBe('hi');
    expect(entry.sourceUrl).toBe('https://example.com');
    expect(entry.truncated).toBe(false);
  });

  it('rejects an empty decoder chain', async () => {
    const created = await service.createCase('decode');
    await expect(
      service.addDecodedArtifact(created.id, {
        input: 'x',
        chain: [],
        output: 'x',
        sourceUrl: null,
      }),
    ).rejects.toBeInstanceOf(EmptyValueError);
  });

  it('refuses a closed case', async () => {
    const created = await service.createCase('decode');
    await service.closeCase(created.id);
    await expect(
      service.addDecodedArtifact(created.id, {
        input: 'x',
        chain: ['url'],
        output: 'x',
        sourceUrl: null,
      }),
    ).rejects.toBeInstanceOf(CaseClosedError);
  });

  it('caps oversized fields and flags truncation', async () => {
    const created = await service.createCase('decode');
    const big = 'a'.repeat(MAX_ARTIFACT_FIELD_CHARS + 100);
    const entry = await service.addDecodedArtifact(created.id, {
      input: big,
      chain: ['base64'],
      output: big,
      sourceUrl: null,
    });
    expect(entry.input.length).toBe(MAX_ARTIFACT_FIELD_CHARS);
    expect(entry.output.length).toBe(MAX_ARTIFACT_FIELD_CHARS);
    expect(entry.truncated).toBe(true);
  });
});

describe('CaseService — enrichment', () => {
  let service: CaseService;

  beforeEach(() => {
    service = makeService();
  });

  it('adds enrichment results to an open case', async () => {
    const created = await service.createCase('enrich');
    const entry = await service.addEnrichment(created.id, {
      indicator: 'example.com',
      indicatorType: 'domain',
      results: [enrichmentResult()],
    });
    expect(entry.kind).toBe('enrichment');
    expect(entry.indicator).toBe('example.com');
    expect(entry.results).toHaveLength(1);
  });

  it('rejects an empty result set', async () => {
    const created = await service.createCase('enrich');
    await expect(
      service.addEnrichment(created.id, { indicator: 'x', indicatorType: 'domain', results: [] }),
    ).rejects.toBeInstanceOf(EmptyValueError);
  });

  it('refuses a closed case', async () => {
    const created = await service.createCase('enrich');
    await service.closeCase(created.id);
    await expect(
      service.addEnrichment(created.id, {
        indicator: 'x',
        indicatorType: 'domain',
        results: [enrichmentResult()],
      }),
    ).rejects.toBeInstanceOf(CaseClosedError);
  });
});

describe('CaseService — detonation', () => {
  let service: CaseService;

  beforeEach(() => {
    service = makeService();
  });

  it('records a detonation against an open case', async () => {
    const created = await service.createCase('detonate');
    const entry = await service.addDetonation(created.id, {
      url: 'https://evil.example',
      container: 'Wadjet throwaway ab12',
      cookieStoreId: 'firefox-container-9',
    });
    expect(entry.kind).toBe('detonation');
    expect(entry.url).toBe('https://evil.example');
    expect(entry.container).toBe('Wadjet throwaway ab12');
  });

  it('refuses a closed case', async () => {
    const created = await service.createCase('detonate');
    await service.closeCase(created.id);
    await expect(
      service.addDetonation(created.id, {
        url: 'https://evil.example',
        container: 'c',
        cookieStoreId: 's',
      }),
    ).rejects.toBeInstanceOf(CaseClosedError);
  });
});

describe('CaseService — page analysis', () => {
  let service: CaseService;

  beforeEach(() => {
    service = makeService();
  });

  it('records a page analysis against an open case', async () => {
    const created = await service.createCase('analyze');
    const entry = await service.addPageAnalysis(created.id, {
      url: 'https://example.com',
      findings: [{ header: 'Content-Security-Policy', status: 'missing', detail: 'No CSP.' }],
      tls: null,
    });
    expect(entry.kind).toBe('page-analysis');
    expect(entry.url).toBe('https://example.com');
    expect(entry.findings).toHaveLength(1);
    expect(entry.tls).toBeNull();
  });

  it('refuses a closed case', async () => {
    const created = await service.createCase('analyze');
    await service.closeCase(created.id);
    await expect(
      service.addPageAnalysis(created.id, { url: 'https://x', findings: [], tls: null }),
    ).rejects.toBeInstanceOf(CaseClosedError);
  });
});
