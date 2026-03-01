import type { ArgsDef, CommandDef } from "citty";
import { BookmarkStore } from "../../store.ts";
import { MarkdownStore } from "../../markdown.ts";
import { LLMSummarizer } from "../../llm-summarizer.ts";

export interface SummarizeArgs extends ArgsDef {
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

export const summarizeCommand: CommandDef<SummarizeArgs> = {
  meta: {
    name: "summarize",
    description: "Generate summaries for bookmarked URLs using LLM",
  },
  args: {
    url: {
      type: "positional",
      description: "URL to summarize",
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
      description: "Directory containing fetched content",
      alias: "c",
      default: "content",
    },
    force: {
      type: "boolean",
      description: "Re-summarize even if summary already exists",
      alias: "f",
      default: false,
    },
    all: {
      type: "boolean",
      description: "Summarize all bookmarks with content but no summary",
      alias: "a",
      default: false,
    },
  },
  run: async (ctx) => {
    const { store, contentDir, force, all } = ctx.args;
    const url = ctx.args._[0] ?? ctx.args.url;

    // Validate arguments
    if (!url && !all) {
      console.error("Error: Provide a URL or use --all to summarize all bookmarks");
      process.exit(1);
    }

    if (url && all) {
      console.error("Error: Cannot use both URL and --all together");
      process.exit(1);
    }

    // Check for API key
    if (!process.env.GEMINI_API_KEY) {
      console.error("Error: GEMINI_API_KEY environment variable is not set");
      process.exit(1);
    }

    const bookmarkStore = await BookmarkStore.load(store);
    const markdownStore = new MarkdownStore(contentDir);

    if (all) {
      await summarizeAll(bookmarkStore, markdownStore, force);
    } else if (url) {
      await summarizeOne(bookmarkStore, markdownStore, url, force);
    }
  },
};

async function summarizeOne(
  bookmarkStore: BookmarkStore,
  markdownStore: MarkdownStore,
  url: string,
  force: boolean,
): Promise<void> {
  // Check if bookmark exists
  if (!bookmarkStore.has(url)) {
    console.error(`Error: URL not found in store: ${url}`);
    process.exit(1);
  }

  // Check for existing summary
  const bookmark = bookmarkStore.get(url);
  if (bookmark?.summary && !force) {
    console.log(`Already summarized: ${url}`);
    console.log("Use --force to re-summarize");
    return;
  }

  // Check if content exists
  const hasContent = await markdownStore.has(url);
  if (!hasContent) {
    console.error(`Error: Content not found for URL. Run 'bookmarks fetch ${url}' first.`);
    process.exit(1);
  }

  // Read content
  const file = await markdownStore.get(url);

  console.log(`Summarizing: ${url}`);

  // Generate summary
  const summarizer = new LLMSummarizer();
  const summary = await summarizer.summarize(file.content);

  // Update store
  bookmarkStore.upsert(url, {
    summary,
    summarizedAt: new Date().toISOString(),
  });

  await bookmarkStore.save();

  console.log(`Summary generated`);
  console.log(`\n${summary}\n`);
}

async function summarizeAll(
  bookmarkStore: BookmarkStore,
  markdownStore: MarkdownStore,
  force: boolean,
): Promise<void> {
  // Find all bookmarks that need summarizing
  const bookmarks = bookmarkStore.filter((b) => !b.summary || force);

  if (bookmarks.length === 0) {
    console.log("No bookmarks to summarize");
    return;
  }

  const summarizer = new LLMSummarizer();
  let summarized = 0;
  let skipped = 0;

  for (const bookmark of bookmarks) {
    // Check if content exists
    const hasContent = await markdownStore.has(bookmark.url);
    if (!hasContent) {
      console.log(`Skipping (no content): ${bookmark.url}`);
      skipped++;
      continue;
    }

    try {
      // Read content
      const file = await markdownStore.get(bookmark.url);

      console.log(`Summarizing: ${bookmark.url}`);

      // Generate summary
      const summary = await summarizer.summarize(file.content);

      // Update store
      bookmarkStore.upsert(bookmark.url, {
        summary,
        summarizedAt: new Date().toISOString(),
      });

      summarized++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error summarizing ${bookmark.url}: ${message}`);
    }
  }

  // Save all changes
  if (summarized > 0) {
    await bookmarkStore.save();
  }

  console.log(`\nSummarized ${summarized} bookmarks (${skipped} skipped - no content)`);
}
