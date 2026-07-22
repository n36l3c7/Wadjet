import { beforeEach, describe, expect, it } from 'vitest';
import {
  DetonationManager,
  isDetonatableUrl,
  type ContainersApi,
  type TabsApi,
} from '../../src/background/detonation';

describe('isDetonatableUrl', () => {
  it('accepts http and https', () => {
    expect(isDetonatableUrl('https://example.com/path')).toBe(true);
    expect(isDetonatableUrl('http://example.com')).toBe(true);
  });

  it('rejects other schemes and junk', () => {
    expect(isDetonatableUrl('javascript:alert(1)')).toBe(false);
    expect(isDetonatableUrl('ftp://example.com')).toBe(false);
    expect(isDetonatableUrl('not a url')).toBe(false);
  });
});

interface Harness {
  manager: DetonationManager;
  created: { name: string; color: string; icon: string }[];
  removed: string[];
  fireTabRemoved: (tabId: number) => void;
}

function makeHarness(): Harness {
  const created: { name: string; color: string; icon: string }[] = [];
  const removed: string[] = [];
  let onRemovedListener: ((tabId: number) => void) | null = null;

  const containers: ContainersApi = {
    create: (details) => {
      created.push(details);
      return Promise.resolve({
        cookieStoreId: `store-${String(created.length)}`,
        name: details.name,
      });
    },
    remove: (cookieStoreId) => {
      removed.push(cookieStoreId);
      return Promise.resolve(undefined);
    },
  };
  const tabs: TabsApi = {
    create: () => Promise.resolve({ id: 42 }),
    onRemoved: (listener) => {
      onRemovedListener = listener;
    },
  };

  const manager = new DetonationManager({
    containers,
    tabs,
    newContainerName: () => 'test-container',
  });
  return {
    manager,
    created,
    removed,
    fireTabRemoved: (tabId) => onRemovedListener?.(tabId),
  };
}

describe('DetonationManager', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makeHarness();
  });

  it('creates a throwaway container and opens the tab', async () => {
    const outcome = await harness.manager.detonate('https://evil.example');
    expect(outcome.container).toBe('test-container');
    expect(outcome.cookieStoreId).toBe('store-1');
    expect(harness.created).toHaveLength(1);
    expect(harness.manager.pending).toBe(1);
  });

  it('removes the container when its tab closes', async () => {
    await harness.manager.detonate('https://evil.example');
    harness.fireTabRemoved(42);
    expect(harness.removed).toEqual(['store-1']);
    expect(harness.manager.pending).toBe(0);
  });

  it('ignores unrelated tab closes', async () => {
    await harness.manager.detonate('https://evil.example');
    harness.fireTabRemoved(999);
    expect(harness.removed).toEqual([]);
    expect(harness.manager.pending).toBe(1);
  });

  it('rejects non-http(s) URLs before creating anything', async () => {
    await expect(harness.manager.detonate('javascript:alert(1)')).rejects.toThrow();
    expect(harness.created).toEqual([]);
  });
});
