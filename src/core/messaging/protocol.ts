/**
 * Typed message protocol between UI surfaces and the background coordinator.
 *
 * The background context owns the {@link CaseService}; UI surfaces (the sidebar
 * today, DevTools later) are thin clients that issue requests over
 * `browser.runtime` messaging. A single request/response map keeps both ends in
 * lockstep at compile time.
 *
 * Wire values must be structured-clone-safe, so `undefined` results are
 * represented as `null`.
 *
 * @module
 */
import type { SecurityHeaderFinding, TlsInfo } from '../analysis/types';
import type {
  Case,
  DecodedArtifactEntry,
  EnrichmentEntry,
  NoteEntry,
  PageAnalysisEntry,
} from '../case/types';
import type { LookupOutcome } from '../enrich/service';
import type { EnrichmentResult, ProviderId } from '../enrich/types';
import type { ExportFile, ExportFormat } from '../export';
import type { NativeTool } from '../native/protocol';
import type { SettingsView } from '../settings/store';
import type { EntryPage, EntryQuery } from '../storage/types';
import type { CaptureState } from '../traffic/state';

/**
 * The full set of request types with their parameter and result shapes. Adding
 * a capability means adding one entry here; both client and handler then fail
 * to compile until they cover it.
 */
export interface RequestMap {
  'case.list': { params: Record<string, never>; result: Case[] };
  'case.getActive': { params: Record<string, never>; result: Case | null };
  'case.create': { params: { name: string }; result: Case };
  'case.open': { params: { id: string }; result: Case };
  'case.close': { params: { id: string }; result: Case };
  'case.entries': { params: { caseId: string; query: EntryQuery }; result: EntryPage };
  'note.add': { params: { caseId: string; text: string; tags: string[] }; result: NoteEntry };
  'decoded.add': {
    params: {
      caseId: string;
      input: string;
      chain: string[];
      output: string;
      sourceUrl: string | null;
    };
    result: DecodedArtifactEntry;
  };
  'capture.getState': { params: Record<string, never>; result: CaptureState };
  'capture.start': {
    params: { caseId: string; retainSensitive: boolean };
    result: CaptureState;
  };
  'capture.stop': { params: Record<string, never>; result: CaptureState };
  'enrich.lookup': { params: { indicator: string }; result: LookupOutcome };
  'enrich.settings': { params: Record<string, never>; result: SettingsView };
  'enrich.setKey': { params: { provider: ProviderId; apiKey: string }; result: SettingsView };
  'enrichment.add': {
    params: {
      caseId: string;
      indicator: string;
      indicatorType: string;
      results: EnrichmentResult[];
    };
    result: EnrichmentEntry;
  };
  detonate: { params: { url: string }; result: { container: string; recorded: boolean } };
  'export.build': { params: { caseId: string; format: ExportFormat }; result: ExportFile };
  'tls.get': { params: { url: string }; result: TlsInfo | null };
  'analysis.add': {
    params: {
      caseId: string;
      url: string;
      findings: SecurityHeaderFinding[];
      tls: TlsInfo | null;
    };
    result: PageAnalysisEntry;
  };
  'native.ping': {
    params: Record<string, never>;
    result: { connected: boolean; version: string | null };
  };
  'native.archive': {
    params: { caseId: string };
    result: {
      ok: boolean;
      dbPath: string | null;
      evidenceDir: string | null;
      rows: number;
      error: string | null;
    };
  };
  'native.tool': {
    params: { caseId: string | null; tool: NativeTool; input: string };
    result: { ok: boolean; output: string; exitCode: number; error: string | null };
  };
}

/** All valid request type discriminants. */
export type RequestType = keyof RequestMap;

/** Parameters for a given request type. */
export type ParamsFor<T extends RequestType> = RequestMap[T]['params'];

/** Result payload for a given request type. */
export type ResultFor<T extends RequestType> = RequestMap[T]['result'];

/** A request envelope for a single request type. */
export interface RequestEnvelope<T extends RequestType> {
  readonly type: T;
  readonly params: ParamsFor<T>;
}

/** The discriminated union of every possible request envelope. */
export type AnyRequest = { [T in RequestType]: RequestEnvelope<T> }[RequestType];

/** A successful or failed response for a given request type. */
export type Response<T extends RequestType> =
  | { readonly ok: true; readonly data: ResultFor<T> }
  | { readonly ok: false; readonly error: string };

/** Build a request envelope with its parameters. */
export function request<T extends RequestType>(type: T, params: ParamsFor<T>): RequestEnvelope<T> {
  return { type, params };
}
