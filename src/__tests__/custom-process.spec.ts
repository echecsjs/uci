import { describe, expect, it } from 'vitest';

import UCI from '../index.js';

import type { EngineProcess } from '../types.js';

class FakeEngineProcess implements EngineProcess {
  readonly #errorListeners: ((error: Error) => void)[] = [];
  readonly #exitListeners: ((code: number) => void)[] = [];
  #rejectNextWrite = false;
  readonly #stdoutListeners: ((data: string) => void)[] = [];
  readonly writes: string[] = [];
  killed = false;
  shouldAnswerIsready = true;

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

  rejectNextWrite(): void {
    this.#rejectNextWrite = true;
  }

  async write(input: string): Promise<void> {
    if (this.#rejectNextWrite) {
      this.#rejectNextWrite = false;
      throw new Error('write failed');
    }

    this.writes.push(input);

    // Keep the handshake working without a real engine
    if (input === 'uci\n') {
      this.emitStdout('id name Test\nid author Me\nuciok\n');
    }

    if (input === 'isready\n' && this.shouldAnswerIsready) {
      this.emitStdout('readyok\n');
    }
  }
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('UCI with custom process', () => {
  it('handshakes and reports the engine id', async () => {
    const fake = new FakeEngineProcess();
    const uci = new UCI('', { process: fake });

    const id = await uci.id();

    expect(id).toEqual({ author: 'Me', name: 'Test' });
  });

  it('routes execute writes to the custom process', async () => {
    const fake = new FakeEngineProcess();
    const uci = new UCI('', { process: fake });

    await uci.debug(true);

    expect(fake.writes).toContain('debug on\n');
  });

  it('kills the custom process on dispose', async () => {
    const fake = new FakeEngineProcess();
    const uci = new UCI('', { process: fake });

    await uci[Symbol.asyncDispose]();

    expect(fake.writes).toContain('quit\n');
    expect(fake.killed).toBe(true);
  });

  it('surfaces impl errors on the error event', async () => {
    const fake = new FakeEngineProcess();
    const uci = new UCI('', { process: fake });
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });

    const boom = new Error('boom');
    fake.emitError(boom);
    await flush();

    expect(errors).toContain(boom);
  });

  it('execute routes write rejections to the error event', async () => {
    const fake = new FakeEngineProcess();
    const uci = new UCI('', { process: fake });
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });

    fake.rejectNextWrite();
    await uci.debug(false);
    await flush();

    expect(errors.some((error) => error.message === 'write failed')).toBe(true);
  });

  it('exit during ready emits Engine process exited', async () => {
    const fake = new FakeEngineProcess();
    fake.shouldAnswerIsready = false;
    const uci = new UCI('', { process: fake, timeout: 5000 });
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });

    const ready = uci.position('startpos');

    // Give ready() one tick to register its exit listener
    await Promise.resolve();

    fake.emitExit(1);
    await ready;
    await flush();

    expect(
      errors.some((error) => error.message === 'Engine process exited'),
    ).toBe(true);
  });
});
