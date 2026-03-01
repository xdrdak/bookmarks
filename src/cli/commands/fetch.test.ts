import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand } from "citty";
import { fetchCommand } from "./fetch.ts";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { BookmarkStore } from "../../store.ts";
import { getContentPath } from "../../fetcher.ts";

describe("fetchCommand", () => {
  const originalEnv = { ...process.env };
  const testDir = join(import.meta.dirname, "test-fixtures", "fetch");
  const contentDir = join(testDir, "content");

  beforeEach(async () => {
    process.env = { ...originalEnv };
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    if (!existsSync(contentDir)) {
      mkdirSync(contentDir, { recursive: true });
    }

    // Reset and set rate limiters to very short values for testing
    const fetcher = await import("../../fetcher.ts");
    fetcher.resetRateLimit();
    fetcher.setRateLimit(1);
  });

  afterEach(() => {
    process.env = originalEnv;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).fetch;
  });

  it("should have correct meta information", async () => {
    const meta = typeof fetchCommand.meta === "function" ? fetchCommand.meta() : fetchCommand.meta;
    const resolvedMeta = meta instanceof Promise ? await meta : meta;

    expect(resolvedMeta?.name).toBe("fetch");
    expect(resolvedMeta?.description).toContain("Fetch");
  });

  it("should have correct args defined", async () => {
    const args = typeof fetchCommand.args === "function" ? fetchCommand.args() : fetchCommand.args;
    const resolvedArgs = args instanceof Promise ? await args : args;

    expect(resolvedArgs).toHaveProperty("store");
    expect(resolvedArgs).toHaveProperty("contentDir");
    expect(resolvedArgs).toHaveProperty("force");
    expect(resolvedArgs).toHaveProperty("all");
  });

  it("should error when no URL and no --all provided", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(runCommand(fetchCommand, { rawArgs: [] })).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Provide a URL or use --all"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should error when both URL and --all provided", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(fetchCommand, { rawArgs: ["https://example.com", "--all"] }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Cannot use both"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should error when URL not in store", async () => {
    const storePath = join(testDir, "store.json");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(fetchCommand, {
        rawArgs: ["https://notfound.com", "--store", storePath],
      }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("not found in store"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should skip if content already exists without --force", async () => {
    const storePath = join(testDir, "existing.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    // Create content file
    const contentPath = getContentPath(url, contentDir);
    writeFileSync(contentPath, "existing content");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("already fetched"));

    consoleSpy.mockRestore();
  });

  it("should fetch URL and save to disk", async () => {
    const storePath = join(testDir, "fetch.json");
    const url = "https://example.com";
    const mockContent = "# Fetched Content\n\nThis is the page.";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    // Mock fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockContent),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Saved to:"));

    // Verify content was saved
    const contentPath = getContentPath(url, contentDir);
    expect(existsSync(contentPath)).toBe(true);
    const savedContent = readFileSync(contentPath, "utf-8");
    expect(savedContent).toBe(mockContent);

    // Verify store was updated
    const updatedStore = await BookmarkStore.load(storePath);
    expect(updatedStore.get(url)?.fetchedAt).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("should re-fetch with --force", async () => {
    const storePath = join(testDir, "force.json");
    const url = "https://example.com";
    const newContent = "New fetched content";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    // Create old content
    const contentPath = getContentPath(url, contentDir);
    writeFileSync(contentPath, "old content");

    // Mock fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(newContent),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir, "--force"],
    });

    // Verify content was updated
    const savedContent = readFileSync(contentPath, "utf-8");
    expect(savedContent).toBe(newContent);

    consoleSpy.mockRestore();
  });

  it("should handle fetch errors", async () => {
    const storePath = join(testDir, "error.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    // Mock fetch failure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(fetchCommand, {
        rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
      }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Error fetching"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should fetch all bookmarks with --all", async () => {
    const storePath = join(testDir, "all.json");
    const url1 = "https://a.com";
    const url2 = "https://b.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url1, {});
    store.upsert(url2, {});
    await store.save();

    // Mock fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("fetched content"),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: ["--all", "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("2 fetched"));

    // Verify both content files exist
    expect(existsSync(getContentPath(url1, contentDir))).toBe(true);
    expect(existsSync(getContentPath(url2, contentDir))).toBe(true);

    consoleSpy.mockRestore();
  });

  it("should skip bookmarks with existing content when using --all", async () => {
    const storePath = join(testDir, "skip.json");
    const url1 = "https://has-content.com";
    const url2 = "https://no-content.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url1, {});
    store.upsert(url2, {});
    await store.save();

    // Create content for url1
    writeFileSync(getContentPath(url1, contentDir), "existing");

    // Mock fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("fetched"),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: ["--all", "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("1 skipped"));

    consoleSpy.mockRestore();
  });
});
