import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCommand } from "citty";
import { join } from "node:path";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { BookmarkStore } from "../../bookmarks.ts";
import { statusCommand } from "./status.ts";

describe("statusCommand", () => {
  const testDir = join(import.meta.dirname, "test-fixtures", "status");
  const contentDir = join(testDir, "content");

  beforeEach(async () => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    if (!existsSync(contentDir)) {
      mkdirSync(contentDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should have correct meta information", async () => {
    const meta =
      typeof statusCommand.meta === "function" ? statusCommand.meta() : statusCommand.meta;
    const resolvedMeta = meta instanceof Promise ? await meta : meta;

    expect(resolvedMeta?.name).toBe("status");
    expect(resolvedMeta?.description).toContain("status");
  });

  it("should have correct args defined", async () => {
    const args =
      typeof statusCommand.args === "function" ? statusCommand.args() : statusCommand.args;
    const resolvedArgs = args instanceof Promise ? await args : args;

    expect(resolvedArgs).toHaveProperty("store");
    expect(resolvedArgs).toHaveProperty("contentDir");
  });

  it("should show empty status for new store", async () => {
    const storePath = join(testDir, "empty.json");
    const store = await BookmarkStore.load(storePath);
    await store.save();

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };

    try {
      await runCommand(statusCommand, {
        rawArgs: ["--store", storePath, "--contentDir", contentDir],
      });
    } finally {
      console.log = originalLog;
    }

    const output = logs.join("\n");
    expect(output).toContain("Total: 0 bookmarks");
    expect(output).toContain("Fetch status:");
    expect(output).toContain("Summarize status:");
  });

  it("should show correct counts for mixed bookmark states", async () => {
    const storePath = join(testDir, "mixed.json");
    const store = await BookmarkStore.load(storePath);

    // Add various bookmark states
    store.upsert("https://complete.com", {
      fetchedAt: "2025-01-01",
      summary: "A summary",
      tags: ["tag1"],
    });
    store.upsert("https://fetched-only.com", {
      fetchedAt: "2025-01-01",
    });
    store.upsert("https://pending.com", {});
    await store.save();

    // Create content file for the complete one
    const hash = (url: string) => {
      const { createHash } = require("node:crypto");
      return createHash("sha256").update(url).digest("hex").slice(0, 16);
    };
    writeFileSync(join(contentDir, `${hash("https://complete.com")}.md`), "content");

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };

    try {
      await runCommand(statusCommand, {
        rawArgs: ["--store", storePath, "--contentDir", contentDir],
      });
    } finally {
      console.log = originalLog;
    }

    const output = logs.join("\n");
    expect(output).toContain("Total: 3 bookmarks");
    expect(output).toContain("2 fetched"); // complete + fetched-only
    expect(output).toContain("1 pending"); // pending
    expect(output).toContain("1 summarized"); // complete only
    expect(output).toContain("1 have content, need summary"); // fetched-only
    expect(output).toContain("1 need content first"); // pending
  });

  it("should handle missing content directory gracefully", async () => {
    const storePath = join(testDir, "no-content-dir.json");
    const store = await BookmarkStore.load(storePath);
    store.upsert("https://example.com", { fetchedAt: "2025-01-01" });
    await store.save();

    // Remove content directory
    rmSync(contentDir, { recursive: true, force: true });

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };

    try {
      await runCommand(statusCommand, {
        rawArgs: ["--store", storePath, "--contentDir", contentDir],
      });
    } finally {
      console.log = originalLog;
    }

    const output = logs.join("\n");
    expect(output).toContain("Total: 1 bookmarks");
    expect(output).toContain("1 fetched"); // from fetchedAt, even without content file
  });

  it("should detect content files on disk not in store", async () => {
    const storePath = join(testDir, "orphan-content.json");
    const store = await BookmarkStore.load(storePath);
    store.upsert("https://known.com", { fetchedAt: "2025-01-01" });
    await store.save();

    // Create content file for known URL
    const hash = (url: string) => {
      const { createHash } = require("node:crypto");
      return createHash("sha256").update(url).digest("hex").slice(0, 16);
    };
    writeFileSync(join(contentDir, `${hash("https://known.com")}.md`), "content");
    // Create orphan content file
    writeFileSync(join(contentDir, "orphan1234abcd.md"), "orphan content");

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };

    try {
      await runCommand(statusCommand, {
        rawArgs: ["--store", storePath, "--contentDir", contentDir],
      });
    } finally {
      console.log = originalLog;
    }

    const output = logs.join("\n");
    // Should show content files count differs from fetched count
    expect(output).toContain("2 content files on disk");
  });
});
