import Emittery from 'emittery';

import type EngineProcess from './engine-process.js';

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

    this.child.on('error', ({ data }) => {
      void this.emit('error', data);
    });
    this.child.on('exit', ({ data }) => {
      void this.emit('exit', data);
    });
    this.child.on('stdout', ({ data }) => {
      this.buffer += data;

      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';

      for (const line of lines) {
        void this.emit('line', line);
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
