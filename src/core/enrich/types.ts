/**
 * Enrichment provider abstraction and result shape.
 *
 * Each provider is queried independently and only when its API key is
 * configured; results are shown per provider and never merged into a single
 * score. Providers are pure at the edges — `buildRequest` and `parse` do no I/O
 * — so the {@link EnrichmentProvider} contract is unit-testable and the HTTP
 * call lives in one place (the enrichment service).
 *
 * @module
 */
import type { IndicatorType } from './indicator';

/** Identifier of an enrichment provider. */
export type ProviderId = 'virustotal' | 'otx' | 'abuseipdb';

/** A single labelled fact from a provider. */
export interface EnrichmentFact {
  readonly label: string;
  readonly value: string;
}

/**
 * A provider's own severity read for an indicator, derived deterministically
 * from that provider's data. It is never combined across providers into an
 * aggregate verdict — each card is coloured by its own provider only.
 */
export type Severity = 'clean' | 'suspicious' | 'malicious' | 'unknown';

/** The parsed content of a provider response (no envelope). */
export interface ProviderParse {
  /** Whether the lookup produced usable data (false for auth/errors). */
  readonly ok: boolean;
  /** One-line human summary (or an error message). */
  readonly summary: string;
  /** Key facts to display. */
  readonly facts: EnrichmentFact[];
  /** Provider permalink for the indicator, if any. */
  readonly link: string | null;
  /** This provider's own severity read (not an aggregate). */
  readonly severity: Severity;
}

/** A provider result, as stored on a case and shown in the UI. */
export interface EnrichmentResult extends ProviderParse {
  readonly provider: ProviderId;
  readonly indicator: string;
  readonly indicatorType: IndicatorType;
  /** Epoch milliseconds when the result was produced. */
  readonly fetchedAt: number;
}

/** An HTTP request a provider wants the service to make. */
export interface ProviderRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/** A pluggable enrichment provider. */
export interface EnrichmentProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Host-permission origin this provider needs (e.g. `https://host/*`). */
  readonly origin: string;
  /** Whether this provider can enrich the given indicator type. */
  supports(type: IndicatorType): boolean;
  /** Build the HTTP request for an indicator (pure). */
  buildRequest(indicator: string, type: IndicatorType, apiKey: string): ProviderRequest;
  /** Parse a response into displayable content (pure). */
  parse(indicator: string, type: IndicatorType, status: number, body: unknown): ProviderParse;
}
