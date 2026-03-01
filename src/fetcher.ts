import { access, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

/** Rate limit for md.dhr.wtf: 5 requests per minute = 12 seconds between requests */
const DEFAULT_RATE_LIMIT_MS = 12_000;

/** Rate limit in milliseconds (can be overridden for testing) */
let rateLimitMs = DEFAULT_RATE_LIMIT_MS;

/** Track last request time for rate limiting */
let lastRequestTime = 0;

/** Pending rate limit promise for coordinating concurrent calls */
let rateLimitPromise: Promise<void> | null = null;

/**
 * Set the rate limit in milliseconds (useful for testing).
 */
export function setRateLimit(ms: number): void {
  rateLimitMs = ms;
}

/**
 * Result of a fetch operation.
 */
export interface FetchResult {
  /** Path to the saved content file */
  path: string;
  /** Whether the content was newly fetched (false if already existed) */
  fetched: boolean;
}

/**
 * Generate a filename-safe hash from a URL.
 */
export function urlToHash(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

/**
 * Get the expected content file path for a URL.
 */
export function getContentPath(url: string, contentDir: string): string {
  const hash = urlToHash(url);
  return join(contentDir, `${hash}.md`);
}

/**
 * Check if content already exists for a URL.
 */
export async function contentExists(url: string, contentDir: string): Promise<boolean> {
  const path = getContentPath(url, contentDir);
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for rate limit to allow the next request.
 * Ensures at least RATE_LIMIT_MS between requests.
 */
async function waitForRateLimit(): Promise<void> {
  // If there's already a pending rate limit wait, chain onto it
  if (rateLimitPromise) {
    await rateLimitPromise;
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  const remaining = rateLimitMs - elapsed;

  if (remaining > 0) {
    // Create a promise that resolves after the remaining wait time
    rateLimitPromise = new Promise((resolve) => {
      setTimeout(resolve, remaining);
    });
    await rateLimitPromise;
    rateLimitPromise = null;
  }

  lastRequestTime = Date.now();
}

/**
 * Fetch content from a URL using md.dhr.wtf and save to disk.
 *
 * @param url - The URL to fetch
 * @param contentDir - Directory to save content files
 * @param force - If true, re-fetch even if content already exists
 * @returns FetchResult with path and whether content was fetched
 * @throws Error if fetch fails
 */
export async function fetchUrlContent(
  url: string,
  contentDir: string,
  force = false,
): Promise<FetchResult> {
  const path = getContentPath(url, contentDir);

  // Check if already exists
  const exists = await contentExists(url, contentDir);
  if (exists && !force) {
    return { path, fetched: false };
  }

  // Ensure content directory exists
  await mkdir(contentDir, { recursive: true });

  // Wait for rate limit before fetching
  await waitForRateLimit();

  // Fetch from md.dhr.wtf
  const fetchUrl = `https://md.dhr.wtf/?url=${encodeURIComponent(url)}`;
  const response = await fetch(fetchUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch content (HTTP ${response.status}: ${response.statusText})`);
  }

  const content = await response.text();

  // Save to disk
  await writeFile(path, content, "utf-8");

  return { path, fetched: true };
}

/**
 * Reset rate limit state (useful for testing).
 */
export function resetRateLimit(): void {
  lastRequestTime = 0;
  rateLimitPromise = null;
  rateLimitMs = DEFAULT_RATE_LIMIT_MS;
}
