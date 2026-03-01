import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand } from "citty";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { BookmarkStore } from "../../bookmarks.ts";
import { MarkdownStore, MarkdownFile } from "../../markdown.ts";
import { summarizeCommand } from "./summarize.ts";
import { LLMSummarizer } from "../../summarizer.ts";

describe("summarizeCommand", () => {
  const originalEnv = { ...process.env };
  const testDir = join(import.meta.dirname, "test-fixtures", "summarize");
  const contentDir = join(testDir, "content");

  let hasSpy: ReturnType<typeof vi.spyOn>;
  let getSpy: ReturnType<typeof vi.spyOn>;
  let summarizeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    process.env = { ...originalEnv, BOOKMARKS_OPENAI_API_KEY: "test-key" };
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    if (!existsSync(contentDir)) {
      mkdirSync(contentDir, { recursive: true });
    }

    // Track which URLs have content
    const contentMap = new Map<string, string>();

    // Spy on prototype methods
    hasSpy = vi.spyOn(MarkdownStore.prototype, "has").mockImplementation((url: string) => {
      return Promise.resolve(contentMap.has(url));
    });

    getSpy = vi.spyOn(MarkdownStore.prototype, "get").mockImplementation((url: string) => {
      const content = contentMap.get(url);
      return content
        ? Promise.resolve(new MarkdownFile(url, content))
        : Promise.reject(new Error("Not found"));
    });

    // Mock summarizer for fast tests
    let callCount = 0;
    summarizeSpy = vi.spyOn(LLMSummarizer.prototype, "summarize").mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        summary: `Mock summary ${callCount}`,
        tags: [`tag-${callCount}`],
      });
    });

    // Helper to add content for tests (URL -> content)
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
    hasSpy.mockRestore();
    getSpy.mockRestore();
    summarizeSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("should have correct meta information", async () => {
    const meta =
      typeof summarizeCommand.meta === "function" ? summarizeCommand.meta() : summarizeCommand.meta;
    const resolvedMeta = meta instanceof Promise ? await meta : meta;

    expect(resolvedMeta?.name).toBe("summarize");
    expect(resolvedMeta?.description).toContain("summaries");
  });

  it("should have correct args defined", async () => {
    const args =
      typeof summarizeCommand.args === "function" ? summarizeCommand.args() : summarizeCommand.args;
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

    await expect(runCommand(summarizeCommand, { rawArgs: [] })).rejects.toThrow("process.exit");

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
      runCommand(summarizeCommand, { rawArgs: ["https://example.com", "--all"] }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Cannot use both"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should error when BOOKMARKS_OPENAI_API_KEY is not set", async () => {
    delete process.env.BOOKMARKS_OPENAI_API_KEY;

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(summarizeCommand, { rawArgs: ["https://example.com"] }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("BOOKMARKS_OPENAI_API_KEY"));

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
      runCommand(summarizeCommand, {
        rawArgs: ["https://notfound.com", "--store", storePath],
      }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("not found in store"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should skip if already summarized without --force", async () => {
    const storePath = join(testDir, "existing.json");
    const url = "https://example.com";

    // Create store with existing summary
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, { summary: "Existing summary" });
    await store.save();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(summarizeCommand, {
      rawArgs: [url, "--store", storePath],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Already summarized"));

    consoleSpy.mockRestore();
  });

  it("should error when content file doesn't exist", async () => {
    const storePath = join(testDir, "no-content.json");
    const url = "https://example.com";

    // Create store without content
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(summarizeCommand, {
        rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
      }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Content not found"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should summarize URL and save to store", async () => {
    const storePath = join(testDir, "summarize.json");
    const url = "https://example.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    // Add content
    (
      globalThis as unknown as { __addContent: (url: string, content: string) => void }
    ).__addContent(url, "# Example Page\n\nContent here.");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(summarizeCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Summary and tags generated"));

    // Verify store was updated
    const updatedStore = await BookmarkStore.load(storePath);
    const bookmark = updatedStore.get(url);
    expect(bookmark?.summary).toBe("Mock summary 1");
    expect(bookmark?.tags).toEqual(["tag-1"]);
    expect(bookmark?.summarizedAt).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("should re-summarize with --force", async () => {
    const storePath = join(testDir, "force.json");
    const url = "https://example.com";

    // Create store with existing summary
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, { summary: "Old summary" });
    await store.save();

    // Add content
    (
      globalThis as unknown as { __addContent: (url: string, content: string) => void }
    ).__addContent(url, "Content");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(summarizeCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir, "--force"],
    });

    // Verify store was updated with new summary
    const updatedStore = await BookmarkStore.load(storePath);
    expect(updatedStore.get(url)?.summary).toBe("Mock summary 1");

    consoleSpy.mockRestore();
  });

  it("should summarize all bookmarks with --all", async () => {
    const storePath = join(testDir, "all.json");
    const url1 = "https://a.com";
    const url2 = "https://b.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url1, {});
    store.upsert(url2, {});
    await store.save();

    // Add content for both
    const addContent = (
      globalThis as unknown as { __addContent: (url: string, content: string) => void }
    ).__addContent;
    addContent(url1, "Content A");
    addContent(url2, "Content B");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(summarizeCommand, {
      rawArgs: ["--all", "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Summarized 2"));

    // Verify both summaries saved
    const updatedStore = await BookmarkStore.load(storePath);
    expect(updatedStore.get(url1)?.summary).toBeDefined();
    expect(updatedStore.get(url2)?.summary).toBeDefined();

    consoleSpy.mockRestore();
  });

  it("should skip bookmarks without content when using --all", async () => {
    const storePath = join(testDir, "skip.json");
    const url1 = "https://has-content.com";
    const url2 = "https://no-content.com";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url1, {});
    store.upsert(url2, {});
    await store.save();

    // Only url1 has content
    (
      globalThis as unknown as { __addContent: (url: string, content: string) => void }
    ).__addContent(url1, "Content");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(summarizeCommand, {
      rawArgs: ["--all", "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("1 skipped"));

    consoleSpy.mockRestore();
  });
});
