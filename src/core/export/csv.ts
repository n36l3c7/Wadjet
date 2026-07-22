/**
 * CSV export of extracted IOCs (spreadsheet-friendly).
 *
 * @module
 */
import type { Ioc } from './iocs';

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function csvRow(cells: readonly string[]): string {
  return cells.map(csvField).join(',');
}

/** Build a CSV of extracted IOCs (`type,value,sources`). */
export function buildCsv(iocs: readonly Ioc[]): string {
  const rows = [
    csvRow(['type', 'value', 'sources']),
    ...iocs.map((ioc) => csvRow([ioc.type, ioc.value, ioc.sources.join('; ')])),
  ];
  return `${rows.join('\r\n')}\r\n`;
}
