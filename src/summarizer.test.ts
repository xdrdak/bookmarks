import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LLMSummarizer } from "./summarizer.ts";

describe("LLMSummarizer", () => {
  const mockApiKey = "test-api-key";

  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", mockApiKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("summarize", () => {
    it("should generate summary from content", async () => {
      const mockSummary = "This is a summary of the content.";
      const content = "Long article content here...";

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: mockSummary }],
              },
            },
          ],
        }),
      } as Response);

      const summarizer = new LLMSummarizer();
      const result = await summarizer.summarize(content);

      expect(result).toBe(mockSummary);

      // Verify API call structure
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        ),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("should include API key in URL", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "summary" }] } }],
        }),
      } as Response);

      const summarizer = new LLMSummarizer();
      await summarizer.summarize("content");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`key=${mockApiKey}`),
        expect.any(Object),
      );
    });

    it("should throw if API key is missing", async () => {
      vi.unstubAllEnvs();

      const summarizer = new LLMSummarizer();
      await expect(summarizer.summarize("content")).rejects.toThrow(
        "GEMINI_API_KEY environment variable is not set",
      );
    });

    it("should throw on HTTP error", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "API key invalid",
      } as Response);

      const summarizer = new LLMSummarizer();
      await expect(summarizer.summarize("content")).rejects.toThrow(
        "Gemini API error (HTTP 403): API key invalid",
      );
    });

    it("should throw if no summary generated", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [] }),
      } as Response);

      const summarizer = new LLMSummarizer();
      await expect(summarizer.summarize("content")).rejects.toThrow(
        "No summary generated from Gemini API",
      );
    });

    it("should include content in prompt", async () => {
      const content = "This is my special content to summarize.";

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "summary" }] } }],
        }),
      } as Response);

      const summarizer = new LLMSummarizer();
      await summarizer.summarize(content);

      const calls = vi.mocked(global.fetch).mock.calls;
      expect(calls[0]).toBeDefined();
      const body = JSON.parse(calls[0]![1]!.body as string);

      expect(body.contents[0].parts[0].text).toContain(content);
    });
  });

  describe("rate limiting", () => {
    it("should enforce rate limit between requests", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "summary" }] } }],
        }),
      } as Response);

      const summarizer = new LLMSummarizer({ rateLimitMs: 100 });

      const start = Date.now();
      await summarizer.summarize("content1");
      await summarizer.summarize("content2");
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should have independent rate limiters per instance", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "summary" }] } }],
        }),
      } as Response);

      const summarizer1 = new LLMSummarizer({ rateLimitMs: 50 });
      const summarizer2 = new LLMSummarizer({ rateLimitMs: 50 });

      const start = Date.now();
      await Promise.all([summarizer1.summarize("content1"), summarizer2.summarize("content2")]);
      const elapsed = Date.now() - start;

      // Parallel calls with different instances should not wait for each other
      expect(elapsed).toBeLessThan(80);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
