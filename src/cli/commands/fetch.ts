import type { ArgsDef, CommandDef } from "citty";
import { BookmarkStore } from "../../store.ts";
import { fetchUrlContent, contentExists } from "../../fetcher.ts";

export interface FetchArgs extends ArgsDef {
  url: {
    type: "positional";
    description: string;
    required: boolean;
  };
  store: {
    type: "string";
    description: string;
    alias: string;
    default: string;
  };
  contentDir: {
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
  all: {
    type: "boolean";
    description: string;
    alias: string;
    default: boolean;
  };
}

export const fetchCommand: CommandDef<FetchArgs> = {
  meta: {
    name: "fetch",
    description: "Fetch bookmark content from URLs and save to disk",
  },
  args: {
    url: {
      type: "positional",
      description: "URL to fetch",
      required: false,
    },
    store: {
      type: "string",
      description: "Path to the bookmark store file",
      alias: "s",
      default: "bookmarks.json",
    },
    contentDir: {
      type: "string",
      description: "Directory to save fetched content",
      alias: "c",
      default: "content",
    },
    force: {
      type: "boolean",
      description: "Re-fetch even if content already exists",
      alias: "f",
      default: false,
    },
    all: {
      type: "boolean",
      description: "Fetch all bookmarks without content",
      alias: "a",
      default: false,
    },
  },
  run: async (ctx) => {
    const { store, contentDir, force, all } = ctx.args;
    const url = ctx.args._[0] ?? ctx.args.url;

    // Validate arguments
    if (!url && !all) {
      console.error("Error: Provide a URL or use --all to fetch all bookmarks");
      process.exit(1);
    }

    if (url && all) {
      console.error("Error: Cannot use both URL and --all together");
      process.exit(1);
    }

    const bookmarkStore = await BookmarkStore.load(store);

    if (all) {
      await fetchAll(bookmarkStore, contentDir, force);
    } else if (url) {
      await fetchOne(bookmarkStore, url, contentDir, force);
    }
  },
};

async function fetchOne(
  bookmarkStore: BookmarkStore,
  url: string,
  contentDir: string,
  force: boolean,
): Promise<void> {
  // Check if bookmark exists
  if (!bookmarkStore.has(url)) {
    console.error(`Error: URL not found in store: ${url}`);
    process.exit(1);
  }

  // Check for existing content
  const exists = await contentExists(url, contentDir);
  if (exists && !force) {
    console.log(`Content already fetched: ${url}`);
    console.log("Use --force to re-fetch");
    return;
  }

  console.log(`Fetching: ${url}`);

  try {
    const result = await fetchUrlContent(url, contentDir, force);

    // Update store with fetched timestamp
    bookmarkStore.upsert(url, {
      fetchedAt: new Date().toISOString(),
    });
    await bookmarkStore.save();

    if (result.fetched) {
      console.log(`Saved to: ${result.path}`);
    } else {
      console.log(`Already exists: ${result.path}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error fetching ${url}: ${message}`);
    process.exit(1);
  }
}

async function fetchAll(
  bookmarkStore: BookmarkStore,
  contentDir: string,
  force: boolean,
): Promise<void> {
  // Find all bookmarks that need fetching
  const bookmarks = bookmarkStore.filter((b) => !b.fetchedAt || force);

  if (bookmarks.length === 0) {
    console.log("No bookmarks to fetch");
    return;
  }

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const bookmark of bookmarks) {
    // Check if content already exists (may have been fetched before without updating store)
    const exists = await contentExists(bookmark.url, contentDir);
    if (exists && !force) {
      console.log(`Skipping (already exists): ${bookmark.url}`);
      skipped++;
      continue;
    }

    try {
      console.log(`Fetching: ${bookmark.url}`);

      await fetchUrlContent(bookmark.url, contentDir, force);

      // Update store
      bookmarkStore.upsert(bookmark.url, {
        fetchedAt: new Date().toISOString(),
      });

      fetched++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching ${bookmark.url}: ${message}`);
      failed++;
    }
  }

  // Save all changes
  if (fetched > 0) {
    await bookmarkStore.save();
  }

  const parts = [];
  if (fetched > 0) parts.push(`${fetched} fetched`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(`${failed} failed`);

  console.log(`\n${parts.join(", ")}`);
}
