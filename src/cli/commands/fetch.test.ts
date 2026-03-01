import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand } from "citty";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { BookmarkStore } from "../../bookmarks.ts";
import { MarkdownStore, MarkdownFetcher, MarkdownFile } from "../../markdown.ts";
import { fetchCommand } from "./fetch.ts";

describe("fetchCommand", () => {
  const originalEnv = { ...process.env };
  const testDir = join(import.meta.dirname, "test-fixtures", "fetch");
  const contentDir = join(testDir, "content");

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let hasSpy: ReturnType<typeof vi.spyOn>;
  let saveSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    if (!existsSync(contentDir)) {
      mkdirSync(contentDir, { recursive: true });
    }

    // Track which URLs have content
    const contentMap = new Map<string, string>();

    // Spy on prototype methods
    fetchSpy = vi
      .spyOn(MarkdownFetcher.prototype, "fetch")
      .mockImplementation(async (url: string) => {
        contentMap.set(url, "mock content");
        return new MarkdownFile(url, "mock content");
      });

    hasSpy = vi.spyOn(MarkdownStore.prototype, "has").mockImplementation((url: string) => {
      return Promise.resolve(contentMap.has(url));
    });

    saveSpy = vi
      .spyOn(MarkdownStore.prototype, "save")
      .mockImplementation(async (file: MarkdownFile) => {
        contentMap.set(file.url, file.content);
        return join(contentDir, "saved.md");
      });
  });

  afterEach(() => {
    process.env = originalEnv;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    fetchSpy.mockRestore();
    hasSpy.mockRestore();
    saveSpy.mockRestore();
    vi.restoreAllMocks();
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

    // Content exists
    hasSpy.mockResolvedValueOnce(true);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("already fetched"));
    expect(fetchSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should fetch URL and save to disk", async () => {
    const storePath = join(testDir, "fetch.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Saved to:"));
    expect(fetchSpy).toHaveBeenCalledWith(url);
    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: url,
        content: "mock content",
      }),
    );

    // Verify store was updated
    const updatedStore = await BookmarkStore.load(storePath);
    expect(updatedStore.get(url)?.fetchedAt).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("should re-fetch with --force", async () => {
    const storePath = join(testDir, "force.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir, "--force"],
    });

    expect(fetchSpy).toHaveBeenCalledWith(url);

    consoleSpy.mockRestore();
  });

  it("should handle fetch errors", async () => {
    const storePath = join(testDir, "error.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    fetchSpy.mockRejectedValue(new Error("Network error"));

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

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: ["--all", "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("2 fetched"));
    expect(fetchSpy).toHaveBeenCalledTimes(2);

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

    // url1 exists, url2 doesn't
    let callCount = 0;
    hasSpy.mockImplementation(() => {
      callCount++;
      return Promise.resolve(callCount === 1); // First call (url1) returns true
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(fetchCommand, {
      rawArgs: ["--all", "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("1 skipped"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(url2);

    consoleSpy.mockRestore();
  });
});
