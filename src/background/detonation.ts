/**
 * Throwaway-container detonation.
 *
 * Opens a URL in a fresh `contextualIdentities` container so its cookies and
 * storage are isolated from the rest of the browser, then removes the container
 * when the tab closes. This is **cookie/storage isolation only** — not a
 * network, process, or exploit sandbox: the page still runs in the analyst's
 * Firefox, on the analyst's network.
 *
 * The browser APIs are injected, so the create/track/cleanup lifecycle is
 * unit-testable without a browser.
 *
 * @module
 */

/** Whether a string is an http(s) URL that can be opened in a container. */
export function isDetonatableUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** A created contextual identity (the fields the manager needs). */
export interface ContextualIdentityLike {
  readonly cookieStoreId: string;
  readonly name: string;
}

/** The subset of `browser.contextualIdentities` the manager uses. */
export interface ContainersApi {
  create(details: { name: string; color: string; icon: string }): Promise<ContextualIdentityLike>;
  remove(cookieStoreId: string): Promise<unknown>;
}

/** The subset of `browser.tabs` the manager uses. */
export interface TabsApi {
  create(details: { url: string; cookieStoreId: string }): Promise<{ id?: number }>;
  onRemoved(listener: (tabId: number) => void): void;
}

/** Injectable dependencies for {@link DetonationManager}. */
export interface DetonationManagerDeps {
  readonly containers: ContainersApi;
  readonly tabs: TabsApi;
  /** Throwaway container name generator; defaults to a random short name. */
  readonly newContainerName?: () => string;
}

/** The result of a detonation. */
export interface DetonationOutcome {
  readonly container: string;
  readonly cookieStoreId: string;
}

function defaultName(): string {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `Wadjet throwaway ${suffix}`;
}

/** Opens URLs in throwaway containers and cleans them up on tab close. */
export class DetonationManager {
  readonly #containers: ContainersApi;
  readonly #tabs: TabsApi;
  readonly #newName: () => string;
  readonly #tabToStore = new Map<number, string>();

  constructor(deps: DetonationManagerDeps) {
    this.#containers = deps.containers;
    this.#tabs = deps.tabs;
    this.#newName = deps.newContainerName ?? defaultName;
    this.#tabs.onRemoved((tabId) => {
      this.#cleanup(tabId);
    });
  }

  /** Containers currently tracked for cleanup (for diagnostics/tests). */
  get pending(): number {
    return this.#tabToStore.size;
  }

  /**
   * Open `url` in a fresh throwaway container.
   *
   * @throws {Error} If `url` is not an http(s) URL.
   */
  async detonate(url: string): Promise<DetonationOutcome> {
    if (!isDetonatableUrl(url)) {
      throw new Error('Only http(s) URLs can be opened in a throwaway container.');
    }
    const identity = await this.#containers.create({
      name: this.#newName(),
      color: 'red',
      icon: 'fingerprint',
    });
    const tab = await this.#tabs.create({ url: url.trim(), cookieStoreId: identity.cookieStoreId });
    if (tab.id !== undefined) {
      this.#tabToStore.set(tab.id, identity.cookieStoreId);
    }
    return { container: identity.name, cookieStoreId: identity.cookieStoreId };
  }

  #cleanup(tabId: number): void {
    const cookieStoreId = this.#tabToStore.get(tabId);
    if (cookieStoreId === undefined) return;
    this.#tabToStore.delete(tabId);
    void this.#containers.remove(cookieStoreId).catch((error: unknown) => {
      console.error('[wadjet] failed to remove throwaway container:', error);
    });
  }
}
