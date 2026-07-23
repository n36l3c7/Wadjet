/**
 * Types for on-page threat signals (phishing and ClickFix).
 *
 * Detection is deliberately **deterministic and individually explainable** (see
 * ADR 0020 and the project brief): every signal states exactly why it fired, and
 * there is no aggregate score or statistical/ML classification. UI surfaces show
 * the fired signals as-is; they never compute a verdict.
 *
 * @module
 */
import type { EnrichmentResult } from '../enrich/types';

/** How strongly a single signal points at a threat. Not a probability. */
export type ThreatSignalSeverity = 'info' | 'warn' | 'high';

/** The family of technique a signal belongs to. */
export type ThreatKind = 'phishing' | 'clickfix';

/**
 * One deterministic observation about a page. Each signal is self-contained: its
 * {@link explanation} quotes the concrete evidence that made it fire.
 */
export interface ThreatSignal {
  /** Stable slug identifying the check (e.g. `idn-homograph`). */
  readonly id: string;
  readonly kind: ThreatKind;
  readonly severity: ThreatSignalSeverity;
  /** Short human-readable label. */
  readonly title: string;
  /** Why this signal fired, referencing the specific evidence. */
  readonly explanation: string;
}

/**
 * Serializable facts a content script extracts from a live page and feeds to the
 * pure detectors. Keeping detection a function of this plain object makes it
 * fully unit-testable without a DOM.
 */
export interface PageContext {
  readonly url: string;
  readonly hostname: string;
  /** URL scheme including the trailing colon, e.g. `https:`. */
  readonly scheme: string;
  readonly title: string;
  /** Visible page text, bounded in length by the caller. */
  readonly text: string;
  /** Whether the page contains at least one password input. */
  readonly hasPasswordField: boolean;
  /** Resolved `action` URLs of forms that contain a password input. */
  readonly credentialFormActions: readonly string[];
}

/** Shared, serializable state of the on-page protection feature. */
export interface ThreatState {
  /** True when automatic on-page scanning is enabled. */
  readonly enabled: boolean;
  /** Whether the optional `<all_urls>` host permission is currently granted. */
  readonly hasHostPermission: boolean;
}

/**
 * Optional, gated context added on top of the local signals: reputation results
 * (only when providers are configured) and domain age (only when the native host
 * is available). Both may be empty/absent.
 */
export interface ThreatAugmentation {
  readonly enrichment: EnrichmentResult[];
  /** Age of the registrable domain in days, or null when unavailable. */
  readonly domainAgeDays: number | null;
}
