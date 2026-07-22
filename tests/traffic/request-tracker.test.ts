import { describe, expect, it } from 'vitest';
import { RequestTracker } from '../../src/core/traffic/request-tracker';

function makeTracker(retainSensitive = false): RequestTracker {
  return new RequestTracker({ retainSensitive });
}

describe('RequestTracker', () => {
  it('assembles a completed request with redacted headers', () => {
    const tracker = makeTracker();
    tracker.onStart({
      requestId: '1',
      url: 'https://example.com/a',
      method: 'GET',
      resourceType: 'main_frame',
      timeStamp: 100,
    });
    tracker.onRequestHeaders({
      requestId: '1',
      requestHeaders: [
        { name: 'Authorization', value: 'Bearer x' },
        { name: 'Accept', value: '*/*' },
      ],
      timeStamp: 110,
    });
    tracker.onResponseHeaders({
      requestId: '1',
      statusCode: 200,
      responseHeaders: [{ name: 'Set-Cookie', value: 'sid=1' }],
      timeStamp: 150,
    });
    const captured = tracker.onCompleted({
      requestId: '1',
      statusCode: 200,
      fromCache: false,
      remoteIp: '1.2.3.4',
      responseHeaders: [{ name: 'Set-Cookie', value: 'sid=1' }],
      timeStamp: 200,
    });

    expect(captured).toBeDefined();
    expect(captured?.method).toBe('GET');
    expect(captured?.statusCode).toBe(200);
    expect(captured?.remoteIp).toBe('1.2.3.4');
    expect(captured?.outcome).toBe('completed');
    expect(captured?.timings).toEqual({ startedAt: 100, responseStartedAt: 150, completedAt: 200 });
    expect(captured?.requestHeaders.find((h) => h.name === 'Authorization')?.redacted).toBe(true);
    expect(captured?.requestHeaders.find((h) => h.name === 'Accept')?.redacted).toBe(false);
    expect(captured?.responseHeaders.find((h) => h.name === 'Set-Cookie')?.redacted).toBe(true);
    expect(tracker.pending).toBe(0);
  });

  it('accumulates the redirect chain across hops', () => {
    const tracker = makeTracker();
    tracker.onStart({
      requestId: '2',
      url: 'http://example.com',
      method: 'GET',
      resourceType: 'main_frame',
      timeStamp: 0,
    });
    tracker.onRedirect({
      requestId: '2',
      url: 'http://example.com',
      redirectUrl: 'https://example.com',
      statusCode: 301,
      timeStamp: 10,
    });
    const captured = tracker.onCompleted({
      requestId: '2',
      statusCode: 200,
      fromCache: false,
      remoteIp: null,
      responseHeaders: [],
      timeStamp: 20,
    });

    expect(captured?.redirectChain).toHaveLength(1);
    expect(captured?.redirectChain[0]).toMatchObject({
      fromUrl: 'http://example.com',
      toUrl: 'https://example.com',
      statusCode: 301,
    });
  });

  it('finalizes an errored request', () => {
    const tracker = makeTracker();
    tracker.onStart({
      requestId: '3',
      url: 'https://example.com',
      method: 'POST',
      resourceType: 'xmlhttprequest',
      timeStamp: 5,
    });
    const captured = tracker.onError({
      requestId: '3',
      error: 'NS_ERROR_NET_RESET',
      timeStamp: 9,
    });

    expect(captured?.outcome).toBe('error');
    expect(captured?.error).toBe('NS_ERROR_NET_RESET');
    expect(captured?.statusCode).toBeNull();
  });

  it('drops terminal events whose start was missed', () => {
    const tracker = makeTracker();
    const captured = tracker.onCompleted({
      requestId: 'unknown',
      statusCode: 200,
      fromCache: false,
      remoteIp: null,
      responseHeaders: [],
      timeStamp: 1,
    });
    expect(captured).toBeUndefined();
  });

  it('retains raw sensitive values when configured to', () => {
    const tracker = makeTracker(true);
    tracker.onStart({
      requestId: '4',
      url: 'https://example.com',
      method: 'GET',
      resourceType: 'other',
      timeStamp: 0,
    });
    tracker.onRequestHeaders({
      requestId: '4',
      requestHeaders: [{ name: 'Cookie', value: 'sid=raw' }],
      timeStamp: 1,
    });
    const captured = tracker.onCompleted({
      requestId: '4',
      statusCode: 204,
      fromCache: false,
      remoteIp: null,
      responseHeaders: [],
      timeStamp: 2,
    });

    expect(captured?.sensitiveRetained).toBe(true);
    expect(captured?.requestHeaders[0]).toEqual({
      name: 'Cookie',
      value: 'sid=raw',
      redacted: false,
    });
  });
});
