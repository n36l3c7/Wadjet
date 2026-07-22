/**
 * A token-bucket rate limiter.
 *
 * Tokens refill continuously at a fixed per-minute rate up to a capacity. Each
 * allowed request consumes one token; when none are available the caller backs
 * off (the enrichment service treats that as "try again shortly" and serves
 * cache instead). The clock is injectable for deterministic tests.
 *
 * @module
 */

/** Options for a {@link TokenBucket}. */
export interface TokenBucketOptions {
  /** Maximum tokens held at once. */
  readonly capacity: number;
  /** Tokens added per minute. */
  readonly refillPerMinute: number;
  /** Clock in epoch milliseconds; defaults to {@link Date.now}. */
  readonly now?: () => number;
}

/** A continuously-refilling token bucket. */
export class TokenBucket {
  readonly #capacity: number;
  readonly #refillPerMs: number;
  readonly #now: () => number;
  #tokens: number;
  #last: number;

  constructor(options: TokenBucketOptions) {
    this.#capacity = options.capacity;
    this.#refillPerMs = options.refillPerMinute / 60_000;
    this.#now = options.now ?? (() => Date.now());
    this.#tokens = options.capacity;
    this.#last = this.#now();
  }

  #refill(): void {
    const now = this.#now();
    const elapsed = Math.max(0, now - this.#last);
    this.#tokens = Math.min(this.#capacity, this.#tokens + elapsed * this.#refillPerMs);
    this.#last = now;
  }

  /** Try to consume a token. Returns true if one was available. */
  tryTake(): boolean {
    this.#refill();
    if (this.#tokens >= 1) {
      this.#tokens -= 1;
      return true;
    }
    return false;
  }

  /** Whole tokens currently available. */
  get available(): number {
    this.#refill();
    return Math.floor(this.#tokens);
  }
}
