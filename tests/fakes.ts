/**
 * In-memory test doubles for the storage interfaces.
 *
 * These let the case service be tested as pure logic, without IndexedDB or the
 * `browser` API.
 */
import type { CaseEntry } from '../src/core/case/types';
import type { ContentStore, KeyValueArea } from '../src/core/storage/types';

/** In-memory {@link KeyValueArea} mimicking `browser.storage.local` semantics. */
export class InMemoryKeyValueArea implements KeyValueArea {
  readonly #data = new Map<string, unknown>();

  get(keys: string | string[]): Promise<Record<string, unknown>> {
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const key of list) {
      if (this.#data.has(key)) {
        out[key] = this.#data.get(key);
      }
    }
    return Promise.resolve(out);
  }

  set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) {
      // structuredClone mirrors the serialization boundary of real storage.
      this.#data.set(key, structuredClone(value));
    }
    return Promise.resolve();
  }

  remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      this.#data.delete(key);
    }
    return Promise.resolve();
  }
}

/** In-memory {@link ContentStore}. */
export class InMemoryContentStore implements ContentStore {
  #entries: CaseEntry[] = [];

  addEntry(entry: CaseEntry): Promise<void> {
    this.#entries.push(structuredClone(entry));
    return Promise.resolve();
  }

  listEntries(caseId: string): Promise<CaseEntry[]> {
    const result = this.#entries
      .filter((entry) => entry.caseId === caseId)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => structuredClone(entry));
    return Promise.resolve(result);
  }

  deleteEntriesForCase(caseId: string): Promise<void> {
    this.#entries = this.#entries.filter((entry) => entry.caseId !== caseId);
    return Promise.resolve();
  }
}

/** A deterministic id generator: `id-1`, `id-2`, … */
export function sequentialIds(): () => string {
  let counter = 0;
  return () => `id-${String(++counter)}`;
}

/** A deterministic clock starting at `start`, advancing `step` ms per call. */
export function steppingClock(start = 1_000, step = 1_000): () => number {
  let current = start - step;
  return () => (current += step);
}
