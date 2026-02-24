import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand, renderUsage } from "citty";
import { downloadCommand } from "./download.ts";
import { writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("downloadCommand", () => {
  const originalEnv = { ...process.env };
  const testDir = join(import.meta.dirname, "test-fixtures");

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    process.env = originalEnv;
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("should have correct meta information", async () => {
    const meta =
      typeof downloadCommand.meta === "function"
        ? downloadCommand.meta()
        : downloadCommand.meta;
    const resolvedMeta = meta instanceof Promise ? await meta : meta;

    expect(resolvedMeta?.name).toBe("download");
    expect(resolvedMeta?.description).toBe("Download bookmarks from Google Sheets");
  });

  it("should have correct args defined", async () => {
    const args =
      typeof downloadCommand.args === "function"
        ? downloadCommand.args()
        : downloadCommand.args;
    const resolvedArgs = args instanceof Promise ? await args : args;

    expect(resolvedArgs).toHaveProperty("output");
    expect(resolvedArgs).toHaveProperty("force");
    expect(resolvedArgs?.output?.type).toBe("string");
    expect(resolvedArgs?.output?.default).toBe("bookmarks.csv");
    expect(resolvedArgs?.force?.type).toBe("boolean");
    expect(resolvedArgs?.force?.default).toBe(false);
  });

  it("should render usage with correct information", async () => {
    const usage = await renderUsage(downloadCommand);

    expect(usage).toContain("download");
    expect(usage).toContain("output");
    expect(usage).toContain("force");
  });

  it("should error when GOOGLE_SHEET_ID is not set", async () => {
    delete process.env.GOOGLE_SHEET_ID;
    process.env.GOOGLE_SHEET_GID = "123";

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(downloadCommand, { rawArgs: [] }),
    ).rejects.toThrow("process.exit");

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

    await expect(
      runCommand(downloadCommand, { rawArgs: [] }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(
      "Error: GOOGLE_SHEET_GID environment variable is not set",
    );

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should download and save to default output path", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    const mockCsv = "url,title,tags\nhttps://example.com,Example,tag1";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsv),
    });

    const outputPath = join(testDir, "bookmarks.csv");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(downloadCommand, {
      rawArgs: ["--output", outputPath],
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://docs.google.com/spreadsheets/d/test-sheet-id/export?format=csv&gid=test-gid",
    );
    expect(existsSync(outputPath)).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Downloaded bookmarks to"),
    );

    consoleSpy.mockRestore();
    global.fetch = undefined;
  });

  it("should create nested directories for output path", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    const mockCsv = "url,title,tags\nhttps://example.com,Example,tag1";

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsv),
    });

    const nestedPath = join(testDir, "nested", "dir", "output.csv");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(downloadCommand, {
      rawArgs: ["--output", nestedPath],
    });

    expect(existsSync(nestedPath)).toBe(true);

    consoleSpy.mockRestore();
    global.fetch = undefined;
  });

  it("should handle HTTP errors", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const outputPath = join(testDir, "http-error-test.csv");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(downloadCommand, { rawArgs: ["--output", outputPath] }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("HTTP 404"),
    );

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    global.fetch = undefined;
  });

  it("should overwrite existing file with --force flag", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    const mockCsv = "url,title,tags\nhttps://example.com,Example,tag1";
    const outputPath = join(testDir, "existing.csv");

    // Create existing file
    writeFileSync(outputPath, "old content", "utf-8");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsv),
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(downloadCommand, {
      rawArgs: ["--output", outputPath, "--force"],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Downloaded bookmarks to"),
    );

    consoleSpy.mockRestore();
    global.fetch = undefined;
  });

  it("should handle network errors", async () => {
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    process.env.GOOGLE_SHEET_GID = "test-gid";

    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const outputPath = join(testDir, "network-error-test.csv");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      runCommand(downloadCommand, { rawArgs: ["--output", outputPath] }),
    ).rejects.toThrow("process.exit");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to fetch"),
    );

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    global.fetch = undefined;
  });
});
