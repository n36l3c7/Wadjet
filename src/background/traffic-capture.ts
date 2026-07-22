/**
 * Traffic capture coordinator (background only).
 *
 * Registers non-blocking `webRequest` listeners, correlates each request's
 * events through a {@link RequestTracker}, and hands the finalized record to a
 * callback that persists it against the capturing case. Capture is a deliberate
 * action: it runs only while enabled and only for the case it was started on,
 * and it needs the optional `<all_urls>` host permission (requested from the
 * sidebar's user gesture before {@link start} is called).
 *
 * The enabled/case/retain choice is persisted so capture can be restored after
 * the background context is recycled ({@link init}). Note the event-page caveat:
 * if the background unloads while idle, a request arriving before the next
 * restore is missed — always-on capture across long idle periods is a later
 * hardening, not a Wave 2 guarantee.
 *
 * @module
 */
import type { KeyValueArea } from '../core/storage/types';
import { SENSITIVE_HEADERS, type RawHeader } from '../core/traffic/redaction';
import { RequestTracker, type CapturedRequest } from '../core/traffic/request-tracker';
import type { CaptureState } from '../core/traffic/state';

const CAPTURE_CONFIG_KEY = 'capture';
const ALL_URLS = '<all_urls>';
const HOST_PERMISSION = { origins: [ALL_URLS] };

interface CaptureConfig {
  enabled: boolean;
  caseId: string | null;
  retainSensitive: boolean;
}

const DEFAULT_CONFIG: CaptureConfig = { enabled: false, caseId: null, retainSensitive: false };

/** Coerce untrusted persisted data into a {@link CaptureConfig}. */
function readConfig(value: unknown): CaptureConfig {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_CONFIG };
  const record = value as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : false,
    caseId: typeof record.caseId === 'string' ? record.caseId : null,
    retainSensitive: typeof record.retainSensitive === 'boolean' ? record.retainSensitive : false,
  };
}

function toRawHeaders(headers: { name: string; value?: string }[] | undefined): RawHeader[] {
  if (!headers) return [];
  return headers.map((header) => ({ name: header.name, value: header.value ?? '' }));
}

/** Injectable dependencies for {@link TrafficCapture}. */
export interface TrafficCaptureDeps {
  /** Key/value area used to persist the capture configuration. */
  readonly storage: KeyValueArea;
  /** Persist a finalized captured request against its case. */
  readonly onCaptured: (caseId: string, captured: CapturedRequest) => Promise<void>;
}

/** Owns the `webRequest` listeners and the capture lifecycle. */
export class TrafficCapture {
  readonly #storage: KeyValueArea;
  readonly #onCaptured: (caseId: string, captured: CapturedRequest) => Promise<void>;
  #config: CaptureConfig = { ...DEFAULT_CONFIG };
  #tracker: RequestTracker | null = null;
  #registered = false;

  constructor(deps: TrafficCaptureDeps) {
    this.#storage = deps.storage;
    this.#onCaptured = deps.onCaptured;
  }

