import { defineCommand, runMain } from "citty";
import { helpCommand, syncCommand, summarizeCommand, fetchCommand } from "./commands/index.ts";

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
    sync: syncCommand,
    summarize: summarizeCommand,
    fetch: fetchCommand,
  },
});

export function run(): Promise<void> {
  return runMain(mainCommand);
}
