import { spawn } from 'node:child_process';

import EngineProcess from './engine-process.js';

import type { ChildProcessWithoutNullStreams } from 'node:child_process';

/**
Node.js implementation of EngineProcess via child_process.spawn
*/
class NodeProcess extends EngineProcess {
  readonly #child: ChildProcessWithoutNullStreams;

  constructor(path: string) {
    super();

    this.#child = spawn(path);

    this.#child.on('error', (error) => {
      void this.emit('error', error);
    });
    // Node passes null (not undefined) as the exit code when the process
    // dies from a signal — a default parameter cannot express this mapping.
    // eslint-disable-next-line unicorn/prefer-default-parameters
    this.#child.on('exit', (code: number | null) => {
      void this.emit('exit', code ?? 0);
    });
    this.#child.stdout.on('data', (data) => {
      void this.emit('stdout', data.toString());
    });
    this.#child.stderr.on('data', (data) => {
      void this.emit('error', new Error(data.toString().trim()));
    });
  }

  kill(): void {
    this.#child.kill();
  }

  async write(input: string): Promise<void> {
    return new Promise((ok, ko) => {
      this.#child.stdin.write(input, 'utf8', (error) => {
        if (error) {
          return ko(error);
        }
        ok();
      });
    });
  }
}

export default NodeProcess;
