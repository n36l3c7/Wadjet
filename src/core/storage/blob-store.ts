/**
 * {@link BlobStore} backed by IndexedDB, content-addressed by SHA-256.
 *
 * Identical payloads collapse to a single record, and a reference is just a
 * hash — cheap to embed in a case entry without duplicating bytes on the
 * timeline. No producer writes blobs in Wave 1; the store exists so the case
 * model can carry binary evidence (screenshots, response bodies) in later
 * waves without a schema migration.
 *
 * @module
 */
import type { WadjetDB } from './database';
import type { BlobRef, BlobStore } from './types';

/** Compute the lowercase hex SHA-256 of a buffer. */
async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** {@link BlobStore} implementation over the Wadjet IndexedDB database. */
export class IdbBlobStore implements BlobStore {
  readonly #db: WadjetDB;

  constructor(db: WadjetDB) {
    this.#db = db;
  }

  async put(data: ArrayBuffer, mediaType: string): Promise<BlobRef> {
    const hash = await sha256Hex(data);
    const ref: BlobRef = { hash, mediaType, byteLength: data.byteLength };
    // Content-addressed: re-storing an identical payload is a harmless no-op.
    await this.#db.put('blobs', { ...ref, data });
    return ref;
  }

  async get(hash: string): Promise<{ ref: BlobRef; data: ArrayBuffer } | undefined> {
    const stored = await this.#db.get('blobs', hash);
    if (stored === undefined) return undefined;
    const { data, ...ref } = stored;
    return { ref, data };
  }
}
