import { describe, it, expect, afterEach, vi } from "vitest";
import { OpenAISummarizer, LLMSummarizer, ErrorPageError } from "./summarizer.ts";
import type OpenAI from "openai";

function createMockClient(responses: Array<{ content: string | null; choices?: unknown[] }> = []) {
  const mockCreate = vi.fn();

  for (const response of responses) {
    mockCreate.mockResolvedValueOnce({
      choices: response.choices ?? [
        {
          message: {
            content: response.content,
          },
        },
      ],
    });
  }

  // Default response for any calls beyond the prepared ones
  mockCreate.mockImplementation(() => {
    return Promise.resolve({
      choices: [{ message: { content: '{"summary":"default","tags":[]}' } }],
    });
  });

  return {
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  } as unknown as OpenAI;
}

describe("OpenAISummarizer", () => {
  describe("constructor", () => {
    const originalEnv = process.env.BOOKMARKS_OPENAI_API_KEY;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.BOOKMARKS_OPENAI_API_KEY = originalEnv;
      } else {
        delete process.env.BOOKMARKS_OPENAI_API_KEY;
      }
    });

    it("should throw if BOOKMARKS_OPENAI_API_KEY is missing and no client provided", () => {
      delete process.env.BOOKMARKS_OPENAI_API_KEY;
      expect(() => new OpenAISummarizer()).toThrow("BOOKMARKS_OPENAI_API_KEY environment variable is not set");
    });

    it("should not throw when client is provided even without API key", () => {
      delete process.env.BOOKMARKS_OPENAI_API_KEY;
      const mockClient = createMockClient([{ content: '{"summary":"s","tags":[]}' }]);
      expect(() => new OpenAISummarizer({ client: mockClient })).not.toThrow();
    });
  });

  describe("summarize", () => {
    it("should generate summary and tags from content", async () => {
      const mockClient = createMockClient([
        { content: '{"summary":"This is a summary.","tags":["tech","ai"]}' },
      ]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      const result = await summarizer.summarize("Long article content here...");

      expect(result.summary).toBe("This is a summary.");
      expect(result.tags).toEqual(["tech", "ai"]);
    });

    it("should include content in prompt", async () => {
      const mockClient = createMockClient([{ content: '{"summary":"s","tags":[]}' }]);
      const content = "Special content to summarize.";

      const summarizer = new OpenAISummarizer({ client: mockClient });
      await summarizer.summarize(content);

      const mockCreate = (
        mockClient as unknown as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }
      ).chat.completions.create;

      const callArgs = mockCreate.mock.calls[0]![0];
      expect(callArgs.messages[1]).toEqual(
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining(content),
        }),
      );
    });

    it("should call API with correct parameters", async () => {
      const mockClient = createMockClient([{ content: '{"summary":"s","tags":[]}' }]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      await summarizer.summarize("content");

      const mockCreate = (
        mockClient as unknown as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }
      ).chat.completions.create;
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "glm-4.7-flash",
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      );
    });

    it("should use custom model if provided", async () => {
      const mockClient = createMockClient([{ content: '{"summary":"s","tags":[]}' }]);

      const summarizer = new OpenAISummarizer({ client: mockClient, model: "glm-4.7-flash" });
      await summarizer.summarize("content");

      const mockCreate = (
        mockClient as unknown as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }
      ).chat.completions.create;
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "glm-4.7-flash",
        }),
      );
    });

    it("should throw if no response content", async () => {
      const mockClient = createMockClient([{ content: null }]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      await expect(summarizer.summarize("content")).rejects.toThrow(
        "No response generated from API",
      );
    });

    it("should throw if no choices returned", async () => {
      const mockClient = createMockClient([{ content: null, choices: [] }]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      await expect(summarizer.summarize("content")).rejects.toThrow(
        "No response generated from API",
      );
    });

    it("should throw on malformed JSON", async () => {
      const mockClient = createMockClient([{ content: "not valid json" }]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      await expect(summarizer.summarize("content")).rejects.toThrow("Failed to parse LLM response");
    });

    it("should throw if summary is missing", async () => {
      const mockClient = createMockClient([{ content: '{"tags":["test"]}' }]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      await expect(summarizer.summarize("content")).rejects.toThrow(
        "Response missing 'summary' string",
      );
    });

    it("should throw if tags is not an array", async () => {
      const mockClient = createMockClient([{ content: '{"summary":"test","tags":"not-array"}' }]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      await expect(summarizer.summarize("content")).rejects.toThrow(
        "Response missing 'tags' array",
      );
    });

    it("should filter non-string tags", async () => {
      const mockClient = createMockClient([
        { content: '{"summary":"test","tags":["valid",123,null,"also-valid"]}' },
      ]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      const result = await summarizer.summarize("content");

      expect(result.tags).toEqual(["valid", "also-valid"]);
    });

    it("should throw ErrorPageError when LLM detects error page", async () => {
      const mockClient = createMockClient([
        { content: '{"isError": true, "errorMessage": "HTTP 403 Forbidden"}' },
        { content: '{"isError": true, "errorMessage": "HTTP 403 Forbidden"}' },
      ]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      const errorContent = "Warning: Target URL returned error 403: Forbidden";

      await expect(summarizer.summarize(errorContent)).rejects.toThrow(ErrorPageError);
      await expect(summarizer.summarize(errorContent)).rejects.toThrow("HTTP 403 Forbidden");
    });

    it("should throw ErrorPageError with default message when errorMessage is missing", async () => {
      const mockClient = createMockClient([{ content: '{"isError": true}' }]);

      const summarizer = new OpenAISummarizer({ client: mockClient });
      await expect(summarizer.summarize("Some error page")).rejects.toThrow(
        "Detected as error page",
      );
    });
  });

  describe("rate limiting", () => {
    it("should enforce rate limit between requests", async () => {
      const mockClient = createMockClient([
        { content: '{"summary":"s","tags":[]}' },
        { content: '{"summary":"s","tags":[]}' },
      ]);

      const summarizer = new OpenAISummarizer({ client: mockClient, rateLimitMs: 100 });

      const start = Date.now();
      await summarizer.summarize("content1");
      await summarizer.summarize("content2");
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);

      const mockCreate = (
        mockClient as unknown as { chat: { completions: { create: ReturnType<typeof vi.fn> } } }
      ).chat.completions.create;
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("should have independent rate limiters per instance", async () => {
      const mockClient1 = createMockClient([{ content: '{"summary":"s","tags":[]}' }]);
      const mockClient2 = createMockClient([{ content: '{"summary":"s","tags":[]}' }]);

      const summarizer1 = new OpenAISummarizer({ client: mockClient1, rateLimitMs: 50 });
      const summarizer2 = new OpenAISummarizer({ client: mockClient2, rateLimitMs: 50 });

      const start = Date.now();
      await Promise.all([summarizer1.summarize("content1"), summarizer2.summarize("content2")]);
      const elapsed = Date.now() - start;

      // Parallel calls with different instances should not wait for each other
      expect(elapsed).toBeLessThan(80);
    });
  });
});

describe("LLMSummarizer (backwards compatibility alias)", () => {
  it("should be an alias for OpenAISummarizer", () => {
    expect(LLMSummarizer).toBe(OpenAISummarizer);
  });
});

describe("ErrorPageError", () => {
  it("should be an instance of Error", () => {
    const error = new ErrorPageError("test error");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ErrorPageError");
    expect(error.message).toBe("test error");
  });
});
