import { describe, expect, it } from 'vitest';
import { applyOperation, computeChain } from '../../src/core/decode/operations';

describe('codec operations', () => {
  it('round-trips base64', () => {
    expect(applyOperation('base64-encode', 'hello')).toEqual({ ok: true, output: 'aGVsbG8=' });
    expect(applyOperation('base64-decode', 'aGVsbG8=')).toEqual({ ok: true, output: 'hello' });
  });

  it('round-trips url', () => {
    expect(applyOperation('url-encode', 'a b/c')).toEqual({ ok: true, output: 'a%20b%2Fc' });
    expect(applyOperation('url-decode', 'a%20b%2Fc')).toEqual({ ok: true, output: 'a b/c' });
  });

  it('round-trips hex', () => {
    expect(applyOperation('hex-encode', 'hi')).toEqual({ ok: true, output: '6869' });
    expect(applyOperation('hex-decode', '6869')).toEqual({ ok: true, output: 'hi' });
  });

  it('escapes and unescapes unicode', () => {
    const escaped = applyOperation('unicode-encode', 'é');
    expect(escaped.ok).toBe(true);
    if (escaped.ok) {
      expect(applyOperation('unicode-decode', escaped.output)).toEqual({ ok: true, output: 'é' });
    }
  });

  it('defangs and refangs URLs', () => {
    expect(applyOperation('defang', 'https://evil.com/a')).toEqual({
      ok: true,
      output: 'hxxps[://]evil[.]com/a',
    });
    expect(applyOperation('refang', 'hxxps[://]evil[.]com/a')).toEqual({
      ok: true,
      output: 'https://evil.com/a',
    });
  });
});

describe('computeChain', () => {
  it('records the value after each step', () => {
    const result = computeChain('aGVsbG8=', ['base64-decode']);
    expect(result.output).toBe('hello');
    expect(result.values).toEqual(['aGVsbG8=', 'hello']);
    expect(result.failure).toBeNull();
  });

  it('applies multiple operations in order', () => {
    const result = computeChain('http://evil.com', ['defang', 'refang']);
    expect(result.output).toBe('http://evil.com');
    expect(result.values).toHaveLength(3);
  });

  it('stops and reports the first failing step', () => {
    const result = computeChain('zzzz', ['hex-decode', 'base64-decode']);
    expect(result.failure?.index).toBe(0);
    expect(result.output).toBe('zzzz');
  });
});
