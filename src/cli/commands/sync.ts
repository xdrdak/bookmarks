import type { ArgsDef, CommandDef } from "citty";
import { BookmarkStore } from "../../bookmarks.ts";
import { parseCsv } from "../../csv.ts";

export interface SyncArgs extends ArgsDef {
  store: {
    type: "string";
    description: string;
    alias: string;
    default: string;
  };
}

export const syncCommand: CommandDef<SyncArgs> = {
  meta: {
    name: "sync",
    description: "Sync bookmarks from Google Sheets to local store",
  },
  args: {
    store: {
      type: "string",
      description: "Path to the bookmark store file",
      alias: "s",
      default: "bookmarks.json",
    },
  },
  run: async (ctx) => {
    const { store } = ctx.args;

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
        `Error: Failed to sync bookmarks (HTTP ${response.status}: ${response.statusText})`,
      );
      process.exit(1);
    }

    const content = await response.text();

    // Parse CSV
    const rows = parseCsv(content);

    // Load store and upsert bookmarks
    const bookmarkStore = await BookmarkStore.load(store);
    let newCount = 0;

    for (const row of rows) {
      const isNew = bookmarkStore.upsert(row.url, {});
      if (isNew) {
        newCount++;
      }
    }

    // Save if there were changes
    if (newCount > 0) {
      await bookmarkStore.save();
    }

    console.log(`Synced ${rows.length} bookmarks (${newCount} new)`);
  },
};
