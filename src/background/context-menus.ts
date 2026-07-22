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
const DETONATE_ID = 'wadjet-detonate';
const OVERLAY_FILE = 'content/overlay.js';
const ENRICH_OVERLAY_FILE = 'content/enrich-overlay.js';

/** Handlers the background provides for menu actions. */
export interface ContextMenuHandlers {
  /** Open a link or selected URL in a throwaway container. */
  readonly onDetonate: (url: string) => void;
}

function injectScript(tabId: number, file: string): void {
  void browser.scripting
    .executeScript({ target: { tabId }, files: [file] })
    .catch((error: unknown) => {
      console.error(`[wadjet] failed to inject ${file}:`, error);
    });
}

/** Register the context-menu items and their click handler. */
export function registerContextMenus(handlers: ContextMenuHandlers): void {
  browser.menus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === DECODE_ID) {
      if (tab?.id !== undefined) injectScript(tab.id, OVERLAY_FILE);
    } else if (info.menuItemId === ENRICH_ID) {
      if (tab?.id !== undefined) injectScript(tab.id, ENRICH_OVERLAY_FILE);
    } else if (info.menuItemId === DETONATE_ID) {
      handlers.onDetonate(info.linkUrl ?? info.selectionText ?? '');
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
    browser.menus.create({
      id: DETONATE_ID,
      title: 'Open in throwaway container (Wadjet)',
      contexts: ['link', 'selection'],
    });
  });
}
