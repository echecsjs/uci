# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.1.0] - 2026-04-26

### Changed

- Upgraded `emittery` from 1.1.0 to 2.0.0 — adapted internally with no breaking
  changes to the public API
- Minimum Node.js version raised from 20 to 22 (required by emittery v2)

## [4.0.2] - 2026-04-16

### Fixed

- Exported `RegisterOptions` type — consumers can now reference it when wrapping
  `register()`

## [4.0.1] - 2026-04-09

### Changed

- Documented `id()`, `register()`, `once()`, and `off()` methods in README

## [4.0.0] - 2026-03-18

### Changed

- `position` is now an async method instead of a setter. Use
  `await engine.position('startpos')` instead of `engine.position = 'startpos'`.

### Fixed

- Process stderr now emits proper `Error` objects instead of raw `Buffer`.
- `ready()` no longer permanently caches errors — subsequent calls retry the
  `isready` handshake, allowing recovery from transient failures.

### Added

- Process class unit tests (stdout buffering, stderr, write errors, lifecycle).
- `go()` option combination tests (depth, nodes, mate, searchmoves, movestogo).
- Edge case tests for parser and ingest (empty input, unknown commands, string
  info).

## [3.0.2] - 2026-03-15

### Added

- `Events` and `GoOptions` are now re-exported from the package root — consumers
  can import them directly: `import UCI, { type GoOptions } from '@echecs/uci'`

### Fixed

- `start()` no longer re-sends `setoption` commands on every call — engine
  config is now applied exactly once after the UCI handshake

## [3.0.1] - 2026-03-15

### Fixed

- README updated to reflect v3.0.0 API (constructor `config` option,
  `GoOptions`, pondering, corrected `stop()`/`reset()` descriptions, `sbhits` in
  `InfoCommand`)
- CHANGELOG: moved `reset()` and `stop()` entries from `Added` to `Changed`

## [3.0.0] - 2026-03-15

### Added

- `GoOptions` interface — typed parameters for `go` command: `wtime`, `btime`,
  `winc`, `binc`, `movestogo`, `movetime`, `nodes`, `mate`, `searchmoves`,
  `depth`
- `start(options?: GoOptions)` — time controls and search limits as typed
  options
- `move(input, options?: GoOptions)` — per-move time controls forwarded to `go`
- Constructor `config` option — `setoption` overrides applied once after UCI
  handshake: `new UCI(path, { config: { Hash: 64 } })`
- `ponder(move, options?)` — sends `go ponder` for pondering on a move; guards
  against double-call
- `ponderhit()` — commits ponder move, switches engine from ponder to normal
  search
- `sbhits` field on `InfoCommand` — Shredder endgame database hits

### Changed

- `start()` parameter changed from `Record<string, unknown>` (setoptions) to
  `GoOptions` (search parameters) — **breaking change**
- Engine `setoption` overrides now passed via constructor `config` option
  instead of `start()` argument
- `reset()` now sends `ucinewgame` before `position startpos`
- `stop()` now clears pondering state

### Migration from v2

```ts
// v2
const uci = new UCI('/path/to/engine');
await uci.start({ MultiPV: 4, Hash: 128 });

// v3
const uci = new UCI('/path/to/engine', { config: { Hash: 128 } });
uci.lines = 4; // MultiPV is still set via the lines property
await uci.start(); // no args needed for engine config
await uci.start({ movetime: 1000 }); // time-controlled search
```

## [2.0.0] - 2026-03-15

### Added

- `debug(on)` — sends `debug on` / `debug off` to the engine
- `Events` interface exported from `src/types.ts` — consumers can now type their
  listeners directly
- `[Symbol.dispose]()` — sends `quit` and terminates the engine process
  (replaces using `stop()` for shutdown)
- `stop()` — now correctly sends `stop` (halts search, keeps engine alive)

### Changed

- `UCI` no longer extends `Emittery` — the public event API is now limited to
  explicit `on()`, `off()`, and `once()` methods. Emittery internals (`onAny`,
  `offAny`, `anyEvent`, `clearListeners`, `listenerCount`, `bindMethods`) are no
  longer accessible.
- `ready()` now fails fast on process exit or timeout instead of hanging
  indefinitely — errors are emitted on the `'error'` event

### Fixed

- `stop()` was sending `quit` instead of `stop`
- `combo` option `var` values were parsed as a single string instead of an
  array, breaking option validation
- `lowerbound`/`upperbound` score flags now parsed order-independently
- `start()` now emits an error instead of throwing when the engine handshake
  fails

## [1.0.0] - 2026-03-13

Initial public release.

### Added

- `UCI` class — wraps a UCI chess engine process with a typed event-emitter API
- Full UCI handshake (`uci`, `isready`, `uciok`, `readyok`)
- `start(options?)` — applies `setoption` overrides and sends `go`
- `move(move)` — sends a move in long algebraic notation and restarts search
- `stop()` — sends `quit` and terminates the engine process
- `reset()` — resets position to `startpos`
- `execute(command)` — sends an arbitrary UCI command string
- `depth` and `lines` properties for controlling search parameters
- `position` setter for FEN or `startpos`
- Typed `info` events: depth, selective depth, score (`cp`/`mate` with
  `lowerbound`/`upperbound`), PV moves, nodes, NPS, time, hashfull, CPU load
- Typed `bestmove`, `id`, `option`, `copyprotection`, `registration`, `error`,
  `output`, `readyok`, `uciok` events
- Engine option validation via Zod schemas
