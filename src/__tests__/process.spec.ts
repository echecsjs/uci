import { describe, expect, it } from 'vitest';

import Process from '../process.js';

import type { EngineProcess } from '../types.js';

const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

class FakeEngineProcess implements EngineProcess {
  readonly #errorListeners: ((error: Error) => void)[] = [];
  readonly #exitListeners: ((code: number) => void)[] = [];
  readonly #stdoutListeners: ((data: string) => void)[] = [];
  readonly writes: string[] = [];
  killed = false;

  emitError(error: Error): void {
    for (const listener of this.#errorListeners) {
      listener(error);
    }
  }

  emitExit(code: number): void {
    for (const listener of this.#exitListeners) {
      listener(code);
    }
  }

  emitStdout(data: string): void {
    for (const listener of this.#stdoutListeners) {
      listener(data);
    }
  }

  kill(): void {
    this.killed = true;
  }

  onError(listener: (error: Error) => void): void {
    this.#errorListeners.push(listener);
  }

  onExit(listener: (code: number) => void): void {
    this.#exitListeners.push(listener);
  }

  onStdout(listener: (data: string) => void): void {
    this.#stdoutListeners.push(listener);
  }

  async write(input: string): Promise<void> {
    this.writes.push(input);
  }
}

describe('Process', () => {
  it('line events buffer chunks split mid-line', async () => {
    const fake = new FakeEngineProcess();
    const process = new Process(fake);
    const lines: string[] = [];
    process.on('line', ({ data }) => {
      lines.push(data);
    });

    fake.emitStdout('ucio');
    fake.emitStdout('k\n');
    await flush();
    expect(lines).toEqual(['uciok']);
  });

  it('holds a partial line until a newline arrives', async () => {
    const fake = new FakeEngineProcess();
    const process = new Process(fake);
    const lines: string[] = [];
    process.on('line', ({ data }) => {
      lines.push(data);
    });

    fake.emitStdout('best');
    await flush();
    expect(lines).toEqual([]);

    fake.emitStdout('move e2e4\n');
    await flush();
    expect(lines).toEqual(['bestmove e2e4']);
  });

  it('emits one line per line in a multi-line chunk', async () => {
    const fake = new FakeEngineProcess();
    const process = new Process(fake);
    const lines: string[] = [];
    process.on('line', ({ data }) => {
      lines.push(data);
    });

    fake.emitStdout('uciok\nreadyok\n');
    await flush();
    expect(lines).toEqual(['uciok', 'readyok']);
  });

  it('preserves empty lines in output', async () => {
    const fake = new FakeEngineProcess();
    const process = new Process(fake);
    const lines: string[] = [];
    process.on('line', ({ data }) => {
      lines.push(data);
    });

    fake.emitStdout('before\n\nafter\n');
    await flush();
    expect(lines).toEqual(['before', '', 'after']);
  });

  it('re-emits impl errors', async () => {
    const fake = new FakeEngineProcess();
    const process = new Process(fake);
    const errors: Error[] = [];
    process.on('error', ({ data }) => {
      errors.push(data);
    });

    const boom = new Error('boom');
    fake.emitError(boom);
    await flush();
    expect(errors).toEqual([boom]);
  });

  it('re-emits impl exit codes', async () => {
    const fake = new FakeEngineProcess();
    const process = new Process(fake);
    const exits: number[] = [];
    process.on('exit', ({ data }) => {
      exits.push(data);
    });

    fake.emitExit(3);
    await flush();
    expect(exits).toEqual([3]);
  });

  it('delegates write to the impl', async () => {
    const fake = new FakeEngineProcess();
    const process = new Process(fake);

    await process.write('uci\n');
    expect(fake.writes).toEqual(['uci\n']);
  });

  it('delegates kill to the impl', () => {
    const fake = new FakeEngineProcess();
    const process = new Process(fake);

    process.kill();
    expect(fake.killed).toBe(true);
  });
});
