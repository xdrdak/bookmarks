# Bookmarks Enhancement Plan

This plan outlines the implementation of bookmark enrichment features: summarization, tagging, read status tracking, and user notes.

## Architecture Overview

```
Google Sheets (append-only)
        │
        ▼
  bookmarks sync ──────► bookmarks.json
                              │
                              ├─► fetch (URL → md.dhr.wtf → content/*.md)
                              ├─► summarize (content/*.md → Gemini → summary)
                              ├─► tag (summary → LLM tags)
                              ├─► mark-read
                              └─► note
```

**Source of truth**: `bookmarks.json` - a JSON store keyed by URL containing all enriched data.

**Content storage**: `content/` - markdown files fetched from URLs, named by URL hash. Not tracked by git.

---

## Tasks

### Phase 1: Foundation

- [x] **1.1 Define TypeScript types for enriched bookmark**
  - Create `src/types.ts` with `EnrichedBookmark` and `BookmarkStore` interfaces
  - Types should include: url, summary, tags, read, readAt, userNotes, summarizedAt, summarizedWith, addedAt
  - Include JSDoc documentation
  - **Tests**: Type checking via TypeScript compilation (no runtime tests needed)
  - **README**: Add "Data Types" section documenting the structure

- [x] **1.2 Create JSON store module**
  - Create `src/store.ts` with `BookmarkStore` class: `load(path)`, `save()`, `upsert(url, partial)`, `get(url)`, `getAllUrls()`, `has(url)`, `count()`, `filter(predicate)`, `getAll()`
  - Handle file not existing (return empty store)
  - Atomic writes (write to temp file, then rename)
  - **Tests**: Unit tests for all store methods, including edge cases (missing file, invalid JSON)
  - **README**: Add "Storage" section explaining bookmarks.json format

### Phase 2: Sync Command

- [x] **2.1 Create CSV parser utility**
  - Create `src/csv.ts` with `parseCsv(content)` that extracts URLs from the CSV
  - Handle the expected format: Timestamp, URL, Notes
  - Return array of URLs
  - **Tests**: Parse valid CSV, handle empty rows, handle malformed rows gracefully
  - **README**: No update needed (internal utility)

- [x] **2.2 Implement sync command**
  - Create `src/cli/commands/sync.ts`
  - Fetch CSV from Google Sheets (reuse existing fetch logic from download)
  - Parse URLs, upsert each into store with `addedAt` timestamp
  - Output summary: "Synced X bookmarks (Y new)"
  - Options: `--store` (default: `bookmarks.json`)
  - **Tests**: Mock fetch, test new vs existing bookmarks, test output messages
  - **README**: Replace "Download" section with "Sync" section

- [x] **2.3 Remove download command**
  - Delete `src/cli/commands/download.ts` and `download.test.ts`
  - Update `src/cli/commands/index.ts`
  - Update `src/cli/main.ts` to use sync as subcommand
  - **Tests**: Update main.test.ts to reference sync instead of download
  - **README**: Ensure download references are fully replaced

### Phase 3: Summarization

- [x] **3.1 Create content fetcher with md.dhr.wtf**
  - Create `src/fetcher.ts` with `fetchUrlContent(url, contentDir)` → saves markdown to disk
  - Use `https://md.dhr.wtf?url=<url>` to convert pages to LLM-ready markdown
  - Rate limit: 5 requests/min (free tier) - implement delay/throttling
  - Check if content file already exists; if so, skip fetch and warn user
  - Save content to `content/<hash>.md` where hash is derived from URL
  - Return path to saved content file
  - **Tests**: Mock fetch, test rate limiting, test skip-if-exists behavior
  - **README**: Add "Content Storage" section explaining the content/ folder

- [x] **3.2 Add content/ to .gitignore**
  - Add `content/` to .gitignore so fetched content is not tracked
  - **Tests**: No tests needed
  - **README**: Mention in "Content Storage" section

- [x] **3.3 Create LLM client with Google Gemini**
  - Create `src/llm.ts` with `generateSummary(content: string)` → returns summary text
  - Use Google Gemini API (free tier - respect rate limits: ~15 RPM for flash models)
  - Handle API key via `GEMINI_API_KEY` environment variable
  - Implement rate limiting/throttling for free tier
  - **Tests**: Mock API calls, test error handling, test rate limiting
  - **README**: Add "LLM Configuration" section with `GEMINI_API_KEY` env var

