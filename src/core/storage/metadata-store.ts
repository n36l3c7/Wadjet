/**
 * {@link MetadataStore} backed by a `browser.storage.local`-shaped key/value
 * area.
 *
 * Case records are small and few, so they are held together under a single
 * `cases` key as a `{ [id]: Case }` map; the active-case pointer is a second
 * key. Read-modify-write of the whole map is acceptable at this scale and keeps
 * the metadata layer dependency-free.
 *
 * @module
 */
import { isCase } from '../case/schema';
import type { Case } from '../case/types';
import type { KeyValueArea, MetadataStore } from './types';

const CASES_KEY = 'cases';
const ACTIVE_CASE_KEY = 'activeCaseId';

/** {@link MetadataStore} implementation over a {@link KeyValueArea}. */
export class LocalMetadataStore implements MetadataStore {
  readonly #area: KeyValueArea;

  constructor(area: KeyValueArea) {
    this.#area = area;
  }

  async #readCaseMap(): Promise<Record<string, Case>> {
    const stored = await this.#area.get(CASES_KEY);
    const raw = stored[CASES_KEY];
    if (typeof raw !== 'object' || raw === null) {
      return {};
    }
    const result: Record<string, Case> = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isCase(value)) {
        result[id] = value;
      }
    }
    return result;
  }

  async listCases(): Promise<Case[]> {
    const map = await this.#readCaseMap();
    return Object.values(map);
  }

  async getCase(id: string): Promise<Case | undefined> {
    const map = await this.#readCaseMap();
    return map[id];
  }

  async putCase(value: Case): Promise<void> {
    const map = await this.#readCaseMap();
    map[value.id] = value;
    await this.#area.set({ [CASES_KEY]: map });
  }

  async deleteCase(id: string): Promise<void> {
    const map = await this.#readCaseMap();
    if (!(id in map)) return;
    delete map[id];
    await this.#area.set({ [CASES_KEY]: map });
  }

  async getActiveCaseId(): Promise<string | null> {
    const stored = await this.#area.get(ACTIVE_CASE_KEY);
    const value = stored[ACTIVE_CASE_KEY];
    return typeof value === 'string' ? value : null;
  }

  async setActiveCaseId(id: string | null): Promise<void> {
    if (id === null) {
      await this.#area.remove(ACTIVE_CASE_KEY);
      return;
    }
    await this.#area.set({ [ACTIVE_CASE_KEY]: id });
  }
}
