/**
 * JSON export: a complete, machine-readable dump of a case.
 *
 * @module
 */
import type { Case, CaseEntry } from '../case/types';
import type { Ioc } from './iocs';

/** Build a JSON export envelope for a case, its IOCs, and its entries. */
export function buildJson(
  caseRecord: Case,
  entries: readonly CaseEntry[],
  iocs: readonly Ioc[],
  options: { toolVersion: string; now: number },
): string {
  return JSON.stringify(
    {
      tool: { name: 'Wadjet', version: options.toolVersion },
      exportedAt: new Date(options.now).toISOString(),
      case: caseRecord,
      iocs,
      entries: [...entries].sort((a, b) => a.timestamp - b.timestamp),
    },
    null,
    2,
  );
}
