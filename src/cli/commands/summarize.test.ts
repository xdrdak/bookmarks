import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand } from "citty";
import { summarizeCommand } from "./summarize.ts";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { BookmarkStore } from "../../store.ts";
import { getContentPath } from "../../fetcher.ts";

describe("summarizeCommand", () => {
  const originalEnv = { ...process.env };
  const testDir = join(import.meta.dirname, "test-fixtures", "summarize");
  const contentDir = join(testDir, "content");

  beforeEach(async () => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key" };
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    if (!existsSync(contentDir)) {
      mkdirSync(contentDir, { recursive: true });
    }

    // Reset and set rate limiters to very short values for testing
    const llm = await import("../../llm.ts");
    llm.resetRateLimit();
    llm.setRateLimit(1);

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

  it("should error when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(summarizeCommand, { rawArgs: ["https://example.com"] }),
    ).rejects.toThrow("process.exit");

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
    const mockSummary = "This is the generated summary.";

    // Create store
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, {});
    await store.save();

    // Create content file - ensure directory exists
    const contentPath = getContentPath(url, contentDir);
    const contentDirForFile = join(contentPath, "..");
    if (!existsSync(contentDirForFile)) {
      mkdirSync(contentDirForFile, { recursive: true });
    }
    writeFileSync(contentPath, "# Example Page\n\nContent here.");

    // Mock LLM API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: mockSummary }] } }],
        }),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(summarizeCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Summary generated"));

    // Verify store was updated
    const updatedStore = await BookmarkStore.load(storePath);
    const bookmark = updatedStore.get(url);
    expect(bookmark?.summary).toBe(mockSummary);
    expect(bookmark?.summarizedAt).toBeDefined();
    expect(bookmark?.summarizedWith).toBe("gemini-2.0-flash");

    consoleSpy.mockRestore();
  });

  it("should re-summarize with --force", async () => {
    const storePath = join(testDir, "force.json");
    const url = "https://example.com";
    const newSummary = "New and improved summary.";

    // Create store with existing summary
    const store = await BookmarkStore.load(storePath);
    store.upsert(url, { summary: "Old summary" });
    await store.save();

    // Create content file
    const contentPath = getContentPath(url, contentDir);
    writeFileSync(contentPath, "Content");

    // Mock LLM API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: newSummary }] } }],
        }),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(summarizeCommand, {
      rawArgs: [url, "--store", storePath, "--contentDir", contentDir, "--force"],
    });

    // Verify store was updated with new summary
    const updatedStore = await BookmarkStore.load(storePath);
    expect(updatedStore.get(url)?.summary).toBe(newSummary);

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

    // Create content files
    writeFileSync(getContentPath(url1, contentDir), "Content A");
    writeFileSync(getContentPath(url2, contentDir), "Content B");

    let callCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: `Summary ${callCount}` }] } }],
          }),
      });
    });

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

    // Create content for only url1
    writeFileSync(getContentPath(url1, contentDir), "Content");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: "Summary" }] } }],
        }),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(summarizeCommand, {
      rawArgs: ["--all", "--store", storePath, "--contentDir", contentDir],
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("1 skipped"));

    consoleSpy.mockRestore();
  });
});
