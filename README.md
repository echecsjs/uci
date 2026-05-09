# UCI

[![npm](https://img.shields.io/npm/v/@echecs/uci)](https://www.npmjs.com/package/@echecs/uci)
[![Coverage](https://codecov.io/gh/echecsjs/uci/branch/main/graph/badge.svg)](https://codecov.io/gh/echecsjs/uci)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![API Docs](https://img.shields.io/badge/API-docs-blue.svg)](https://uci.echecs.dev/)
[![Spec](https://img.shields.io/badge/Spec-UCI-green.svg)](SPEC.md)

**UCI** is a TypeScript wrapper for the
[Universal Chess Interface](https://www.wbec-ridderkerk.nl/html/UCIProtocol.html)
protocol — the standard way for chess GUIs to communicate with chess engines
such as Stockfish, Leela Chess Zero, and Komodo.

It spawns and manages the engine process, handles the full UCI handshake, and
surfaces engine output as typed events. Zero configuration required.

## Why this library?

Working with UCI engines directly means parsing a line-oriented text protocol,
managing process lifecycle, and coordinating asynchronous handshakes. This
library handles all of that:

- **Full protocol compliance** — implements the complete UCI spec: `uci`,
  `isready`, `ucinewgame`, `position`, `go`, `stop`, `setoption`, `register`,
  and `ponderhit`. Engine output (`id`, `option`, `info`, `bestmove`) is parsed
  into typed objects.
- **Time controls** — pass `wtime`, `btime`, `movetime`, `depth`, and more as a
  typed `GoOptions` object.
- **Pondering** — first-class `ponder()` and `ponderhit()` with correct state
  tracking.
- **Typed `info` events** — search information is fully parsed: depth, selective
  depth, score (centipawns or mate distance with bound flags), PV moves, nodes,
  NPS, time, hashfull, CPU load, and endgame tablebase hits.
- **Typed `score`** — scores are a discriminated union (`cp` or `mate`, with
  optional `lowerbound`/`upperbound`), not a raw string or plain number.
- **Engine options** — options advertised by the engine are validated before
  being sent via `setoption`.
- **Event-based** — built on
  [Emittery](https://github.com/sindresorhus/emittery) for fully-typed async
  events.

## Installation

```bash
npm install @echecs/uci
```

Named types are exported directly from the package:

```typescript
import UCI, { type GoOptions, type Events } from '@echecs/uci';
// Also available: ID, InfoCommand, Option, RegisterOptions, Score
```

## Quick Start

```typescript
import UCI from '@echecs/uci';

const engine = new UCI('/usr/bin/stockfish');

engine.on('bestmove', ({ move }) => {
  console.log(`Best move: ${move}`); // e.g. "e2e4"
});

await engine.start();
```

## Usage

### Creating an engine

```typescript
new UCI(path: string, options?: { config?: Record<string, unknown>; timeout?: number })
```

`path` is the path to the UCI engine binary. `timeout` (default 5000 ms) is how
long to wait for the engine to respond to the initial `uci` command before
emitting an error. `config` is an optional map of `setoption` values applied
once after the UCI handshake.

```typescript
const engine = new UCI('/usr/bin/stockfish');
const engine = new UCI('./engines/lc0', { timeout: 10_000 });
const engine = new UCI('/usr/bin/stockfish', {
  config: { Hash: 256, Threads: 4 },
});
```

### Starting a search

```typescript
await engine.start(options?: GoOptions): Promise<void>
```

Waits for the engine to be ready, applies `setoption` values from the
constructor `config`, then sends `go`. Accepts an optional `GoOptions` object
for time controls and search limits. Listen for `info` events during the search
and `bestmove` when it finishes.

```typescript
engine.on('info', (info) => {
  if (info.score?.type === 'cp') {
    console.log(`Score: ${info.score.value} pawns at depth ${info.depth}`);
  }
  if (info.score?.type === 'mate') {
    console.log(`Mate in ${info.score.value}`);
  }
});

engine.on('bestmove', ({ move, ponder }) => {
  console.log(`Best: ${move}, ponder: ${ponder}`);
});

// Infinite search (default)
await engine.start();

// Fixed time per move
await engine.start({ movetime: 1000 });

// Clock-based (standard game)
await engine.start({ wtime: 60_000, btime: 60_000, winc: 1000, binc: 1000 });

// Fixed depth
await engine.start({ depth: 20 });
```

### `GoOptions`

All fields are optional. When none are set, the engine searches infinitely until
`stop()` is called.

```typescript
interface GoOptions {
  binc?: number; // black increment per move (ms)
  btime?: number; // black remaining time (ms)
  depth?: number; // search to this depth (overrides engine.depth)
  mate?: number; // search for mate in N moves
  movestogo?: number; // moves until next time control
  movetime?: number; // search exactly N ms
  nodes?: number; // search exactly N nodes
  searchmoves?: string[]; // restrict search to these moves
  winc?: number; // white increment per move (ms)
  wtime?: number; // white remaining time (ms)
}
```

### Sending moves

```typescript
await engine.move(move: string, options?: GoOptions): Promise<void>
```

Sends a move in long algebraic notation, stops the current search, updates the
position, and restarts the search. Moves accumulate — call `reset()` to start a
new game. Accepts the same `GoOptions` as `start()`.

```typescript
await engine.move('e2e4');
await engine.move('e7e5', { movetime: 500 });
await engine.move('e7e8q'); // promotion
```

### Pondering

Pondering lets the engine think on the opponent's time.

```typescript
// After receiving bestmove with a ponder suggestion, start pondering
engine.on('bestmove', async ({ move, ponder }) => {
  if (ponder) {
    await engine.ponder(ponder);
  }
});

// Opponent played the predicted move — switch to normal search
await engine.ponderhit();

// Opponent played a different move — stop pondering, then send the actual move
await engine.stop();
await engine.move('d7d5');
```

```typescript
await engine.ponder(move: string, options?: GoOptions): Promise<void>
await engine.ponderhit(): Promise<void>
```

`ponder()` sends `go ponder` with the speculative opponent move. Calling it
while already pondering emits an error. `ponderhit()` commits the ponder move
and switches the engine to normal search; calling it when not pondering emits an
error.

### Setting position

```typescript
await engine.position('startpos'); // initial position (default)
await engine.position('fen <fenstring>'); // custom position
```

Calling `position()` resets the move list and sends `position` to the engine.

### Configuring search defaults

```typescript
engine.depth = 10; // default depth for go (overridden by GoOptions.depth)
engine.lines = 3; // MultiPV — return top N lines (default: 1)
```

### Stopping and resetting

```typescript
await engine.stop(): Promise<void>   // halts the current search (engine stays alive)
await engine.reset(): Promise<void>  // sends ucinewgame + resets to startpos
await engine[Symbol.dispose](): Promise<void> // sends quit + kills the process
await engine.debug(true): Promise<void>   // sends "debug on"
await engine.debug(false): Promise<void>  // sends "debug off"
```

### Querying the engine identity

```typescript
async id(): Promise<ID>
```

Waits for the UCI handshake to complete, then returns the engine's `ID` object
(`{ name: string; author: string }`). Throws if the engine did not report an
identity.

```typescript
const { name, author } = await engine.id();
console.log(`${name} by ${author}`);
```

### Registering the engine

```typescript
async register(options?: RegisterOptions): Promise<void>
```

Sends a `register` command to the engine. Call without arguments to defer
registration (`register later`), or pass `{ name, code }` to register
immediately.

```typescript
await engine.register(); // register later
await engine.register({ name: 'My Name', code: '4359874324' });
```

### Listening for one event

```typescript
once<K extends keyof Events>(event: K): Promise<Events[K]>
```

Returns a promise that resolves with the next emission of `event`. Useful for
waiting on a single engine response without setting up a persistent listener.

```typescript
const { move } = await engine.once('bestmove');
```

### Removing a listener

```typescript
off<K extends keyof Events>(event: K, listener: (data: Events[K]) => void | Promise<void>): void
```

Removes a listener previously registered with `on()`.

```typescript
const handler = ({ move }: { move: string | undefined }) => console.log(move);
engine.on('bestmove', handler);
// …
engine.off('bestmove', handler);
```

### Low-level access

```typescript
await engine.execute(command: string): Promise<void>
```

Sends an arbitrary UCI command string to the engine. Useful for engine-specific
extensions (e.g. `d` for board display in Stockfish).

## Events

```typescript
engine.on('bestmove',      ({ move, ponder }) => void)
engine.on('copyprotection', (status: string) => void)
engine.on('error',          (error: Error)   => void)
engine.on('id',             ({ name, author }) => void)
engine.on('info',           (info: InfoCommand) => void)
engine.on('option',         (option: Option) => void)
engine.on('output',         (line: string)   => void)
engine.on('readyok',        () => void)
engine.on('registration',   (status: string) => void)
engine.on('uciok',          () => void)
```

### `InfoCommand`

```typescript
{
  cpuload?:    number,                          // cpu usage in permill
  current?:    { line?: string[], move?: string, number?: number },
  depth?:      number | { selective: number, total: number },
  hashfull?:   number,                          // hash usage in permill
  info?:       string,                          // free-form engine string
  line?:       number,                          // multipv line number
  moves?:      string[],                        // pv move list
  nodes?:      number,
  refutation?: string[],
  sbhits?:     number,                          // Shredder endgame DB hits
  score?:      Score,
  stats?:      { nps?: number },
  tbhits?:     number,                          // endgame tablebase hits
  time?:       number,                          // ms
}
```

### `Score`

```typescript
| { type: 'cp';   value: number }                        // centipawns ÷ 100
| { type: 'mate'; value: number }                        // moves to mate (negative = being mated)
| { type: 'cp';   value: number; bound: 'lower' }
| { type: 'cp';   value: number; bound: 'upper' }
```

### `Option`

```typescript
{ name: string } & (
  | { type: 'button' }
  | { type: 'check',  default: boolean }
  | { type: 'combo',  default: string, var: string[] }
  | { type: 'spin',   default: number, min?: number, max?: number }
  | { type: 'string', default: string }
)
```

## API

Full API reference is available at https://uci.echecs.dev/

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for
guidelines on how to submit issues and pull requests.
