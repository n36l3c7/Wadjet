import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../../src/core/enrich/rate-limit';

describe('TokenBucket', () => {
  it('allows up to capacity, then blocks', () => {
    const clock = 0;
    const bucket = new TokenBucket({ capacity: 2, refillPerMinute: 60, now: () => clock });
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(false);
  });

  it('refills over time', () => {
    let clock = 0;
    // 60/min = 1 token per second.
    const bucket = new TokenBucket({ capacity: 1, refillPerMinute: 60, now: () => clock });
    expect(bucket.tryTake()).toBe(true);
    expect(bucket.tryTake()).toBe(false);
    clock = 1000;
    expect(bucket.tryTake()).toBe(true);
  });

  it('never exceeds capacity when idle', () => {
    let clock = 0;
    const bucket = new TokenBucket({ capacity: 3, refillPerMinute: 600, now: () => clock });
    clock = 60_000;
    expect(bucket.available).toBe(3);
  });
});
