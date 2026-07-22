/**
 * Client for the optional native messaging host.
 *
 * Every call is one-shot (`sendNativeMessage`). If the host is not installed the
 * promise rejects and callers treat it as "not connected" — the extension never
 * depends on the host.
 *
 * @module
 */
import type { Case, CaseEntry } from '../core/case/types';
import {
  NATIVE_APP,
  type ArchiveResult,
  type NativeArchiveFile,
  type NativeRequest,
  type NativeTool,
  type PingResult,
  type ToolResult,
} from '../core/native/protocol';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

async function send(request: NativeRequest): Promise<Record<string, unknown>> {
  const response: unknown = await browser.runtime.sendNativeMessage(NATIVE_APP, request);
  const record = asRecord(response);
  if (record === null) throw new Error('Malformed native host response.');
  if (record.ok !== true) {
    throw new Error(typeof record.error === 'string' ? record.error : 'Native host error.');
  }
  return record;
}

/** Talks to the `wadjet_host` native application. */
export class NativeHost {
  /** Check the host is reachable and get its version. */
  async ping(): Promise<PingResult> {
    const record = await send({ cmd: 'ping' });
    return { version: typeof record.version === 'string' ? record.version : 'unknown' };
  }

  /** Archive a case (SQLite rows + evidence files) to the host. */
  async archive(
    caseRecord: Case,
    entries: CaseEntry[],
    files: NativeArchiveFile[],
  ): Promise<ArchiveResult> {
    const record = await send({ cmd: 'archive', case: caseRecord, entries, files });
    return {
      dbPath: typeof record.dbPath === 'string' ? record.dbPath : '',
      evidenceDir: typeof record.evidenceDir === 'string' ? record.evidenceDir : '',
      rows: typeof record.rows === 'number' ? record.rows : 0,
    };
  }

  /** Run an allowlisted local tool on an input. */
  async tool(tool: NativeTool, input: string): Promise<ToolResult> {
    const record = await send({ cmd: 'tool', tool, input });
    return {
      output: typeof record.output === 'string' ? record.output : '',
      exitCode: typeof record.exitCode === 'number' ? record.exitCode : -1,
    };
  }
}
