# AGENTS.md

Agent guidance for the `@echecs/uci` repository — a TypeScript wrapper around
UCI chess engine processes, providing a typed event-emitter API.

**See also:** [`REFERENCES.md`](REFERENCES.md) |
[`COMPARISON.md`](COMPARISON.md) | [`SPEC.md`](SPEC.md)

**Backlog:** tracked in [GitHub Issues](https://github.com/echecsjs/uci/issues).

---

## Project Overview

`@echecs/uci` wraps a UCI chess engine subprocess and exposes it as a typed
`Emittery`-based event emitter. The public API exports the `UCI` class (default
and named), the `EngineProcess` abstract base class for non-Node runtimes, and
the public types. Runtime dependencies: `emittery` (event emitter) and `zod`
(option validation).

---

Key source files:

| File                                | Role                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/index.ts`                      | `UCI` class — public API and engine lifecycle                                                   |
| `src/types.ts`                      | Exported types: `ID`, `InfoCommand`, `Option`, `Score`                                          |
| `src/engine-process.ts`             | `EngineProcess` abstract base class — extends `Emittery`; runtime contract for non-Node engines |
| `src/node-process.ts`               | `NodeProcess` class — Node.js `EngineProcess` via `child_process.spawn`                         |
| `src/options.ts`                    | `Options` class — engine option store with Zod validation                                       |
| `src/process.ts`                    | `Process` class — wraps an `EngineProcess` with line buffering, re-emits `line`/`error`/`exit`  |
| `src/parser/index.ts`               | Parser dispatcher — routes UCI output tokens to handlers                                        |
| `src/parser/bestmove.ts`            | Parses `bestmove` responses                                                                     |
| `src/parser/info.ts`                | Parses `info` lines into typed `InfoCommand` objects                                            |
| `src/parser/identity.ts`            | Parses `id` responses                                                                           |
| `src/parser/extract.ts`             | Utility: extracts named fields from UCI token strings                                           |
| `src/parser/noop.ts`                | Pass-through for commands with no payload                                                       |
| `src/__tests__/index.spec.ts`       | Unit tests for the `UCI` class                                                                  |
| `src/__tests__/parser.spec.ts`      | Unit tests for the parser module                                                                |
| `src/__tests__/integration.spec.ts` | Integration tests (skipped without a real engine binary)                                        |

---

## Commands

Use **pnpm** exclusively (no npm/yarn).

### Build

```bash
pnpm build              # bundle TypeScript → dist/ via tsdown
```

### Test

```bash
pnpm test               # run all tests once (vitest run)
pnpm test:watch         # watch mode
pnpm test:coverage      # with v8 coverage report

# Run a single test file
pnpm test src/__tests__/parser.spec.ts

# Run tests matching a name substring
pnpm test -- --reporter=verbose -t "bestmove"
```

> **Note:** `integration.spec.ts` tests are skipped when `UCI_ENGINE_PATH` is
> not set. Set it to a UCI engine path to enable them. 6 skipped tests is
> expected and normal in CI.

### Lint & Format

```bash
pnpm lint               # ESLint + tsc type-check (auto-fixes style issues)
pnpm lint:ci            # strict — zero warnings allowed, no auto-fix
pnpm lint:style         # ESLint only (auto-fixes)
pnpm lint:types         # tsc --noEmit type-check only
pnpm format             # Prettier (writes changes)
pnpm format:ci          # Prettier check only (no writes)
```

### Full pre-PR check

```bash
pnpm lint && pnpm test && pnpm build
```

---

## Validation

Input validation is mostly provided by TypeScript's strict type system at
compile time. The exception in this package is engine option validation, which
uses `zod` for runtime schema validation (since engine options arrive as untyped
strings from the UCI protocol). Do not add additional runtime type-checking
guards elsewhere unless there is an explicit trust boundary.

---

## Architecture Notes

- **ESM-only** — the package ships only ESM. Do not add a CJS build.
- `UCI` does **not** extend `Emittery` — it holds a private `#emitter` field and
  exposes only `on()`, `off()`, and `once()`. All engine output is surfaced as
  typed events (`bestmove`, `info`, `id`, `option`, `error`, etc.).
- Engine communication flows: `Process` (child process + line reader) →
  `UCI#ingest` (parser dispatch) → typed `emit` calls.
- `Options` validates and stores engine options using Zod schemas.
- `src/types.ts` holds all public types as named exports — do not use global
  ambient namespaces.
- Propagate errors via `this.#emitter.emit('error', ...)` — do not swallow them
  silently.
- Runtime dependencies (`emittery`, `zod`) are intentional; do not remove them.

### Error propagation — known limitation

`ready()` and `execute()` are **error-absorbing**: they catch all rejections
internally and route them to `this.#emitter.emit('error', ...)`, then return a
resolved promise. They never reject.

This means adding a `.catch()` to a chain like
`this.ready().then(() => this.execute(...))` is **dead code** — neither call
will reject, so the `.catch()` can never fire. Do not propose "add a `.catch()`
to propagate errors" as a fix anywhere in `src/index.ts`; it will not work
without first refactoring `ready()` or `execute()` to throw instead of absorb.

Note: `ready()` does **not** permanently cache errors. A failed `isready`
handshake does not prevent subsequent `ready()` calls from retrying — each call
performs a fresh handshake.

---

## Release Protocol

Step-by-step process for releasing a new version. CI auto-publishes to npm when
`version` in `package.json` changes on `main`.

1. **Verify the package is clean:**

   ```bash
   pnpm lint && pnpm test && pnpm build
   ```

   Do not proceed if any step fails.

2. **Decide the semver level:**
   - `patch` — bug fixes, internal refactors with no API change
   - `minor` — new features, new exports, non-breaking additions
   - `major` — breaking changes to the public API

3. **Update `CHANGELOG.md`** following
   [Keep a Changelog](https://keepachangelog.com) format:

   ```markdown
   ## [x.y.z] - YYYY-MM-DD

   ### Added

   - …

   ### Changed

   - …

   ### Fixed

   - …

   ### Removed

   - …
   ```

   Include only sections that apply. Use past tense.

4. **Update `README.md`** if the release introduces new public API, changes
   usage examples, or deprecates/removes existing features.

5. **Bump the version:**

   ```bash
   npm version <major|minor|patch> --no-git-tag-version
   ```

6. **Open a release PR:**

   ```bash
   git checkout -b release/x.y.z
   git add package.json CHANGELOG.md README.md
   git commit -m "release: @echecs/uci@x.y.z"
   git push -u origin release/x.y.z
   gh pr create --title "release: @echecs/uci@x.y.z" --body "<description>"
   ```

   Wait for CI (format, lint, test) to pass on the PR before merging.

7. **Merge the PR:** Once CI is green, merge (squash) into `main`. The release
   workflow detects the version bump, publishes to npm, and creates a GitHub
   Release with a git tag.

Do not manually publish with `npm publish`. Do not create git tags manually —
the release workflow handles tagging.
