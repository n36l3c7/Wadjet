/**
 * Correlates the sequence of `webRequest` events for a single request into one
 * assembled record.
 *
 * The browser reports a request as several events sharing a `requestId`
 * (start → request headers → response headers → zero or more redirects →
 * completed/error). This tracker accumulates that lifecycle in memory and, on
 * the terminal event, produces a {@link CapturedRequest} with sensitive headers
 * already redacted.
 *
 * The logic is pure and browser-free — the background layer normalizes real
 * `webRequest` details into the event shapes below and feeds them in — so it is
 * fully unit-testable. In-memory state is transient: if the request never
 * terminates (e.g. the background context unloads mid-flight), the partial
 * record is simply dropped, never persisted.
 *
 * @module
 */
import type { HttpHeader, RedirectHop, RequestOutcome, RequestTimings } from '../case/types';
import { redactHeaders, type RawHeader } from './redaction';

/**
 * An assembled request, before it is wrapped into a `CaseEntry` (the case
 * service adds `id`, `caseId`, `kind` and `tags`). Header values are already
 * redacted per the tracker's policy.
 */
export interface CapturedRequest {
  readonly method: string;
  readonly url: string;
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
  readonly sensitiveRetained: boolean;
}

/** Normalized `onBeforeRequest` event. */
export interface StartEvent {
  readonly requestId: string;
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly timeStamp: number;
}

/** Normalized `onSendHeaders` event. */
export interface RequestHeadersEvent {
  readonly requestId: string;
  readonly requestHeaders: readonly RawHeader[];
  readonly timeStamp: number;
}

/** Normalized `onHeadersReceived` event. */
export interface ResponseHeadersEvent {
  readonly requestId: string;
  readonly statusCode: number;
  readonly responseHeaders: readonly RawHeader[];
  readonly timeStamp: number;
}

/** Normalized `onBeforeRedirect` event. */
export interface RedirectEvent {
  readonly requestId: string;
  readonly url: string;
  readonly redirectUrl: string;
  readonly statusCode: number;
  readonly timeStamp: number;
}

/** Normalized `onCompleted` event. */
export interface CompletedEvent {
  readonly requestId: string;
  readonly statusCode: number;
  readonly fromCache: boolean;
  readonly remoteIp: string | null;
  readonly responseHeaders: readonly RawHeader[];
  readonly timeStamp: number;
}

/** Normalized `onErrorOccurred` event. */
export interface ErrorEvent {
  readonly requestId: string;
  readonly error: string;
  readonly timeStamp: number;
}

interface InFlight {
  method: string;
  url: string;
  resourceType: string;
  requestHeaders: readonly RawHeader[];
  responseHeaders: readonly RawHeader[];
  statusCode: number | null;
  redirectChain: RedirectHop[];
  startedAt: number;
  responseStartedAt: number | null;
}

/** Injectable configuration for {@link RequestTracker}. */
export interface RequestTrackerOptions {
  /** When true, sensitive header values are retained raw (analyst opt-in). */
  readonly retainSensitive: boolean;
  /** Optional override of the sensitive-header denylist. */
  readonly denylist?: ReadonlySet<string>;
}

/** Accumulates per-request `webRequest` events and finalizes captured records. */
export class RequestTracker {
  readonly #inFlight = new Map<string, InFlight>();
  readonly #retainSensitive: boolean;
  readonly #denylist: ReadonlySet<string> | undefined;

  constructor(options: RequestTrackerOptions) {
    this.#retainSensitive = options.retainSensitive;
    this.#denylist = options.denylist;
  }

  /** Number of requests currently mid-flight (for diagnostics/tests). */
  get pending(): number {
    return this.#inFlight.size;
  }

  onStart(event: StartEvent): void {
    this.#inFlight.set(event.requestId, {
      method: event.method,
      url: event.url,
      resourceType: event.resourceType,
      requestHeaders: [],
      responseHeaders: [],
      statusCode: null,
      redirectChain: [],
      startedAt: event.timeStamp,
      responseStartedAt: null,
    });
  }

  onRequestHeaders(event: RequestHeadersEvent): void {
    const flight = this.#inFlight.get(event.requestId);
    if (flight) flight.requestHeaders = event.requestHeaders;
  }

  onResponseHeaders(event: ResponseHeadersEvent): void {
    const flight = this.#inFlight.get(event.requestId);
    if (!flight) return;
    flight.responseHeaders = event.responseHeaders;
    flight.statusCode = event.statusCode;
    flight.responseStartedAt ??= event.timeStamp;
  }

  onRedirect(event: RedirectEvent): void {
    const flight = this.#inFlight.get(event.requestId);
    if (!flight) return;
    flight.redirectChain.push({
      fromUrl: event.url,
      toUrl: event.redirectUrl,
      statusCode: event.statusCode,
      timestamp: event.timeStamp,
    });
  }

  /** Finalize a completed request, or `undefined` if its start was missed. */
  onCompleted(event: CompletedEvent): CapturedRequest | undefined {
    const flight = this.#take(event.requestId);
    if (!flight) return undefined;
    flight.statusCode = event.statusCode;
    if (event.responseHeaders.length > 0) flight.responseHeaders = event.responseHeaders;
    return this.#finalize(flight, {
      outcome: 'completed',
      error: null,
      fromCache: event.fromCache,
      remoteIp: event.remoteIp,
      completedAt: event.timeStamp,
    });
  }

  /** Finalize a failed request, or `undefined` if its start was missed. */
  onError(event: ErrorEvent): CapturedRequest | undefined {
    const flight = this.#take(event.requestId);
    if (!flight) return undefined;
    return this.#finalize(flight, {
      outcome: 'error',
      error: event.error,
      fromCache: false,
      remoteIp: null,
      completedAt: event.timeStamp,
    });
  }

  #take(requestId: string): InFlight | undefined {
    const flight = this.#inFlight.get(requestId);
    if (flight) this.#inFlight.delete(requestId);
    return flight;
  }

  #finalize(
    flight: InFlight,
    end: {
      outcome: RequestOutcome;
      error: string | null;
      fromCache: boolean;
      remoteIp: string | null;
      completedAt: number;
    },
  ): CapturedRequest {
    const redaction = { retainSensitive: this.#retainSensitive, denylist: this.#denylist };
    return {
      method: flight.method,
      url: flight.url,
      resourceType: flight.resourceType,
      statusCode: flight.statusCode,
      fromCache: end.fromCache,
      remoteIp: end.remoteIp,
      requestHeaders: redactHeaders(flight.requestHeaders, redaction),
      responseHeaders: redactHeaders(flight.responseHeaders, redaction),
      redirectChain: flight.redirectChain,
      timings: {
        startedAt: flight.startedAt,
        responseStartedAt: flight.responseStartedAt,
        completedAt: end.completedAt,
      },
      outcome: end.outcome,
      error: end.error,
      sensitiveRetained: this.#retainSensitive,
    };
  }
}
