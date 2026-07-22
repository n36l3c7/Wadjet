import { describe, expect, it } from 'vitest';
import { decode } from '../../src/core/decode/decoders';

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

describe('base64 decoder', () => {
  it('decodes standard base64', () => {
    expect(decode('base64', 'aGVsbG8=')).toEqual({ ok: true, output: 'hello' });
  });

  it('decodes url-safe base64 without padding', () => {
    expect(decode('base64', 'Pj4-')).toEqual({ ok: true, output: '>>>' });
  });

  it('rejects non-base64 input', () => {
    expect(decode('base64', '@@@!').ok).toBe(false);
  });
});

describe('url decoder', () => {
  it('percent-decodes', () => {
    expect(decode('url', 'a%20b%2Fc')).toEqual({ ok: true, output: 'a b/c' });
  });

  it('rejects malformed percent-encoding', () => {
    expect(decode('url', '%zz').ok).toBe(false);
  });
});

describe('hex decoder', () => {
  it('decodes hex, with or without 0x', () => {
    expect(decode('hex', '68656c6c6f')).toEqual({ ok: true, output: 'hello' });
    expect(decode('hex', '0x6869')).toEqual({ ok: true, output: 'hi' });
  });

  it('rejects odd-length and non-hex', () => {
    expect(decode('hex', 'abc').ok).toBe(false);
    expect(decode('hex', 'xyz1').ok).toBe(false);
  });
});

describe('unicode decoder', () => {
  it('decodes \\uXXXX and \\u{...} escapes', () => {
    expect(decode('unicode', '\\u0068\\u0069')).toEqual({ ok: true, output: 'hi' });
    expect(decode('unicode', '\\u{1F600}')).toEqual({ ok: true, output: '😀' });
  });

  it('reports when there are no escapes', () => {
    expect(decode('unicode', 'plain text').ok).toBe(false);
  });
});

describe('jwt decoder', () => {
  it('decodes header and payload without verifying the signature', () => {
    const token = `${base64Url({ alg: 'HS256' })}.${base64Url({ sub: '123' })}.sig`;
    const result = decode('jwt', token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.output) as {
        header: unknown;
        payload: unknown;
        signature: unknown;
      };
      expect(parsed.header).toEqual({ alg: 'HS256' });
      expect(parsed.payload).toEqual({ sub: '123' });
      expect(parsed.signature).toBe('sig');
    }
  });

  it('rejects tokens that are not three segments', () => {
    expect(decode('jwt', 'only.two').ok).toBe(false);
  });
});
