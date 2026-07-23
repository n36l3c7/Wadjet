/**
 * Deterministic IOC extraction from a case's entries.
 *
 * Structured fields only: request and detonation URLs (and their hostnames),
 * decoded-artifact source URLs, and enrichment indicators. Free text (notes,
 * decoded output) is deliberately not scanned, to keep the output precise.
 *
 * @module
 */
import type { CaseEntry } from '../case/types';
import { classifyIndicator, type IndicatorType } from '../enrich/indicator';

/** An extracted indicator of compromise, with the entry kinds it came from. */
export interface Ioc {
  readonly type: IndicatorType;
  readonly value: string;
  readonly sources: string[];
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Extract deduplicated, classified IOCs from a case's entries.
 *
 * @param entries - The case entries to scan.
 * @returns IOCs sorted by type then value.
 */
export function extractIocs(entries: readonly CaseEntry[]): Ioc[] {
  const found = new Map<string, { type: IndicatorType; value: string; sources: Set<string> }>();

  const add = (type: IndicatorType, value: string, source: string): void => {
    if (value === '') return;
    const key = `${type}:${value.toLowerCase()}`;
    const existing = found.get(key);
    if (existing) {
      existing.sources.add(source);
    } else {
      found.set(key, { type, value, sources: new Set([source]) });
    }
  };

  const addUrlAndHost = (url: string, source: string): void => {
    const classifiedUrl = classifyIndicator(url);
    if (classifiedUrl) add(classifiedUrl.type, classifiedUrl.value, source);
    const host = hostnameOf(url);
    if (host !== null) {
      const classifiedHost = classifyIndicator(host);
      if (classifiedHost) add(classifiedHost.type, classifiedHost.value, source);
    }
  };

  for (const entry of entries) {
    switch (entry.kind) {
      case 'request':
        addUrlAndHost(entry.url, 'request');
        break;
      case 'detonation':
        addUrlAndHost(entry.url, 'detonation');
        break;
      case 'decoded-artifact':
        if (entry.sourceUrl !== null) addUrlAndHost(entry.sourceUrl, 'decoded');
        break;
      case 'enrichment': {
        const classified = classifyIndicator(entry.indicator);
        if (classified) add(classified.type, classified.value, 'enrichment');
        break;
      }
      case 'threat-finding':
        addUrlAndHost(entry.url, 'threat');
        break;
      case 'note':
        break;
    }
  }

  return [...found.values()]
    .map((entry) => ({ type: entry.type, value: entry.value, sources: [...entry.sources].sort() }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.value.localeCompare(b.value));
}
