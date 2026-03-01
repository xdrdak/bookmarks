/**
 * Represents a row from the bookmarks CSV.
 */
export interface CsvRow {
  timestamp: string;
  url: string;
  notes: string;
}

/**
 * Parse CSV content from Google Sheets export.
 * Expected format: Timestamp,URL,Notes
 *
 * Handles:
 * - Header row (skipped)
 * - Empty rows (skipped)
 * - Notes field may contain commas (rest of line after first 2 commas)
 */
export function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/);
  const rows: CsvRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Skip header row
    if (i === 0 && line.toLowerCase().startsWith("timestamp")) {
      continue;
    }

    // Split on first 2 commas only (notes may contain commas)
    const firstComma = line.indexOf(",");
    if (firstComma === -1) continue; // Malformed row, skip

    const secondComma = line.indexOf(",", firstComma + 1);
    if (secondComma === -1) continue; // Malformed row, skip

    const timestamp = line.slice(0, firstComma).trim();
    const url = line.slice(firstComma + 1, secondComma).trim();
    const notes = line.slice(secondComma + 1).trim();

    // Skip rows without a URL
    if (!url) continue;

    rows.push({ timestamp, url, notes });
  }

  return rows;
}
