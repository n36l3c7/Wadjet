/**
 * Core domain types for the Wadjet case model.
 *
 * A **case** is the container every artifact an analyst touches is bound to.
 * Everything else in the model is a {@link CaseEntry}: a timestamped record that
 * belongs to exactly one case and appears on its timeline.
 *
 * @module
 */

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
 * Wave 1 added `note`; Wave 2 adds `request`. Later waves extend this union
 * further (`decoded-artifact`, `enrichment`, `screenshot`, `detonation`); the
 * discriminated-union design keeps timeline, tagging and export code agnostic to
 * which kinds exist.
 */
export type CaseEntryKind = 'note' | 'request';

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
 * Any entry attached to a case. A discriminated union over {@link CaseEntryKind};
 * narrow on `kind` to reach kind-specific fields.
 */
export type CaseEntry = NoteEntry | RequestEntry;
