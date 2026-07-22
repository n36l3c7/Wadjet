/**
 * IndexedDB database definition shared by the content and blob stores.
 *
 * A single database with two object stores keeps schema upgrades in one place:
 *
 * - `entries` — {@link CaseEntry} records keyed by `id`, with a compound index
 *   `[caseId, timestamp]` for time-ordered retrieval per case.
 * - `blobs` — content-addressed binary payloads keyed by SHA-256 hash.
 * - `enrichment_cache` — cached provider results keyed by `provider:indicator`.
 *
 * @module
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CaseEntry } from '../case/types';
import type { EnrichmentResult } from '../enrich/types';

/** IndexedDB database name. */
export const DB_NAME = 'wadjet';

/** IndexedDB schema version; bump when the object-store layout changes. */
export const DB_VERSION = 2;

/** A binary payload as persisted in the `blobs` object store. */
export interface StoredBlob {
  readonly hash: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly data: ArrayBuffer;
}

/** A cached enrichment result with its expiry. */
export interface CachedEnrichment {
  /** Cache key: `${provider}:${indicator}`. */
  readonly key: string;
  readonly result: EnrichmentResult;
  /** Epoch milliseconds after which the entry is stale. */
  readonly expiresAt: number;
}

/** Typed IndexedDB schema for the Wadjet database. */
export interface WadjetDBSchema extends DBSchema {
  entries: {
    key: string;
    value: CaseEntry;
    indexes: { 'by-case-timestamp': [string, number] };
  };
  blobs: {
    key: string;
    value: StoredBlob;
  };
  enrichment_cache: {
    key: string;
    value: CachedEnrichment;
  };
}

/** An open handle to the Wadjet IndexedDB database. */
export type WadjetDB = IDBPDatabase<WadjetDBSchema>;

/** Name of the compound index used to list entries per case in time order. */
export const ENTRIES_BY_CASE_TIMESTAMP = 'by-case-timestamp';

/**
 * Open (creating or upgrading as needed) the Wadjet IndexedDB database.
 *
 * @returns A promise resolving to the open database handle.
 */
export function openWadjetDb(): Promise<WadjetDB> {
  return openDB<WadjetDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex(ENTRIES_BY_CASE_TIMESTAMP, ['caseId', 'timestamp']);
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'hash' });
      }
      if (!db.objectStoreNames.contains('enrichment_cache')) {
        db.createObjectStore('enrichment_cache', { keyPath: 'key' });
      }
    },
  });
}
