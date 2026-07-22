import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/decode/detect';

describe('detect', () => {
  it('suggests jwt first for a three-segment token', () => {
    const candidates = detect('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig');
    expect(candidates[0]?.id).toBe('jwt-decode');
  });

  it('suggests url for percent-encoded text', () => {
    expect(detect('name=a%20b').some((c) => c.id === 'url-decode')).toBe(true);
  });

  it('suggests unicode for escape sequences', () => {
    expect(detect('\\u0068\\u0069').some((c) => c.id === 'unicode-decode')).toBe(true);
  });

  it('suggests hex for even-length hex strings', () => {
    expect(detect('68656c6c6f').some((c) => c.id === 'hex-decode')).toBe(true);
  });

  it('suggests base64 for multiple-of-4 alphabet strings', () => {
    expect(detect('aGVsbG8gd29ybGQh').some((c) => c.id === 'base64-decode')).toBe(true);
  });

  it('suggests refang for defanged indicators', () => {
    expect(detect('hxxps://evil[.]com').some((c) => c.id === 'refang')).toBe(true);
  });

  it('returns nothing for plain short text', () => {
    expect(detect('hi there')).toEqual([]);
  });

  it('gives every candidate a non-empty reason', () => {
    for (const candidate of detect('a%20b\\u0068')) {
      expect(candidate.reason.length).toBeGreaterThan(0);
    }
  });

  it('orders candidates by descending confidence', () => {
    const candidates = detect('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig');
    for (let i = 1; i < candidates.length; i += 1) {
      expect(candidates[i - 1]!.confidence).toBeGreaterThanOrEqual(candidates[i]!.confidence);
    }
  });
});
