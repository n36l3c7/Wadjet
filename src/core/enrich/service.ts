/**
 * Enrichment orchestration.
 *
 * Classifies an indicator, then queries every provider that (a) supports the
 * indicator type and (b) has an API key configured — cache first, then the
 * network, honouring a per-provider rate limit. Everything is injected (the
 * providers, cache, key lookup, permission check, HTTP, clock), so the
 * orchestration is unit-testable without touching the network.
 *
 * The design is offline-safe: a cache hit needs no network, and a failed or
 * rate-limited request yields an explanatory result rather than throwing.
 *
 * @module
 */
import { classifyIndicator, type IndicatorType } from './indicator';
import type { TokenBucket } from './rate-limit';
import type { EnrichmentCache } from './cache';
import type { EnrichmentProvider, EnrichmentResult, ProviderId } from './types';

/** The outcome of enriching one indicator. */
export interface LookupOutcome {
  /** The normalized indicator (or the trimmed input if unclassifiable). */
  readonly indicator: string;
  /** The classified type, or null if nothing matched. */
  readonly indicatorType: IndicatorType | null;
  /** One result per queried provider. */
  readonly results: EnrichmentResult[];
}

/** Injectable dependencies for {@link EnrichmentService}. */
export interface EnrichmentServiceDeps {
  readonly providers: readonly EnrichmentProvider[];
  readonly cache: EnrichmentCache;
  /** Resolve a provider's configured API key, or null if unset. */
  readonly getApiKey: (id: ProviderId) => Promise<string | null>;
  /** Whether the host permission for an origin is granted. */
  readonly hasPermission: (origin: string) => Promise<boolean>;
  /** Perform an HTTP GET and return status + parsed JSON body. */
  readonly fetchJson: (
    url: string,
    headers: Record<string, string>,
  ) => Promise<{ status: number; body: unknown }>;
  /** Provide the rate-limiter bucket for a provider. */
  readonly rateLimiterFor: (id: ProviderId) => TokenBucket;
  readonly now?: () => number;
  /** Cache TTL in milliseconds; defaults to 24 hours. */
  readonly cacheTtlMs?: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Orchestrates per-provider enrichment lookups. */
export class EnrichmentService {
  readonly #providers: readonly EnrichmentProvider[];
  readonly #cache: EnrichmentCache;
  readonly #getApiKey: (id: ProviderId) => Promise<string | null>;
  readonly #hasPermission: (origin: string) => Promise<boolean>;
  readonly #fetchJson: (
    url: string,
    headers: Record<string, string>,
  ) => Promise<{ status: number; body: unknown }>;
  readonly #rateLimiterFor: (id: ProviderId) => TokenBucket;
  readonly #now: () => number;
  readonly #ttl: number;

  constructor(deps: EnrichmentServiceDeps) {
    this.#providers = deps.providers;
    this.#cache = deps.cache;
    this.#getApiKey = deps.getApiKey;
    this.#hasPermission = deps.hasPermission;
    this.#fetchJson = deps.fetchJson;
    this.#rateLimiterFor = deps.rateLimiterFor;
    this.#now = deps.now ?? (() => Date.now());
    this.#ttl = deps.cacheTtlMs ?? DEFAULT_TTL_MS;
  }

  /** Enrich a raw indicator across all configured, supporting providers. */
  async lookup(raw: string): Promise<LookupOutcome> {
    const classified = classifyIndicator(raw);
    if (classified === null) {
      return { indicator: raw.trim(), indicatorType: null, results: [] };
    }
    const { type, value } = classified;
    const results: EnrichmentResult[] = [];

    for (const provider of this.#providers) {
      if (!provider.supports(type)) continue;
      const apiKey = await this.#getApiKey(provider.id);
      if (apiKey === null || apiKey === '') continue;

      const cached = await this.#cache.get(provider.id, value, this.#now());
      if (cached !== undefined) {
        results.push(cached);
        continue;
      }

      if (!(await this.#hasPermission(provider.origin))) {
        results.push(this.#failure(provider.id, value, type, 'Host permission not granted.'));
        continue;
      }

      if (!this.#rateLimiterFor(provider.id).tryTake()) {
        results.push(
          this.#failure(provider.id, value, type, 'Rate limit reached; try again shortly.'),
        );
        continue;
      }

      results.push(await this.#query(provider, value, type, apiKey));
    }

    return { indicator: value, indicatorType: type, results };
  }

  async #query(
    provider: EnrichmentProvider,
    indicator: string,
    type: IndicatorType,
    apiKey: string,
  ): Promise<EnrichmentResult> {
    try {
      const request = provider.buildRequest(indicator, type, apiKey);
      const { status, body } = await this.#fetchJson(request.url, request.headers);
      const parsed = provider.parse(indicator, type, status, body);
      const result: EnrichmentResult = {
        provider: provider.id,
        indicator,
        indicatorType: type,
        fetchedAt: this.#now(),
        ...parsed,
      };
      if (parsed.ok) await this.#cache.put(result, this.#ttl);
      return result;
    } catch {
      return this.#failure(provider.id, indicator, type, 'Request failed (offline or blocked).');
    }
  }

  #failure(
    provider: ProviderId,
    indicator: string,
    type: IndicatorType,
    message: string,
  ): EnrichmentResult {
    return {
      provider,
      indicator,
      indicatorType: type,
      fetchedAt: this.#now(),
      ok: false,
      summary: message,
      facts: [],
      link: null,
    };
  }
}
