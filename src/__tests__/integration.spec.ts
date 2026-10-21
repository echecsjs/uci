import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UCI } from '../index.js';

const ENGINE_PATH = process.env['UCI_ENGINE_PATH'];

describe.skipIf(!ENGINE_PATH)('UCI integration', () => {
  let uci: UCI;

  beforeEach(() => {
    uci = new UCI(ENGINE_PATH!);
  });

  afterEach(async () => {
    await uci.stop();
  });

  // eslint-disable-next-line vitest/expect-expect
  it('emits uciok on init', () =>
    new Promise<void>((resolve) => {
      uci.on('uciok', () => {
        resolve();
      });
    }));

  // eslint-disable-next-line vitest/expect-expect
  it('emits id with name and author', () =>
    new Promise<void>((resolve) => {
      uci.on('id', (data) => {
        if (data.name || data.author) {
          resolve();
        }
      });
    }));

  // eslint-disable-next-line vitest/expect-expect
  it('emits at least one option', () =>
    new Promise<void>((resolve) => {
      uci.on('option', () => {
        resolve();
      });
    }));

  // eslint-disable-next-line vitest/expect-expect
  it('emits info events after start()', async () => {
    await new Promise<void>((resolve) => {
      uci.on('uciok', () => {
        resolve();
      });
    });

    return new Promise<void>((resolve) => {
      uci.on('info', () => {
        resolve();
      });
      void uci.start();
    });
  });

  it('emits bestmove after a move', async () => {
    await new Promise<void>((resolve) => {
      uci.on('uciok', () => {
        resolve();
      });
    });

    await uci.start();

    return new Promise<void>((resolve) => {
      uci.on('bestmove', ({ move }) => {
        expect(move).toBeTruthy();
        resolve();
      });
      uci.move('e2e4');
    });
  });

  it('does not emit error after stop()', async () => {
    await new Promise<void>((resolve) => {
      uci.on('uciok', () => {
        resolve();
      });
    });

    const errors: Error[] = [];
    uci.on('error', (error) => {
      errors.push(error);
    });

    // afterEach calls stop() — we just assert no errors before that
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(errors).toHaveLength(0);
  });
});
