import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NoteEntry, RequestEntry } from '../../src/core/case/types';
import { IdbContentStore } from '../../src/core/storage/content-store';
import { DB_NAME, openWadjetDb, type WadjetDB } from '../../src/core/storage/database';

function note(id: string, caseId: string, timestamp: number): NoteEntry {
  return { id, caseId, kind: 'note', timestamp, tags: [], text: `note ${id}` };
}

function requestEntry(id: string, caseId: string, timestamp: number): RequestEntry {
  return {
    id,
    caseId,
    kind: 'request',
    timestamp,
    tags: [],
    method: 'GET',
    url: 'https://example.com',
    resourceType: 'main_frame',
    statusCode: 200,
    fromCache: false,
    remoteIp: null,
    requestHeaders: [],
    responseHeaders: [],
    redirectChain: [],
    timings: { startedAt: timestamp, responseStartedAt: null, completedAt: timestamp },
    outcome: 'completed',
    error: null,
    sensitiveRetained: false,
  };
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

  it('queries newest-first, kind-filtered and paginated', async () => {
    await store.addEntry(note('n1', 'c1', 1000));
    await store.addEntry(requestEntry('r1', 'c1', 2000));
    await store.addEntry(requestEntry('r2', 'c1', 3000));

    const requests = await store.queryEntries('c1', {
      kinds: ['request'],
      limit: 10,
      before: null,
    });
    expect(requests.entries.map((e) => e.id)).toEqual(['r2', 'r1']);

    const all = await store.queryEntries('c1', { kinds: null, limit: 10, before: null });
    expect(all.entries.map((e) => e.id)).toEqual(['r2', 'r1', 'n1']);
    expect(all.hasMore).toBe(false);

    const page1 = await store.queryEntries('c1', { kinds: null, limit: 2, before: null });
    expect(page1.entries.map((e) => e.id)).toEqual(['r2', 'r1']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextBefore).toBe(2000);

    const page2 = await store.queryEntries('c1', {
      kinds: null,
      limit: 2,
      before: page1.nextBefore,
    });
    expect(page2.entries.map((e) => e.id)).toEqual(['n1']);
    expect(page2.hasMore).toBe(false);
  });
});
