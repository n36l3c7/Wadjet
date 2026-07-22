/**
 * Wadjet's selection context-menu items.
 *
 * Two items appear on a text selection:
 *
 * - **Decode selection** — injects the inline decoder overlay into the active
 *   tab (on demand, via `activeTab`).
 * - **Enrich selection** — looks the selection up across configured providers
 *   and attaches the result to the active case.
 *
 * Both items are created in a single `removeAll` + `create` pass so a recycled
 * background context never leaves duplicates.
 *
 * @module
 */
const DECODE_ID = 'wadjet-decode-selection';
const ENRICH_ID = 'wadjet-enrich-selection';
const OVERLAY_FILE = 'content/overlay.js';

/** Handlers the background provides for menu actions. */
export interface ContextMenuHandlers {
  /** Enrich a selected indicator and attach it to the active case. */
  readonly onEnrich: (selectionText: string) => void;
}

function injectOverlay(tabId: number): void {
  void browser.scripting
    .executeScript({ target: { tabId }, files: [OVERLAY_FILE] })
    .catch((error: unknown) => {
      console.error('[wadjet] failed to inject the decoder overlay:', error);
    });
}

/** Register both context-menu items and their click handler. */
export function registerContextMenus(handlers: ContextMenuHandlers): void {
  browser.menus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === DECODE_ID) {
      if (tab?.id !== undefined) injectOverlay(tab.id);
    } else if (info.menuItemId === ENRICH_ID) {
      handlers.onEnrich(info.selectionText ?? '');
    }
  });

  void browser.menus.removeAll().then(() => {
    browser.menus.create({
      id: DECODE_ID,
      title: 'Decode selection with Wadjet',
      contexts: ['selection'],
    });
    browser.menus.create({
      id: ENRICH_ID,
      title: 'Enrich selection with Wadjet',
      contexts: ['selection'],
    });
  });
}
