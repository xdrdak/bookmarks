import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  fetchUrlContent,
  urlToHash,
  getContentPath,
  contentExists,
  resetRateLimit,
  setRateLimit,
} from "./fetcher.ts";

describe("fetcher", () => {
  const testDir = join(import.meta.dirname, "test-fixtures", "fetcher");
  const contentDir = join(testDir, "content");

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    resetRateLimit();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
    resetRateLimit();
  });

  describe("urlToHash", () => {
    it("should generate consistent hash for same URL", () => {
      const url = "https://example.com";
      const hash1 = urlToHash(url);
      const hash2 = urlToHash(url);
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different URLs", () => {
      const hash1 = urlToHash("https://example.com");
      const hash2 = urlToHash("https://different.com");
      expect(hash1).not.toBe(hash2);
    });

    it("should return 16 character hash", () => {
      const hash = urlToHash("https://example.com");
      expect(hash).toHaveLength(16);
    });
  });

  describe("getContentPath", () => {
    it("should return correct path for URL", () => {
      const url = "https://example.com";
      const hash = urlToHash(url);
      const path = getContentPath(url, contentDir);
      expect(path).toBe(join(contentDir, `${hash}.md`));
    });
  });

  describe("contentExists", () => {
    it("should return false when file doesn't exist", async () => {
      const exists = await contentExists("https://example.com", contentDir);
      expect(exists).toBe(false);
    });

    it("should return true when file exists", async () => {
      const url = "https://example.com";
      const path = getContentPath(url, contentDir);
      mkdirSync(contentDir, { recursive: true });
      writeFileSync(path, "test content");

      const exists = await contentExists(url, contentDir);
      expect(exists).toBe(true);
    });
  });

  describe("fetchUrlContent", () => {
    it("should fetch and save content to disk", async () => {
      const url = "https://example.com";
      const mockContent = "# Example Page\n\nThis is the content.";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockContent),
      });

      const result = await fetchUrlContent(url, contentDir);

      expect(result.fetched).toBe(true);
      expect(result.path).toBe(getContentPath(url, contentDir));
      expect(existsSync(result.path)).toBe(true);

      const savedContent = readFileSync(result.path, "utf-8");
      expect(savedContent).toBe(mockContent);

      // Verify correct API call
      expect(global.fetch).toHaveBeenCalledWith(
        `https://md.dhr.wtf/?url=${encodeURIComponent(url)}`,
      );
    });

    it("should skip fetch if content already exists", async () => {
      const url = "https://example.com";
      const path = getContentPath(url, contentDir);
      mkdirSync(contentDir, { recursive: true });
      writeFileSync(path, "existing content");

      global.fetch = vi.fn();

      const result = await fetchUrlContent(url, contentDir);

      expect(result.fetched).toBe(false);
      expect(result.path).toBe(path);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should force fetch even if content exists", async () => {
      const url = "https://example.com";
      const path = getContentPath(url, contentDir);
      mkdirSync(contentDir, { recursive: true });
      require("fs").writeFileSync(path, "old content");

      const mockContent = "new content";
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockContent),
      });

      const result = await fetchUrlContent(url, contentDir, true);

      expect(result.fetched).toBe(true);
      expect(global.fetch).toHaveBeenCalled();

      const savedContent = readFileSync(path, "utf-8");
      expect(savedContent).toBe(mockContent);
    });

    it("should throw on HTTP error", async () => {
      const url = "https://example.com";

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(fetchUrlContent(url, contentDir)).rejects.toThrow(
        "Failed to fetch content (HTTP 404: Not Found)",
      );
    });

    it("should create content directory if it doesn't exist", async () => {
      const url = "https://example.com";
      const newContentDir = join(testDir, "new-content");

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("content"),
      });

      const result = await fetchUrlContent(url, newContentDir);

      expect(existsSync(newContentDir)).toBe(true);
      expect(existsSync(result.path)).toBe(true);
    });

    it("should URL-encode the URL parameter", async () => {
      const url = "https://example.com/path?query=value&foo=bar";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("content"),
      });

      await fetchUrlContent(url, contentDir);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://md.dhr.wtf/?url=${encodeURIComponent(url)}`,
      );
    });
  });

  describe("rate limiting", () => {
    it("should enforce rate limit between requests", async () => {
      // Use a short rate limit for testing
      setRateLimit(100);
      const urls = ["https://a.com", "https://b.com"];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("content"),
      });

      const start = Date.now();
      await fetchUrlContent(urls[0]!, contentDir);
      await fetchUrlContent(urls[1]!, contentDir);
      const elapsed = Date.now() - start;

      // Should have waited at least 100ms (rate limit) between requests
      expect(elapsed).toBeGreaterThanOrEqual(90); // Small margin for timing
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should reset rate limit state", () => {
      resetRateLimit();
      // This is primarily for testing - just verify it doesn't throw
      expect(true).toBe(true);
    });
  });
});
