import Emittery from 'emittery';

import type { EngineProcess } from './types.js';

interface Events {
  error: Error;
  exit: number;
  line: string;
}

class Process extends Emittery<Events> {
  private buffer = '';

  private readonly child: EngineProcess;

  constructor(child: EngineProcess) {
    super();

    this.child = child;

    this.child.onError((error) => this.emit('error', error));
    this.child.onExit((code) => this.emit('exit', code));
    this.child.onStdout((data) => {
      this.buffer += data;

      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';

      for (const line of lines) {
        this.emit('line', line);
      }
    });
  }

  kill(): void {
    this.child.kill();
  }

  async write(input: string): Promise<void> {
    return this.child.write(input);
  }
}

export default Process;
