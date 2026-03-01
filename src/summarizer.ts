/**
 * Interface for summarizing content.
 */
export interface Summarizer {
  /** Generate a summary from content. */
  summarize(content: string): Promise<string>;
}

/** Rate limit for Gemini free tier: ~15 RPM for Flash models = 4 seconds between requests */
const DEFAULT_RATE_LIMIT_MS = 4_000;

/** Default Gemini model to use */
const DEFAULT_MODEL = "gemini-2.0-flash";

/** Options for configuring LLMSummarizer. */
export interface LLMSummarizerOptions {
  /** Rate limit in milliseconds (default: 4000 for Gemini free tier) */
  rateLimitMs?: number;
}

/**
 * Summarizes content using Google Gemini.
 */
export class LLMSummarizer implements Summarizer {
  private readonly model: string;
  private readonly rateLimitMs: number;
  private lastRequestTime = 0;
  private rateLimitPromise: Promise<void> | null = null;

  constructor(options?: LLMSummarizerOptions) {
    this.model = DEFAULT_MODEL;
    this.rateLimitMs = options?.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS;
  }

  async summarize(content: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    await this.waitForRateLimit();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;

    const prompt = `Summarize the following web page content in a concise but informative way. Focus on the main topics, key points, and any important details. Keep the summary to 2-3 paragraphs maximum.

Content:
${content}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`Gemini API error (HTTP ${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!summary) {
      throw new Error("No summary generated from Gemini API");
    }

    return summary;
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
