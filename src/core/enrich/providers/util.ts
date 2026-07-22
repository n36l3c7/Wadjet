/**
 * Defensive accessors for parsing untrusted provider JSON.
 *
 * @module
 */

/** Narrow an unknown value to a plain record, or null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** Read a numeric property, or null. */
export function numAt(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' ? value : null;
}

/** Read a string property, or null. */
export function strAt(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
}
