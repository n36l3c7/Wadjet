/**
 * Export dispatcher.
 *
 * Turns a case and its entries into a downloadable file in one of four formats.
 * All builders are pure; the caller (background) provides the tool version and
 * timestamp, and performs the actual download/clipboard action.
 *
 * @module
 */
import type { Case, CaseEntry } from '../case/types';
import { buildCsv } from './csv';
import { buildHar } from './har';
import { extractIocs } from './iocs';
import { buildJson } from './json';
import { buildMarkdown } from './markdown';

/** A supported export format. */
export type ExportFormat = 'markdown' | 'har' | 'csv' | 'json';

/** All export formats, in display order. */
export const EXPORT_FORMATS: readonly ExportFormat[] = ['markdown', 'har', 'csv', 'json'];

/** A produced export file. */
export interface ExportFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: string;
}

/** Options for {@link buildExport}. */
export interface ExportOptions {
  /** Tool version recorded in HAR/JSON metadata. */
  readonly toolVersion?: string;
  /** Export timestamp (epoch ms); defaults to now. */
  readonly now?: number;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug === '' ? 'case' : slug;
}

function dateStamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Build an export file for a case in the requested format. */
export function buildExport(
  format: ExportFormat,
  caseRecord: Case,
  entries: readonly CaseEntry[],
  options: ExportOptions = {},
): ExportFile {
  const now = options.now ?? Date.now();
  const toolVersion = options.toolVersion ?? '';
  const iocs = extractIocs(entries);
  const base = `wadjet-${slugify(caseRecord.name)}-${dateStamp(now)}`;

  switch (format) {
    case 'markdown':
      return {
        filename: `${base}.md`,
        mimeType: 'text/markdown',
        content: buildMarkdown(caseRecord, entries, iocs),
      };
    case 'har':
      return {
        filename: `${base}.har`,
        mimeType: 'application/json',
        content: buildHar(entries, { toolVersion }),
      };
    case 'csv':
      return {
        filename: `${base}-iocs.csv`,
        mimeType: 'text/csv',
        content: buildCsv(iocs),
      };
    case 'json':
      return {
        filename: `${base}.json`,
        mimeType: 'application/json',
        content: buildJson(caseRecord, entries, iocs, { toolVersion, now }),
      };
  }
}
