import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateSummary, setRateLimit, resetRateLimit } from "./llm.ts";

describe("llm", () => {
  const mockApiKey = "test-api-key";

  beforeEach(() => {
    resetRateLimit();
    vi.stubEnv("GEMINI_API_KEY", mockApiKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetRateLimit();
  });

  describe("generateSummary", () => {
    it("should generate summary from content", async () => {
      const mockSummary = "This is a summary of the content.";
      const content = "Long article content here...";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [{ text: mockSummary }],
                },
              },
            ],
          }),
      });

      const result = await generateSummary(content);

      expect(result.summary).toBe(mockSummary);
      expect(result.model).toBe("gemini-2.0-flash");

      // Verify API call structure
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
        ),
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("should include API key in URL", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "summary" }] } }],
          }),
      });

      await generateSummary("content", "my-custom-key");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("key=my-custom-key"),
        expect.any(Object),
      );
    });

    it("should use environment variable for API key", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "summary" }] } }],
          }),
      });

      await generateSummary("content");

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining(`key=${mockApiKey}`),
        expect.any(Object),
      );
    });

    it("should throw if API key is missing", async () => {
      vi.unstubAllEnvs();

      await expect(generateSummary("content")).rejects.toThrow(
        "GEMINI_API_KEY environment variable is not set",
      );
    });

    it("should throw on HTTP error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("API key invalid"),
      });

      await expect(generateSummary("content")).rejects.toThrow(
        "Gemini API error (HTTP 403): API key invalid",
      );
    });

    it("should throw if no summary generated", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      });

      await expect(generateSummary("content")).rejects.toThrow(
        "No summary generated from Gemini API",
      );
    });

    it("should use custom model", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "summary" }] } }],
          }),
      });

      const result = await generateSummary("content", mockApiKey, "gemini-1.5-flash");

      expect(result.model).toBe("gemini-1.5-flash");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("gemini-1.5-flash"),
        expect.any(Object),
      );
    });

    it("should include content in prompt", async () => {
      const content = "This is my special content to summarize.";

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "summary" }] } }],
          }),
      });

      await generateSummary(content);

      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(call[1].body as string);

      expect(body.contents[0].parts[0].text).toContain(content);
    });
  });

  describe("rate limiting", () => {
    it("should enforce rate limit between requests", async () => {
      setRateLimit(100);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ content: { parts: [{ text: "summary" }] } }],
          }),
      });

      const start = Date.now();
      await generateSummary("content1");
      await generateSummary("content2");
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
