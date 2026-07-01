import { describe, expect, it, vi } from 'vitest';

import UCI from '../index.js';

describe('UCI', () => {
  it('emits an error when instantiated with an invalid path', async () => {
    const onError = vi.fn();
    const invalidPath = '/invalid/path/to/engine';

    const uci = new UCI(invalidPath);
    uci.on('error', onError);

    // Wait for the error event to fire asynchronously
    await new Promise<void>((resolve) => {
      uci.on('error', () => {
        resolve();
      });
    });

    expect(onError).toHaveBeenCalled();
  });

  it('stop() sends the stop command', async () => {
    const uci = new UCI('/invalid/path');
    const spy = vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    );

    // stop() should not throw — ignore the underlying write error
    try {
      await uci.stop();
    } catch {
      // ignore
    }

    expect(spy).toHaveBeenCalledWith('stop');
  });

  it('[Symbol.dispose]() sends quit and kills the process', async () => {
    const uci = new UCI('/invalid/path');
    const executeSpy = vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    );
    const killSpy = vi.spyOn(
      (uci as unknown as { process: { kill: () => void } }).process,
      'kill',
    );

    try {
      // eslint-disable-next-line unicorn/no-nonstandard-builtin-properties
      await uci[Symbol.asyncDispose]();
    } catch {
      // ignore
    }

    expect(executeSpy).toHaveBeenCalledWith('quit');
    expect(killSpy).toHaveBeenCalledOnce();
  });

  it('emits an error when ready() times out', async () => {
    // Use a very short timeout so the test does not take 5 seconds
    const uci = new UCI('/invalid/path', { timeout: 20 });
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });

    // Call ready() directly — it will send isready and then time out
    void (uci as unknown as { ready: () => Promise<void> }).ready();

    // Wait for the timeout to fire
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    const timeoutErrors = errors.filter((error) =>
      error.message.includes('timeout'),
    );
    expect(timeoutErrors.length).toBeGreaterThan(0);
  });

  it('emits an error immediately when process exits while ready() is waiting', async () => {
    const uci = new UCI('/invalid/path', { timeout: 5000 });
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });

    // Start a ready() race
    void (uci as unknown as { ready: () => Promise<void> }).ready();

    // Give ready() one tick to register its exit listener
    await Promise.resolve();

    const before = errors.length;

    // Simulate engine crash
    void (
      uci as unknown as {
        process: { emit: (event: string, value: number) => Promise<void> };
      }
    ).process.emit('exit', 1);

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const exitErrors = errors
      .slice(before)
      .filter((error) => error.message.includes('exited'));
    expect(exitErrors.length).toBeGreaterThan(0);
  });

  it('debug(true) sends "debug on"', async () => {
    const uci = new UCI('/invalid/path');
    const spy = vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    );

    try {
      await uci.debug(true);
    } catch {
      // ignore
    }

    expect(spy).toHaveBeenCalledWith('debug on');
  });

  it('debug(false) sends "debug off"', async () => {
    const uci = new UCI('/invalid/path');
    const spy = vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    );

    try {
      await uci.debug(false);
    } catch {
      // ignore
    }

    expect(spy).toHaveBeenCalledWith('debug off');
  });

  it('off() unsubscribes a listener', async () => {
    const uci = new UCI('/invalid/path');
    const handler = vi.fn();

    uci.on('output', handler);
    uci.off('output', handler);

    // Trigger an output event via ingest (unknown command routes to 'output')
    await (
      uci as unknown as { ingest: (line: string) => Promise<void> }
    ).ingest('unknown command');

    expect(handler).not.toHaveBeenCalled();
  });

  it('once() resolves on the next event', async () => {
    const uci = new UCI('/invalid/path');

    const promise = uci.once('output');

    // Trigger an output event via ingest
    void (uci as unknown as { ingest: (line: string) => Promise<void> }).ingest(
      'unknown command',
    );

    const result = await promise;
    expect(result).toBe('unknown command');
  });

  it('position() sends position command after ready', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
    });
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    await uci.position('startpos');

    expect(calls).toContain('position startpos');
  });

  it('position() resets move history', async () => {
    const uci = new UCI('/invalid/path');
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockResolvedValue();
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    // Simulate some moves existing in history by calling move()
    await uci.move('e2e4');

    // Now set a new position — moves should be cleared
    await uci.position('startpos');

    // After position(), a ponder call should use empty moves list
    const calls: string[] = [];
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
    });

    await uci.ponder('e7e5');

    const positionCall = calls.find((c) => c.startsWith('position'));
    // moves list should be reset — only the ponder move, no prior moves
    expect(positionCall).toBe('position startpos moves e7e5');
  });

  it('reset() sends ucinewgame then position startpos', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
    });
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    await uci.reset();

    expect(calls[0]).toBe('ucinewgame');
    expect(calls[1]).toBe('position startpos');
  });

  it('start() sends go with movetime when GoOptions.movetime is set', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    // Resolve #ready by simulating uciok
    void ingest('uciok');
    await Promise.resolve();

    await uci.start({ movetime: 1000 });

    expect(calls.some((c) => c.startsWith('go'))).toBe(true);
    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('movetime 1000');
  });

  it('start() sends go with wtime/btime when provided', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    // Resolve #ready by simulating uciok
    void ingest('uciok');
    await Promise.resolve();

    await uci.start({ wtime: 60_000, btime: 60_000, winc: 1000, binc: 1000 });

    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('wtime 60000');
    expect(goCall).toContain('btime 60000');
    expect(goCall).toContain('winc 1000');
    expect(goCall).toContain('binc 1000');
  });

  it('constructor config is applied as setoptions before go in start()', async () => {
    const uci = new UCI('/invalid/path', { config: { Hash: 64 } });
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    // Resolve #ready by simulating uciok
    void ingest('uciok');
    await Promise.resolve();

    await uci.start();

    const setoption = calls.find((c) => c.includes('setoption name Hash'));
    const go = calls.find((c) => c.startsWith('go'));
    expect(setoption).toBeDefined();
    expect(go).toBeDefined();
    expect(calls.indexOf(setoption!)).toBeLessThan(calls.indexOf(go!));
  });

  it('constructor config setoptions are only sent on the first start() call', async () => {
    const uci = new UCI('/invalid/path', { config: { Hash: 64 } });
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    void ingest('uciok');
    await Promise.resolve();

    await uci.start();
    await uci.start();

    const setoptionCalls = calls.filter((c) =>
      c.includes('setoption name Hash'),
    );
    expect(setoptionCalls).toHaveLength(1);
  });

  it('start() sends go infinite when no GoOptions are set', async () => {
    const uci = new UCI('/invalid/path');
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();
    const executeSpy = vi
      .spyOn(
        uci as unknown as { execute: (command: string) => Promise<void> },
        'execute',
      )
      .mockImplementation(async (command) => {
        if (command === 'isready') {
          void ingest('readyok');
        }
      });

    // Resolve #ready by simulating uciok
    void ingest('uciok');
    await Promise.resolve();

    await uci.start();

    const goCall = executeSpy.mock.calls.find(([command]) =>
      command.startsWith('go'),
    );
    expect(goCall?.[0]).toBe('go infinite');
  });

  it('ponder() sends go ponder command', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
    });
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    await uci.ponder('e7e5');

    const goCall = calls.find((c) => c.startsWith('go'));
    expect(goCall).toContain('ponder');
  });

  it('ponderhit() sends ponderhit command when pondering', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
    });
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    await uci.ponder('e7e5');
    await uci.ponderhit();

    expect(calls).toContain('ponderhit');
  });

  it('ponderhit() emits an error when not pondering', async () => {
    const uci = new UCI('/invalid/path');
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });

    await uci.ponderhit();

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.message).toContain('pondering');
  });

  it('stop() clears pondering state so ponderhit() emits error afterwards', async () => {
    const uci = new UCI('/invalid/path');
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockResolvedValue();
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    await uci.ponder('e7e5');
    await uci.stop();
    await uci.ponderhit();

    expect(errors.some((error) => error.message.includes('pondering'))).toBe(
      true,
    );
  });

  it('ponder() emits an error when already pondering', async () => {
    const uci = new UCI('/invalid/path');
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockResolvedValue();
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    await uci.ponder('e7e5');
    await uci.ponder('d7d5'); // second call while pondering

    expect(
      errors.some((error) => error.message.includes('already pondering')),
    ).toBe(true);
  });

  it('ponder() sends position command containing the ponder move', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
    });
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    await uci.ponder('e7e5');

    const positionCall = calls.find((c) => c.startsWith('position'));
    expect(positionCall).toContain('e7e5');
  });

  it('move() clears pondering state so ponderhit() emits error afterwards', async () => {
    const uci = new UCI('/invalid/path');
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockResolvedValue();
    vi.spyOn(
      uci as unknown as { ready: () => Promise<void> },
      'ready',
    ).mockResolvedValue();

    await uci.ponder('e7e5');
    await uci.move('d2d4');
    await uci.ponderhit();

    expect(errors.some((error) => error.message.includes('pondering'))).toBe(
      true,
    );
  });

  it('start() sends go with depth option', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    void ingest('uciok');
    await Promise.resolve();

    await uci.start({ depth: 20 });

    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('depth 20');
    expect(goCall).not.toContain('infinite');
  });

  it('start() sends go with nodes option', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    void ingest('uciok');
    await Promise.resolve();

    await uci.start({ nodes: 1_000_000 });

    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('nodes 1000000');
  });

  it('start() sends go with mate option', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    void ingest('uciok');
    await Promise.resolve();

    await uci.start({ mate: 3 });

    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('mate 3');
  });

  it('start() sends go with searchmoves option', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    void ingest('uciok');
    await Promise.resolve();

    await uci.start({ searchmoves: ['e2e4', 'd2d4'] });

    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('searchmoves e2e4 d2d4');
  });

  it('start() sends go with movestogo option', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    void ingest('uciok');
    await Promise.resolve();

    await uci.start({ movestogo: 30 });

    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('movestogo 30');
  });

  it('start() uses instance depth when GoOptions.depth is not set', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    void ingest('uciok');
    await Promise.resolve();

    uci.depth = 15;
    await uci.start();

    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('depth 15');
  });

  it('GoOptions.depth overrides instance depth', async () => {
    const uci = new UCI('/invalid/path');
    const calls: string[] = [];
    const ingest = (line: string) =>
      (uci as unknown as { ingest: (l: string) => Promise<void> }).ingest(line);
    vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    ).mockImplementation(async (command) => {
      calls.push(command);
      if (command === 'isready') {
        void ingest('readyok');
      }
    });
    vi.spyOn(
      (uci as unknown as { options: { set: () => void } }).options,
      'set',
    ).mockReturnValue();

    void ingest('uciok');
    await Promise.resolve();

    uci.depth = 15;
    await uci.start({ depth: 20 });

    const goCall = calls.find((c) => c.startsWith('go'))!;
    expect(goCall).toContain('depth 20');
  });

  it('ingest routes unknown commands to the output event', async () => {
    const uci = new UCI('/invalid/path');
    const handler = vi.fn();
    uci.on('output', handler);

    await (
      uci as unknown as { ingest: (line: string) => Promise<void> }
    ).ingest('customcommand some data here');

    expect(handler).toHaveBeenCalledWith('customcommand some data here');
  });

  it('ingest handles empty string input without crashing', async () => {
    const uci = new UCI('/invalid/path');

    await expect(
      (uci as unknown as { ingest: (line: string) => Promise<void> }).ingest(
        '',
      ),
    ).resolves.toBeUndefined();
  });

  it('ready() retries after a previous timeout instead of permanently failing', async () => {
    const uci = new UCI('/invalid/path', { timeout: 20 });
    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });

    // First ready() times out
    void (uci as unknown as { ready: () => Promise<void> }).ready();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    const timeoutErrors = errors.filter((error) =>
      error.message.includes('timeout'),
    );
    expect(timeoutErrors.length).toBeGreaterThan(0);

    // Second ready() should attempt a fresh handshake (send isready again)
    const executeSpy = vi.spyOn(
      uci as unknown as { execute: (command: string) => Promise<void> },
      'execute',
    );

    void (uci as unknown as { ready: () => Promise<void> }).ready();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const isreadyCalls = executeSpy.mock.calls.filter(
      ([command]) => command === 'isready',
    );
    expect(isreadyCalls.length).toBeGreaterThan(0);
  });
});
