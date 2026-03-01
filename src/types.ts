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
 * Interface for summarizing content.
 */
export interface Summarizer {
  /** Generate a summary from content. */
  summarize(content: string): Promise<string>;
}

/**
 * The store structure - a map of URL to enriched bookmark data.
 */
export type BookmarkStoreData = Record<string, EnrichedBookmark>;
