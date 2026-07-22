/**
 * HAR 1.2 export of captured requests.
 *
 * Only `request` entries contribute. Header values are exported exactly as
 * stored — i.e. redacted values remain `[redacted]`, so the HAR never leaks a
 * secret. Bodies were never captured (Wave 2), so `content`/`postData` are
 * empty; sizes are reported as `-1` per the HAR convention for "unknown".
 *
 * @module
 */
import type { CaseEntry, RequestEntry } from '../case/types';

function queryStringOf(url: string): { name: string; value: string }[] {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function toHarEntry(entry: RequestEntry): unknown {
  const startedDateTime = new Date(entry.timings.startedAt).toISOString();
  const time =
    entry.timings.completedAt !== null
      ? Math.max(0, entry.timings.completedAt - entry.timings.startedAt)
      : 0;
  return {
    startedDateTime,
    time,
    request: {
      method: entry.method,
      url: entry.url,
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: entry.requestHeaders.map((header) => ({ name: header.name, value: header.value })),
      queryString: queryStringOf(entry.url),
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: entry.statusCode ?? 0,
      statusText: '',
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: entry.responseHeaders.map((header) => ({ name: header.name, value: header.value })),
      content: { size: 0, mimeType: '' },
      redirectURL: entry.redirectChain.at(-1)?.toUrl ?? '',
      headersSize: -1,
      bodySize: -1,
    },
    cache: {},
    timings: { send: -1, wait: -1, receive: -1 },
    _wadjet: {
      outcome: entry.outcome,
      error: entry.error,
      fromCache: entry.fromCache,
      remoteIp: entry.remoteIp,
      sensitiveRetained: entry.sensitiveRetained,
    },
  };
}

/** Build a HAR 1.2 document (as a JSON string) from a case's request entries. */
export function buildHar(entries: readonly CaseEntry[], options: { toolVersion: string }): string {
  const requests = entries.filter((entry): entry is RequestEntry => entry.kind === 'request');
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'Wadjet', version: options.toolVersion },
      entries: requests
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(toHarEntry),
    },
  };
  return JSON.stringify(har, null, 2);
}
