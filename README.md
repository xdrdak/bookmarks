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
