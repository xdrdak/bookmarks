# Bookmarks Enhancement Plan

This plan outlines the implementation of bookmark enrichment features: summarization, tagging, read status tracking, and user notes.

## Architecture Overview

```
Google Sheets (append-only)
        │
        ▼
  bookmarks sync ──────► bookmarks.json
                              │
                              ├─► summarize (URL → LLM summary)
                              ├─► tag (summary → LLM tags)
                              ├─► mark-read
                              └─► note
```

**Source of truth**: `bookmarks.json` - a JSON store keyed by URL containing all enriched data.

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

- [ ] **3.1 Create LLM client abstraction**
  - Create `src/llm.ts` with a simple client for calling an LLM API
  - Start with one provider (e.g., OpenAI-compatible)
  - Function: `generateSummary(url, content)` → returns summary text
  - Handle API key via environment variable
  - **Tests**: Mock API calls, test error handling
  - **README**: Add "LLM Configuration" section with required env vars

- [ ] **3.2 Create URL content fetcher**
  - Create `src/fetcher.ts` with `fetchUrlContent(url)` → returns page text
  - Handle errors gracefully (timeouts, 404s, etc.)
  - Consider truncating very long pages
  - **Tests**: Mock fetch, test various HTTP responses, test timeout handling
  - **README**: No update needed (internal utility)

- [ ] **3.3 Implement summarize command**
  - Create `src/cli/commands/summarize.ts`
  - Accept URL as positional argument or `--all` flag for unsummarized bookmarks
  - Fetch URL content → call LLM → store summary with metadata
  - Options: `--store`, `--force` (re-summarize even if exists)
  - **Tests**: Test single URL, test --all, test --force, test already-summarized
  - **README**: Add "Summarize" section with examples

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