  /** Restore capture on background startup if it was enabled and still permitted. */
  async init(): Promise<void> {
    this.#config = await this.#loadConfig();
    if (!this.#config.enabled) return;
    if (await this.#hasHostPermission()) {
      this.#tracker = new RequestTracker({
        retainSensitive: this.#config.retainSensitive,
        denylist: SENSITIVE_HEADERS,
      });
      this.#register();
    } else {
      // The host permission was revoked while enabled; reflect reality.
      this.#config = { ...this.#config, enabled: false };
      await this.#saveConfig();
    }
  }

  /** The current, serializable capture state. */
  async getState(): Promise<CaptureState> {
    const hasHostPermission = await this.#hasHostPermission();
    const active = this.#registered && this.#config.enabled;
    return {
      active,
      caseId: active ? this.#config.caseId : null,
      retainSensitive: this.#config.retainSensitive,
      hasHostPermission,
    };
  }

  /**
   * Start capturing for a case. The host permission must already be granted
   * (the sidebar requests it from a user gesture first).
   *
   * @throws {Error} If the `<all_urls>` host permission is not granted.
   */
  async start(caseId: string, retainSensitive: boolean): Promise<CaptureState> {
    if (!(await this.#hasHostPermission())) {
      throw new Error('The <all_urls> host permission is required to capture traffic.');
    }
    this.#config = { enabled: true, caseId, retainSensitive };
    await this.#saveConfig();
    this.#tracker = new RequestTracker({ retainSensitive, denylist: SENSITIVE_HEADERS });
    this.#register();
    return this.getState();
  }

  /** Stop capturing and remove the listeners. */
  async stop(): Promise<CaptureState> {
    this.#config = { ...this.#config, enabled: false };
    await this.#saveConfig();
    this.#unregister();
    this.#tracker = null;
    return this.getState();
  }

  /** Stop capture if the case it is bound to has just been closed. */
  async onCaseClosed(caseId: string): Promise<void> {
    if (this.#config.enabled && this.#config.caseId === caseId) {
      await this.stop();
    }
  }

  async #loadConfig(): Promise<CaptureConfig> {
    const stored = await this.#storage.get(CAPTURE_CONFIG_KEY);
    return readConfig(stored[CAPTURE_CONFIG_KEY]);
  }

  async #saveConfig(): Promise<void> {
    await this.#storage.set({ [CAPTURE_CONFIG_KEY]: { ...this.#config } });
  }

  #hasHostPermission(): Promise<boolean> {
    return browser.permissions.contains(HOST_PERMISSION);
  }

  #active(): boolean {
    return this.#config.enabled && this.#tracker !== null;
  }

  #register(): void {
    if (this.#registered) return;
    const wr = browser.webRequest;
    const filter = { urls: [ALL_URLS] };
    wr.onBeforeRequest.addListener(this.#onBeforeRequest, filter);
    wr.onSendHeaders.addListener(this.#onSendHeaders, filter, ['requestHeaders']);
    wr.onHeadersReceived.addListener(this.#onHeadersReceived, filter, ['responseHeaders']);
    wr.onBeforeRedirect.addListener(this.#onBeforeRedirect, filter);
    wr.onCompleted.addListener(this.#onCompleted, filter, ['responseHeaders']);
    wr.onErrorOccurred.addListener(this.#onErrorOccurred, filter);
    this.#registered = true;
  }

  #unregister(): void {
    if (!this.#registered) return;
    const wr = browser.webRequest;
    wr.onBeforeRequest.removeListener(this.#onBeforeRequest);
    wr.onSendHeaders.removeListener(this.#onSendHeaders);
    wr.onHeadersReceived.removeListener(this.#onHeadersReceived);
    wr.onBeforeRedirect.removeListener(this.#onBeforeRedirect);
    wr.onCompleted.removeListener(this.#onCompleted);
    wr.onErrorOccurred.removeListener(this.#onErrorOccurred);
    this.#registered = false;
  }

  #emit(captured: CapturedRequest): void {
    const caseId = this.#config.caseId;
    if (caseId === null) return;
    void this.#onCaptured(caseId, captured).catch((error: unknown) => {
      console.error('[wadjet] failed to persist captured request:', error);
    });
  }

  readonly #onBeforeRequest = (details: browser.webRequest._OnBeforeRequestDetails): void => {
    if (!this.#active()) return;
    this.#tracker?.onStart({
      requestId: details.requestId,
      url: details.url,
      method: details.method,
      resourceType: details.type,
      timeStamp: details.timeStamp,
    });
  };

  readonly #onSendHeaders = (details: browser.webRequest._OnSendHeadersDetails): void => {
    if (!this.#active()) return;
    this.#tracker?.onRequestHeaders({
      requestId: details.requestId,
      requestHeaders: toRawHeaders(details.requestHeaders),
      timeStamp: details.timeStamp,
    });
  };

  readonly #onHeadersReceived = (details: browser.webRequest._OnHeadersReceivedDetails): void => {
    if (!this.#active()) return;
    this.#tracker?.onResponseHeaders({
      requestId: details.requestId,
      statusCode: details.statusCode,
      responseHeaders: toRawHeaders(details.responseHeaders),
      timeStamp: details.timeStamp,
    });
  };

  readonly #onBeforeRedirect = (details: browser.webRequest._OnBeforeRedirectDetails): void => {
    if (!this.#active()) return;
    this.#tracker?.onRedirect({
      requestId: details.requestId,
      url: details.url,
      redirectUrl: details.redirectUrl,
      statusCode: details.statusCode,
      timeStamp: details.timeStamp,
    });
  };

  readonly #onCompleted = (details: browser.webRequest._OnCompletedDetails): void => {
    if (!this.#active()) return;
    const captured = this.#tracker?.onCompleted({
      requestId: details.requestId,
      statusCode: details.statusCode,
      fromCache: details.fromCache,
      remoteIp: details.ip ?? null,
      responseHeaders: toRawHeaders(details.responseHeaders),
      timeStamp: details.timeStamp,
    });
    if (captured) this.#emit(captured);
  };

  readonly #onErrorOccurred = (details: browser.webRequest._OnErrorOccurredDetails): void => {
    if (!this.#active()) return;
    const captured = this.#tracker?.onError({
      requestId: details.requestId,
      error: details.error,
      timeStamp: details.timeStamp,
    });
    if (captured) this.#emit(captured);
  };
}
