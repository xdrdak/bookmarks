import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand } from "citty";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { BookmarkStore } from "../../bookmarks.ts";
import { MarkdownStore, MarkdownFetcher, MarkdownFile } from "../../markdown.ts";
import { processCommand } from "./process.ts";
import { LLMSummarizer } from "../../summarizer.ts";

describe("processCommand", () => {
  const originalEnv = { ...process.env };
  const testDir = join(import.meta.dirname, "test-fixtures", "process");
  const contentDir = join(testDir, "content");

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let hasSpy: ReturnType<typeof vi.spyOn>;
  let getSpy: ReturnType<typeof vi.spyOn>;
  let saveSpy: ReturnType<typeof vi.spyOn>;
  let summarizeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key" };
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

    getSpy = vi.spyOn(MarkdownStore.prototype, "get").mockImplementation((url: string) => {
      const content = contentMap.get(url);
      return content
        ? Promise.resolve(new MarkdownFile(url, content))
        : Promise.reject(new Error("Not found"));
    });

    saveSpy = vi
      .spyOn(MarkdownStore.prototype, "save")
      .mockImplementation(async (file: MarkdownFile) => {
        contentMap.set(file.url, file.content);
        return join(contentDir, "saved.md");
      });

    // Mock summarizer
    let callCount = 0;
    summarizeSpy = vi.spyOn(LLMSummarizer.prototype, "summarize").mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        summary: `Mock summary ${callCount}`,
        tags: [`tag-${callCount}`],
      });
    });

    // Helper to add content for tests
    (
      globalThis as unknown as { __addContent: (url: string, content: string) => void }
    ).__addContent = (url: string, content: string) => {
      contentMap.set(url, content);
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    fetchSpy.mockRestore();
    hasSpy.mockRestore();
    getSpy.mockRestore();
    saveSpy.mockRestore();
    summarizeSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("should have correct meta information", async () => {
    const meta =
      typeof processCommand.meta === "function" ? processCommand.meta() : processCommand.meta;
    const resolvedMeta = meta instanceof Promise ? await meta : meta;

    expect(resolvedMeta?.name).toBe("process");
    expect(resolvedMeta?.description).toContain("Fetch and summarize");
  });

  it("should have correct args defined", async () => {
    const args =
      typeof processCommand.args === "function" ? processCommand.args() : processCommand.args;
    const resolvedArgs = args instanceof Promise ? await args : args;

    expect(resolvedArgs).toHaveProperty("store");
    expect(resolvedArgs).toHaveProperty("contentDir");
    expect(resolvedArgs).toHaveProperty("force");
  });

  it("should error when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(runCommand(processCommand, { rawArgs: [] })).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("GEMINI_API_KEY"));

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
      runCommand(processCommand, {
        rawArgs: ["https://notfound.com", "--store", storePath],
      }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("not found in store"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should fetch and summarize a single URL", async () => {
    const storePath = join(testDir, "single.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(processCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalled();

    // Verify summarize was called
    expect(summarizeSpy).toHaveBeenCalled();

    // Verify store was updated with summary and tags
    const updatedStore = await BookmarkStore.load(storePath);
    const bookmark = updatedStore.get(url);
    expect(bookmark?.summary).toBe("Mock summary 1");
    expect(bookmark?.tags).toEqual(["tag-1"]);
    expect(bookmark?.fetchedAt).toBeDefined();
    expect(bookmark?.summarizedAt).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("should skip fetch if content already exists", async () => {
    const storePath = join(testDir, "skip-fetch.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    // Pre-add content
    (
      globalThis as unknown as { __addContent: (url: string, content: string) => void }
    ).__addContent(url, "Existing content");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(processCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    // Verify fetch was NOT called (content already exists)
    expect(fetchSpy).not.toHaveBeenCalled();

    // Verify summarize was still called
    expect(summarizeSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should skip summarize if already summarized without --force", async () => {
    const storePath = join(testDir, "skip-summarize.json");
    const url = "https://example.com";

    // Create store with existing summary
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, { summary: "Existing summary", tags: ["existing"] });
    await store.save();

    // Pre-add content
    (
      globalThis as unknown as { __addContent: (url: string, content: string) => void }
    ).__addContent(url, "Content");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(processCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Already summarized"));

    consoleSpy.mockRestore();
  });

  it("should re-fetch and re-summarize with --force", async () => {
    const storePath = join(testDir, "force.json");
    const url = "https://example.com";

    // Create store with existing data
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, { summary: "Old summary", tags: ["old"], fetchedAt: "2025-01-01" });
    await store.save();

    // Pre-add content
    (
      globalThis as unknown as { __addContent: (url: string, content: string) => void }
    ).__addContent(url, "Content");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(processCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir, "--force"],
    });

    // Verify fetch was called (even though content existed)
    expect(fetchSpy).toHaveBeenCalled();

    // Verify summarize was called
    expect(summarizeSpy).toHaveBeenCalled();

    // Verify store was updated
    const updatedStore = await BookmarkStore.load(storePath);
    const bookmark = updatedStore.get(url);
    expect(bookmark?.summary).toBe("Mock summary 1");
    expect(bookmark?.tags).toEqual(["tag-1"]);

    consoleSpy.mockRestore();
  });

  it("should process all bookmarks when no URL provided", async () => {
    const storePath = join(testDir, "all.json");
    const url1 = "https://a.com";
    const url2 = "https://b.com";

    // Create store with multiple bookmarks
    const store = await BookmarkStore.load(storePath);
    store.upsert(url1, {});
    store.upsert(url2, {});
    await store.save();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(processCommand, {
      rawArgs: ["--store", storePath, "--contentDir", contentDir],
    });

    // Verify both were processed
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(summarizeSpy).toHaveBeenCalledTimes(2);

    // Verify store was updated
    const updatedStore = await BookmarkStore.load(storePath);
    expect(updatedStore.get(url1)?.summary).toBeDefined();
    expect(updatedStore.get(url2)?.summary).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("should skip already processed bookmarks when processing all", async () => {
    const storePath = join(testDir, "skip-all.json");
    const url1 = "https://has-summary.com";
    const url2 = "https://no-summary.com";

    // Create store - one with summary, one without
    const store = await BookmarkStore.load(storePath);
    store.upsert(url1, { summary: "Done" });
    store.upsert(url2, {});
    await store.save();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(processCommand, {
      rawArgs: ["--store", storePath, "--contentDir", contentDir],
    });

    // Only url2 should be processed
    expect(summarizeSpy).toHaveBeenCalledTimes(1);

    consoleSpy.mockRestore();
  });

  it("should handle fetch errors gracefully", async () => {
    const storePath = join(testDir, "fetch-error.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    // Make fetch fail
    fetchSpy.mockRejectedValue(new Error("Network error"));

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(processCommand, {
        rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
      }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Error fetching"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should handle summarize errors when processing all", async () => {
    const storePath = join(testDir, "summarize-error.json");
    const url1 = "https://good.com";
    const url2 = "https://bad.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url1, {});
    store.upsert(url2, {});
    await store.save();

    // Make summarize fail for second URL
    let callCount = 0;
    summarizeSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ summary: "Good", tags: ["ok"] });
      }
      return Promise.reject(new Error("Summarize failed"));
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runCommand(processCommand, {
      rawArgs: ["--store", storePath, "--contentDir", contentDir],
    });

    // Should continue processing despite error
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Error processing"));

    // First URL should still be saved
    const updatedStore = await BookmarkStore.load(storePath);
    expect(updatedStore.get(url1)?.summary).toBe("Good");

    consoleSpy.mockRestore();
  });
});
