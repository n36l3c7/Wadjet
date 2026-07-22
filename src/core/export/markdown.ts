/**
 * Markdown report of a case: metadata, extracted IOCs, and the timeline.
 *
 * Designed to be pasted straight into a written report. Values are shown as
 * stored, so redacted header values stay redacted.
 *
 * @module
 */
import type { Case, CaseEntry } from '../case/types';
import type { Ioc } from './iocs';

function collapse(text: string, max = 200): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

function summarize(entry: CaseEntry): string {
  switch (entry.kind) {
    case 'note':
      return collapse(entry.text);
    case 'request':
      return `${entry.method} ${entry.url} → ${entry.statusCode !== null ? String(entry.statusCode) : entry.outcome}`;
    case 'decoded-artifact':
      return `${entry.chain.join(' → ')}: ${collapse(entry.output, 120)}`;
    case 'enrichment':
      return `${entry.indicator} (${entry.indicatorType}) — ${entry.results
        .map((result) => `${result.provider}: ${result.summary}`)
        .join(' | ')}`;
    case 'detonation':
      return `${entry.url} in ${entry.container}`;
    case 'page-analysis': {
      const missing = entry.findings.filter((finding) => finding.status === 'missing').length;
      return `${entry.url} — ${String(missing)} security header(s) missing${entry.tls !== null ? `, TLS ${entry.tls.state}` : ''}`;
    }
    case 'tool-result':
      return `${entry.tool} (${entry.input}) → exit ${String(entry.exitCode)}: ${collapse(entry.output, 120)}`;
  }
}

/** Build a Markdown report from a case, its entries, and extracted IOCs. */
export function buildMarkdown(
  caseRecord: Case,
  entries: readonly CaseEntry[],
  iocs: readonly Ioc[],
): string {
  const lines: string[] = [];
  lines.push(`# Wadjet case: ${caseRecord.name}`, '');
  lines.push(`- **Status:** ${caseRecord.status}`);
  lines.push(`- **Created:** ${new Date(caseRecord.createdAt).toISOString()}`);
  if (caseRecord.closedAt !== null) {
    lines.push(`- **Closed:** ${new Date(caseRecord.closedAt).toISOString()}`);
  }
  if (caseRecord.tags.length > 0) {
    lines.push(`- **Tags:** ${caseRecord.tags.join(', ')}`);
  }

  lines.push('', `## Indicators (${String(iocs.length)})`, '');
  if (iocs.length === 0) {
    lines.push('_None extracted._');
  } else {
    for (const ioc of iocs) {
      lines.push(`- \`${ioc.value}\` (${ioc.type}) — from ${ioc.sources.join(', ')}`);
    }
  }

  lines.push('', `## Timeline (${String(entries.length)})`, '');
  const ordered = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  if (ordered.length === 0) {
    lines.push('_No entries._');
  } else {
    for (const entry of ordered) {
      lines.push(
        `- **${new Date(entry.timestamp).toISOString()}** [${entry.kind}] ${summarize(entry)}`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}
