/**
 * Context menu that launches the inline decoder overlay.
 *
 * A single "Decode selection" item appears on text selections. Clicking it
 * injects the overlay content script into the active tab — on demand, using the
 * `activeTab` permission granted by the menu gesture, so Wadjet needs no
 * broad host access for decoding.
 *
 * @module
 */
const MENU_ID = 'wadjet-decode-selection';
const OVERLAY_FILE = 'content/overlay.js';

function injectOverlay(tabId: number): void {
  void browser.scripting
    .executeScript({ target: { tabId }, files: [OVERLAY_FILE] })
    .catch((error: unknown) => {
      console.error('[wadjet] failed to inject the decoder overlay:', error);
    });
}

/**
 * Register the decoder context menu and its click handler. Safe to call once at
 * background startup; existing Wadjet menu items are cleared first so a recycled
 * background context does not create duplicates.
 */
export function registerDecoderMenu(): void {
  browser.menus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    if (tab?.id === undefined) return;
    injectOverlay(tab.id);
  });

  void browser.menus.removeAll().then(() => {
    browser.menus.create({
      id: MENU_ID,
      title: 'Decode selection with Wadjet',
      contexts: ['selection'],
    });
  });
}
