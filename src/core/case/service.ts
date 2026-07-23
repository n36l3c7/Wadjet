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
import type { SecurityHeaderFinding, TlsInfo } from '../analysis/types';
import type { EnrichmentResult } from '../enrich/types';
import type { ContentStore, EntryPage, EntryQuery, MetadataStore } from '../storage/types';
import type { ThreatSignal } from '../threat/types';
import type { CapturedRequest } from '../traffic/request-tracker';
import { normalizeTags } from './tags';
import {
  CASE_SCHEMA_VERSION,
  type Case,
  type CaseEntry,
  type DecodedArtifactEntry,
  type DetonationEntry,
  type EnrichmentEntry,
  type NoteEntry,
  type PageAnalysisEntry,
  type RequestEntry,
  type ThreatFindingEntry,
  type ToolResultEntry,
} from './types';

/** Maximum stored length of a decoded artifact's input or output, in characters. */
export const MAX_ARTIFACT_FIELD_CHARS = 16_384;

function capField(value: string): { value: string; truncated: boolean } {
  if (value.length <= MAX_ARTIFACT_FIELD_CHARS) return { value, truncated: false };
  return { value: value.slice(0, MAX_ARTIFACT_FIELD_CHARS), truncated: true };
}

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

  /** The case with `id`, or `undefined` if none exists. */
  async getCase(id: string): Promise<Case | undefined> {
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
   * Permanently delete a case and every entry belonging to it. If the deleted
   * case was the active one, the active pointer is cleared. This is
   * irreversible; entries and the case record are removed from storage.
   *
   * @param id - Target case id.
   * @returns The case record as it was just before deletion.
   * @throws {CaseNotFoundError} If no case has that id.
   */
  async deleteCase(id: string): Promise<Case> {
    const existing = await this.#metadata.getCase(id);
    if (existing === undefined) throw new CaseNotFoundError(id);

    await this.#content.deleteEntriesForCase(id);
    await this.#metadata.deleteCase(id);
    if ((await this.#metadata.getActiveCaseId()) === id) {
      await this.#metadata.setActiveCaseId(null);
    }
    return existing;
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

  /**
   * Persist a captured HTTP request against an open case.
   *
   * Called by traffic capture in the background. Header redaction has already
   * happened in the tracker; this method only wraps the record into an entry.
   *
   * @throws {CaseNotFoundError} If the case does not exist.
   * @throws {CaseClosedError} If the case is closed.
   */
  async addRequest(caseId: string, captured: CapturedRequest): Promise<RequestEntry> {
    const target = await this.#requireOpenCase(caseId);
    const entry: RequestEntry = {
      id: this.#newId(),
      caseId: target.id,
      kind: 'request',
      // Order requests on the timeline by when they started.
      timestamp: captured.timings.startedAt,
      tags: [],
      method: captured.method,
      url: captured.url,
      resourceType: captured.resourceType,
      statusCode: captured.statusCode,
      fromCache: captured.fromCache,
      remoteIp: captured.remoteIp,
      requestHeaders: captured.requestHeaders,
      responseHeaders: captured.responseHeaders,
      redirectChain: captured.redirectChain,
      timings: captured.timings,
      outcome: captured.outcome,
      error: captured.error,
      sensitiveRetained: captured.sensitiveRetained,
    };
    await this.#content.addEntry(entry);
    return entry;
  }

  /** All entries for a case, ordered by ascending timestamp. */
  async getTimeline(caseId: string): Promise<CaseEntry[]> {
    return this.#content.listEntries(caseId);
  }

  /**
   * Persist a decoded artifact against an open case. Input and output are capped
   * at {@link MAX_ARTIFACT_FIELD_CHARS}; `truncated` records whether either was.
   *
   * @throws {CaseNotFoundError} If the case does not exist.
   * @throws {CaseClosedError} If the case is closed.
   * @throws {EmptyValueError} If the decoder chain is empty.
   */
  async addDecodedArtifact(
    caseId: string,
    params: { input: string; chain: readonly string[]; output: string; sourceUrl: string | null },
  ): Promise<DecodedArtifactEntry> {
    const target = await this.#requireOpenCase(caseId);
    if (params.chain.length === 0) throw new EmptyValueError('Decoder chain');
    const input = capField(params.input);
    const output = capField(params.output);
    const entry: DecodedArtifactEntry = {
      id: this.#newId(),
      caseId: target.id,
      kind: 'decoded-artifact',
      timestamp: this.#now(),
      tags: [],
      input: input.value,
      chain: [...params.chain],
      output: output.value,
      sourceUrl: params.sourceUrl,
      truncated: input.truncated || output.truncated,
    };
    await this.#content.addEntry(entry);
    return entry;
  }

  /**
   * Persist an enrichment result set against an open case.
   *
   * @throws {CaseNotFoundError} If the case does not exist.
   * @throws {CaseClosedError} If the case is closed.
   * @throws {EmptyValueError} If there are no results to record.
   */
  async addEnrichment(
    caseId: string,
    params: { indicator: string; indicatorType: string; results: readonly EnrichmentResult[] },
  ): Promise<EnrichmentEntry> {
    const target = await this.#requireOpenCase(caseId);
    if (params.results.length === 0) throw new EmptyValueError('Enrichment results');
    const entry: EnrichmentEntry = {
      id: this.#newId(),
      caseId: target.id,
      kind: 'enrichment',
      timestamp: this.#now(),
      tags: [],
      indicator: params.indicator,
      indicatorType: params.indicatorType,
      results: [...params.results],
    };
    await this.#content.addEntry(entry);
    return entry;
  }

  /**
   * Record that a URL was detonated in a throwaway container, against an open
   * case.
   *
   * @throws {CaseNotFoundError} If the case does not exist.
   * @throws {CaseClosedError} If the case is closed.
   */
  async addDetonation(
    caseId: string,
    params: { url: string; container: string; cookieStoreId: string },
  ): Promise<DetonationEntry> {
    const target = await this.#requireOpenCase(caseId);
    const entry: DetonationEntry = {
      id: this.#newId(),
      caseId: target.id,
      kind: 'detonation',
      timestamp: this.#now(),
      tags: [],
      url: params.url,
      container: params.container,
      cookieStoreId: params.cookieStoreId,
    };
    await this.#content.addEntry(entry);
    return entry;
  }

  /**
   * Record a per-page analysis (security headers + optional TLS) against an open
   * case.
   *
   * @throws {CaseNotFoundError} If the case does not exist.
   * @throws {CaseClosedError} If the case is closed.
   */
  async addPageAnalysis(
    caseId: string,
    params: { url: string; findings: readonly SecurityHeaderFinding[]; tls: TlsInfo | null },
  ): Promise<PageAnalysisEntry> {
    const target = await this.#requireOpenCase(caseId);
    const entry: PageAnalysisEntry = {
      id: this.#newId(),
      caseId: target.id,
      kind: 'page-analysis',
      timestamp: this.#now(),
      tags: [],
      url: params.url,
      findings: [...params.findings],
      tls: params.tls,
    };
    await this.#content.addEntry(entry);
    return entry;
  }

  /**
   * Record the output of a local tool run by the native host against an open
   * case.
   *
   * @throws {CaseNotFoundError} If the case does not exist.
   * @throws {CaseClosedError} If the case is closed.
   */
  async addToolResult(
    caseId: string,
    params: { tool: string; input: string; output: string; exitCode: number },
  ): Promise<ToolResultEntry> {
    const target = await this.#requireOpenCase(caseId);
    const entry: ToolResultEntry = {
      id: this.#newId(),
      caseId: target.id,
      kind: 'tool-result',
      timestamp: this.#now(),
      tags: [],
      tool: params.tool,
      input: params.input,
      output: params.output,
      exitCode: params.exitCode,
    };
    await this.#content.addEntry(entry);
    return entry;
  }

  /**
   * Record a deterministic on-page threat finding (phishing / ClickFix) against
   * an open case, with any gated context (reputation results, domain age).
   *
   * @throws {CaseNotFoundError} If the case does not exist.
   * @throws {CaseClosedError} If the case is closed.
   * @throws {EmptyValueError} If there are no signals to record.
   */
  async addThreatFinding(
    caseId: string,
    params: {
      url: string;
      signals: readonly ThreatSignal[];
      enrichment: readonly EnrichmentResult[];
      domainAgeDays: number | null;
    },
  ): Promise<ThreatFindingEntry> {
    const target = await this.#requireOpenCase(caseId);
    if (params.signals.length === 0) throw new EmptyValueError('Threat signals');
    const entry: ThreatFindingEntry = {
      id: this.#newId(),
      caseId: target.id,
      kind: 'threat-finding',
      timestamp: this.#now(),
      tags: [],
      url: params.url,
      signals: [...params.signals],
      enrichment: [...params.enrichment],
      domainAgeDays: params.domainAgeDays,
    };
    await this.#content.addEntry(entry);
    return entry;
  }

  /** A newest-first, kind-filtered, paginated page of a case's entries. */
  async getEntries(caseId: string, query: EntryQuery): Promise<EntryPage> {
    return this.#content.queryEntries(caseId, query);
  }

  async #requireOpenCase(caseId: string): Promise<Case> {
    const target = await this.#metadata.getCase(caseId);
    if (target === undefined) throw new CaseNotFoundError(caseId);
    if (target.status === 'closed') throw new CaseClosedError(caseId);
    return target;
  }
}
