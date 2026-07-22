/**
 * Background coordinator.
 *
 * Owns the single {@link CaseService} instance and answers typed requests from
 * UI surfaces over `browser.runtime` messaging. This is the only context that
 * mutates the case model, which keeps persistence consistent as later waves add
 * producers (traffic capture, decoders) that also run here.
 *
 * @module
 */
import { CaseService } from '../core/case/service';
import type { AnyRequest, Response, RequestType } from '../core/messaging/protocol';
import { openWadjetDb } from '../core/storage/database';
import { IdbContentStore } from '../core/storage/content-store';
import { LocalMetadataStore } from '../core/storage/metadata-store';
import type { KeyValueArea } from '../core/storage/types';

/** Adapt `browser.storage.local` to the minimal {@link KeyValueArea} shape. */
function createKeyValueArea(): KeyValueArea {
  return {
    get: (keys) => browser.storage.local.get(keys),
    set: (items) => browser.storage.local.set(items),
    remove: (keys) => browser.storage.local.remove(keys),
  };
}

let servicePromise: Promise<CaseService> | null = null;

/** Lazily build the case service (opening IndexedDB on first use). */
function getService(): Promise<CaseService> {
  servicePromise ??= (async (): Promise<CaseService> => {
    const db = await openWadjetDb();
    const metadata = new LocalMetadataStore(createKeyValueArea());
    const content = new IdbContentStore(db);
    return new CaseService({ metadata, content });
  })();
  return servicePromise;
}

/** Structural guard for inbound messages. */
function isAnyRequest(value: unknown): value is AnyRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    typeof (value as { params?: unknown }).params === 'object' &&
    (value as { params?: unknown }).params !== null
  );
}

/** Route a validated request to the case service. */
async function dispatch(req: AnyRequest): Promise<Response<RequestType>> {
  const service = await getService();
  switch (req.type) {
    case 'case.list':
      return { ok: true, data: await service.listCases() };
    case 'case.getActive':
      return { ok: true, data: (await service.getActiveCase()) ?? null };
    case 'case.create':
      return { ok: true, data: await service.createCase(req.params.name) };
    case 'case.open':
      return { ok: true, data: await service.openCase(req.params.id) };
    case 'case.close':
      return { ok: true, data: await service.closeCase(req.params.id) };
    case 'case.timeline':
      return { ok: true, data: await service.getTimeline(req.params.caseId) };
    case 'note.add':
      return {
        ok: true,
        data: await service.addNote(req.params.caseId, req.params.text, req.params.tags),
      };
    default:
      return { ok: false, error: `Unknown request type: ${String((req as AnyRequest).type)}` };
  }
}

browser.runtime.onMessage.addListener((message: unknown): Promise<Response<RequestType>> => {
  if (!isAnyRequest(message)) {
    return Promise.resolve({ ok: false, error: 'Malformed request envelope.' });
  }
  return dispatch(message).catch((error: unknown): Response<RequestType> => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
});
