/**
 * The case service: the single source of truth for the case model.
 *
 * It owns every mutation of cases and entries and coordinates the metadata and
 * content stores. All dependencies are injected — the stores, plus a clock and
 * an id generator — so the service is deterministic and unit-testable against
 * in-memory fakes. In the extension it runs in the background context; UI
 * surfaces reach it through the typed message protocol.
 *
 * @module
 */
import type { ContentStore, MetadataStore } from '../storage/types';
import { normalizeTags } from './tags';
import { CASE_SCHEMA_VERSION, type Case, type CaseEntry, type NoteEntry } from './types';

/** Raised when an operation references a case id that does not exist. */
export class CaseNotFoundError extends Error {
  constructor(readonly caseId: string) {
    super(`No case with id "${caseId}".`);
    this.name = 'CaseNotFoundError';
  }
}

/** Raised when an entry is added to a case that is not open. */
export class CaseClosedError extends Error {
  constructor(readonly caseId: string) {
    super(`Case "${caseId}" is closed; reopen it before adding entries.`);
    this.name = 'CaseClosedError';
  }
}

/** Raised when a required text field is empty after trimming. */
export class EmptyValueError extends Error {
  constructor(field: string) {
    super(`${field} must not be empty.`);
    this.name = 'EmptyValueError';
  }
}

/** Injectable dependencies for {@link CaseService}. */
export interface CaseServiceDeps {
  readonly metadata: MetadataStore;
  readonly content: ContentStore;
  /** Clock returning epoch milliseconds; defaults to {@link Date.now}. */
  readonly now?: () => number;
  /** Unique id generator; defaults to {@link crypto.randomUUID}. */
  readonly newId?: () => string;
}

/** Coordinates all reads and writes of the case model. */
export class CaseService {
  readonly #metadata: MetadataStore;
  readonly #content: ContentStore;
  readonly #now: () => number;
  readonly #newId: () => string;

  constructor(deps: CaseServiceDeps) {
    this.#metadata = deps.metadata;
    this.#content = deps.content;
    this.#now = deps.now ?? (() => Date.now());
    this.#newId = deps.newId ?? (() => crypto.randomUUID());
  }

  /**
   * Create a new open case and make it the active case.
   *
   * @param name - Human-readable case label; must be non-empty.
   * @returns The created case.
   * @throws {EmptyValueError} If `name` is blank.
   */
  async createCase(name: string): Promise<Case> {
    const trimmed = name.trim();
    if (trimmed === '') throw new EmptyValueError('Case name');
    const now = this.#now();
    const created: Case = {
      id: this.#newId(),
      name: trimmed,
      status: 'open',
      createdAt: now,
      closedAt: null,
      tags: [],
      schemaVersion: CASE_SCHEMA_VERSION,
    };
    await this.#metadata.putCase(created);
    await this.#metadata.setActiveCaseId(created.id);
    return created;
  }

  /** All cases, most recently created first. */
  async listCases(): Promise<Case[]> {
    const cases = await this.#metadata.listCases();
    return cases.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** The active case, or `undefined` when none is active. */
  async getActiveCase(): Promise<Case | undefined> {
    const id = await this.#metadata.getActiveCaseId();
    if (id === null) return undefined;
    return this.#metadata.getCase(id);
  }

  /**
   * Make an existing case the active case.
   *
   * @throws {CaseNotFoundError} If no case has that id.
   */
  async openCase(id: string): Promise<Case> {
    const existing = await this.#metadata.getCase(id);
    if (existing === undefined) throw new CaseNotFoundError(id);
    await this.#metadata.setActiveCaseId(id);
    return existing;
  }

  /**
   * Close a case. Closing is idempotent and clears the active pointer if the
   * closed case was active. Entries are retained.
   *
   * @throws {CaseNotFoundError} If no case has that id.
   */
  async closeCase(id: string): Promise<Case> {
    const existing = await this.#metadata.getCase(id);
    if (existing === undefined) throw new CaseNotFoundError(id);
    if (existing.status === 'closed') return existing;

    const closed: Case = { ...existing, status: 'closed', closedAt: this.#now() };
    await this.#metadata.putCase(closed);
    if ((await this.#metadata.getActiveCaseId()) === id) {
      await this.#metadata.setActiveCaseId(null);
    }
    return closed;
  }

  /**
   * Append a free-text note to an open case.
   *
   * @param caseId - Target case; must exist and be open.
   * @param text - Note body; must be non-empty.
   * @param tags - Optional labels for the entry.
   * @returns The created entry.
   * @throws {CaseNotFoundError} If the case does not exist.
   * @throws {CaseClosedError} If the case is closed.
   * @throws {EmptyValueError} If `text` is blank.
   */
  async addNote(caseId: string, text: string, tags: readonly string[] = []): Promise<NoteEntry> {
    const target = await this.#requireOpenCase(caseId);
    const trimmed = text.trim();
    if (trimmed === '') throw new EmptyValueError('Note text');
    const entry: NoteEntry = {
      id: this.#newId(),
      caseId: target.id,
      kind: 'note',
      timestamp: this.#now(),
      tags: normalizeTags(tags),
      text: trimmed,
    };
    await this.#content.addEntry(entry);
    return entry;
  }

  /** All entries for a case, ordered by ascending timestamp. */
  async getTimeline(caseId: string): Promise<CaseEntry[]> {
    return this.#content.listEntries(caseId);
  }

  async #requireOpenCase(caseId: string): Promise<Case> {
    const target = await this.#metadata.getCase(caseId);
    if (target === undefined) throw new CaseNotFoundError(caseId);
    if (target.status === 'closed') throw new CaseClosedError(caseId);
    return target;
  }
}
