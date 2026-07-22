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
import type { Case, NoteEntry } from '../case/types';
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
  'capture.getState': { params: Record<string, never>; result: CaptureState };
  'capture.start': {
    params: { caseId: string; retainSensitive: boolean };
    result: CaptureState;
  };
  'capture.stop': { params: Record<string, never>; result: CaptureState };
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
