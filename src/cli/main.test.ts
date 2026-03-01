import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCommand, renderUsage } from "citty";
import { mainCommand } from "./main.ts";
import { helpCommand } from "./commands/help.ts";

describe("mainCommand", () => {
  it("should have correct meta information", async () => {
    const meta = typeof mainCommand.meta === "function" ? mainCommand.meta() : mainCommand.meta;
    const resolvedMeta = meta instanceof Promise ? await meta : meta;

    expect(resolvedMeta?.name).toBe("bookmarks");
    expect(resolvedMeta?.description).toBe(
      "A CLI tool for managing bookmarks with LLM-generated notes and tags",
    );
  });

  it("should include help as a subcommand", async () => {
    const subCommands =
      typeof mainCommand.subCommands === "function"
        ? mainCommand.subCommands()
        : mainCommand.subCommands;
    const resolvedSubCommands = subCommands instanceof Promise ? await subCommands : subCommands;

    expect(resolvedSubCommands).toHaveProperty("help");
  });

  it("should include sync as a subcommand", async () => {
    const subCommands =
      typeof mainCommand.subCommands === "function"
        ? mainCommand.subCommands()
        : mainCommand.subCommands;
    const resolvedSubCommands = subCommands instanceof Promise ? await subCommands : subCommands;

    expect(resolvedSubCommands).toHaveProperty("sync");
  });

  it("should throw when run without subcommand", async () => {
    await expect(runCommand(mainCommand, { rawArgs: [] })).rejects.toThrow("No command specified");
  });

  it("should render usage with correct description", async () => {
    const usage = await renderUsage(mainCommand);

    expect(usage).toContain("bookmarks");
    expect(usage).toContain("A CLI tool for managing bookmarks");
  });
});

describe("helpCommand", () => {
  it("should have correct meta information", async () => {
    const meta = typeof helpCommand.meta === "function" ? helpCommand.meta() : helpCommand.meta;
    const resolvedMeta = meta instanceof Promise ? await meta : meta;

    expect(resolvedMeta?.name).toBe("help");
    expect(resolvedMeta?.description).toBe("Show help for a command");
  });

  it("should have optional command positional argument", async () => {
    const args = typeof helpCommand.args === "function" ? helpCommand.args() : helpCommand.args;
    const resolvedArgs = args instanceof Promise ? await args : args;

    expect(resolvedArgs).toHaveProperty("command");
    expect(resolvedArgs?.command?.type).toBe("positional");
    expect(resolvedArgs?.command?.required).toBe(false);
  });

  it("should show its own usage when run directly", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCommand(helpCommand, {
      rawArgs: [],
    });

    const loggedOutput = consoleSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(loggedOutput).toContain("help");

    consoleSpy.mockRestore();
  });
});

describe("CLI integration", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("should show help with help subcommand", async () => {
    await runCommand(mainCommand, {
      rawArgs: ["help"],
    });

    expect(consoleLogSpy).toHaveBeenCalled();
  });
});
