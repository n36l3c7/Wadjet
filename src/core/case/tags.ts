/**
 * Tag parsing and normalization helpers.
 *
 * Tags are free-form labels. Normalization trims whitespace, drops empties and
 * removes case-insensitive duplicates while preserving first-seen order and the
 * original casing of the first occurrence.
 *
 * @module
 */

/**
 * Normalize a list of tags: trim, drop empties, and de-duplicate
 * case-insensitively (keeping the first occurrence's casing and order).
 *
 * @param tags - Raw tag values.
 * @returns The cleaned, de-duplicated tag list.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Parse a comma-separated tag string (as typed in the UI) into a normalized
 * tag list.
 *
 * @param raw - A string such as `"phishing, credential-theme, urgent"`.
 * @returns The normalized tag list.
 */
export function parseTags(raw: string): string[] {
  return normalizeTags(raw.split(','));
}
