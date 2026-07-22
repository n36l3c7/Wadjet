/**
 * Core domain types for the Wadjet case model.
 *
 * A **case** is the container every artifact an analyst touches is bound to.
 * Everything else in the model is a {@link CaseEntry}: a timestamped record that
 * belongs to exactly one case and appears on its timeline.
 *
 * @module
 */
import type { SecurityHeaderFinding, TlsInfo } from '../analysis/types';
import type { EnrichmentResult } from '../enrich/types';

/**
 * Schema version of the case data model written by this build.
 *
 * Persisted records carry the version they were written with so later waves can
 * migrate rather than guess. Bump this whenever the on-disk shape changes.
 */
export const CASE_SCHEMA_VERSION = 1;

/** Lifecycle state of a case. */
export type CaseStatus = 'open' | 'closed';

/** An investigation case: the unit of context everything is attached to. */
export interface Case {
  readonly id: string;
  /** Human-readable label chosen by the analyst. */
  name: string;
  status: CaseStatus;
  /** Epoch milliseconds when the case was created. */
  readonly createdAt: number;
  /** Epoch milliseconds when the case was closed, or `null` while open. */
  closedAt: number | null;
  /** Free-form labels applied to the whole case. */
  tags: string[];
  /** Schema version the record was written with; see {@link CASE_SCHEMA_VERSION}. */
  readonly schemaVersion: number;
}

/**
 * Discriminant identifying the concrete shape of a {@link CaseEntry}.
 *
 * Wave 1 added `note`; Wave 2 added `request`; Wave 3 added `decoded-artifact`;
 * Wave 4 added `enrichment`; Wave 5 added `detonation`; Wave 7 added
 * `page-analysis`; Wave 8 adds `tool-result`. The discriminated-union design
 * keeps timeline, tagging and export code agnostic to which kinds exist.
 */
export type CaseEntryKind =
  | 'note'
  | 'request'
  | 'decoded-artifact'
  | 'enrichment'
  | 'detonation'
  | 'page-analysis'
  | 'tool-result';

/** Fields shared by every entry, regardless of {@link CaseEntryKind}. */
export interface CaseEntryBase {
  readonly id: string;
  readonly caseId: string;
  readonly kind: CaseEntryKind;
  /** Epoch milliseconds; the timeline is ordered by this value. */
  readonly timestamp: number;
  /** Free-form labels applied to this entry. */
  tags: string[];
}

/** A free-text observation recorded by the analyst. */
export interface NoteEntry extends CaseEntryBase {
  readonly kind: 'note';
  text: string;
}

/**
 * A single HTTP header. When {@link redacted} is true, {@link value} holds a
 * placeholder rather than the original: sensitive values are masked at capture
 * time and never persisted in the clear (see the traffic redaction module).
 */
export interface HttpHeader {
  readonly name: string;
  readonly value: string;
  readonly redacted: boolean;
}

/** One hop in an HTTP redirect chain. */
export interface RedirectHop {
  readonly fromUrl: string;
  readonly toUrl: string;
  readonly statusCode: number | null;
  /** Epoch milliseconds when the redirect was observed. */
  readonly timestamp: number;
}

/** Coarse timing markers for a captured request (epoch milliseconds). */
export interface RequestTimings {
  readonly startedAt: number;
  readonly responseStartedAt: number | null;
  readonly completedAt: number | null;
}

/** How a captured request ended. */
export type RequestOutcome = 'completed' | 'error';

/**
 * A single HTTP(S) request observed by traffic capture and bound to a case.
 *
 * Bodies are intentionally absent in this schema — Wave 2 captures metadata and
 * headers only. Header values that match the sensitive-header denylist are
 * redacted before persistence unless the capturing session explicitly opted to
 * retain them ({@link sensitiveRetained}).
 */
export interface RequestEntry extends CaseEntryBase {
  readonly kind: 'request';
  readonly method: string;
  readonly url: string;
  /** WebExtension resource type (e.g. `main_frame`, `xmlhttprequest`). */
  readonly resourceType: string;
  readonly statusCode: number | null;
  readonly fromCache: boolean;
  readonly remoteIp: string | null;
  readonly requestHeaders: HttpHeader[];
  readonly responseHeaders: HttpHeader[];
  readonly redirectChain: RedirectHop[];
  readonly timings: RequestTimings;
  readonly outcome: RequestOutcome;
  readonly error: string | null;
  /** True when sensitive header values were kept raw by explicit opt-in. */
  readonly sensitiveRetained: boolean;
}

/**
 * A decoded artifact: text the analyst decoded inline, with the chain of
 * decoders applied. Input and output are size-capped ({@link truncated} records
 * whether either was cut). Decoded content may itself be sensitive (e.g. JWT
 * claims) — it is stored because decoding it was a deliberate analyst action.
 */
export interface DecodedArtifactEntry extends CaseEntryBase {
  readonly kind: 'decoded-artifact';
  /** The original selected text (possibly truncated). */
  readonly input: string;
  /** Decoder ids applied in order, e.g. `['base64', 'url']`. */
  readonly chain: string[];
  /** The final decoded output (possibly truncated). */
  readonly output: string;
  /** URL of the page the selection came from, if known. */
  readonly sourceUrl: string | null;
  /** True if `input` or `output` was capped for storage. */
  readonly truncated: boolean;
}

/**
 * On-demand enrichment of an indicator (domain, IP, hash, URL) from one or more
 * providers. Results are stored per provider and never merged into a single
 * score — Wadjet surfaces each provider's facts, it does not compute a verdict.
 */
export interface EnrichmentEntry extends CaseEntryBase {
  readonly kind: 'enrichment';
  readonly indicator: string;
  readonly indicatorType: string;
  readonly results: EnrichmentResult[];
}

/**
 * A record that a URL was opened in a throwaway `contextualIdentities`
 * container. This isolates cookies and storage only — it is **not** a network,
 * process, or exploit sandbox; the page still runs in the analyst's Firefox.
 */
export interface DetonationEntry extends CaseEntryBase {
  readonly kind: 'detonation';
  readonly url: string;
  /** Human-readable throwaway container name. */
  readonly container: string;
  /** The container's cookie store id. */
  readonly cookieStoreId: string;
}

/**
 * Per-page analysis captured from the DevTools panel: the deterministic
 * security-header findings for a page and, when available, its TLS/certificate
 * information.
 */
export interface PageAnalysisEntry extends CaseEntryBase {
  readonly kind: 'page-analysis';
  readonly url: string;
  readonly findings: SecurityHeaderFinding[];
  readonly tls: TlsInfo | null;
}

/**
 * The output of a local tool run by the optional native host (e.g. `whois`,
 * `exiftool`, `yara`), attached to the case.
 */
export interface ToolResultEntry extends CaseEntryBase {
  readonly kind: 'tool-result';
  readonly tool: string;
  readonly input: string;
  readonly output: string;
  readonly exitCode: number;
}

/**
 * Any entry attached to a case. A discriminated union over {@link CaseEntryKind};
 * narrow on `kind` to reach kind-specific fields.
 */
export type CaseEntry =
  | NoteEntry
  | RequestEntry
  | DecodedArtifactEntry
  | EnrichmentEntry
  | DetonationEntry
  | PageAnalysisEntry
  | ToolResultEntry;
