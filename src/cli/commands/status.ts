import type { ArgsDef, CommandDef } from "citty";
import { BookmarkStore } from "../../bookmarks.ts";
import { MarkdownStore } from "../../markdown.ts";
import { readdir, access } from "node:fs/promises";

export interface StatusArgs extends ArgsDef {
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
}

interface StatusCounts {
  total: number;
  fetched: number;
  pendingFetch: number;
  summarized: number;
  pendingSummarize: number;
  contentFiles: number;
}

export const statusCommand: CommandDef<StatusArgs> = {
  meta: {
    name: "status",
    description: "Show bookmark processing status",
  },
  args: {
    store: {
      type: "string",
      description: "Path to the bookmark store file",
      alias: "s",
      default: "bookmarks.json",
    },
    contentDir: {
      type: "string",
      description: "Directory containing fetched content",
      alias: "c",
      default: "content",
    },
  },
  run: async (ctx) => {
    const { store, contentDir } = ctx.args;

    const bookmarkStore = await BookmarkStore.load(store);
    const markdownStore = new MarkdownStore(contentDir);

    const counts = await computeStatus(bookmarkStore, markdownStore, contentDir);
    printStatus(counts);
  },
};

async function computeStatus(
  bookmarkStore: BookmarkStore,
  markdownStore: MarkdownStore,
  contentDir: string,
): Promise<StatusCounts> {
  const bookmarks = bookmarkStore.getAll();
  const total = bookmarks.length;

  // Count content files on disk
  let contentFiles = 0;
  try {
    await access(contentDir);
    const files = await readdir(contentDir);
    contentFiles = files.filter((f) => f.endsWith(".md")).length;
  } catch {
    // Content dir doesn't exist
  }

  // Count by status
  let fetched = 0;
  let summarized = 0;

  for (const bookmark of bookmarks) {
    const hasContent = await markdownStore.has(bookmark.url);
    if (hasContent || bookmark.fetchedAt) {
      fetched++;
    }
    if (bookmark.summary) {
      summarized++;
    }
  }

  return {
    total,
    fetched,
    pendingFetch: total - fetched,
    summarized,
    pendingSummarize: fetched - summarized,
    contentFiles,
  };
}

function printStatus(counts: StatusCounts): void {
  const fetchedPercent = counts.total > 0 ? Math.round((counts.fetched / counts.total) * 100) : 0;
  const summarizedPercent =
    counts.total > 0 ? Math.round((counts.summarized / counts.total) * 100) : 0;
  const contentPercent =
    counts.total > 0 ? Math.round((counts.contentFiles / counts.total) * 100) : 0;

  console.log(`Total: ${counts.total} bookmarks\n`);

  console.log("Fetch status:");
  if (counts.fetched > 0) {
    console.log(`  ✓ ${counts.fetched} fetched (${fetchedPercent}%)`);
  }
  if (counts.pendingFetch > 0) {
    console.log(`  ○ ${counts.pendingFetch} pending`);
  }
  if (counts.contentFiles !== counts.fetched) {
    console.log(`  📄 ${counts.contentFiles} content files on disk (${contentPercent}%)`);
  }
  if (counts.fetched === 0 && counts.pendingFetch === 0) {
    console.log("  (none)");
  }

  console.log("\nSummarize status:");
  if (counts.summarized > 0) {
    console.log(`  ✓ ${counts.summarized} summarized (${summarizedPercent}%)`);
  }
  if (counts.pendingSummarize > 0) {
    console.log(`  ○ ${counts.pendingSummarize} have content, need summary`);
  }
  if (counts.pendingFetch > 0) {
    console.log(`  ✗ ${counts.pendingFetch} need content first`);
  }
  if (counts.summarized === 0 && counts.pendingSummarize === 0 && counts.pendingFetch === 0) {
    console.log("  (none)");
  }
}
