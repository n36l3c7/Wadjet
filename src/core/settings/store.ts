/**
 * Extension settings, including per-provider API keys.
 *
 * Keys live in `browser.storage.local` (the browser profile is the trust
 * boundary). They are never written to the repo or to logs, and the settings
 * *view* returned to the UI reports only whether a key is set — never the key
 * itself.
 *
 * @module
 */
import type { IndicatorType } from '../enrich/indicator';
import { PROVIDERS } from '../enrich/providers';
import type { ProviderId } from '../enrich/types';
import type { KeyValueArea } from '../storage/types';

const SETTINGS_KEY = 'settings';
const INDICATOR_TYPES: readonly IndicatorType[] = ['domain', 'ip', 'hash', 'url'];

/** A provider's configuration status (no key material). */
export interface ProviderSetting {
  readonly id: ProviderId;
  readonly label: string;
  readonly origin: string;
  readonly hasKey: boolean;
  readonly hasPermission: boolean;
  readonly supports: IndicatorType[];
}

/** The settings surface shown to the UI. */
export type SettingsView = ProviderSetting[];

function readApiKeys(value: unknown): Partial<Record<ProviderId, string>> {
  if (typeof value !== 'object' || value === null) return {};
  const apiKeys = (value as { apiKeys?: unknown }).apiKeys;
  if (typeof apiKeys !== 'object' || apiKeys === null) return {};
  const result: Partial<Record<ProviderId, string>> = {};
  for (const provider of PROVIDERS) {
    const key = (apiKeys as Record<string, unknown>)[provider.id];
    if (typeof key === 'string' && key !== '') result[provider.id] = key;
  }
  return result;
}

/** Reads and writes extension settings over a {@link KeyValueArea}. */
export class SettingsStore {
  readonly #area: KeyValueArea;

  constructor(area: KeyValueArea) {
    this.#area = area;
  }

  async #readApiKeys(): Promise<Partial<Record<ProviderId, string>>> {
    const stored = await this.#area.get(SETTINGS_KEY);
    return readApiKeys(stored[SETTINGS_KEY]);
  }

  /** The configured API key for a provider, or null if unset. */
  async getApiKey(provider: ProviderId): Promise<string | null> {
    const keys = await this.#readApiKeys();
    return keys[provider] ?? null;
  }

  /** Set (or, with an empty string, clear) a provider's API key. */
  async setApiKey(provider: ProviderId, apiKey: string): Promise<void> {
    const keys = await this.#readApiKeys();
    const next = { ...keys };
    if (apiKey === '') {
      delete next[provider];
    } else {
      next[provider] = apiKey;
    }
    await this.#area.set({ [SETTINGS_KEY]: { apiKeys: next } });
  }

  /** Build the settings view, reporting key presence and host permission only. */
  async view(hasPermission: (origin: string) => Promise<boolean>): Promise<SettingsView> {
    const keys = await this.#readApiKeys();
    const view: ProviderSetting[] = [];
    for (const provider of PROVIDERS) {
      view.push({
        id: provider.id,
        label: provider.label,
        origin: provider.origin,
        hasKey: keys[provider.id] !== undefined,
        hasPermission: await hasPermission(provider.origin),
        supports: INDICATOR_TYPES.filter((type) => provider.supports(type)),
      });
    }
    return view;
  }
}
