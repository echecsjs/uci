import { describe, expect, it } from 'vitest';

import EngineProcess from '../engine-process.js';
import { UCI } from '../index.js';

class FakeEngineProcess extends EngineProcess {
  #rejectNextWrite = false;
  readonly path: string;
  readonly writes: string[] = [];
  killed = false;
  shouldAnswerIsready = true;

  constructor(path = '') {
    super();

    this.path = path;
    instances.push(this);
  }

  kill(): void {
    this.killed = true;
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
      await this.emit('stdout', 'id name Test\nid author Me\nuciok\n');
    }

    if (input === 'isready\n' && this.shouldAnswerIsready) {
      await this.emit('stdout', 'readyok\n');
    }
  }
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

const instances: FakeEngineProcess[] = [];

describe('UCI with custom process', () => {
  it('accepts a process class and instantiates it with the engine path', async () => {
    const uci = new UCI('/engines/stockfish', { process: FakeEngineProcess });

    const id = await uci.id();

    expect(id).toEqual({ author: 'Me', name: 'Test' });
    expect(instances.at(-1)?.path).toBe('/engines/stockfish');
  });

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
    await fake.emit('error', boom);
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

    await fake.emit('exit', 1);
    await ready;
    await flush();

    expect(
      errors.some((error) => error.message === 'Engine process exited'),
    ).toBe(true);
  });
});
