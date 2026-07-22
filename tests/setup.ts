/**
 * Vitest global setup.
 *
 * Installs `fake-indexeddb` on the global scope so the IndexedDB-backed stores
 * run without a browser.
 */
import 'fake-indexeddb/auto';
