/**
 * Background coordinator.
 *
 * Owns the single {@link CaseService} and {@link TrafficCapture} instances and
 * answers typed requests from UI surfaces over `browser.runtime` messaging. This
 * is the only context that mutates the case model and the only one that runs the
 * `webRequest` listeners, which keeps persistence consistent.
 *
 * @module
 */
import { CaseService } from '../core/case/service';
import type { AnyRequest, Response, RequestType } from '../core/messaging/protocol';
import { openWadjetDb } from '../core/storage/database';
import { IdbContentStore } from '../core/storage/content-store';
import { LocalMetadataStore } from '../core/storage/metadata-store';
import type { KeyValueArea } from '../core/storage/types';
import { registerDecoderMenu } from './decoder-menu';
import { TrafficCapture } from './traffic-capture';

/** Adapt `browser.storage.local` to the minimal {@link KeyValueArea} shape. */
function createKeyValueArea(): KeyValueArea {
  return {
    get: (keys) => browser.storage.local.get(keys),
    set: (items) => browser.storage.local.set(items),
    remove: (keys) => browser.storage.local.remove(keys),
  };
}

interface BackgroundContext {
  readonly service: CaseService;
  readonly capture: TrafficCapture;
}

let contextPromise: Promise<BackgroundContext> | null = null;

/** Lazily build the case service and traffic capture (opening IndexedDB once). */
function getContext(): Promise<BackgroundContext> {
  contextPromise ??= (async (): Promise<BackgroundContext> => {
    const db = await openWadjetDb();
    const area = createKeyValueArea();
    const service = new CaseService({
      metadata: new LocalMetadataStore(area),
      content: new IdbContentStore(db),
    });
    const capture = new TrafficCapture({
      storage: area,
      onCaptured: (caseId, captured) => service.addRequest(caseId, captured).then(() => undefined),
    });
    await capture.init();
    return { service, capture };
  })();
  return contextPromise;
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

/** Route a validated request to the case service or traffic capture. */
async function dispatch(req: AnyRequest): Promise<Response<RequestType>> {
  const { service, capture } = await getContext();
  switch (req.type) {
    case 'case.list':
      return { ok: true, data: await service.listCases() };
    case 'case.getActive':
      return { ok: true, data: (await service.getActiveCase()) ?? null };
    case 'case.create':
      return { ok: true, data: await service.createCase(req.params.name) };
    case 'case.open':
      return { ok: true, data: await service.openCase(req.params.id) };
    case 'case.close': {
      const closed = await service.closeCase(req.params.id);
      await capture.onCaseClosed(closed.id);
      return { ok: true, data: closed };
    }
    case 'case.entries':
      return { ok: true, data: await service.getEntries(req.params.caseId, req.params.query) };
    case 'note.add':
      return {
        ok: true,
        data: await service.addNote(req.params.caseId, req.params.text, req.params.tags),
      };
    case 'decoded.add':
      return {
        ok: true,
        data: await service.addDecodedArtifact(req.params.caseId, {
          input: req.params.input,
          chain: req.params.chain,
          output: req.params.output,
          sourceUrl: req.params.sourceUrl,
        }),
      };
    case 'capture.getState':
      return { ok: true, data: await capture.getState() };
    case 'capture.start':
      return {
        ok: true,
        data: await capture.start(req.params.caseId, req.params.retainSensitive),
      };
    case 'capture.stop':
      return { ok: true, data: await capture.stop() };
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

// Register the decoder context menu (its click handler injects the overlay).
registerDecoderMenu();

// Build the context on startup so capture is restored if it was left enabled.
void getContext().catch((error: unknown) => {
  console.error('[wadjet] background initialization failed:', error);
});
