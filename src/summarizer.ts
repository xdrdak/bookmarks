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

  async summarize(content: string): Promise<SummarizerResult> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }

    await this.waitForRateLimit();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;

    const prompt = `Analyze the following web page content and provide:
1. A concise summary (2-3 paragraphs) covering the main topics, key points, and important details
2. 3-7 relevant tags for categorization

Respond with ONLY valid JSON in this exact format:
{"summary": "your summary text here", "tags": ["tag1", "tag2", "tag3"]}

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

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      throw new Error("No response generated from Gemini API");
    }

    return this.parseResponse(rawText);
  }

  private parseResponse(rawText: string): SummarizerResult {
    // Try to extract JSON from the response (LLM might wrap it in markdown)
    let jsonText = rawText.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      jsonText = jsonMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(jsonText) as unknown;

      // Validate structure
      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Response is not an object");
      }

      const obj = parsed as Record<string, unknown>;

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
