import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv.ts";

describe("parseCsv", () => {
  it("should parse valid CSV with header", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://example.com,Test note`;

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      timestamp: "1/7/2026 4:47:14",
      url: "https://example.com",
      notes: "Test note",
    });
  });

  it("should skip header row", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://example.com,Note`;

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe("https://example.com");
  });

  it("should handle empty notes", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://example.com,`;

    const rows = parseCsv(csv);

    expect(rows[0]?.notes).toBe("");
  });

  it("should handle notes with commas", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://example.com,A note, with commas, in it`;

    const rows = parseCsv(csv);

    expect(rows[0]?.notes).toBe("A note, with commas, in it");
  });

  it("should skip empty rows", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://a.com,Note

1/7/2026 5:00:00,https://b.com,Note`;

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(2);
  });

  it("should skip rows without URL", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14,,Note`;

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(0);
  });

  it("should skip malformed rows (missing commas)", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14
https://example.com`;

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(0);
  });

  it("should handle Windows line endings (CRLF)", () => {
    const csv = "Timestamp,URL,Notes\r\n1/7/2026 4:47:14,https://example.com,Note\r\n";

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.url).toBe("https://example.com");
  });

  it("should handle case-insensitive header detection", () => {
    const csv = `TIMESTAMP,url,NOTES
1/7/2026 4:47:14,https://example.com,Note`;

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(1);
  });

  it("should trim whitespace from fields", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14 ,  https://example.com  ,  Note  `;

    const rows = parseCsv(csv);

    expect(rows[0]).toEqual({
      timestamp: "1/7/2026 4:47:14",
      url: "https://example.com",
      notes: "Note",
    });
  });

  it("should parse multiple rows", () => {
    const csv = `Timestamp,URL,Notes
1/7/2026 4:47:14,https://a.com,Note A
1/8/2026 5:00:00,https://b.com,Note B
1/9/2026 6:00:00,https://c.com,Note C`;

    const rows = parseCsv(csv);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.url)).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
  });

  it("should return empty array for empty content", () => {
    const rows = parseCsv("");
    expect(rows).toEqual([]);
  });

  it("should return empty array for header-only content", () => {
    const rows = parseCsv("Timestamp,URL,Notes");
    expect(rows).toEqual([]);
  });
});
