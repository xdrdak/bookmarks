import type { ArgsDef, CommandDef } from "citty";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as readline from "node:readline/promises";

export interface DownloadArgs extends ArgsDef {
  output: {
    type: "string";
    description: string;
    alias: string;
    default: string;
  };
  force: {
    type: "boolean";
    description: string;
    alias: string;
    default: boolean;
  };
}

export const downloadCommand: CommandDef<DownloadArgs> = {
  meta: {
    name: "download",
    description: "Download bookmarks from Google Sheets",
  },
  args: {
    output: {
      type: "string",
      description: "Output file path",
      alias: "o",
      default: "bookmarks.csv",
    },
    force: {
      type: "boolean",
      description: "Overwrite existing file without prompting",
      alias: "f",
      default: false,
    },
  },
  run: async (ctx) => {
    const { output, force } = ctx.args;

    const googleSheetId = process.env.GOOGLE_SHEET_ID;
    const googleSheetGid = process.env.GOOGLE_SHEET_GID;

    if (!googleSheetId) {
      console.error("Error: GOOGLE_SHEET_ID environment variable is not set");
      process.exit(1);
    }

    if (!googleSheetGid) {
      console.error("Error: GOOGLE_SHEET_GID environment variable is not set");
      process.exit(1);
    }

    const url = `https://docs.google.com/spreadsheets/d/${googleSheetId}/export?format=csv&gid=${googleSheetGid}`;

    // Check if file exists and handle overwrite
    if (existsSync(output) && !force) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const answer = await rl.question(
        `File "${output}" already exists. Overwrite? (y/N) `,
      );
      rl.close();
      const shouldOverwrite = answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
      if (!shouldOverwrite) {
        console.log("Download cancelled");
        return;
      }
    }

    // Fetch the CSV
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: Failed to fetch from Google Sheets: ${message}`);
      process.exit(1);
    }

    if (!response.ok) {
      console.error(
        `Error: Failed to download bookmarks (HTTP ${response.status}: ${response.statusText})`,
      );
      process.exit(1);
    }

    const content = await response.text();

    // Create directory if needed
    const dir = dirname(output);
    if (dir !== "." && dir !== "..") {
      mkdirSync(dir, { recursive: true });
    }

    // Write the file
    writeFileSync(output, content, "utf-8");
    console.log(`Downloaded bookmarks to ${output}`);
  },
};
