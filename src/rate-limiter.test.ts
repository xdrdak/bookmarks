import { describe, it, expect, beforeEach } from "vitest";
import { RateLimiter } from "./rate-limiter.ts";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(100);
  });

  describe("waitForNext", () => {
    it("should allow immediate first request", async () => {
      const start = Date.now();
      await limiter.waitForNext();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(20);
    });

    it("should enforce delay between requests", async () => {
      await limiter.waitForNext();

      const start = Date.now();
      await limiter.waitForNext();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90); // Small margin
    });

    it("should allow request after waiting full period", async () => {
      await limiter.waitForNext();

      // Wait longer than rate limit
      await new Promise((resolve) => setTimeout(resolve, 150));

      const start = Date.now();
      await limiter.waitForNext();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(20);
    });

    it("should handle zero rate limit (no limiting)", async () => {
      const noLimit = new RateLimiter(0);

      const start = Date.now();
      await noLimit.waitForNext();
      await noLimit.waitForNext();
      await noLimit.waitForNext();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(20);
    });
  });

  describe("setRateLimit", () => {
    it("should update rate limit", async () => {
      await limiter.waitForNext();

      limiter.setRateLimit(50);

      const start = Date.now();
      await limiter.waitForNext();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe("reset", () => {
    it("should reset state and rate limit", async () => {
      await limiter.waitForNext();
      limiter.reset();

      // After reset, should be like a fresh limiter with 0ms limit
      const start = Date.now();
      await limiter.waitForNext();
      await limiter.waitForNext();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(20);
    });
  });
});
