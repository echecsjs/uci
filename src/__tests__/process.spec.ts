import { describe, expect, it } from 'vitest';

import EngineProcess from '../engine-process.js';
import Process from '../process.js';

const flush = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

class FakeEngineProcess extends EngineProcess {
  readonly writes: string[] = [];
  killed = false;

  kill(): void {
    this.killed = true;
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

    await fake.emit('stdout', 'ucio');
    await fake.emit('stdout', 'k\n');
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

    await fake.emit('stdout', 'best');
    await flush();
    expect(lines).toEqual([]);

    await fake.emit('stdout', 'move e2e4\n');
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

    await fake.emit('stdout', 'uciok\nreadyok\n');
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

    await fake.emit('stdout', 'before\n\nafter\n');
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
    await fake.emit('error', boom);
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

    await fake.emit('exit', 3);
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
