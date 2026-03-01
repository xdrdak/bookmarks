import type { ArgsDef, CommandDef } from "citty";
import { BookmarkStore } from "../../bookmarks.ts";
import { MarkdownFetcher, MarkdownStore } from "../../markdown.ts";
import { LLMSummarizer } from "../../summarizer.ts";

export interface ProcessArgs extends ArgsDef {
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
}

export const processCommand: CommandDef<ProcessArgs> = {
  meta: {
    name: "process",
    description: "Fetch and summarize bookmarks in one command",
  },
  args: {
    url: {
      type: "positional",
      description: "URL to process",
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
      description: "Directory for fetched content",
      alias: "c",
      default: "content",
    },
    force: {
      type: "boolean",
      description: "Re-fetch and re-summarize even if already done",
      alias: "f",
      default: false,
    },
  },
  run: async (ctx) => {
    const { store, contentDir, force } = ctx.args;
    const url = ctx.args._[0] ?? ctx.args.url;

    // Check for API key
    if (!process.env.GEMINI_API_KEY) {
      console.error("Error: GEMINI_API_KEY environment variable is not set");
      process.exit(1);
    }

    const bookmarkStore = await BookmarkStore.load(store);
    const markdownStore = new MarkdownStore(contentDir);
    const fetcher = new MarkdownFetcher();
    const summarizer = new LLMSummarizer();

    if (url) {
      await processOne(bookmarkStore, markdownStore, fetcher, summarizer, url, force);
    } else {
      await processAll(bookmarkStore, markdownStore, fetcher, summarizer, force);
    }
  },
};

async function processOne(
  bookmarkStore: BookmarkStore,
  markdownStore: MarkdownStore,
  fetcher: MarkdownFetcher,
  summarizer: LLMSummarizer,
  url: string,
  force: boolean,
): Promise<void> {
  // Check if bookmark exists
  if (!bookmarkStore.has(url)) {
    console.error(`Error: URL not found in store: ${url}`);
    process.exit(1);
  }

  // Fetch content
  const hasContent = await markdownStore.has(url);
  if (hasContent && !force) {
    console.log(`Content already fetched: ${url}`);
  } else {
    console.log(`Fetching: ${url}`);
    try {
      const file = await fetcher.fetch(url);
      await markdownStore.save(file);
      bookmarkStore.upsert(url, {
        fetchedAt: new Date().toISOString(),
      });
      await bookmarkStore.save();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching ${url}: ${message}`);
      process.exit(1);
    }
  }

  // Summarize
  const bookmark = bookmarkStore.get(url);
  if (bookmark?.summary && !force) {
    console.log(`Already summarized: ${url}`);
    console.log("Use --force to re-process");
    return;
  }

  const contentFile = await markdownStore.get(url);
  console.log(`Summarizing: ${url}`);

  const result = await summarizer.summarize(contentFile.content);
  bookmarkStore.upsert(url, {
    summary: result.summary,
    tags: result.tags,
    summarizedAt: new Date().toISOString(),
  });

  await bookmarkStore.save();

  console.log(`Summary and tags generated`);
  console.log(`\nSummary:\n${result.summary}`);
  console.log(`\nTags: ${result.tags.join(", ")}\n`);
}

async function processAll(
  bookmarkStore: BookmarkStore,
  markdownStore: MarkdownStore,
  fetcher: MarkdownFetcher,
  summarizer: LLMSummarizer,
  force: boolean,
): Promise<void> {
  const bookmarks = bookmarkStore.getAll();

  if (bookmarks.length === 0) {
    console.log("No bookmarks to process");
    return;
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const bookmark of bookmarks) {
    // Skip if already processed (unless force)
    if (bookmark.summary && !force) {
      skipped++;
      continue;
    }

    try {
      // Fetch if needed
      const hasContent = await markdownStore.has(bookmark.url);
      if (!hasContent || force) {
        console.log(`Fetching: ${bookmark.url}`);
        const file = await fetcher.fetch(bookmark.url);
        await markdownStore.save(file);
        bookmarkStore.upsert(bookmark.url, {
          fetchedAt: new Date().toISOString(),
        });
      }

      // Summarize
      const contentFile = await markdownStore.get(bookmark.url);
      console.log(`Summarizing: ${bookmark.url}`);

      const result = await summarizer.summarize(contentFile.content);
      bookmarkStore.upsert(bookmark.url, {
        summary: result.summary,
        tags: result.tags,
        summarizedAt: new Date().toISOString(),
      });

      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error processing ${bookmark.url}: ${message}`);
      failed++;
    }
  }

  // Save all changes
  if (processed > 0) {
    await bookmarkStore.save();
  }

  const parts = [];
  if (processed > 0) parts.push(`${processed} processed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (failed > 0) parts.push(`${failed} failed`);

  console.log(`\n${parts.join(", ")}`);
}
