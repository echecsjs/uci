import { describe, expect, it } from 'vitest';

import NodeProcess from '../node-process.js';

const until = async (isDone: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (isDone()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
};

describe('NodeProcess', () => {
  it('echoes written input back on stdout', async () => {
    const chunks: string[] = [];
    const engine = new NodeProcess('cat');
    engine.onStdout((data) => {
      chunks.push(data);
    });

    try {
      await engine.write('uci\n');
      await until(() => chunks.length > 0);
      expect(chunks.join('')).toContain('uci');
    } finally {
      engine.kill();
    }
  });

  it('reports exit code 0 after kill', async () => {
    const exits: number[] = [];
    const engine = new NodeProcess('cat');
    engine.onExit((code) => {
      exits.push(code);
    });

    engine.kill();
    await until(() => exits.length > 0);
    expect(exits[0]).toBe(0);
  });

  it('notifies every stdout listener', async () => {
    const first: string[] = [];
    const second: string[] = [];
    const engine = new NodeProcess('cat');
    engine.onStdout((data) => {
      first.push(data);
    });
    engine.onStdout((data) => {
      second.push(data);
    });

    try {
      await engine.write('uci\n');
      await until(() => first.length > 0 && second.length > 0);
      expect(first.join('')).toContain('uci');
      expect(second.join('')).toContain('uci');
    } finally {
      engine.kill();
    }
  });
});
