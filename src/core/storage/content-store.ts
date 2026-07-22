/**
 * {@link ContentStore} backed by IndexedDB.
 *
 * Entries are retrieved per case in ascending timestamp order via the compound
 * `[caseId, timestamp]` index, so building a case timeline never requires a
 * full-store scan or an in-memory sort.
 *
 * @module
 */
import type { CaseEntry } from '../case/types';
import { ENTRIES_BY_CASE_TIMESTAMP, type WadjetDB } from './database';
import type { ContentStore } from './types';

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
