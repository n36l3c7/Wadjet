/**
 * TLS/certificate collector for per-page analysis.
 *
 * `webRequest.getSecurityInfo` can only be called from a **blocking**
 * `onHeadersReceived` listener, so this collector registers one (returning
 * nothing, so it never actually blocks or modifies a request) and caches the
 * TLS info for recent top-level documents. The DevTools panel reads it by URL.
 *
 * This is the one place the project relies on Firefox's MV3-retained blocking
 * `webRequest` (see ADR 0001) and it needs the `webRequestBlocking` permission
 * plus host access — so it only runs once the optional `<all_urls>` host
 * permission has been granted (e.g. by enabling traffic capture).
 *
 * @module
 */
import type { TlsInfo } from '../core/analysis/types';

const HOST_PERMISSION = { origins: ['<all_urls>'] };
const MAX_ENTRIES = 100;

function normalize(info: browser.webRequest.SecurityInfo): TlsInfo {
  const certificate = info.certificates[0];
  return {
    state: info.state,
    protocol: info.protocolVersion ?? null,
    cipher: info.cipherSuite ?? null,
    subject: certificate?.subject ?? null,
    issuer: certificate?.issuer ?? null,
    validFrom: certificate?.validity.start ?? null,
    validTo: certificate?.validity.end ?? null,
    fingerprintSha256: certificate?.fingerprint.sha256 ?? null,
  };
}

/** Caches recent per-URL TLS info gathered from `getSecurityInfo`. */
export class SecurityInfoCollector {
  readonly #byUrl = new Map<string, TlsInfo>();
  #registered = false;

  /** Register the listener now (if permitted) and when host access is granted. */
  async init(): Promise<void> {
    await this.#registerIfPermitted();
    browser.permissions.onAdded.addListener(() => {
      void this.#registerIfPermitted();
    });
  }

  /** The cached TLS info for a page URL, or null. */
  getTls(url: string): TlsInfo | null {
    return this.#byUrl.get(url) ?? null;
  }

  async #registerIfPermitted(): Promise<void> {
    if (this.#registered) return;
    if (!(await browser.permissions.contains(HOST_PERMISSION))) return;
    browser.webRequest.onHeadersReceived.addListener(
      this.#onHeadersReceived,
      { urls: ['<all_urls>'], types: ['main_frame'] },
      ['blocking'],
    );
    this.#registered = true;
  }

  readonly #onHeadersReceived = (details: browser.webRequest._OnHeadersReceivedDetails): void => {
    const { url, requestId } = details;
    void browser.webRequest
      .getSecurityInfo(requestId, {})
      .then((info) => {
        if (info.state === 'secure' || info.state === 'weak') {
          this.#store(url, normalize(info));
        }
      })
      .catch(() => {
        // Plain HTTP or no access — nothing to record.
      });
  };

  #store(url: string, tls: TlsInfo): void {
    if (this.#byUrl.size >= MAX_ENTRIES) {
      const oldest = this.#byUrl.keys().next().value;
      if (oldest !== undefined) this.#byUrl.delete(oldest);
    }
    this.#byUrl.set(url, tls);
  }
}
