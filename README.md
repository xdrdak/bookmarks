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

## Commands

### Help

```bash
bookmarks help [command]    # Show help for a command
```

Displays usage information for the CLI or a specific subcommand. When run without arguments, shows the main CLI help with all available commands.

**Examples:**

```bash
bookmarks help              # Show main help
bookmarks help add          # Show help for the add command
```

### Download

```bash
bookmarks download [options]    # Download bookmarks from Google Sheets
```

Fetches the bookmarks CSV from a public Google Sheet and saves it locally. Requires `GOOGLE_SHEET_ID` and `GOOGLE_SHEET_GID` environment variables.

| Option         | Default         | Description                               |
| -------------- | --------------- | ----------------------------------------- |
| `-o, --output` | `bookmarks.csv` | Output file path                          |
| `-f, --force`  | `false`         | Overwrite existing file without prompting |

**Environment Variables:**

| Variable           | Description                        |
| ------------------ | ---------------------------------- |
| `GOOGLE_SHEET_ID`  | Google Sheets document ID          |
| `GOOGLE_SHEET_GID` | Sheet (tab) ID within the document |

**Examples:**

```bash
bookmarks download                     # Save to bookmarks.csv
bookmarks download -o my-bookmarks.csv # Save to custom path
bookmarks download --force             # Overwrite without prompt
```

**Notes:**

- The Google Sheet must be publicly accessible (anyone with link can view)
- Creates the output file if it doesn't exist
- Prompts before overwriting existing files (use `--force` to skip)

---

## Architecture

```
src/
├── bin.ts              # CLI entry point
├── index.ts            # Public exports
├── types.ts            # TypeScript type definitions
├── store.ts            # BookmarkStore class for JSON persistence
└── cli/
    ├── main.ts         # Main command definition
    ├── main.test.ts    # Tests for main command
    └── commands/
        ├── download.ts     # Download command implementation
        ├── download.test.ts # Tests for download command
        ├── help.ts         # Help command implementation
        └── index.ts        # Command exports
```

### Adding New Commands

1. Create a new file in `src/cli/commands/` (e.g., `add.ts`)
2. Define the command using `defineCommand()` from citty
3. Export from `src/cli/commands/index.ts`
4. Register as a subCommand in `src/cli/main.ts`
5. Add documentation to this README
6. Add tests in `src/cli/main.test.ts` or create a dedicated test file
