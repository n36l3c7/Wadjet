import { describe, expect, it } from 'vitest';
import { classifyIndicator } from '../../src/core/enrich/indicator';

describe('classifyIndicator', () => {
  it('classifies IPv4 and IPv6 as ip', () => {
    expect(classifyIndicator('8.8.8.8')).toEqual({ type: 'ip', value: '8.8.8.8' });
    expect(classifyIndicator('2001:4860:4860::8888')?.type).toBe('ip');
  });

  it('classifies and lowercases domains', () => {
    expect(classifyIndicator('Example.COM')).toEqual({ type: 'domain', value: 'example.com' });
  });

  it('classifies md5, sha1, and sha256 as hash', () => {
    expect(classifyIndicator('d41d8cd98f00b204e9800998ecf8427e')?.type).toBe('hash');
    expect(classifyIndicator('a'.repeat(40))?.type).toBe('hash');
    expect(classifyIndicator('a'.repeat(64))?.type).toBe('hash');
  });

  it('classifies http(s) URLs as url', () => {
    expect(classifyIndicator('https://example.com/path')?.type).toBe('url');
  });

  it('rejects junk and empty input', () => {
    expect(classifyIndicator('not an indicator!!')).toBeNull();
    expect(classifyIndicator('   ')).toBeNull();
    expect(classifyIndicator('localhost')).toBeNull();
  });
});
