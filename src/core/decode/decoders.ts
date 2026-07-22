/**
 * Deterministic, individually-explainable decoders.
 *
 * Each decoder is a pure function from text to text. Decoding never guesses: it
 * either produces a result or fails with a concrete reason. Detection (see
 * `detect.ts`) is separate — it only ranks which decoders are worth suggesting.
 *
 * @module
 */

/** Identifier of a decoder. */
export type DecoderId = 'base64' | 'url' | 'hex' | 'unicode' | 'jwt';

/** The result of applying a decoder. */
export type DecodeResult =
  { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

/** A decoder: a stable id, a human label, and a pure decode function. */
export interface Decoder {
  readonly id: DecoderId;
  readonly label: string;
  decode(input: string): DecodeResult;
}

const utf8 = new TextDecoder('utf-8', { fatal: false });

function bytesToText(bytes: Uint8Array): string {
  return utf8.decode(bytes);
}

function decodeBase64(input: string): DecodeResult {
  const cleaned = input.trim().replace(/\s+/g, '');
  if (cleaned === '') return { ok: false, error: 'Empty input.' };
  const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) {
    return { ok: false, error: 'Not valid base64 (unexpected characters).' };
  }
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { ok: true, output: bytesToText(bytes) };
  } catch {
    return { ok: false, error: 'base64 decoding failed.' };
  }
}

function decodeUrl(input: string): DecodeResult {
  try {
    return { ok: true, output: decodeURIComponent(input) };
  } catch {
    return { ok: false, error: 'Invalid percent-encoding.' };
  }
}

function decodeHex(input: string): DecodeResult {
  const cleaned = input.trim().replace(/^0x/i, '').replace(/\s+/g, '');
  if (cleaned === '' || cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    return { ok: false, error: 'Not valid hex (needs an even number of hex digits).' };
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16);
  }
  return { ok: true, output: bytesToText(bytes) };
}

function decodeUnicode(input: string): DecodeResult {
  try {
    const output = input
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_match, hex: string) =>
        String.fromCodePoint(Number.parseInt(hex, 16)),
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      )
      .replace(/\\x([0-9a-fA-F]{2})/g, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      );
    if (output === input) {
      return { ok: false, error: 'No \\u or \\x escape sequences found.' };
    }
    return { ok: true, output };
  } catch {
    return { ok: false, error: 'Invalid unicode escape (code point out of range).' };
  }
}

function base64UrlToJson(segment: string): unknown {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(bytesToText(bytes));
}

function decodeJwt(input: string): DecodeResult {
  const parts = input.trim().split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Not a JWT (expected three dot-separated segments).' };
  }
  try {
    const header = base64UrlToJson(parts[0] ?? '');
    const payload = base64UrlToJson(parts[1] ?? '');
    // Decode-only: the signature is shown but never verified (that needs a key).
    return {
      ok: true,
      output: JSON.stringify({ header, payload, signature: parts[2] }, null, 2),
    };
  } catch {
    return { ok: false, error: 'JWT segments are not valid base64url JSON.' };
  }
}

/** All decoders, keyed by id. */
export const DECODERS: Readonly<Record<DecoderId, Decoder>> = {
  base64: { id: 'base64', label: 'Base64', decode: decodeBase64 },
  url: { id: 'url', label: 'URL / percent', decode: decodeUrl },
  hex: { id: 'hex', label: 'Hex', decode: decodeHex },
  unicode: { id: 'unicode', label: 'Unicode escapes', decode: decodeUnicode },
  jwt: { id: 'jwt', label: 'JWT (decode-only)', decode: decodeJwt },
};

/** Ordered list of decoder ids. */
export const DECODER_IDS: readonly DecoderId[] = ['base64', 'url', 'hex', 'unicode', 'jwt'];

/** Apply a decoder by id. */
export function decode(id: DecoderId, input: string): DecodeResult {
  return DECODERS[id].decode(input);
}
