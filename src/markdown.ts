import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { RateLimiter } from "./rate-limiter.ts";

/** Default rate limit for md.dhr.wtf: 5 requests per minute = 12 seconds between requests */
const DEFAULT_RATE_LIMIT_MS = 12_000;

/**
 * Convert a URL to a 16-character hash for use as a filename.
 */
function urlToHash(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

/**
 * A markdown file with its source URL and content.
 *
 * Used to represent fetched markdown content that can be stored and retrieved.
 */
export class MarkdownFile {
  /** The source URL this content was fetched from */
  readonly url: string;
  /** The markdown content */
  readonly content: string;

  constructor(url: string, content: string) {
    this.url = url;
    this.content = content;
  }
}

/**
 * Fetches markdown content from URLs via md.dhr.wtf.
 *
 * Returns MarkdownFile instances ready for storage.
 */
export class MarkdownFetcher {
  private readonly rateLimiter: RateLimiter | null;

  constructor(rateLimiter?: RateLimiter | null) {
    // undefined = default rate limiter, null = no rate limiting
    this.rateLimiter =
      rateLimiter === undefined ? new RateLimiter(DEFAULT_RATE_LIMIT_MS) : rateLimiter;
  }

  /**
   * Fetch markdown content from a URL.
   *
   * @param url - The URL to fetch
   * @returns A MarkdownFile with the source URL and fetched content
   * @throws Error if fetch fails
   */
  async fetch(url: string): Promise<MarkdownFile> {
    // Wait for rate limit before fetching
    await this.rateLimiter?.waitForNext();

    const fetchUrl = `https://md.dhr.wtf/?url=${encodeURIComponent(url)}`;
    const response = await fetch(fetchUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch content (HTTP ${response.status}: ${response.statusText})`);
    }

    const content = await response.text();

    return new MarkdownFile(url, content);
  }
}

/**
 * Persists and retrieves markdown files by URL.
 *
 * Files are stored as `<hash>.md` in the content directory, where hash is derived from the URL.
 * Designed to work with MarkdownFile instances from MarkdownFetcher.
 */
export class MarkdownStore {
  private readonly contentDir: string;

  constructor(contentDir: string) {
    this.contentDir = contentDir;
  }

  /**
   * Save a markdown file to disk.
   *
   * @param file - The MarkdownFile to save
   * @returns Path to the saved file
   */
  async save(file: MarkdownFile): Promise<string> {
    await mkdir(this.contentDir, { recursive: true });
    const path = this.getPath(file.url);
    await writeFile(path, file.content, "utf-8");
    return path;
  }

  /**
   * Get a markdown file from disk.
   *
   * @param url - The source URL of the file
   * @returns The stored MarkdownFile
   * @throws Error if file doesn't exist
   */
  async get(url: string): Promise<MarkdownFile> {
    const path = this.getPath(url);
    const content = await readFile(path, "utf-8");
    return new MarkdownFile(url, content);
  }

  /**
   * Check if a markdown file exists.
   *
   * @param url - The source URL of the file
   */
  async has(url: string): Promise<boolean> {
    const path = this.getPath(url);
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the full path for a markdown file.
   *
   * @param url - The source URL of the file
   */
  getPath(url: string): string {
    const hash = urlToHash(url);
    return join(this.contentDir, `${hash}.md`);
  }
}
