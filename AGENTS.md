# Agent Instructions

This repository is a TypeScript/Node.js bookmarks tracking application using LLM-generated notes and tags.

## Code Style Guidelines

### TypeScript Configuration

- Strict mode is enabled (tsconfig:23)
- Additional strict checks: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- Target: ESNext with Node.js module resolution
- All unused locals/parameters must be removed
- **No parameter properties** - Node 24's `--experimental-strip-types` doesn't support `constructor(readonly foo: string)` shorthand. Declare properties explicitly. This is enforced by `npm run lint`.

### Type Safety

- Always use strict typing - no `any` or type assertions without clear reason
- Leverage `noUncheckedIndexedAccess` - check array/object access for undefined
- Use `exactOptionalPropertyTypes` - don't add undefined to optional props explicitly
- Define interfaces/types for data structures
- Return types should be explicit on exported functions

### Imports

- Use ES modules (`import`/`export`)
- `verbatimModuleSyntax` means type-only imports use `import type`
- Order: external dependencies, internal modules, relative imports
- Group imports and separate with blank lines between groups

### Formatting (oxfmt)

- Let oxfmt handle indentation and line length
- Run `npm run format` before committing
- CI will check formatting with `npm run format:check`

### Linting (oxlint)

- Run `npm run lint` to check for issues
- Fix all linting errors before committing
- Focus on code quality and potential bugs
- The `--import-plugin -D no-commonjs` flags catch CommonJS `require()` usage - always use ES module imports
- Note: oxlint doesn't detect unused exports; remove exports that aren't imported elsewhere

### Naming Conventions

- PascalCase for classes, interfaces, types, enums
- camelCase for variables, functions, methods, properties
- UPPER_SNAKE_CASE for constants
- Use descriptive, meaningful names
- use kebab-case for all typescript files.

### Error Handling

- Use try/catch for async operations that may fail
- Prefer explicit error types over generic Error
- Log errors appropriately for debugging
- Consider custom error types for domain-specific failures

### Code Organization

- Keep files focused and small (<300 lines preferred)
- One module/class per file
- Use clear file names matching exports
- Group related functionality in directories

### Comments

- Comments should explain WHY, not WHAT
- Prefer self-documenting code over comments
- Use JSDoc for exported function documentation
- No inline comments for obvious code

### Node.js Specifics

- Use async/await over callbacks
- Handle promises properly (always await or .catch)
- Use modern Node.js APIs available in Node 24
- Consider performance for I/O operations

## Before Submitting Changes

1. Run `npm run lint` and fix all issues
2. Run `npm run format` to ensure consistent formatting
3. Run tests when implemented
4. Verify TypeScript compilation succeeds

## CLI Documentation

- Document all commands using the `bookmarks` keyword (e.g., `bookmarks sync`, `bookmarks help`)
- This represents the conceptual command interface, not the exact shell invocation
- When validating, testing, or running commands locally, use: `npm start -- <command>`
  - Example: `npm start -- sync -s bookmarks.json`
  - The `--env-file=.env` flag is baked into the npm script

## Patterns

### Atomic File Writes

- Write to temp file, then rename to target path
- Prevents corrupted files on crash/interruption
- Used in: `src/store.ts` BookmarkStore.save()

### Spread Ordering for Type Inference

- When merging partial data with required fields: `{...partial, requiredField: value}`
- Spread first, required fields last - TypeScript knows required fields are always present
- Avoids type assertions like `as MyType`
- Used in: `src/store.ts` BookmarkStore.upsert()

### Conditional Save Pattern

- Track changes (e.g., `newCount`) and only call `save()` if changes occurred
- Avoids unnecessary disk I/O and preserves file timestamps
- Used in: `src/cli/commands/sync.ts`

### Rate Limiting for Testability

- Implement rate limiting as module-level state with `setRateLimit(ms)` and `resetRateLimit()` exports
- Allows tests to use short delays (e.g., 1ms) while production uses real limits
- Rate limiter should be in the module that makes API calls, not in commands
- Used in: `src/fetcher.ts`, `src/llm.ts`

### URL Hashing for Filenames

- Use `createHash("sha256").update(url).digest("hex").slice(0, 16)` for deterministic, collision-resistant filenames
- 16 hex chars (64 bits) sufficient for typical bookmark counts
- Used in: `src/fetcher.ts` urlToHash()

### LLM JSON Output

- Request structured JSON from LLM with explicit format in prompt: `Respond with ONLY valid JSON in this exact format: {"field": "value"}`
- LLM may wrap JSON in markdown code blocks, so extract with regex: `/```(?:json)?\s*([\s\S]*?)```/`
- Validate structure and filter arrays for type safety (e.g., non-string tags)
- Used in: `src/summarizer.ts` parseResponse()

### Intermediate State Persistence

- In multi-step operations (fetch → summarize), save state after each successful step
- Prevents inconsistent state on retry: if step 2 fails, step 1's result is already persisted
- Used in: `src/cli/commands/process.ts` processOne()

### Interface Stability

- **Do not eagerly modify established interfaces** - they are contracts with callers
- Before changing an interface signature, consider:
  - How many places call this?
  - Will this break existing code?
  - Is there a way to achieve the goal without changing the interface?
- If an interface change seems necessary, **propose it first** with:
  - What needs to change
  - Why it's needed
  - Alternative approaches considered
- Prefer solutions that preserve interfaces (e.g., throw a custom error instead of adding a required parameter)

## External Skills

- **citty-expert** - Use `/skill:citty-expert` for CLI argument patterns, testing commands, and debugging flag issues
