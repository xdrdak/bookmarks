import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { BookmarkStore } from "./store.ts";

describe("BookmarkStore", () => {
  const testDir = join(import.meta.dirname, "test-fixtures", "store");
  const storePath = join(testDir, "bookmarks.json");

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

  describe("load", () => {
    it("should create empty store when file doesn't exist", async () => {
      const store = await BookmarkStore.load(storePath);

      expect(store.count()).toBe(0);
      expect(store.getAllUrls()).toEqual([]);
    });

    it("should load existing store data", async () => {
      const data = {
        "https://example.com": {
          url: "https://example.com",
          addedAt: "2026-01-01T00:00:00.000Z",
          summary: "Test summary",
        },
      };

      await writeFile(storePath, JSON.stringify(data), "utf-8");

      const store = await BookmarkStore.load(storePath);

      expect(store.count()).toBe(1);
      expect(store.get("https://example.com")).toEqual(data["https://example.com"]);
    });

    it("should throw on invalid JSON", async () => {
      await writeFile(storePath, "not valid json", "utf-8");

      await expect(BookmarkStore.load(storePath)).rejects.toThrow("Invalid JSON");
    });
  });

  describe("save", () => {
    it("should save store to file", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://example.com", { summary: "Test" });
      await store.save();

      expect(existsSync(storePath)).toBe(true);

      const content = JSON.parse(readFileSync(storePath, "utf-8"));
      expect(content["https://example.com"]).toBeDefined();
      expect(content["https://example.com"].summary).toBe("Test");
    });

    it("should create parent directories if needed", async () => {
      const nestedPath = join(testDir, "nested", "deep", "store.json");
      const store = await BookmarkStore.load(nestedPath);
      store.upsert("https://example.com", {});
      await store.save();

      expect(existsSync(nestedPath)).toBe(true);
    });

    it("should save valid JSON with formatting", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://example.com", { summary: "Test" });
      await store.save();

      const content = readFileSync(storePath, "utf-8");
      // Should be formatted with 2-space indentation
      expect(content).toContain("{\n");
      expect(content).toContain("  ");
    });
  });

  describe("upsert", () => {
    it("should create new bookmark with url and addedAt", async () => {
      const store = await BookmarkStore.load(storePath);
      const created = store.upsert("https://example.com", {});

      expect(created).toBe(true);
      const bookmark = store.get("https://example.com");
      expect(bookmark).toBeDefined();
      expect(bookmark?.url).toBe("https://example.com");
      expect(bookmark?.addedAt).toBeDefined();
    });

    it("should merge partial data into new bookmark", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://example.com", { summary: "Test summary", tags: ["tag1", "tag2"] });

      const bookmark = store.get("https://example.com");
      expect(bookmark?.summary).toBe("Test summary");
      expect(bookmark?.tags).toEqual(["tag1", "tag2"]);
    });

    it("should update existing bookmark without changing addedAt", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://example.com", { summary: "Original" });
      const originalAddedAt = store.get("https://example.com")?.addedAt;

      const created = store.upsert("https://example.com", { summary: "Updated" });

      expect(created).toBe(false);
      const bookmark = store.get("https://example.com");
      expect(bookmark?.summary).toBe("Updated");
      expect(bookmark?.addedAt).toBe(originalAddedAt);
    });

    it("should merge with existing data", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://example.com", { summary: "Test", read: false });

      store.upsert("https://example.com", { read: true, readAt: "2026-01-02" });

      const bookmark = store.get("https://example.com");
      expect(bookmark?.summary).toBe("Test"); // Should retain existing
      expect(bookmark?.read).toBe(true);
      expect(bookmark?.readAt).toBe("2026-01-02");
    });
  });

  describe("get", () => {
    it("should return undefined for non-existent URL", async () => {
      const store = await BookmarkStore.load(storePath);
      expect(store.get("https://notfound.com")).toBeUndefined();
    });

    it("should return bookmark for existing URL", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://example.com", { summary: "Test" });

      const bookmark = store.get("https://example.com");
      expect(bookmark?.summary).toBe("Test");
    });
  });

  describe("getAllUrls", () => {
    it("should return empty array for empty store", async () => {
      const store = await BookmarkStore.load(storePath);
      expect(store.getAllUrls()).toEqual([]);
    });

    it("should return all URLs", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://a.com", {});
      store.upsert("https://b.com", {});
      store.upsert("https://c.com", {});

      const urls = store.getAllUrls();
      expect(urls).toHaveLength(3);
      expect(urls).toContain("https://a.com");
      expect(urls).toContain("https://b.com");
      expect(urls).toContain("https://c.com");
    });
  });

  describe("has", () => {
    it("should return false for non-existent URL", async () => {
      const store = await BookmarkStore.load(storePath);
      expect(store.has("https://notfound.com")).toBe(false);
    });

    it("should return true for existing URL", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://example.com", {});
      expect(store.has("https://example.com")).toBe(true);
    });
  });

  describe("count", () => {
    it("should return 0 for empty store", async () => {
      const store = await BookmarkStore.load(storePath);
      expect(store.count()).toBe(0);
    });

    it("should return correct count", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://a.com", {});
      store.upsert("https://b.com", {});
      expect(store.count()).toBe(2);
    });
  });

  describe("filter", () => {
    it("should return empty array when no matches", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://a.com", { read: false });

      const results = store.filter((b) => b.read === true);
      expect(results).toEqual([]);
    });

    it("should return matching bookmarks", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://a.com", { read: true });
      store.upsert("https://b.com", { read: false });
      store.upsert("https://c.com", { read: true });

      const results = store.filter((b) => b.read === true);
      expect(results).toHaveLength(2);
      expect(results.map((b) => b.url)).toContain("https://a.com");
      expect(results.map((b) => b.url)).toContain("https://c.com");
    });
  });

  describe("getAll", () => {
    it("should return empty array for empty store", async () => {
      const store = await BookmarkStore.load(storePath);
      expect(store.getAll()).toEqual([]);
    });

    it("should return all bookmarks", async () => {
      const store = await BookmarkStore.load(storePath);
      store.upsert("https://a.com", { summary: "A" });
      store.upsert("https://b.com", { summary: "B" });

      const all = store.getAll();
      expect(all).toHaveLength(2);
    });
  });
});
