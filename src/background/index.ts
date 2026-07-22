/**
 * Background coordinator.
 *
 * Owns the single instances of the case service, traffic capture, enrichment,
 * and settings, and answers typed requests from UI surfaces over
 * `browser.runtime` messaging. This is the only context that mutates the case
 * model, runs the `webRequest` listeners, and makes provider network calls.
 *
 * @module
 */
import { CaseService } from '../core/case/service';
import { IdbEnrichmentCache } from '../core/enrich/cache';
import { PROVIDERS } from '../core/enrich/providers';
import { TokenBucket } from '../core/enrich/rate-limit';
import { EnrichmentService } from '../core/enrich/service';
import type { ProviderId } from '../core/enrich/types';
import type { AnyRequest, Response, RequestType } from '../core/messaging/protocol';
import { SettingsStore } from '../core/settings/store';
import { openWadjetDb } from '../core/storage/database';
import { IdbContentStore } from '../core/storage/content-store';
import { LocalMetadataStore } from '../core/storage/metadata-store';
import type { KeyValueArea } from '../core/storage/types';
import { registerContextMenus } from './context-menus';
import { DetonationManager } from './detonation';
import { TrafficCapture } from './traffic-capture';

/** Adapt `browser.storage.local` to the minimal {@link KeyValueArea} shape. */
function createKeyValueArea(): KeyValueArea {
  return {
    get: (keys) => browser.storage.local.get(keys),
    set: (items) => browser.storage.local.set(items),
    remove: (keys) => browser.storage.local.remove(keys),
  };
}

function hasHostPermission(origin: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [origin] });
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { method: 'GET', headers });
  const body = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, body };
}

/** Conservative per-provider rate limits (well within free tiers). */
function createRateLimiters(): Map<ProviderId, TokenBucket> {
  return new Map<ProviderId, TokenBucket>([
    ['virustotal', new TokenBucket({ capacity: 4, refillPerMinute: 4 })],
    ['otx', new TokenBucket({ capacity: 10, refillPerMinute: 10 })],
    ['abuseipdb', new TokenBucket({ capacity: 5, refillPerMinute: 5 })],
  ]);
}

/** Adapt `browser.contextualIdentities` and `browser.tabs` for detonation. */
function createDetonationManager(): DetonationManager {
  return new DetonationManager({
    containers: {
      create: (details) => browser.contextualIdentities.create(details),
      remove: (cookieStoreId) => browser.contextualIdentities.remove(cookieStoreId),
    },
    tabs: {
      create: (details) => browser.tabs.create(details),
      onRemoved: (listener) => {
        browser.tabs.onRemoved.addListener((tabId) => {
          listener(tabId);
        });
      },
    },
  });
}

interface BackgroundContext {
  readonly service: CaseService;
  readonly capture: TrafficCapture;
  readonly enrichment: EnrichmentService;
  readonly settings: SettingsStore;
  readonly detonation: DetonationManager;
}

let contextPromise: Promise<BackgroundContext> | null = null;

/** Lazily build all background services (opening IndexedDB once). */
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
    const settings = new SettingsStore(area);
    const rateLimiters = createRateLimiters();
    const fallbackBucket = new TokenBucket({ capacity: 5, refillPerMinute: 5 });
    const enrichment = new EnrichmentService({
      providers: PROVIDERS,
      cache: new IdbEnrichmentCache(db),
      getApiKey: (id) => settings.getApiKey(id),
      hasPermission: hasHostPermission,
      fetchJson,
      rateLimiterFor: (id) => rateLimiters.get(id) ?? fallbackBucket,
    });
    const detonation = createDetonationManager();
    return { service, capture, enrichment, settings, detonation };
  })();
  return contextPromise;
}

/** Open a URL in a throwaway container and record it against the active case. */
async function detonateUrl(url: string): Promise<{ container: string; recorded: boolean }> {
  const { service, detonation } = await getContext();
  const outcome = await detonation.detonate(url);
  const active = await service.getActiveCase();
  if (active === undefined) {
    return { container: outcome.container, recorded: false };
  }
  await service.addDetonation(active.id, {
    url: url.trim(),
    container: outcome.container,
    cookieStoreId: outcome.cookieStoreId,
  });
  return { container: outcome.container, recorded: true };
}

/** Enrich a selection (from the context menu) and attach it to the active case. */
async function enrichSelection(selectionText: string): Promise<void> {
  const { service, enrichment } = await getContext();
  const active = await service.getActiveCase();
  if (active === undefined) {
    console.info('[wadjet] enrich: no active case to attach to.');
    return;
  }
  const outcome = await enrichment.lookup(selectionText);
  if (outcome.indicatorType === null || outcome.results.length === 0) {
    console.info('[wadjet] enrich: nothing to attach (unclassifiable or no providers configured).');
    return;
  }
  await service.addEnrichment(active.id, {
    indicator: outcome.indicator,
    indicatorType: outcome.indicatorType,
    results: outcome.results,
  });
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

/** Route a validated request to the appropriate service. */
async function dispatch(req: AnyRequest): Promise<Response<RequestType>> {
  const { service, capture, enrichment, settings } = await getContext();
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
    case 'enrich.lookup':
      return { ok: true, data: await enrichment.lookup(req.params.indicator) };
    case 'enrich.settings':
      return { ok: true, data: await settings.view(hasHostPermission) };
    case 'enrich.setKey':
      await settings.setApiKey(req.params.provider, req.params.apiKey);
      return { ok: true, data: await settings.view(hasHostPermission) };
    case 'enrichment.add':
      return {
        ok: true,
        data: await service.addEnrichment(req.params.caseId, {
          indicator: req.params.indicator,
          indicatorType: req.params.indicatorType,
          results: req.params.results,
        }),
      };
    case 'detonate':
      return { ok: true, data: await detonateUrl(req.params.url) };
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

// Register the selection context menus (decode overlay + enrich).
registerContextMenus({
  onEnrich: (selectionText) => {
    void enrichSelection(selectionText).catch((error: unknown) => {
      console.error('[wadjet] enrich selection failed:', error);
    });
  },
  onDetonate: (url) => {
    void detonateUrl(url).catch((error: unknown) => {
      console.error('[wadjet] detonation failed:', error);
    });
  },
});

// Build the context on startup so capture is restored if it was left enabled.
void getContext().catch((error: unknown) => {
  console.error('[wadjet] background initialization failed:', error);
});
