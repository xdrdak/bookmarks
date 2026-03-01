import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { MarkdownFile, MarkdownFetcher, MarkdownStore } from "./markdown.ts";
import { RateLimiter } from "./rate-limiter.ts";

describe("MarkdownFile", () => {
  it("should store url and content", () => {
    const file = new MarkdownFile("https://example.com", "# Hello\n\nContent here.");
    expect(file.url).toBe("https://example.com");
    expect(file.content).toBe("# Hello\n\nContent here.");
  });
});

describe("MarkdownFetcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetch", () => {
    it("should fetch markdown content and return MarkdownFile", async () => {
      const fetcher = new MarkdownFetcher(new RateLimiter(1));
      const url = "https://example.com";
      const mockContent = "# Example Page\n\nThis is the content.";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockContent),
      });

      const result = await fetcher.fetch(url);

      expect(result).toBeInstanceOf(MarkdownFile);
      expect(result.content).toBe(mockContent);
      expect(result.url).toBe(url);
      expect(global.fetch).toHaveBeenCalledWith(`https://r.jina.ai/${url}`);
    });

    it("should throw on HTTP error", async () => {
      const fetcher = new MarkdownFetcher(new RateLimiter(1));
      const url = "https://example.com";

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(fetcher.fetch(url)).rejects.toThrow(
        "Failed to fetch content (HTTP 404: Not Found)",
      );
    });

    it("should pass URL directly in path", async () => {
      const fetcher = new MarkdownFetcher(new RateLimiter(1));
      const url = "https://example.com/path?query=value&foo=bar";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("content"),
      });

      await fetcher.fetch(url);

      expect(global.fetch).toHaveBeenCalledWith(`https://r.jina.ai/${url}`);
    });

    it("should disable rate limiting when passed null", async () => {
      const fetcher = new MarkdownFetcher(null);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("content"),
      });

      const start = Date.now();
      await fetcher.fetch("https://a.com");
      await fetcher.fetch("https://b.com");
      const elapsed = Date.now() - start;

      // Should be nearly instant without rate limiting
      expect(elapsed).toBeLessThan(50);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("rate limiting", () => {
    it("should enforce rate limit between requests", async () => {
      const fetcher = new MarkdownFetcher(new RateLimiter(100));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("content"),
      });

      const start = Date.now();
      await fetcher.fetch("https://a.com");
      await fetcher.fetch("https://b.com");
      const elapsed = Date.now() - start;

      // Should have waited at least 100ms (rate limit) between requests
      expect(elapsed).toBeGreaterThanOrEqual(90); // Small margin for timing
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should use shared RateLimiter instance", async () => {
      const rateLimiter = new RateLimiter(100);
      const fetcher1 = new MarkdownFetcher(rateLimiter);
      const fetcher2 = new MarkdownFetcher(rateLimiter);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("content"),
      });

      const start = Date.now();
      await fetcher1.fetch("https://a.com");
      await fetcher2.fetch("https://b.com");
      const elapsed = Date.now() - start;

      // Shared rate limiter should coordinate between fetchers
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });
});

describe("MarkdownStore", () => {
  const testDir = join(import.meta.dirname, "test-fixtures", "markdown-store");
  const contentDir = join(testDir, "content");

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("getPath", () => {
    it("should return path with .md extension", () => {
      const store = new MarkdownStore(contentDir);
      const path = store.getPath("https://example.com");
      expect(path.endsWith(".md")).toBe(true);
      expect(path.startsWith(contentDir)).toBe(true);
    });

    it("should return consistent path for same URL", () => {
      const store = new MarkdownStore(contentDir);
      const path1 = store.getPath("https://example.com");
      const path2 = store.getPath("https://example.com");
      expect(path1).toBe(path2);
    });

    it("should return different paths for different URLs", () => {
      const store = new MarkdownStore(contentDir);
      const path1 = store.getPath("https://example.com");
      const path2 = store.getPath("https://different.com");
      expect(path1).not.toBe(path2);
    });
  });

  describe("has", () => {
    it("should return false when file doesn't exist", async () => {
      const store = new MarkdownStore(contentDir);
      const has = await store.has("https://example.com");
      expect(has).toBe(false);
    });

    it("should return true when file exists", async () => {
      const store = new MarkdownStore(contentDir);
      const url = "https://example.com";
      const path = store.getPath(url);
      mkdirSync(contentDir, { recursive: true });
      writeFileSync(path, "test content");

      const has = await store.has(url);
      expect(has).toBe(true);
    });
  });

  describe("save", () => {
    it("should save MarkdownFile to disk and return path", async () => {
      const store = new MarkdownStore(contentDir);
      const file = new MarkdownFile(
        "https://example.com",
        "# Example Page\n\nThis is the content.",
      );

      const path = await store.save(file);

      expect(existsSync(path)).toBe(true);
      expect(path).toBe(store.getPath(file.url));

      const savedContent = readFileSync(path, "utf-8");
      expect(savedContent).toBe(file.content);
    });

    it("should create content directory if it doesn't exist", async () => {
      const newContentDir = join(testDir, "new-content");
      const store = new MarkdownStore(newContentDir);
      const file = new MarkdownFile("https://example.com", "content");

      const path = await store.save(file);

      expect(existsSync(newContentDir)).toBe(true);
      expect(existsSync(path)).toBe(true);
    });

    it("should overwrite existing content", async () => {
      const store = new MarkdownStore(contentDir);
      const url = "https://example.com";

      await store.save(new MarkdownFile(url, "old content"));
      await store.save(new MarkdownFile(url, "new content"));

      const file = await store.get(url);
      expect(file.content).toBe("new content");
    });
  });

  describe("get", () => {
    it("should read MarkdownFile from disk", async () => {
      const store = new MarkdownStore(contentDir);
      const originalFile = new MarkdownFile(
        "https://example.com",
        "# Example Page\n\nContent here.",
      );

      await store.save(originalFile);
      const result = await store.get("https://example.com");

      expect(result).toBeInstanceOf(MarkdownFile);
      expect(result.url).toBe("https://example.com");
      expect(result.content).toBe(originalFile.content);
    });

    it("should throw when file doesn't exist", async () => {
      const store = new MarkdownStore(contentDir);

      await expect(store.get("https://nonexistent.com")).rejects.toThrow();
    });
  });
});
