/**
 * Indicator classification.
 *
 * Given a raw string, decide whether it is a domain, an IP, a file hash, or a
 * URL — deterministically, by shape alone. Returns `null` when nothing matches,
 * so the enrichment layer can refuse rather than guess.
 *
 * @module
 */

/** The kind of indicator being enriched. */
export type IndicatorType = 'domain' | 'ip' | 'hash' | 'url';

/** A classified, normalized indicator. */
export interface Indicator {
  readonly type: IndicatorType;
  readonly value: string;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HASH = /^(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;
const DOMAIN = /^(?=.{1,253}$)([a-zA-Z0-9](?:-?[a-zA-Z0-9])*\.)+[a-zA-Z]{2,}$/;

function isIpv6(value: string): boolean {
  if (!value.includes(':')) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const groups = value
    .replace('::', ':')
    .split(':')
    .filter((group) => group !== '');
  if (groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  return value.includes('::') ? groups.length <= 7 : value.split(':').length === 8;
}

/**
 * Classify a raw string as a domain, IP, hash, or URL.
 *
 * @param raw - The candidate indicator.
 * @returns The classified indicator, or `null` if it matches no known shape.
 */
export function classifyIndicator(raw: string): Indicator | null {
  const value = raw.trim();
  if (value === '') return null;
  if (/^https?:\/\//i.test(value)) return { type: 'url', value };
  if (IPV4.test(value) || isIpv6(value)) return { type: 'ip', value };
  if (HASH.test(value)) return { type: 'hash', value: value.toLowerCase() };
  if (DOMAIN.test(value)) return { type: 'domain', value: value.toLowerCase() };
  return null;
}
