/**
 * On-page protection: the automatic-scan toggle and its injection lifecycle.
 *
 * When enabled, the content script that runs the deterministic detectors is
 * injected into every completed top-level http(s) navigation. The toggle state
 * is persisted so it survives a background restart. Injection needs the optional
 * `<all_urls>` host permission, which the sidebar requests inside the click
 * gesture before enabling; if it is not granted the tab URL reads back empty and
 * nothing is injected.
 *
 * @module
 */
import type { KeyValueArea } from '../core/storage/types';
import type { ThreatState } from '../core/threat/types';

const ENABLED_KEY = 'wadjet.threat.enabled';
const ALL_URLS = '<all_urls>';
const SCAN_FILE = 'content/threat-scan.js';

/** Manages the on-page protection toggle and injects the scan script. */
export class ThreatProtection {
  #enabled = false;
  readonly #storage: KeyValueArea;

  constructor(storage: KeyValueArea) {
    this.#storage = storage;
  }

  /** Load the persisted toggle and register the navigation listener. */
  async init(): Promise<void> {
    const stored = await this.#storage.get(ENABLED_KEY);
    this.#enabled = stored[ENABLED_KEY] === true;

    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!this.#enabled) return;
      if (changeInfo.status !== 'complete') return;
      const url = tab.url ?? '';
      if (!/^https?:/i.test(url)) return;
      void browser.scripting
        .executeScript({ target: { tabId }, files: [SCAN_FILE] })
        .catch(() => undefined);
    });
  }

  /** The current toggle state plus whether the host permission is granted. */
  async getState(): Promise<ThreatState> {
    return {
      enabled: this.#enabled,
      hasHostPermission: await browser.permissions.contains({ origins: [ALL_URLS] }),
    };
  }

  /** Enable or disable automatic scanning and persist the choice. */
  async setEnabled(enabled: boolean): Promise<ThreatState> {
    this.#enabled = enabled;
    await this.#storage.set({ [ENABLED_KEY]: enabled });
    return this.getState();
  }
}
