import { describe, expect, it } from 'vitest';
import {
  isSensitiveHeader,
  redactHeaders,
  REDACTED_PLACEHOLDER,
  SENSITIVE_HEADERS,
} from '../../src/core/traffic/redaction';

const headers = [
  { name: 'Authorization', value: 'Bearer secret' },
  { name: 'Accept', value: 'text/html' },
  { name: 'Cookie', value: 'sid=abc' },
];

describe('isSensitiveHeader', () => {
  it('matches denylisted names case-insensitively', () => {
    expect(isSensitiveHeader('Authorization')).toBe(true);
    expect(isSensitiveHeader('COOKIE')).toBe(true);
    expect(isSensitiveHeader('  set-cookie  ')).toBe(true);
  });

  it('does not match unlisted headers', () => {
    expect(isSensitiveHeader('Accept')).toBe(false);
    expect(isSensitiveHeader('X-Request-Id')).toBe(false);
  });
});

describe('redactHeaders', () => {
  it('redacts sensitive values by default', () => {
    const out = redactHeaders(headers, { retainSensitive: false });
    expect(out[0]).toEqual({ name: 'Authorization', value: REDACTED_PLACEHOLDER, redacted: true });
    expect(out[1]).toEqual({ name: 'Accept', value: 'text/html', redacted: false });
    expect(out[2]?.redacted).toBe(true);
  });

  it('retains raw values when explicitly opted in', () => {
    const out = redactHeaders(headers, { retainSensitive: true });
    expect(out.every((header) => !header.redacted)).toBe(true);
    expect(out[0]?.value).toBe('Bearer secret');
  });

  it('fails loud: masks everything when the denylist is empty', () => {
    const out = redactHeaders(headers, { retainSensitive: false, denylist: new Set() });
    expect(out.every((header) => header.redacted && header.value === REDACTED_PLACEHOLDER)).toBe(
      true,
    );
  });

  it('does not fail-loud-mask when values are being retained', () => {
    const out = redactHeaders(headers, { retainSensitive: true, denylist: new Set() });
    expect(out.every((header) => !header.redacted)).toBe(true);
  });

  it('ships a non-empty default denylist', () => {
    expect(SENSITIVE_HEADERS.has('authorization')).toBe(true);
    expect(SENSITIVE_HEADERS.size).toBeGreaterThan(0);
  });
});
