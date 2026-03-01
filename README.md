# Bookmarks

A CLI tool for managing bookmarks with LLM-generated notes and tags.

## Installation

```bash
npm install
```

## Tech Stack

- **Runtime**: Node.js 24+
- **Language**: TypeScript (strict mode)
- **CLI Framework**: [citty](https://github.com/unjs/citty)
- **Testing**: Vitest
- **Linting**: oxlint
- **Formatting**: oxfmt

## Development

```bash
npm start          # Run the CLI
npm test           # Run tests
npm run lint       # Lint code
npm run format     # Format code
npm run format:check # Check formatting
```

## Usage

```bash
bookmarks [command] [options]
```

| Option      | Description                                 |
| ----------- | ------------------------------------------- |
| `--help`    | Show help for the CLI or a specific command |
| `--version` | Show the current version                    |

---

## Data Types

### EnrichedBookmark

Each bookmark in the store contains the following fields:

| Field            | Type       | Required | Description                              |
| ---------------- | ---------- | -------- | ---------------------------------------- |
| `url`            | `string`   | Yes      | The URL (acts as unique key)             |
| `addedAt`        | `string`   | Yes      | ISO timestamp when added to store        |
| `fetchedAt`      | `string`   | No       | ISO timestamp when content was fetched   |
| `summary`        | `string`   | No       | LLM-generated summary of page content    |
| `tags`           | `string[]` | No       | LLM-generated tags for categorization    |
| `read`           | `boolean`  | No       | Whether user has read/understood         |
| `readAt`         | `string`   | No       | ISO timestamp when marked as read        |
| `userNotes`      | `string`   | No       | User's personal notes                    |
| `summarizedAt`   | `string`   | No       | ISO timestamp when summary was generated |
| `summarizedWith` | `string`   | No       | LLM model used for summarization         |

---

## Storage

The bookmark store is a JSON file (`bookmarks.json` by default) containing a map of URLs to enriched bookmark data.

**Example structure:**

```json
{
  "https://example.com/article": {
    "url": "https://example.com/article",
    "addedAt": "2026-02-23T00:00:00.000Z",
    "summary": "An article about...",
    "tags": ["ai", "productivity"],
    "read": true,
    "readAt": "2026-02-24T12:00:00.000Z",
    "userNotes": "Great reference for X",
    "summarizedAt": "2026-02-23T01:00:00.000Z",
    "summarizedWith": "claude-3.5-sonnet"
  }
}
```

The store is managed by the `BookmarkStore` class in `src/store.ts`, which provides atomic writes and CRUD operations.

---

## Content Storage

Fetched page content is stored as markdown files in the `content/` directory (configurable). Each file is named using a SHA-256 hash of the URL, making filenames deterministic and collision-resistant.

**Example:**

```
content/
├── 100680ad546ce6a5.md    # https://example.com/article
├── 2a3f8b1c9d4e5f6a.md    # https://another-site.com/blog
└── ...
```

The `content/` directory is not tracked by git (added to `.gitignore`).

---

## LLM Configuration

Summarization uses Google Gemini API. Configure via environment variables:

| Variable         | Description           | Required For    |
| ---------------- | --------------------- | --------------- |
| `GEMINI_API_KEY` | Google Gemini API key | `summarize` cmd |

**Rate Limits:** The free tier of Gemini Flash allows ~15 requests per minute. The CLI enforces rate limiting automatically.

---

## Commands

### Help

```bash
bookmarks help [command]    # Show help for a command
```

Displays usage information for the CLI or a specific subcommand. When run without arguments, shows the main CLI help with all available commands.

**Examples:**

```bash
bookmarks help              # Show main help
bookmarks help sync         # Show help for the sync command
```

### Sync

```bash
bookmarks sync [options]    # Sync bookmarks from Google Sheets to local store
```

Fetches bookmarks from a public Google Sheet and syncs them to the local JSON store. New URLs are added; existing URLs are preserved. Requires `GOOGLE_SHEET_ID` and `GOOGLE_SHEET_GID` environment variables.

| Option        | Default          | Description                     |
| ------------- | ---------------- | ------------------------------- |
| `-s, --store` | `bookmarks.json` | Path to the bookmark store file |

**Environment Variables:**

| Variable           | Description                        |
| ------------------ | ---------------------------------- |
| `GOOGLE_SHEET_ID`  | Google Sheets document ID          |
| `GOOGLE_SHEET_GID` | Sheet (tab) ID within the document |

**Examples:**

```bash
bookmarks sync                        # Sync to default bookmarks.json
bookmarks sync -s my-bookmarks.json   # Sync to custom store path
```

**Notes:**

- The Google Sheet must be publicly accessible (anyone with link can view)
- Expected CSV format: `Timestamp,URL,Notes` (header row is skipped)
- The store file is created if it doesn't exist
- Only saves to disk if new bookmarks were added

### Fetch

```bash
bookmarks fetch [URL] [options]    # Fetch bookmark content from URLs
```

Fetches page content from URLs and saves it as markdown files to disk. Uses [md.dhr.wtf](https://md.dhr.wtf) to convert pages to LLM-ready markdown. Content must be fetched before summarizing.

| Option             | Default          | Description                             |
| ------------------ | ---------------- | --------------------------------------- |
| `-s, --store`      | `bookmarks.json` | Path to the bookmark store file         |
| `-c, --contentDir` | `content`        | Directory to save fetched content       |
| `-f, --force`      | `false`          | Re-fetch even if content already exists |
| `-a, --all`        | `false`          | Fetch all bookmarks without content     |

**Examples:**

```bash
bookmarks fetch https://example.com/article     # Fetch single URL
bookmarks fetch --all                           # Fetch all unfetched bookmarks
bookmarks fetch --all --force                   # Re-fetch all bookmarks
```

**Notes:**

- Rate limited to 5 requests/minute (md.dhr.wtf free tier)
- Skips URLs that already have content (unless `--force`)
- Updates `fetchedAt` timestamp in the store

### Summarize

```bash
bookmarks summarize [URL] [options]    # Generate summaries using LLM
```

Generates AI summaries for bookmarked pages. Requires content to be fetched first (run `bookmarks fetch`). Uses Google Gemini API.

| Option             | Default          | Description                          |
| ------------------ | ---------------- | ------------------------------------ |
| `-s, --store`      | `bookmarks.json` | Path to the bookmark store file      |
| `-c, --contentDir` | `content`        | Directory containing fetched content |
| `-f, --force`      | `false`          | Re-summarize even if summary exists  |
| `-a, --all`        | `false`          | Summarize all bookmarks with content |

**Environment Variables:**

| Variable         | Description           |
| ---------------- | --------------------- |
| `GEMINI_API_KEY` | Google Gemini API key |

**Examples:**

```bash
bookmarks summarize https://example.com/article   # Summarize single URL
bookmarks summarize --all                         # Summarize all with content
bookmarks summarize --all --force                 # Re-summarize everything
```

**Notes:**

- Requires `GEMINI_API_KEY` environment variable
- Rate limited to ~15 requests/minute (Gemini free tier)
- Skips bookmarks without fetched content
- Stores summary, `summarizedAt`, and `summarizedWith` fields

---

## Architecture

```
src/
├── bin.ts              # CLI entry point
├── index.ts            # Public exports
├── types.ts            # TypeScript type definitions
├── store.ts            # BookmarkStore class for JSON persistence
├── csv.ts              # CSV parsing utilities
├── fetcher.ts          # URL content fetching (md.dhr.wtf)
├── llm.ts              # LLM client (Google Gemini)
└── cli/
    ├── main.ts         # Main command definition
    ├── main.test.ts    # Tests for main command
    └── commands/
        ├── sync.ts         # Sync command implementation
        ├── sync.test.ts    # Tests for sync command
        ├── fetch.ts        # Fetch command implementation
        ├── fetch.test.ts   # Tests for fetch command
        ├── summarize.ts    # Summarize command implementation
        ├── summarize.test.ts # Tests for summarize command
        ├── help.ts         # Help command implementation
        └── index.ts        # Command exports
```

### Adding New Commands

1. Create a new file in `src/cli/commands/` (e.g., `tag.ts`)
2. Define the command using `defineCommand()` from citty
3. Export from `src/cli/commands/index.ts`
4. Register as a subCommand in `src/cli/main.ts`
5. Add documentation to this README
6. Add tests in `src/cli/main.test.ts` or create a dedicated test file
