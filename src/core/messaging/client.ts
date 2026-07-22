/**
 * Typed messaging client for UI surfaces.
 *
 * Wraps `browser.runtime.sendMessage` so callers work with the request map
 * directly and receive a typed result, with failed responses surfaced as thrown
 * errors rather than `{ ok: false }` shapes leaking into UI code.
 *
 * @module
 */
import {
  request,
  type ParamsFor,
  type RequestType,
  type Response,
  type ResultFor,
} from './protocol';

/**
 * Send a typed request to the background coordinator and await its result.
 *
 * @param type - The request type.
 * @param params - Parameters for that request type.
 * @returns The typed result payload.
 * @throws {Error} If the background reports a failure.
 */
export async function sendRequest<T extends RequestType>(
  type: T,
  params: ParamsFor<T>,
): Promise<ResultFor<T>> {
  const response = (await browser.runtime.sendMessage(request(type, params))) as Response<T>;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}
