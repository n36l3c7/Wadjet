/**
 * Deterministic encoding detection.
 *
 * Given a string, rank which decoders are worth suggesting and say **why** each
 * one fired. This is heuristic *suggestion* only — every candidate is
 * rule-based and explainable, the analyst always chooses, and detection never
 * decides on its own. It is not a classifier and produces no verdict.
 *
 * @module
 */
import type { DecoderId } from './decoders';

/** A suggested decoder with a confidence score and a plain-language reason. */
export interface Candidate {
  readonly id: DecoderId;
  /** Rough confidence in [0, 1]; used only for ordering suggestions. */
  readonly confidence: number;
  /** Why this decoder was suggested (shown to the analyst). */
  readonly reason: string;
}

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const BASE64_STD_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64_URL_RE = /^[A-Za-z0-9_-]+$/;
const HEX_RE = /^(0x)?[0-9a-fA-F]+$/;
const PERCENT_RE = /%[0-9A-Fa-f]{2}/;
const UNICODE_ESCAPE_RE = /\\u[0-9a-fA-F]{4}|\\u\{[0-9a-fA-F]+\}|\\x[0-9a-fA-F]{2}/;

/**
 * Rank the decoders worth suggesting for `input`, most confident first.
 *
 * @param input - The text to inspect.
 * @returns Candidates in descending confidence order (possibly empty).
 */
export function detect(input: string): Candidate[] {
  const value = input.trim();
  const candidates: Candidate[] = [];
  if (value === '') return candidates;

  const compact = value.replace(/\s+/g, '');

  if (JWT_RE.test(value) && value.split('.').length === 3) {
    candidates.push({
      id: 'jwt',
      confidence: 0.95,
      reason: 'Three base64url segments separated by dots.',
    });
  }

  if (PERCENT_RE.test(value)) {
    candidates.push({
      id: 'url',
      confidence: 0.8,
      reason: 'Contains percent-encoded octets (%XX).',
    });
  }

  if (UNICODE_ESCAPE_RE.test(value)) {
    candidates.push({
      id: 'unicode',
      confidence: 0.8,
      reason: 'Contains \\u or \\x escape sequences.',
    });
  }

  const hexCore = compact.replace(/^0x/i, '');
  if (HEX_RE.test(compact) && hexCore.length >= 2 && hexCore.length % 2 === 0) {
    candidates.push({
      id: 'hex',
      confidence: 0.55,
      reason: 'Even-length string of hex digits.',
    });
  }

  const looksBase64 =
    compact.length >= 8 &&
    compact.length % 4 === 0 &&
    (BASE64_STD_RE.test(compact) || BASE64_URL_RE.test(compact));
  if (looksBase64) {
    candidates.push({
      id: 'base64',
      confidence: 0.5,
      reason: 'Length is a multiple of 4 with a valid base64 alphabet.',
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}
