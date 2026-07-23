/**
 * Best-effort, deterministic extraction of a domain's age from raw WHOIS output.
 *
 * WHOIS formats vary by registry, so this parser is conservative: it looks for a
 * few common "creation date" field spellings followed by an ISO `YYYY-MM-DD`
 * date, and returns `null` whenever it cannot be confident. A very young domain
 * is a classic phishing signal; a missing date is simply not a signal.
 *
 * @module
 */

const CREATION_FIELD =
  /(?:creation date|created(?:\s+on)?|registered on|registration time|domain registration date)\s*:?\s*(\d{4}-\d{2}-\d{2})/i;

/**
 * Age of the registrable domain in whole days, or `null` when no creation date
 * could be parsed.
 *
 * @param whoisOutput - Raw text returned by the `whois` tool.
 * @param now - Reference time in epoch milliseconds; defaults to {@link Date.now}.
 */
export function parseDomainAgeDays(whoisOutput: string, now: number = Date.now()): number | null {
  const match = CREATION_FIELD.exec(whoisOutput);
  const iso = match?.[1];
  if (iso === undefined) return null;
  const created = Date.parse(iso);
  if (Number.isNaN(created)) return null;
  const days = Math.floor((now - created) / 86_400_000);
  return days >= 0 ? days : null;
}
