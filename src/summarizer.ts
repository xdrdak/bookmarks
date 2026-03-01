import OpenAI from "openai";

/**
 * Result from summarizing content.
 */
export interface SummarizerResult {
  /** The generated summary. */
  summary: string;
  /** Tags extracted from the content. */
  tags: string[];
}

/**
 * Interface for summarizing content.
 */
export interface Summarizer {
  /** Generate a summary and tags from content. */
  summarize(content: string): Promise<SummarizerResult>;
}

/** Default model to use */
const DEFAULT_MODEL = "glm-4.7-flash";

/** Default rate limit in milliseconds */
const DEFAULT_RATE_LIMIT_MS = 12_000;

/** Options for configuring OpenAISummarizer. */
export interface OpenAISummarizerOptions {
  /** Rate limit in milliseconds (default: 1000) */
  rateLimitMs?: number;
  /** Model to use (default: glm-4.7-flash) */
  model?: string;
  /** Pre-configured OpenAI client (for testing) */
  client?: OpenAI;
}

/**
 * Thrown when the content appears to be an error page rather than valid content.
 */
export class ErrorPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorPageError";
  }
}

/**
 * Summarizes content using OpenAI-compatible API.
 */
export class OpenAISummarizer implements Summarizer {
  private readonly model: string;
  private readonly rateLimitMs: number;
  private readonly client: OpenAI;
  private lastRequestTime = 0;
  private rateLimitPromise: Promise<void> | null = null;

  constructor(options?: OpenAISummarizerOptions) {
    this.model = options?.model ?? DEFAULT_MODEL;
    this.rateLimitMs = options?.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;

    if (options?.client) {
      this.client = options.client;
    } else {
      const apiKey = process.env.BOOKMARKS_OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("BOOKMARKS_OPENAI_API_KEY environment variable is not set");
      }

      this.client = new OpenAI({
        apiKey,
        baseURL: "https://api.z.ai/api/paas/v4/",
      });
    }
  }

  async summarize(content: string): Promise<SummarizerResult> {
    await this.waitForRateLimit();

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that analyzes web page content and extracts structured information. Always respond with valid JSON.

IMPORTANT: First check if the content appears to be an error page or failed fetch. Signs include:
- Application error messages (e.g., "a client-side exception has occurred")
- HTTP error codes (403, 404, 500, etc.) in the text
- "Access denied", "Forbidden", or "Unauthorized" messages
- Client-side exception notices
- Captcha or bot detection pages
- Very short content that's clearly not the intended page

If you detect an error page, respond with:
{"isError": true, "errorMessage": "brief description of the error"}

For normal content, provide a real summary and tags.`,
        },
        {
          role: "user",
          content: `Analyze the following web page content:

1. FIRST: Check if this appears to be an error page or failed fetch. If so, return: {"isError": true, "errorMessage": "brief description"}

2. If it's valid content, provide:
   - A concise summary (2-3 paragraphs) covering the main topics, key points, and important details
   - 3-7 relevant tags for categorization

Respond with ONLY valid JSON in this exact format:
{"summary": "your summary text here", "tags": ["tag1", "tag2", "tag3"]}

Content:
${content}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const rawText = response.choices[0]?.message?.content;

    if (!rawText) {
      throw new Error("No response generated from API");
    }

    return this.parseResponse(rawText);
  }

  private parseResponse(rawText: string): SummarizerResult {
    try {
      const parsed = JSON.parse(rawText) as unknown;

      // Validate structure
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Response is not an object");
      }

      const obj = parsed as Record<string, unknown>;

      // Check for error page indicator
      if (obj.isError === true) {
        const errorMessage =
          typeof obj.errorMessage === "string" ? obj.errorMessage : "Detected as error page";
        throw new ErrorPageError(errorMessage);
      }

      if (typeof obj.summary !== "string") {
        throw new Error("Response missing 'summary' string");
      }

      if (!Array.isArray(obj.tags)) {
        throw new Error("Response missing 'tags' array");
      }

      const tags = obj.tags.filter((tag): tag is string => typeof tag === "string");

      return {
        summary: obj.summary,
        tags,
      };
    } catch (error) {
      // Re-throw ErrorPageError as-is
      if (error instanceof ErrorPageError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse LLM response: ${message}\nResponse: ${rawText}`);
    }
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.rateLimitPromise) {
      await this.rateLimitPromise;
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const remaining = this.rateLimitMs - elapsed;

    if (remaining > 0) {
      this.rateLimitPromise = new Promise((resolve) => {
        setTimeout(resolve, remaining);
      });
      await this.rateLimitPromise;
      this.rateLimitPromise = null;
    }

    this.lastRequestTime = Date.now();
  }
}
