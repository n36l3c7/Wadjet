/**
 * TTL cache for enrichment results.
 *
 * Keyed by `provider:indicator`. A hit within its TTL is served without hitting
 * the network, which keeps Wadjet within providers' rate limits and works
 * offline for indicators already seen.
 *
 * @module
 */
import type { WadjetDB } from '../storage/database';
import type { ProviderId } from './types';
import type { EnrichmentResult } from './types';

/** A TTL cache of provider results. */
export interface EnrichmentCache {
  /** A non-expired cached result for the indicator, or undefined. */
  get(provider: ProviderId, indicator: string, now: number): Promise<EnrichmentResult | undefined>;
  /** Cache a result for `ttlMs` from its `fetchedAt`. */
  put(result: EnrichmentResult, ttlMs: number): Promise<void>;
}

function cacheKey(provider: ProviderId, indicator: string): string {
  return `${provider}:${indicator}`;
}

/** {@link EnrichmentCache} backed by the Wadjet IndexedDB database. */
export class IdbEnrichmentCache implements EnrichmentCache {
  readonly #db: WadjetDB;

  constructor(db: WadjetDB) {
    this.#db = db;
  }

  async get(
    provider: ProviderId,
    indicator: string,
    now: number,
  ): Promise<EnrichmentResult | undefined> {
    const record = await this.#db.get('enrichment_cache', cacheKey(provider, indicator));
    if (record === undefined || record.expiresAt <= now) return undefined;
    return record.result;
  }

  async put(result: EnrichmentResult, ttlMs: number): Promise<void> {
    await this.#db.put('enrichment_cache', {
      key: cacheKey(result.provider, result.indicator),
      result,
      expiresAt: result.fetchedAt + ttlMs,
    });
  }
}
