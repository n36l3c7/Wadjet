/**
 * {@link ContentStore} backed by IndexedDB.
 *
 * Entries are retrieved per case in ascending timestamp order via the compound
 * `[caseId, timestamp]` index, so building a case timeline never requires a
 * full-store scan or an in-memory sort.
 *
 * @module
 */
import type { CaseEntry, CaseEntryKind } from '../case/types';
import { ENTRIES_BY_CASE_TIMESTAMP, type WadjetDB } from './database';
import type { ContentStore, EntryPage, EntryQuery } from './types';

/** {@link ContentStore} implementation over the Wadjet IndexedDB database. */
export class IdbContentStore implements ContentStore {
  readonly #db: WadjetDB;

  constructor(db: WadjetDB) {
    this.#db = db;
  }

  async addEntry(entry: CaseEntry): Promise<void> {
    await this.#db.add('entries', entry);
  }

  async listEntries(caseId: string): Promise<CaseEntry[]> {
    // A one-element lower bound sorts before every `[caseId, timestamp]` key,
    // and an upper bound with the maximum safe timestamp sorts after them all.
    const range = IDBKeyRange.bound([caseId], [caseId, Number.MAX_SAFE_INTEGER]);
    return this.#db.getAllFromIndex('entries', ENTRIES_BY_CASE_TIMESTAMP, range);
  }

  async queryEntries(caseId: string, query: EntryQuery): Promise<EntryPage> {
    const upperTimestamp = query.before ?? Number.MAX_SAFE_INTEGER;
    const excludeCursor = query.before != null;
    // Iterate the `[caseId, timestamp]` index descending (newest first). The
    // upper bound is the cursor timestamp (exclusive when paginating).
    const range = IDBKeyRange.bound([caseId], [caseId, upperTimestamp], false, excludeCursor);
    const kinds =
      query.kinds && query.kinds.length > 0 ? new Set<CaseEntryKind>(query.kinds) : null;
    const limit = Math.max(1, query.limit);

    const entries: CaseEntry[] = [];
    let hasMore = false;
    let nextBefore: number | null = null;

    const index = this.#db.transaction('entries').store.index(ENTRIES_BY_CASE_TIMESTAMP);
    for await (const cursor of index.iterate(range, 'prev')) {
      const entry = cursor.value;
      if (kinds && !kinds.has(entry.kind)) continue;
      if (entries.length >= limit) {
        hasMore = true;
        break;
      }
      entries.push(entry);
      nextBefore = entry.timestamp;
    }

    return { entries, hasMore, nextBefore: hasMore ? nextBefore : null };
  }

  async deleteEntriesForCase(caseId: string): Promise<void> {
    const range = IDBKeyRange.bound([caseId], [caseId, Number.MAX_SAFE_INTEGER]);
    const tx = this.#db.transaction('entries', 'readwrite');
    const index = tx.store.index(ENTRIES_BY_CASE_TIMESTAMP);
    for await (const cursor of index.iterate(range)) {
      await cursor.delete();
    }
    await tx.done;
  }
}
