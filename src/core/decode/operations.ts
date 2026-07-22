/**
 * Codec operations: deterministic, reversible text conversions.
 *
 * Extends the decoders with encoders and defang/refang. Each operation is a pure
 * function from text to text that either succeeds or fails with a concrete
 * reason. A **chain** is a list of operation ids applied in order to an original
 * input; {@link computeChain} recomputes the whole sequence, so a step can be
 * removed or reordered and the result re-derived.
 *
 * @module
 */
import { decode } from './decoders';

/** Identifier of a codec operation. */
export type OperationId =
  | 'base64-decode'
  | 'base64-encode'
  | 'url-decode'
  | 'url-encode'
  | 'hex-decode'
  | 'hex-encode'
  | 'unicode-decode'
  | 'unicode-encode'
  | 'jwt-decode'
  | 'defang'
  | 'refang';

/** Grouping used to lay operations out in the UI. */
export type OperationGroup = 'decode' | 'encode' | 'defang';

/** The result of applying one operation. */
export type OperationResult =
  { readonly ok: true; readonly output: string } | { readonly ok: false; readonly error: string };

/** A codec operation. */
export interface Operation {
  readonly id: OperationId;
  readonly label: string;
  readonly group: OperationGroup;
  apply(input: string): OperationResult;
}

const utf8 = new TextEncoder();

function encodeBase64(input: string): OperationResult {
  const binary = Array.from(utf8.encode(input), (byte) => String.fromCharCode(byte)).join('');
  return { ok: true, output: btoa(binary) };
}

function encodeUrl(input: string): OperationResult {
  return { ok: true, output: encodeURIComponent(input) };
}

function encodeHex(input: string): OperationResult {
  const output = Array.from(utf8.encode(input), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return { ok: true, output };
}

function encodeUnicode(input: string): OperationResult {
  let output = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    output += code > 127 ? `\\u${code.toString(16).padStart(4, '0')}` : char;
  }
  return { ok: true, output };
}

function defang(input: string): OperationResult {
  const output = input
    .replace(/https?/gi, (match) => match.replace(/^http/i, 'hxxp'))
    .replace(/:\/\//g, '[://]')
    .replace(/\./g, '[.]')
    .replace(/@/g, '[@]');
  return { ok: true, output };
}

function refang(input: string): OperationResult {
  const output = input
    .replace(/\[\.\]/g, '.')
    .replace(/\[:\/\/\]/g, '://')
    .replace(/\[@\]/g, '@')
    .replace(/hxxps/gi, 'https')
    .replace(/hxxp/gi, 'http');
  return { ok: true, output };
}

/** All operations, keyed by id. */
export const OPERATIONS: Readonly<Record<OperationId, Operation>> = {
  'base64-decode': {
    id: 'base64-decode',
    label: 'Base64 decode',
    group: 'decode',
    apply: (input) => decode('base64', input),
  },
  'base64-encode': {
    id: 'base64-encode',
    label: 'Base64 encode',
    group: 'encode',
    apply: encodeBase64,
  },
  'url-decode': {
    id: 'url-decode',
    label: 'URL decode',
    group: 'decode',
    apply: (input) => decode('url', input),
  },
  'url-encode': { id: 'url-encode', label: 'URL encode', group: 'encode', apply: encodeUrl },
  'hex-decode': {
    id: 'hex-decode',
    label: 'Hex decode',
    group: 'decode',
    apply: (input) => decode('hex', input),
  },
  'hex-encode': { id: 'hex-encode', label: 'Hex encode', group: 'encode', apply: encodeHex },
  'unicode-decode': {
    id: 'unicode-decode',
    label: 'Unicode unescape',
    group: 'decode',
    apply: (input) => decode('unicode', input),
  },
  'unicode-encode': {
    id: 'unicode-encode',
    label: 'Unicode escape',
    group: 'encode',
    apply: encodeUnicode,
  },
  'jwt-decode': {
    id: 'jwt-decode',
    label: 'JWT decode',
    group: 'decode',
    apply: (input) => decode('jwt', input),
  },
  defang: { id: 'defang', label: 'Defang', group: 'defang', apply: defang },
  refang: { id: 'refang', label: 'Refang', group: 'defang', apply: refang },
};

/** All operation ids in display order. */
export const OPERATION_IDS: readonly OperationId[] = [
  'base64-decode',
  'base64-encode',
  'url-decode',
  'url-encode',
  'hex-decode',
  'hex-encode',
  'unicode-decode',
  'unicode-encode',
  'jwt-decode',
  'defang',
  'refang',
];

/** Apply a single operation by id. */
export function applyOperation(id: OperationId, input: string): OperationResult {
  return OPERATIONS[id].apply(input);
}

/** The outcome of computing a chain over an original input. */
export interface ChainResult {
  /** Value after each successful step, starting with the original at index 0. */
  readonly values: string[];
  /** The final value (last successful step). */
  readonly output: string;
  /** The step index that failed and its message, if any. */
  readonly failure: { readonly index: number; readonly error: string } | null;
}

/**
 * Apply a chain of operations to `original`, recording the value after each
 * step. Stops at the first failing step and reports it.
 *
 * @param original - The starting text.
 * @param chain - Operation ids to apply in order.
 * @returns The intermediate values, final output, and any failure.
 */
export function computeChain(original: string, chain: readonly OperationId[]): ChainResult {
  const values: string[] = [original];
  let current = original;
  for (let index = 0; index < chain.length; index += 1) {
    const result = applyOperation(chain[index] as OperationId, current);
    if (!result.ok) {
      return { values, output: current, failure: { index, error: result.error } };
    }
    current = result.output;
    values.push(current);
  }
  return { values, output: current, failure: null };
}
