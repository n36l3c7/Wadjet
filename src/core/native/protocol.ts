/**
 * Native-messaging protocol between the extension and the optional Python host.
 *
 * These messages travel over `browser.runtime.sendNativeMessage`, separate from
 * the in-extension runtime protocol. The host is optional: if it is not
 * installed, calls reject and the extension carries on unaffected.
 *
 * @module
 */
import type { Case, CaseEntry } from '../case/types';

/** Native-messaging application name (matches the host manifest). */
export const NATIVE_APP = 'wadjet_host';

/** Tools the host may run, by allowlist. */
export type NativeTool = 'whois' | 'exiftool' | 'yara';

/** All native tool ids. */
export const NATIVE_TOOLS: readonly NativeTool[] = ['whois', 'exiftool', 'yara'];

/** A file written to the host's per-case evidence directory. */
export interface NativeArchiveFile {
  readonly name: string;
  readonly contentBase64: string;
}

/** A request sent to the native host. */
export type NativeRequest =
  | { readonly cmd: 'ping' }
  | {
      readonly cmd: 'archive';
      readonly case: Case;
      readonly entries: CaseEntry[];
      readonly files: NativeArchiveFile[];
    }
  | { readonly cmd: 'tool'; readonly tool: NativeTool; readonly input: string };

/** The host's reply to `ping`. */
export interface PingResult {
  readonly version: string;
}

/** The host's reply to `archive`. */
export interface ArchiveResult {
  readonly dbPath: string;
  readonly evidenceDir: string;
  readonly rows: number;
}

/** The host's reply to `tool`. */
export interface ToolResult {
  readonly output: string;
  readonly exitCode: number;
}
