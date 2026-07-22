import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/core/settings/store';
import { InMemoryKeyValueArea } from '../fakes';

describe('SettingsStore', () => {
  it('stores and returns an API key', async () => {
    const store = new SettingsStore(new InMemoryKeyValueArea());
    expect(await store.getApiKey('virustotal')).toBeNull();
    await store.setApiKey('virustotal', 'SECRET');
    expect(await store.getApiKey('virustotal')).toBe('SECRET');
  });

  it('clears a key when set to empty', async () => {
    const store = new SettingsStore(new InMemoryKeyValueArea());
    await store.setApiKey('otx', 'K');
    await store.setApiKey('otx', '');
    expect(await store.getApiKey('otx')).toBeNull();
  });

  it('exposes a view that reports key presence but never the key', async () => {
    const store = new SettingsStore(new InMemoryKeyValueArea());
    await store.setApiKey('virustotal', 'SECRET');
    const view = await store.view(() => Promise.resolve(false));
    expect(view.find((provider) => provider.id === 'virustotal')?.hasKey).toBe(true);
    expect(view.find((provider) => provider.id === 'otx')?.hasKey).toBe(false);
    expect(JSON.stringify(view)).not.toContain('SECRET');
  });

  it('lists all providers with their supported indicator types', async () => {
    const store = new SettingsStore(new InMemoryKeyValueArea());
    const view = await store.view(() => Promise.resolve(true));
    expect(view.map((provider) => provider.id).sort()).toEqual(['abuseipdb', 'otx', 'virustotal']);
    expect(view.find((provider) => provider.id === 'abuseipdb')?.supports).toEqual(['ip']);
  });
});
