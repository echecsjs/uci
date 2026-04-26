import { describe, expect, it } from 'vitest';

import Process from '../process.js';

describe('Process', () => {
  it('emits an Error object (not a Buffer) when stderr receives data', async () => {
    const proc = new Process('sh');

    const errorPromise = new Promise<Error>((resolve) => {
      proc.on('error', ({ data: error_ }) => {
        resolve(error_);
      });
    });

    await proc.write('echo "stderr message" >&2\n');

    try {
      const error = await errorPromise;

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('stderr message');
    } finally {
      proc.kill();
    }
  });

  describe('stdout buffering', () => {
    it('buffers partial lines and only emits after a newline', async () => {
      const proc = new Process('sh');
      const lines: string[] = [];

      // Single handler: collects lines and resolves the sentinel promise
      const donePromise = new Promise<void>((resolve) => {
        proc.on('line', ({ data: line }) => {
          lines.push(line);
          if (line === '__done__') {
            resolve();
          }
        });
      });

      try {
        // First command: emit text to stdout with no trailing newline.
        // We use a subshell that writes via /dev/stdout so the write goes
        // straight to the parent's stdout stream without buffering by sh itself.
        // The \c suppresses the trailing newline on some platforms; printf -n
        // is more portable so we use printf.
        await proc.write('printf "partial"\n');

        // Give the sh process time to execute and flush that output before we
        // check — 50 ms is generous since the shell round-trip is <5 ms.
        await new Promise<void>((resolve) => setTimeout(resolve, 50));

        // No newline yet → Process buffer must not have emitted anything
        expect(lines).toHaveLength(0);

        // Complete the line and add a sentinel so we know when to stop waiting
        await proc.write('printf " line\\n__done__\\n"\n');
        await donePromise;

        // Filter out the sentinel
        const payload = lines.filter((l) => l !== '__done__');

        expect(payload).toHaveLength(1);
        expect(payload[0]).toBe('partial line');
      } finally {
        proc.kill();
      }
    });

    it('emits multiple lines separately when a single chunk contains multiple newlines', async () => {
      const proc = new Process('sh');
      const lines: string[] = [];

      const donePromise = new Promise<void>((resolve) => {
        proc.on('line', ({ data: line }) => {
          lines.push(line);
          if (line === '__done__') {
            resolve();
          }
        });
      });

      try {
        // printf emits both lines in one write — the buffering logic must split them
        await proc.write('printf "line1\\nline2\\n__done__\\n"\n');
        await donePromise;

        const payload = lines.slice(0, -1);

        expect(payload).toHaveLength(2);
        expect(payload[0]).toBe('line1');
        expect(payload[1]).toBe('line2');
      } finally {
        proc.kill();
      }
    });

    it('preserves empty lines in output', async () => {
      const proc = new Process('sh');
      const lines: string[] = [];

      // Resolve once we see the sentinel so we don't rely on a fixed timeout
      const donePromise = new Promise<void>((resolve) => {
        proc.on('line', ({ data: line }) => {
          lines.push(line);
          if (line === '__done__') {
            resolve();
          }
        });
      });

      try {
        await proc.write('printf "before\\n\\nafter\\n__done__\\n"\n');
        await donePromise;

        // Exclude the sentinel itself
        const payload = lines.slice(0, -1);

        expect(payload).toHaveLength(3);
        expect(payload[0]).toBe('before');
        expect(payload[1]).toBe('');
        expect(payload[2]).toBe('after');
      } finally {
        proc.kill();
      }
    });
  });

  describe('write errors and lifecycle', () => {
    it('rejects write() when stdin is closed', async () => {
      const proc = new Process('sh');

      // Wait for the exit event before attempting the write — more deterministic
      // than a fixed timeout
      const exitPromise = new Promise<void>((resolve) => {
        proc.on('exit', () => {
          resolve();
        });
      });

      proc.kill();
      await exitPromise;

      await expect(proc.write('echo hello\n')).rejects.toBeInstanceOf(Error);
    });

    it('forwards the exit code via the exit event', async () => {
      const proc = new Process('sh');

      const exitPromise = new Promise<number>((resolve) => {
        proc.on('exit', ({ data: code }) => {
          resolve(code);
        });
      });

      try {
        // Exit with a specific non-zero code
        await proc.write('exit 42\n');

        const code = await exitPromise;

        expect(code).toBe(42);
      } finally {
        // Process already exited via `exit 42`; kill() is a no-op here
      }
    });

    it('normalises a null exit code to 0', async () => {
      const proc = new Process('sh');

      const exitPromise = new Promise<number>((resolve) => {
        proc.on('exit', ({ data: code }) => {
          resolve(code);
        });
      });

      try {
        // SIGKILL produces a null exit code in Node — the class must convert it to 0
        proc.kill();

        const code = await exitPromise;

        expect(code).toBe(0);
      } finally {
        // Process already killed; kill() is a no-op here
      }
    });
  });
});