- [x] **3.4 Implement summarize command**
  - Create `src/cli/commands/summarize.ts`
  - Flow: Read content from disk → call LLM → store summary with metadata
  - Accept URL as positional argument or `--all` flag for unsummarized bookmarks
  - Options: `--store`, `--contentDir` (default: `content/`), `--force` (re-summarize)
  - **Tests**: Test single URL, test --all, test --force, test missing content file
  - **README**: Add "Summarize" section with examples

- [x] **3.5 Implement fetch command** (separate from summarize)
  - Create `src/cli/commands/fetch.ts`
  - Fetch URL content via md.dhr.wtf and save to disk (does NOT summarize)
  - Accept URL as positional argument or `--all` flag for unfetched bookmarks
  - Options: `--contentDir`, `--force` (re-fetch even if exists)
  - **Tests**: Test single URL, test --all, test skip-if-exists, test rate limiting
  - **README**: Add "Fetch" section explaining how to pre-fetch content

### Phase 4: Tagging

- [ ] **4.1 Implement tag command**
  - Create `src/cli/commands/tag.ts`
  - Read summary from store, call LLM to generate tags
  - Store tags array on bookmark
  - Options: `--store`, `--all` (tag all with summaries but no tags), `--force`
  - **Tests**: Test tagging from summary, test --all, test missing summary error
  - **README**: Add "Tag" section with examples

- [ ] **4.2 Add process convenience command** (optional enhancement)
  - Create `src/cli/commands/process.ts` that runs summarize + tag in sequence
  - Useful for batch processing new bookmarks
  - **Tests**: Test that it calls summarize and tag in order
  - **README**: Add "Process" section

### Phase 5: Read Status

- [ ] **5.1 Implement mark-read command**
  - Create `src/cli/commands/mark-read.ts`
  - Accept URL as positional argument
  - Toggle read status, set `readAt` timestamp
  - Options: `--store`, `--unread` (mark as unread)
  - **Tests**: Test marking read, marking unread, toggling
  - **README**: Add "Mark-Read" section

### Phase 6: User Notes

- [ ] **6.1 Implement note command**
  - Create `src/cli/commands/note.ts`
  - Accept URL and note text as arguments
  - Append/update `userNotes` field
  - Options: `--store`, `--append` (add to existing notes), `--clear`
  - **Tests**: Test adding note, appending, clearing
  - **README**: Add "Note" section

### Phase 7: Polish

- [ ] **7.1 Add list command**
  - Create `src/cli/commands/list.ts` to view bookmarks
  - Filter options: `--unread`, `--untagged`, `--unsummarized`
  - Output format: simple table or JSON with `--json`
  - **Tests**: Test various filter combinations
  - **README**: Add "List" section

- [ ] **7.2 Final README review**
  - Ensure all commands are documented
  - Add usage examples for common workflows
  - Document all environment variables in one place

- [ ] **7.3 Final test coverage review**
  - Run `npm test` and ensure all tests pass
  - Verify all new modules have corresponding test files

---

## Notes

- Each task must include tests before it can be marked complete
- Each task must include README updates (where noted)
- Keep commits atomic - one task per commit ideally
- Run `npm run lint && npm run format` before each commit

### Phase 1 Learnings

**What worked well:**

- Class-based `BookmarkStore` with static `load()` factory pattern - clean API for commands
- Atomic writes (temp file + rename) - safe persistence even on crash

**Gotchas:**

- Mixed sync/async fs is a footgun - use `node:fs/promises` consistently
- Spread ordering matters for type inference: `{...partial, url, addedAt}` (required fields last) avoids type assertions

### Phase 2 Learnings

**What worked well:**

- Simple CSV parser without external dependencies - format is predictable enough
- Reusing fetch logic from download - straightforward migration to sync

**Design decisions:**

- Only save store if new bookmarks found - avoids unnecessary disk writes
- Parser returns full rows (timestamp, url, notes) for future flexibility, even if sync only uses URL

### Phase 3 Learnings

**What worked well:**

- Separating fetch and summarize into distinct commands - cleaner separation of concerns
- Content persisted to disk as markdown files - easy to inspect/debug
- URL hashing for content filenames - deterministic, no collisions in practice
- Rate limiting built into modules (not commands) - reusable across contexts

**Gotchas:**

- Citty uses camelCase for CLI args (`--contentDir`), not kebab-case (`--content-dir`)
- `vi.resetModules()` can cause module instance mismatches - better to set up rate limiters in beforeEach
- Positional args in citty: `type: "positional"` with access via `args._[0]`
