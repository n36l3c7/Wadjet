/**
 * Shared, serializable traffic-capture state.
 *
 * Exchanged over the message protocol between the sidebar (which drives the
 * capture toggle and the host-permission prompt) and the background (which owns
 * the `webRequest` listeners).
 *
 * @module
 */

/** The current state of traffic capture. */
export interface CaptureState {
  /** True while `webRequest` listeners are registered and capturing. */
  readonly active: boolean;
  /** The case captured requests are bound to, or null when not capturing. */
  readonly caseId: string | null;
  /** Whether sensitive header values are being retained raw (opt-in). */
  readonly retainSensitive: boolean;
  /** Whether the optional `<all_urls>` host permission is currently granted. */
  readonly hasHostPermission: boolean;
}
