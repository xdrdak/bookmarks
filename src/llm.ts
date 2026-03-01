/** Rate limit for Gemini free tier: ~15 RPM for Flash models = 4 seconds between requests */
const DEFAULT_RATE_LIMIT_MS = 4_000;

/** Rate limit in milliseconds (can be overridden for testing) */
let rateLimitMs = DEFAULT_RATE_LIMIT_MS;

/** Track last request time for rate limiting */
let lastRequestTime = 0;

/** Pending rate limit promise for coordinating concurrent calls */
let rateLimitPromise: Promise<void> | null = null;

/** Default Gemini model to use */
const DEFAULT_MODEL = "gemini-2.0-flash";

/**
 * Set the rate limit in milliseconds (useful for testing).
 */
export function setRateLimit(ms: number): void {
  rateLimitMs = ms;
}

/**
 * Reset rate limit state (useful for testing).
 */
export function resetRateLimit(): void {
  lastRequestTime = 0;
  rateLimitPromise = null;
  rateLimitMs = DEFAULT_RATE_LIMIT_MS;
}

/**
 * Wait for rate limit to allow the next request.
 */
async function waitForRateLimit(): Promise<void> {
  if (rateLimitPromise) {
    await rateLimitPromise;
  }

  const now = Date.now();
  const elapsed = now - lastRequestTime;
  const remaining = rateLimitMs - elapsed;

  if (remaining > 0) {
    rateLimitPromise = new Promise((resolve) => {
      setTimeout(resolve, remaining);
    });
    await rateLimitPromise;
    rateLimitPromise = null;
  }

  lastRequestTime = Date.now();
}

/**
 * Result of a summary generation.
 */
export interface SummaryResult {
  /** The generated summary text */
  summary: string;
  /** The model used to generate the summary */
  model: string;
}

/**
 * Generate a summary from content using Google Gemini.
 *
 * @param content - The content to summarize
 * @param apiKey - Gemini API key (defaults to GEMINI_API_KEY env var)
 * @param model - Gemini model to use (defaults to gemini-2.0-flash)
 * @returns SummaryResult with summary text and model used
 * @throws Error if API key is missing or API call fails
 */
export async function generateSummary(
  content: string,
  apiKey?: string,
  model = DEFAULT_MODEL,
): Promise<SummaryResult> {
  const key = apiKey ?? process.env.GEMINI_API_KEY;

  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  // Wait for rate limit before making request
  await waitForRateLimit();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

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

  // Extract summary from response
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!summary) {
    throw new Error("No summary generated from Gemini API");
  }

  return {
    summary,
    model,
  };
}
