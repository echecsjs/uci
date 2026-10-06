import { spawn } from 'node:child_process';

import type { EngineProcess } from './types.js';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

/**
Node.js implementation of EngineProcess via child_process.spawn
*/
class NodeProcess implements EngineProcess {
  readonly #child: ChildProcessWithoutNullStreams;

  readonly #errorListeners: ((error: Error) => void)[] = [];

  readonly #exitListeners: ((code: number) => void)[] = [];

  readonly #stdoutListeners: ((data: string) => void)[] = [];

  constructor(path: string) {
    this.#child = spawn(path);

    this.#child.on('error', (error) => {
      this.#notifyError(error);
    });
    this.#child.on('exit', (code) => {
      this.#notifyExit(code ?? 0);
    });
    this.#child.stdout.on('data', (data) => {
      this.#notifyStdout(data.toString());
    });
    this.#child.stderr.on('data', (data) => {
      this.#notifyError(new Error(data.toString().trim()));
    });
  }

  #notifyError(error: Error): void {
    for (const listener of this.#errorListeners) {
      listener(error);
    }
  }

  #notifyExit(code: number): void {
    for (const listener of this.#exitListeners) {
      listener(code);
    }
  }

  #notifyStdout(data: string): void {
    for (const listener of this.#stdoutListeners) {
      listener(data);
    }
  }

  kill(): void {
    this.#child.kill();
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
