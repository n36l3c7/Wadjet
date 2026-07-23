import { describe, expect, it } from 'vitest';
import { parseDomainAgeDays } from '../../src/core/threat/domain-age';

describe('parseDomainAgeDays', () => {
  const now = Date.parse('2026-07-23T00:00:00Z');

  it('parses a Creation Date field and computes whole-day age', () => {
    expect(parseDomainAgeDays('Creation Date: 2026-07-13T09:00:00Z', now)).toBe(10);
  });

  it('accepts a "Registered on" spelling', () => {
    expect(parseDomainAgeDays('Registered on: 2020-01-03', now)).toBeGreaterThan(2000);
  });

  it('returns null when there is no creation date', () => {
    expect(parseDomainAgeDays('Domain Status: ok\nNo dates here.', now)).toBeNull();
  });
});
