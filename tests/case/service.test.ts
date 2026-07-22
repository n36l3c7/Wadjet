import { beforeEach, describe, expect, it } from 'vitest';
import {
  CaseClosedError,
  CaseNotFoundError,
  CaseService,
  EmptyValueError,
} from '../../src/core/case/service';
import { CASE_SCHEMA_VERSION } from '../../src/core/case/types';
import { LocalMetadataStore } from '../../src/core/storage/metadata-store';
import { InMemoryContentStore, InMemoryKeyValueArea, sequentialIds, steppingClock } from '../fakes';

function makeService(): CaseService {
  const metadata = new LocalMetadataStore(new InMemoryKeyValueArea());
  const content = new InMemoryContentStore();
  return new CaseService({
    metadata,
    content,
    now: steppingClock(),
    newId: sequentialIds(),
  });
}

describe('CaseService', () => {
  let service: CaseService;

  beforeEach(() => {
    service = makeService();
  });

  it('creates an open case and makes it active', async () => {
    const created = await service.createCase('  Phishing kit  ');
    expect(created).toMatchObject({
      id: 'id-1',
      name: 'Phishing kit',
      status: 'open',
      closedAt: null,
      tags: [],
      schemaVersion: CASE_SCHEMA_VERSION,
    });
    expect(await service.getActiveCase()).toMatchObject({ id: 'id-1' });
  });

  it('rejects a blank case name', async () => {
    await expect(service.createCase('   ')).rejects.toBeInstanceOf(EmptyValueError);
  });

  it('lists cases most-recent first', async () => {
    await service.createCase('first');
    await service.createCase('second');
    const cases = await service.listCases();
    expect(cases.map((c) => c.name)).toEqual(['second', 'first']);
  });

  it('throws when opening an unknown case', async () => {
    await expect(service.openCase('missing')).rejects.toBeInstanceOf(CaseNotFoundError);
  });

  it('closes a case, clears the active pointer, and is idempotent', async () => {
    const created = await service.createCase('to close');
    const closed = await service.closeCase(created.id);
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect(await service.getActiveCase()).toBeUndefined();

    const closedAgain = await service.closeCase(created.id);
    expect(closedAgain.closedAt).toBe(closed.closedAt);
  });

  it('adds notes to an open case, ordered on the timeline', async () => {
    const created = await service.createCase('active');
    await service.addNote(created.id, 'first observation', ['Phishing', 'phishing']);
    await service.addNote(created.id, 'second observation');

    const timeline = await service.getTimeline(created.id);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({
      kind: 'note',
      text: 'first observation',
      tags: ['Phishing'],
    });
    expect(timeline[1]?.text).toBe('second observation');
    expect(timeline[0]!.timestamp).toBeLessThan(timeline[1]!.timestamp);
  });

  it('refuses to add a note to a closed case', async () => {
    const created = await service.createCase('closed case');
    await service.closeCase(created.id);
    await expect(service.addNote(created.id, 'late note')).rejects.toBeInstanceOf(CaseClosedError);
  });

  it('rejects a blank note', async () => {
    const created = await service.createCase('active');
    await expect(service.addNote(created.id, '   ')).rejects.toBeInstanceOf(EmptyValueError);
  });

  it('throws when adding a note to an unknown case', async () => {
    await expect(service.addNote('missing', 'note')).rejects.toBeInstanceOf(CaseNotFoundError);
  });
});
