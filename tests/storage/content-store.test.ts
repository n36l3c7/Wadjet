import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NoteEntry } from '../../src/core/case/types';
import { IdbContentStore } from '../../src/core/storage/content-store';
import { DB_NAME, openWadjetDb, type WadjetDB } from '../../src/core/storage/database';

function note(id: string, caseId: string, timestamp: number): NoteEntry {
  return { id, caseId, kind: 'note', timestamp, tags: [], text: `note ${id}` };
}

describe('IdbContentStore', () => {
  let db: WadjetDB;
  let store: IdbContentStore;

  beforeEach(async () => {
    db = await openWadjetDb();
    store = new IdbContentStore(db);
  });

  afterEach(async () => {
    db.close();
    await deleteDB(DB_NAME);
  });

  it('lists entries for a case ordered by ascending timestamp', async () => {
    await store.addEntry(note('e2', 'c1', 2000));
    await store.addEntry(note('e1', 'c1', 1000));
    await store.addEntry(note('e3', 'c1', 3000));

    const entries = await store.listEntries('c1');
    expect(entries.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('isolates entries by case', async () => {
    await store.addEntry(note('a', 'c1', 1000));
    await store.addEntry(note('b', 'c2', 1000));
    expect((await store.listEntries('c1')).map((e) => e.id)).toEqual(['a']);
    expect((await store.listEntries('c2')).map((e) => e.id)).toEqual(['b']);
  });

  it('returns an empty list for a case with no entries', async () => {
    expect(await store.listEntries('empty')).toEqual([]);
  });

  it('deletes all entries for a case only', async () => {
    await store.addEntry(note('a', 'c1', 1000));
    await store.addEntry(note('b', 'c1', 2000));
    await store.addEntry(note('c', 'c2', 1000));

    await store.deleteEntriesForCase('c1');
    expect(await store.listEntries('c1')).toEqual([]);
    expect((await store.listEntries('c2')).map((e) => e.id)).toEqual(['c']);
  });
});
