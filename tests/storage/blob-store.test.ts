import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IdbBlobStore } from '../../src/core/storage/blob-store';
import { DB_NAME, openWadjetDb, type WadjetDB } from '../../src/core/storage/database';

function bufferOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe('IdbBlobStore', () => {
  let db: WadjetDB;
  let store: IdbBlobStore;

  beforeEach(async () => {
    db = await openWadjetDb();
    store = new IdbBlobStore(db);
  });

  afterEach(async () => {
    db.close();
    await deleteDB(DB_NAME);
  });

  it('stores a payload and returns a SHA-256 reference', async () => {
    const ref = await store.put(bufferOf('hello'), 'text/plain');
    expect(ref.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(ref.mediaType).toBe('text/plain');
    expect(ref.byteLength).toBe(5);
  });

  it('round-trips the stored bytes', async () => {
    const ref = await store.put(bufferOf('payload'), 'application/octet-stream');
    const fetched = await store.get(ref.hash);
    expect(fetched).toBeDefined();
    expect(new TextDecoder().decode(fetched!.data)).toBe('payload');
    expect(fetched!.ref).toEqual(ref);
  });

  it('is content-addressed: identical payloads share a hash', async () => {
    const a = await store.put(bufferOf('same'), 'text/plain');
    const b = await store.put(bufferOf('same'), 'text/plain');
    expect(a.hash).toBe(b.hash);
  });

  it('gives different hashes for different payloads', async () => {
    const a = await store.put(bufferOf('one'), 'text/plain');
    const b = await store.put(bufferOf('two'), 'text/plain');
    expect(a.hash).not.toBe(b.hash);
  });

  it('returns undefined for an unknown hash', async () => {
    expect(await store.get('deadbeef')).toBeUndefined();
  });
});
