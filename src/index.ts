import Emittery from 'emittery';

import Options from './options.js';
import { parsers } from './parser/index.js';
import Process from './process.js';

import type { Events, GoOptions, ID } from './types.js';

interface RegisterOptions {
  code: string;
  name: string;
}

const TIMEOUT = 5000;

class UCI {
  /**
   * Internal store of the engine options
   * @private
   */
  private readonly options = new Options();

  private process: Process;

  /**
   * Engine setoption overrides to apply before the first go command.
   * @private
   */
  readonly #config: Record<string, unknown>;

  /**
   * Whether #config setoptions have already been sent to the engine.
   * @private
   */
  #configApplied = false;

  /**
   * Internal state of the depth
   * @private
   */
  #depth: number | 'infinite' = 'infinite';

  /**
   * Internal event emitter.
   * @private
   */
  readonly #emitter = new Emittery<Events>();

  /**
   * Internal store of the engine id
   * @private
   */
  #id: ID | undefined;

  /**
   * Internal state of the number of lines
   * @private
   */
  #lines = 1;

  /**
   * Maps consumer listeners to their emittery v2 wrappers so off() can
   * unsubscribe the correct reference.
   * @private
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  readonly #listeners = new WeakMap<Function, Function>();

  /**
   * Internal list of moves
   * @private
   */
  #moves: string[] = [];

  /**
   * The speculative ponder move, not yet confirmed as played.
   * @private
   */
  #ponderMove: string | undefined;

  /**
   * Whether the engine is currently in ponder mode.
   * @private
   */
  #pondering = false;

  /**
   * Initial position of the engine
   * @private
   */
  #position = 'startpos';

  /**
   * Internal state of uciok event
   * @private
   */
  readonly #ready: Promise<void>;

  /**
   * Timeout in ms for UCI handshake and isready responses.
   * @private
   */
  readonly #timeout: number;

