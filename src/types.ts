type MergeTypes<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TypesArray extends any[],
  Result = unknown,
> = TypesArray extends [infer Head, ...infer Rem]
  ? MergeTypes<Rem, Result & Head>
  : Result;

type OneOf<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TypesArray extends any[],
  Result = never,
  AllProperties = MergeTypes<TypesArray>,
> = TypesArray extends [infer Head, ...infer Rem]
  ? OneOf<Rem, Result | OnlyFirst<Head, AllProperties>, AllProperties>
  : Result;

type OnlyFirst<F, S> = F & { [Key in keyof Omit<S, keyof F>]?: never };

interface Value<T> {
  default: T;
  value?: T;
}

interface Type<T> {
  type: T;
}

type Button = Value<void> & Type<'button'>;
type Check = Value<boolean> & Type<'check'>;
type Combo = Value<string> & Type<'combo'> & { var: string[] };
type Spin = Value<number> & Type<'spin'> & { max?: number; min?: number };
type Stringy = Value<string> & Type<'string'>;
interface Name {
  name: string;
}

/**
Options exposed by a UCI engine
*/
type Option = OneOf<[Button, Check, Combo, Spin, Stringy]> & Name;

/**
Events emitted by the UCI engine wrapper
*/
interface Events {
  bestmove: { move: string | undefined; ponder?: string };
  copyprotection: string;
  error: Error;
  id: ID;
  info: InfoCommand;
  option: Option;
  output: string;
  readyok: undefined;
  registration: string;
  uciok: undefined;
}

/**
Parameters for the UCI `go` command
*/
interface GoOptions {
  binc?: number;
  btime?: number;
  depth?: number;
  mate?: number;
  movestogo?: number;
  movetime?: number;
  nodes?: number;
  searchmoves?: string[];
  winc?: number;
  wtime?: number;
}

/**
Engine identity (name + author)
*/
interface ID {
  author: string;
  name: string;
}

/**
Score from the engine — centipawns or mate distance, with optional bound
*/
type Score =
  | { bound: 'lower'; type: 'cp'; value: number }
  | { bound: 'upper'; type: 'cp'; value: number }
  | { bound?: never; type: 'cp'; value: number }
  | { bound?: never; type: 'mate'; value: number };

/**
Information emitted by the engine via `info` command
*/
interface InfoCommand {
  cpuload?: number;
  current?: { line?: string[]; move?: string; number?: number };
  depth?: number | { selective: number; total: number };
  hashfull?: number;
  info?: string;
  line?: number;
  moves?: string[];
  nodes?: number;
  refutation?: string[];
  sbhits?: number;
  score?: Score;
  stats?: { nps?: number };
  tbhits?: number;
  time?: number;
}

export type { Events, GoOptions, ID, InfoCommand, Option, Score };
