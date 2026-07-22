/**
 * Storage abstraction for Wadjet.
 *
 * The persistence strategy is deliberately split (see ADR 0003):
 *
 * - {@link MetadataStore} — small, frequently-read records (the case list, the
 *   active-case pointer) live in `browser.storage.local`.
 * - {@link ContentStore} — the potentially large, append-heavy stream of case
 *   entries lives in IndexedDB, indexed for time-ordered retrieval.
 * - {@link BlobStore} — opaque binary payloads (screenshots, response bodies in
 *   later waves) are content-addressed in IndexedDB and referenced by hash.
 *
 * Consumers depend on these interfaces, never on a concrete backend, so the
 * case service can be unit-tested against in-memory fakes.
 *
 * @module
 */
import type { Case, CaseEntry, CaseEntryKind } from '../case/types';

/**
 * Minimal key/value surface satisfied by `browser.storage.local`.
 *
 * Declaring only what {@link MetadataStore} needs keeps the dependency small
 * and trivially mockable in tests.
 */
export interface KeyValueArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** Persists case records and the active-case pointer. */
export interface MetadataStore {
  /** All known cases, in no particular order. */
  listCases(): Promise<Case[]>;
  /** The case with `id`, or `undefined` if none exists. */
  getCase(id: string): Promise<Case | undefined>;
  /** Insert or replace a case record. */
  putCase(value: Case): Promise<void>;
  /** Remove a case record. No-op if it does not exist. */
  deleteCase(id: string): Promise<void>;
  /** The active case id, or `null` when no case is active. */
  getActiveCaseId(): Promise<string | null>;
  /** Set (or clear, with `null`) the active case id. */
  setActiveCaseId(id: string | null): Promise<void>;
}

/**
 * A reverse-chronological, optionally kind-filtered page query over a case's
 * entries. Pagination uses a timestamp cursor rather than an offset so that
 * appends during browsing do not shift the page boundary.
 */
export interface EntryQuery {
  /** Restrict to these kinds; empty/absent means all kinds. */
  readonly kinds?: readonly CaseEntryKind[] | null;
  /** Maximum number of entries to return. */
  readonly limit: number;
  /** Return entries strictly older than this timestamp (the page cursor). */
  readonly before?: number | null;
}

/** A single page of entries, newest first. */
export interface EntryPage {
  readonly entries: CaseEntry[];
  /** True if matching entries older than this page exist. */
  readonly hasMore: boolean;
  /** Cursor for the next (older) page, or null when exhausted. */
  readonly nextBefore: number | null;
}

/** Persists the time-ordered stream of case entries. */
export interface ContentStore {
  /** Append an entry. */
  addEntry(entry: CaseEntry): Promise<void>;
  /** All entries for a case, ordered by ascending timestamp. */
  listEntries(caseId: string): Promise<CaseEntry[]>;
  /** A newest-first, kind-filtered, paginated page of a case's entries. */
  queryEntries(caseId: string, query: EntryQuery): Promise<EntryPage>;
  /** Remove every entry belonging to a case. */
  deleteEntriesForCase(caseId: string): Promise<void>;
}

/** A reference to a stored binary payload. */
export interface BlobRef {
  /** Lowercase hex SHA-256 of the payload; the store's primary key. */
  readonly hash: string;
  /** IANA media type describing the payload. */
  readonly mediaType: string;
  /** Payload size in bytes. */
  readonly byteLength: number;
}

/** Content-addressed store for opaque binary payloads. */
export interface BlobStore {
  /** Store `data`, returning a reference keyed by its content hash. */
  put(data: ArrayBuffer, mediaType: string): Promise<BlobRef>;
  /** Retrieve a payload by hash, or `undefined` if absent. */
  get(hash: string): Promise<{ ref: BlobRef; data: ArrayBuffer } | undefined>;
}
