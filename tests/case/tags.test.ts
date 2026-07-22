import { describe, expect, it } from 'vitest';
import { normalizeTags, parseTags } from '../../src/core/case/tags';

describe('normalizeTags', () => {
  it('trims whitespace and drops empty entries', () => {
    expect(normalizeTags(['  phishing ', '', '   ', 'urgent'])).toEqual(['phishing', 'urgent']);
  });

  it('de-duplicates case-insensitively, keeping first occurrence', () => {
    expect(normalizeTags(['Phishing', 'phishing', 'PHISHING'])).toEqual(['Phishing']);
  });

  it('preserves first-seen order', () => {
    expect(normalizeTags(['c', 'a', 'b', 'a'])).toEqual(['c', 'a', 'b']);
  });
});

describe('parseTags', () => {
  it('splits a comma-separated string and normalizes', () => {
    expect(parseTags('phishing, credential-theme ,  urgent')).toEqual([
      'phishing',
      'credential-theme',
      'urgent',
    ]);
  });

  it('returns an empty list for a blank string', () => {
    expect(parseTags('   ')).toEqual([]);
  });
});
