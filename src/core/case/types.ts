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
 * Wave 1 produces only `note` entries. Later waves extend this union
 * (`request`, `decoded-artifact`, `enrichment`, `screenshot`, `detonation`);
 * the discriminated-union design keeps timeline, tagging and export code
 * agnostic to which kinds exist.
 */
export type CaseEntryKind = 'note';

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
 * Any entry attached to a case. A discriminated union over {@link CaseEntryKind};
 * narrow on `kind` to reach kind-specific fields.
 */
export type CaseEntry = NoteEntry;
