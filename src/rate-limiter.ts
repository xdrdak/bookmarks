/** Default rate limit: no limiting */
const DEFAULT_RATE_LIMIT_MS = 0;

/**
 * Rate limiter for controlling request frequency.
 * Ensures a minimum delay between operations.
 */
export class RateLimiter {
  private rateLimitMs: number;
  private lastRequestTime = 0;
  private pendingPromise: Promise<void> | null = null;

  constructor(rateLimitMs: number) {
    this.rateLimitMs = rateLimitMs;
  }

  /**
   * Wait until the next request is allowed.
   * Call this before making a rate-limited operation.
   */
  async waitForNext(): Promise<void> {
    // If there's already a pending wait, chain onto it
    if (this.pendingPromise) {
      await this.pendingPromise;
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const remaining = this.rateLimitMs - elapsed;

    if (remaining > 0) {
      this.pendingPromise = new Promise((resolve) => {
        setTimeout(resolve, remaining);
      });
      await this.pendingPromise;
      this.pendingPromise = null;
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Set the rate limit in milliseconds.
   */
  setRateLimit(ms: number): void {
    this.rateLimitMs = ms;
  }

  /**
   * Reset rate limiter state.
   */
  reset(): void {
    this.lastRequestTime = 0;
    this.pendingPromise = null;
    this.rateLimitMs = DEFAULT_RATE_LIMIT_MS;
  }
}
