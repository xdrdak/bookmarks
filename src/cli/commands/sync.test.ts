import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand, renderUsage } from "citty";
import { syncCommand } from "./sync.ts";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, statSync } from "node:fs";
import { BookmarkStore } from "../../store.ts";

describe("syncCommand", () => {
  const originalEnv = { ...process.env };
  const testDir = join(import.meta.dirname, "test-fixtures", "sync");

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
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
    const meta = typeof syncCommand.meta === "function" ? syncCommand.meta() : syncCommand.meta;
    const resolvedMeta = meta instanceof Promise ? await meta : meta;

    expect(resolvedMeta?.name).toBe("sync");
    expect(resolvedMeta?.description).toBe("Sync bookmarks from Google Sheets to local store");
  });

  it("should have correct args defined", async () => {
    const args = typeof syncCommand.args === "function" ? syncCommand.args() : syncCommand.args;
    const resolvedArgs = args instanceof Promise ? await args : args;

    expect(resolvedArgs).toHaveProperty("store");
    expect(resolvedArgs?.store?.type).toBe("string");
    expect(resolvedArgs?.store?.default).toBe("bookmarks.json");
  });

  it("should render usage with correct information", async () => {
    const usage = await renderUsage(syncCommand);

    expect(usage).toContain("sync");
    expect(usage).toContain("store");
  });

  it("should error when GOOGLE_SHEET_ID is not set", async () => {
    delete process.env.GOOGLE_SHEET_ID;
    process.env.GOOGLE_SHEET_GID = "123";

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(runCommand(syncCommand, { rawArgs: [] })).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error: GOOGLE_SHEET_ID environment variable is not set",
    );

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should error when GOOGLE_SHEET_GID is not set", async () => {
    process.env.GOOGLE_SHEET_ID = "abc123";
    delete process.env.GOOGLE_SHEET_GID;

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(runCommand(syncCommand, { rawArgs: [] })).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error: GOOGLE_SHEET_GID environment variable is not set",
    );

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should sync bookmarks and create store", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    const mockCsv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://a.com,Note A
1/8/2026 5:00:00,https://b.com,Note B`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsv),
    });

    const storePath = join(testDir, "bookmarks.json");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(syncCommand, {
      rawArgs: ["--store", storePath],
    });

    expect(consoleSpy).toHaveBeenCalledWith("Synced 2 bookmarks (2 new)");
    expect(existsSync(storePath)).toBe(true);

    // Verify store contents
    const store = await BookmarkStore.load(storePath);
    expect(store.count()).toBe(2);
    expect(store.has("https://a.com")).toBe(true);
    expect(store.has("https://b.com")).toBe(true);

    consoleSpy.mockRestore();
  });

  it("should only count new bookmarks", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    const mockCsv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://a.com,Note A
1/8/2026 5:00:00,https://b.com,Note B`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsv),
    });

    const storePath = join(testDir, "existing.json");

    // Pre-populate store with one bookmark
    const existingStore = await BookmarkStore.load(storePath);
    existingStore.upsert("https://a.com", { summary: "Existing" });
    await existingStore.save();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(syncCommand, {
      rawArgs: ["--store", storePath],
    });

    expect(consoleSpy).toHaveBeenCalledWith("Synced 2 bookmarks (1 new)");

    // Verify existing bookmark wasn't overwritten
    const store = await BookmarkStore.load(storePath);
    expect(store.get("https://a.com")?.summary).toBe("Existing");

    consoleSpy.mockRestore();
  });

  it("should not save if no new bookmarks", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    const mockCsv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://a.com,Note A`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsv),
    });

    const storePath = join(testDir, "no-new.json");

    // Pre-populate store
    const existingStore = await BookmarkStore.load(storePath);
    existingStore.upsert("https://a.com", {});
    await existingStore.save();

    const originalMtime = existsSync(storePath) ? statSync(storePath).mtime.getTime() : 0;

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(syncCommand, {
      rawArgs: ["--store", storePath],
    });

    // File should not have been modified (save not called)
    const newMtime = statSync(storePath).mtime.getTime();
    expect(newMtime).toBe(originalMtime);

    consoleSpy.mockRestore();
  });

  it("should handle HTTP errors", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const storePath = join(testDir, "http-error.json");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(runCommand(syncCommand, { rawArgs: ["--store", storePath] })).rejects.toThrow(
      "process.exit",
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("HTTP 404"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should handle network errors", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const storePath = join(testDir, "network-error.json");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(runCommand(syncCommand, { rawArgs: ["--store", storePath] })).rejects.toThrow(
      "process.exit",
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch"));

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
