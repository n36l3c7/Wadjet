import { beforeEach, describe, expect, it } from 'vitest';
import type { EnrichmentCache } from '../../src/core/enrich/cache';
import { TokenBucket } from '../../src/core/enrich/rate-limit';
import { EnrichmentService, type EnrichmentServiceDeps } from '../../src/core/enrich/service';
import type { EnrichmentProvider, EnrichmentResult, ProviderId } from '../../src/core/enrich/types';

class InMemoryCache implements EnrichmentCache {
  readonly store = new Map<string, { result: EnrichmentResult; expiresAt: number }>();
  get(provider: ProviderId, indicator: string, now: number): Promise<EnrichmentResult | undefined> {
    const record = this.store.get(`${provider}:${indicator}`);
    return Promise.resolve(record && record.expiresAt > now ? record.result : undefined);
  }
  put(result: EnrichmentResult, ttlMs: number): Promise<void> {
    this.store.set(`${result.provider}:${result.indicator}`, {
      result,
      expiresAt: result.fetchedAt + ttlMs,
    });
    return Promise.resolve();
  }
}

function fakeProvider(id: ProviderId, supported: string): EnrichmentProvider {
  return {
    id,
    label: id,
    origin: `https://${id}/*`,
    supports: (type) => type === supported,
    buildRequest: (indicator) => ({ url: `https://${id}/${indicator}`, headers: {} }),
    parse: (_indicator, _type, status) => ({
      ok: status === 200,
      summary: `status ${String(status)}`,
      facts: [],
      link: null,
    }),
  };
}

interface Harness {
  fetchCalls: number;
  service: EnrichmentService;
}

function makeService(overrides: Partial<EnrichmentServiceDeps> = {}): Harness {
  const harness = { fetchCalls: 0 } as Harness;
  const bucket = new TokenBucket({ capacity: 10, refillPerMinute: 600, now: () => 0 });
  const deps: EnrichmentServiceDeps = {
    providers: [fakeProvider('virustotal', 'domain'), fakeProvider('abuseipdb', 'ip')],
    cache: new InMemoryCache(),
    getApiKey: () => Promise.resolve('KEY'),
    hasPermission: () => Promise.resolve(true),
    fetchJson: () => {
      harness.fetchCalls += 1;
      return Promise.resolve({ status: 200, body: {} });
    },
    rateLimiterFor: () => bucket,
    now: () => 1000,
    ...overrides,
  };
  harness.service = new EnrichmentService(deps);
  return harness;
}

describe('EnrichmentService', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeService();
  });

  it('queries only providers that support the indicator type', async () => {
    const outcome = await harness.service.lookup('example.com');
    expect(outcome.indicatorType).toBe('domain');
    expect(outcome.results.map((r) => r.provider)).toEqual(['virustotal']);
    expect(harness.fetchCalls).toBe(1);
  });

  it('returns nothing for an unclassifiable indicator', async () => {
    const outcome = await harness.service.lookup('not-an-indicator!!');
    expect(outcome.indicatorType).toBeNull();
    expect(outcome.results).toEqual([]);
    expect(harness.fetchCalls).toBe(0);
  });

  it('skips providers without a configured key', async () => {
    const local = makeService({ getApiKey: () => Promise.resolve(null) });
    const outcome = await local.service.lookup('example.com');
    expect(outcome.results).toEqual([]);
    expect(local.fetchCalls).toBe(0);
  });

  it('serves a cached result without fetching again', async () => {
    await harness.service.lookup('example.com');
    await harness.service.lookup('example.com');
    expect(harness.fetchCalls).toBe(1);
  });

  it('reports a failure when the host permission is missing', async () => {
    const local = makeService({ hasPermission: () => Promise.resolve(false) });
    const outcome = await local.service.lookup('example.com');
    expect(outcome.results[0]?.ok).toBe(false);
    expect(outcome.results[0]?.summary).toContain('permission');
    expect(local.fetchCalls).toBe(0);
  });

  it('reports a failure when rate limited', async () => {
    const bucket = new TokenBucket({ capacity: 1, refillPerMinute: 0, now: () => 0 });
    const local = makeService({ rateLimiterFor: () => bucket });
    const first = await local.service.lookup('a.example.com');
    expect(first.results[0]?.ok).toBe(true);
    const second = await local.service.lookup('b.example.com');
    expect(second.results[0]?.ok).toBe(false);
    expect(second.results[0]?.summary).toContain('Rate limit');
  });

  it('is offline-safe when the request throws', async () => {
    const local = makeService({
      fetchJson: () => Promise.reject(new Error('offline')),
    });
    const outcome = await local.service.lookup('example.com');
    expect(outcome.results[0]?.ok).toBe(false);
    expect(outcome.results[0]?.summary).toContain('offline');
  });
});
