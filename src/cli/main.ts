import { defineCommand, runMain } from "citty";
import { helpCommand, downloadCommand } from "./commands/index.ts";

import { readFileSync } from "node:fs";

function getPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
    );
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const mainCommand = defineCommand({
  meta: {
    name: "bookmarks",
    version: getPackageVersion(),
    description: "A CLI tool for managing bookmarks with LLM-generated notes and tags",
  },
  subCommands: {
    help: helpCommand,
    download: downloadCommand,
  },
  run: async () => {
    // When run without subcommand, show help
    const { showUsage } = await import("citty");
    await showUsage(mainCommand);
  },
});

export function run(): Promise<void> {
  return runMain(mainCommand);
}
