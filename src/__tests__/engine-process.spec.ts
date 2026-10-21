import { describe, expect, it } from 'vitest';

import EngineProcess from '../engine-process.js';

class EchoProcess extends EngineProcess {
  readonly writes: string[] = [];
  killed = false;

  kill(): void {
    this.killed = true;
  }

  async write(input: string): Promise<void> {
    this.writes.push(input);
  }
}

describe('EngineProcess', () => {
  it('is a runtime class that can be extended', () => {
    expect(typeof EngineProcess).toBe('function');

    const process = new EchoProcess();

    expect(process).toBeInstanceOf(EngineProcess);
    expect(process.killed).toBe(false);
  });

  it('delivers emitted stdout to on() listeners', async () => {
    const process = new EchoProcess();
    const chunks: string[] = [];
    process.on('stdout', ({ data }) => {
      chunks.push(data);
    });

    await process.emit('stdout', 'uciok\n');

    expect(chunks).toEqual(['uciok\n']);
  });

  it('delivers emitted error and exit events', async () => {
    const process = new EchoProcess();
    const errors: Error[] = [];
    const exits: number[] = [];
    process.on('error', ({ data }) => {
      errors.push(data);
    });
    process.on('exit', ({ data }) => {
      exits.push(data);
    });

    const boom = new Error('boom');
    await process.emit('error', boom);
    await process.emit('exit', 42);

    expect(errors).toEqual([boom]);
    expect(exits).toEqual([42]);
  });

  it('supports once() inherited from Emittery', async () => {
    const process = new EchoProcess();
    const exit = process.once('exit');

    await process.emit('exit', 7);

    expect(await exit).toEqual({ data: 7, name: 'exit' });
  });

  it('drops events emitted before any listener is attached', async () => {
    const process = new EchoProcess();
    await process.emit('stdout', 'lost\n');
    const chunks: string[] = [];
    process.on('stdout', ({ data }) => {
      chunks.push(data);
    });

    await process.emit('stdout', 'seen\n');

    expect(chunks).toEqual(['seen\n']);
  });
});

describe('package exports', () => {
  it('exports EngineProcess and UCI as runtime values from the index', async () => {
    const index = await import('../index.js');

    expect(typeof index.EngineProcess).toBe('function');
    expect(typeof index.UCI).toBe('function');
    expect(index.default).toBe(index.UCI);
  });
});
