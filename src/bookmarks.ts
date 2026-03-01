import { readFile, writeFile, rename, access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * A single bookmark with all enriched metadata.
 */
export interface EnrichedBookmark {
  /** The URL of the bookmark (acts as unique key) */
  url: string;
  /** LLM-generated summary of the page content */
  summary?: string;
  /** LLM-generated tags for categorization */
  tags?: string[];
  /** Whether the user has read/understood this bookmark */
  read?: boolean;
  /** Timestamp when the bookmark was marked as read */
  readAt?: string;
  /** User's personal notes about this bookmark */
  userNotes?: string;
  /** Timestamp when the page content was fetched */
  fetchedAt?: string;
  /** Timestamp when the summary was generated */
  summarizedAt?: string;
  /** Timestamp when the bookmark was first added to the store */
  addedAt: string;
}

/**
 * The store structure - a map of URL to enriched bookmark data.
 */
export type BookmarkStoreData = Record<string, EnrichedBookmark>;

/**
 * Manages the bookmark store, providing load, save, and CRUD operations.
 */
export class BookmarkStore {
  private data: BookmarkStoreData;
  private path: string;

  private constructor(path: string, data: BookmarkStoreData) {
    this.path = path;
    this.data = data;
  }

  /**
   * Load the bookmark store from a file. Creates an empty store if the file doesn't exist.
   */
  static async load(path: string): Promise<BookmarkStore> {
    try {
      await access(path);
      const content = await readFile(path, "utf-8");
      const data = JSON.parse(content) as BookmarkStoreData;
      return new BookmarkStore(path, data);
    } catch (error) {
      // File doesn't exist or is invalid JSON - return empty store
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new BookmarkStore(path, {});
      }
      // Invalid JSON - throw with context
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in store file: ${path}`);
      }
      throw error;
    }
  }

  /**
   * Save the store to disk atomically (write to temp file, then rename).
   */
  async save(): Promise<void> {
    const dir = dirname(this.path);
    // Ensure directory exists
    if (dir !== "." && dir !== "..") {
      await mkdir(dir, { recursive: true });
    }

    const tempPath = join(dir, `.tmp-${Date.now()}.json`);
    const content = JSON.stringify(this.data, null, 2);

    await writeFile(tempPath, content, "utf-8");
    await rename(tempPath, this.path);
  }

  /**
   * Get a bookmark by URL, or undefined if not found.
   */
  get(url: string): EnrichedBookmark | undefined {
    return this.data[url];
  }

  /**
   * Get all URLs in the store.
   */
  getAllUrls(): string[] {
    return Object.keys(this.data);
  }

  /**
   * Upsert a bookmark - create new or merge with existing.
   * Returns true if a new bookmark was created, false if updated.
   */
  upsert(url: string, partial: Partial<Omit<EnrichedBookmark, "url">>): boolean {
    const existing = this.data[url];
    const now = new Date().toISOString();

    if (existing) {
      // Merge partial data into existing
      this.data[url] = {
        ...existing,
        ...partial,
      };
      return false;
    } else {
      // Create new bookmark - url and addedAt are always set explicitly
      this.data[url] = {
        ...partial,
        url,
        addedAt: now,
      };
      return true;
    }
  }

  /**
   * Check if a URL exists in the store.
   */
  has(url: string): boolean {
    return url in this.data;
  }

  /**
   * Get the total count of bookmarks.
   */
  count(): number {
    return Object.keys(this.data).length;
  }

  /**
   * Get all bookmarks that match a filter criteria.
   */
  filter(predicate: (bookmark: EnrichedBookmark) => boolean): EnrichedBookmark[] {
    return Object.values(this.data).filter(predicate);
  }

  /**
   * Get all bookmarks in the store.
   */
  getAll(): EnrichedBookmark[] {
    return Object.values(this.data);
  }
}