  constructor(
    path: string,
    {
      config = {},
      timeout,
    }: { config?: Record<string, unknown>; timeout?: number } = {},
  ) {
    this.#timeout = timeout ?? TIMEOUT;
    this.#config = config;
    this.process = new Process(path);

    this.process.on('line', ({ data }) => this.ingest(data));
    this.process.on('error', ({ data }) => this.#emitter.emit('error', data));

    // Store the ID of the engine
    this.#emitter.on('id', ({ data: id }) => {
      this.#id = id;
    });
    // Define the available options
    this.#emitter.on('option', ({ data: option }) => {
      this.options.define(option.name, option);
    });

    // Set a promise to wait for the engine to be ready
    this.#ready = new Promise((ok, ko) => {
      this.#emitter.on('uciok', () => {
        ok();
      });

      // Set a timeout as a fallback
      setTimeout(ko, this.#timeout);

      // Starts the communication protocol
      this.execute('uci').catch(ko);
    });

    // Prevent unhandled rejection when no caller awaits #ready.
    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    void this.#ready.catch((_error: unknown) => {});
  }

  get depth(): number | 'infinite' {
    return this.#depth;
  }

  set depth(value: number | 'infinite') {
    this.#depth = value;
  }

  get lines(): number {
    return this.#lines;
  }

  set lines(value: number) {
    this.#lines = value;
  }

  async [Symbol.dispose](): Promise<void> {
    await this.execute('quit');
    this.process.kill();
  }

  debug(on: boolean): Promise<void> {
    return this.execute(`debug ${on ? 'on' : 'off'}`);
  }

  async execute(command: string): Promise<void> {
    await this.process.write(`${command}\n`).catch((error: unknown) => {
      void this.#emitter.emit(
        'error',
        error instanceof Error ? error : new Error(String(error)),
      );
    });
  }

  async id(): Promise<ID> {
    await this.#ready;

    if (!this.#id) {
      throw new Error('ID not found');
    }

    return this.#id;
  }

  async move(input: string, options: GoOptions = {}): Promise<void> {
    this.#pondering = false;
    this.#ponderMove = undefined;
    this.#moves.push(input);

    const list = this.#moves.join(' ');

    await this.execute('stop');
    await this.execute(`position ${this.#position} moves ${list}`);
    await this.go(options);
  }

  off<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void | Promise<void>,
  ): void {
    const wrapped = this.#listeners.get(listener);
    if (wrapped) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.#emitter.off(event, wrapped as any);
      this.#listeners.delete(listener);
    }
  }

  on<K extends keyof Events>(
    event: K,
    listener: (data: Events[K]) => void | Promise<void>,
  ): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = ({ data }: any) => listener(data);
    this.#listeners.set(listener, wrapped);
    return this.#emitter.on(event, wrapped);
  }

  async once<K extends keyof Events>(event: K): Promise<Events[K]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = (await this.#emitter.once(event)) as any;
    return data as Events[K];
  }

  async ponder(move: string, options: GoOptions = {}): Promise<void> {
    if (this.#pondering) {
      void this.#emitter.emit(
        'error',
        new Error('ponder() called while already pondering'),
      );
      return;
    }

    await this.execute('stop');

    this.#ponderMove = move;
    const list = [...this.#moves, move].join(' ');

    await this.execute(`position ${this.#position} moves ${list}`);
    await this.go(options, true);
    this.#pondering = true;
  }

  async ponderhit(): Promise<void> {
    if (!this.#pondering) {
      void this.#emitter.emit(
        'error',
        new Error('ponderhit() called when not pondering'),
      );
      return;
    }

    if (this.#ponderMove !== undefined) {
      this.#moves.push(this.#ponderMove);
      this.#ponderMove = undefined;
    }

    this.#pondering = false;
    await this.execute('ponderhit');
  }

  async position(input: string): Promise<void> {
    this.#position = input;
    this.#moves = [];

    await this.ready();
    await this.execute(`position ${input}`);
  }

  async register(options?: RegisterOptions): Promise<void> {
    if (!options) {
      return this.execute('register later');
    }

    const { code, name } = options;
    return this.execute(`register name ${name} code ${code}`);
  }

  async reset(): Promise<void> {
    this.#pondering = false;
    this.#ponderMove = undefined;
    await this.execute('ucinewgame');
    await this.position('startpos');
  }

  async start(options: GoOptions = {}): Promise<void> {
    try {
      await this.#ready;
    } catch (error: unknown) {
      void this.#emitter.emit(
        'error',
        error instanceof Error ? error : new Error(String(error)),
      );
      return;
    }

    if (!this.#configApplied) {
      this.#configApplied = true;

      const config: Record<string, unknown> = {
        MultiPV: this.#lines,
        ...this.#config,
      };

      for (const [key, value] of Object.entries(config)) {
        try {
          this.options.set(key, value);
        } catch (error: unknown) {
          void this.#emitter.emit(
            'error',
            error instanceof Error ? error : new Error(String(error)),
          );
          continue; // skip sending invalid option to engine
        }
        await this.execute(`setoption name ${key} value ${value}`);
      }
    }

    await this.go(options);
  }

  stop(): Promise<void> {
    this.#pondering = false;
    this.#ponderMove = undefined;
    return this.execute('stop');
  }

  private async go(options: GoOptions = {}, ponder = false): Promise<void> {
    await this.ready();

    const parts: string[] = ['go'];

    if (ponder) {
      parts.push('ponder');
    }

    if (options.wtime !== undefined) {
      parts.push('wtime', String(options.wtime));
    }

    if (options.btime !== undefined) {
      parts.push('btime', String(options.btime));
    }

    if (options.winc !== undefined) {
      parts.push('winc', String(options.winc));
    }

    if (options.binc !== undefined) {
      parts.push('binc', String(options.binc));
    }

    if (options.movestogo !== undefined) {
      parts.push('movestogo', String(options.movestogo));
    }

    const depth =
      options.depth ?? (this.#depth === 'infinite' ? undefined : this.#depth);
    if (depth !== undefined) {
      parts.push('depth', String(depth));
    }

    if (options.nodes !== undefined) {
      parts.push('nodes', String(options.nodes));
    }

    if (options.mate !== undefined) {
      parts.push('mate', String(options.mate));
    }

    if (options.movetime !== undefined) {
      parts.push('movetime', String(options.movetime));
    }

    const hasSearchLimit =
      depth !== undefined ||
      options.movestogo !== undefined ||
      options.movetime !== undefined ||
      options.nodes !== undefined ||
      options.mate !== undefined ||
      options.wtime !== undefined ||
      options.btime !== undefined;

    if (!hasSearchLimit && !ponder) {
      parts.push('infinite');
    }

    if (options.searchmoves && options.searchmoves.length > 0) {
      parts.push('searchmoves', ...options.searchmoves);
    }

    await this.execute(parts.join(' '));
  }

  private async ingest(input: string): Promise<void> {
    const [key, ...argv] = input.split(' ');
    const value = argv.join(' ');

    if (key === undefined) {
      return;
    }

    if (!(key in parsers)) {
      await this.#emitter.emit('output', input);
      return;
    }

    const command = key as keyof typeof parsers;
    const payload = parsers[command](value);

    await this.#emitter.emit(command as keyof Events, payload);
  }

  private async ready(): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let unsubscribeExit: (() => void) | undefined;
    let unsubscribeReadyok: (() => void) | undefined;

    const readyok = new Promise<void>((ok) => {
      unsubscribeReadyok = this.#emitter.on('readyok', () => {
        ok();
      });
    });

    const exit = new Promise<never>((_, ko) => {
      unsubscribeExit = this.process.on('exit', () =>
        ko(new Error('Engine process exited')),
      );
    });

    const timeout = new Promise<never>((_, ko) => {
      timeoutId = setTimeout(() => {
        ko(new Error('Engine ready timeout'));
      }, this.#timeout);
    });

    await this.execute('isready');

    try {
      await Promise.race([readyok, exit, timeout]);
    } catch (error: unknown) {
      void this.#emitter.emit(
        'error',
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      clearTimeout(timeoutId);
      unsubscribeExit?.();
      unsubscribeReadyok?.();
    }
  }
}

export default UCI;
export type { RegisterOptions };
export type {
  Events,
  GoOptions,
  ID,
  InfoCommand,
  Option,
  Score,
} from './types.js';
