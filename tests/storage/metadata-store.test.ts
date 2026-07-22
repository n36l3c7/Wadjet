import { beforeEach, describe, expect, it } from 'vitest';
import { CASE_SCHEMA_VERSION, type Case } from '../../src/core/case/types';
import { LocalMetadataStore } from '../../src/core/storage/metadata-store';
import { InMemoryKeyValueArea } from '../fakes';

function sampleCase(id: string, overrides: Partial<Case> = {}): Case {
  return {
    id,
    name: `Case ${id}`,
    status: 'open',
    createdAt: 1000,
    closedAt: null,
    tags: [],
    schemaVersion: CASE_SCHEMA_VERSION,
    ...overrides,
  };
}

describe('LocalMetadataStore', () => {
  let area: InMemoryKeyValueArea;
  let store: LocalMetadataStore;

  beforeEach(() => {
    area = new InMemoryKeyValueArea();
    store = new LocalMetadataStore(area);
  });

  it('stores and retrieves cases', async () => {
    await store.putCase(sampleCase('a'));
    await store.putCase(sampleCase('b'));
    expect(await store.getCase('a')).toMatchObject({ id: 'a' });
    expect((await store.listCases()).map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('returns undefined for an unknown case', async () => {
    expect(await store.getCase('nope')).toBeUndefined();
  });

  it('replaces an existing case on put', async () => {
    await store.putCase(sampleCase('a'));
    await store.putCase(sampleCase('a', { name: 'Renamed' }));
    expect(await store.getCase('a')).toMatchObject({ name: 'Renamed' });
  });

  it('deletes cases', async () => {
    await store.putCase(sampleCase('a'));
    await store.deleteCase('a');
    expect(await store.getCase('a')).toBeUndefined();
    await store.deleteCase('a'); // no-op, must not throw
  });

  it('sets and clears the active case id', async () => {
    expect(await store.getActiveCaseId()).toBeNull();
    await store.setActiveCaseId('a');
    expect(await store.getActiveCaseId()).toBe('a');
    await store.setActiveCaseId(null);
    expect(await store.getActiveCaseId()).toBeNull();
  });

  it('ignores malformed persisted case records', async () => {
    await area.set({ cases: { bad: { id: 'bad' }, good: sampleCase('good') } });
    const cases = await store.listCases();
    expect(cases.map((c) => c.id)).toEqual(['good']);
  });
});
