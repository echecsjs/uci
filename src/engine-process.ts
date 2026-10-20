import Emittery from 'emittery';

/**
Events emitted by an engine process. Listeners receive the Emittery v2
`{ data }` envelope.
*/
interface EngineProcessEvents {
  error: Error;
  exit: number;
  stdout: string;
}

/**
Base class for engine processes in any runtime — Node.js (see
`NodeProcess`), Tauri, Deno, or the browser. Extend it, implement `kill()`
and `write()`, and emit `error`, `exit`, and `stdout` events as the engine
produces them. Emit from the process callbacks, not from the constructor —
events emitted before listeners are attached are dropped.
*/
abstract class EngineProcess extends Emittery<EngineProcessEvents> {
  /**
  Terminate the engine process.
  */
  abstract kill(): void;

  /**
  Write a newline-terminated command to the engine's stdin.
  */
  abstract write(input: string): Promise<void>;
}

export type { EngineProcessEvents };
export default EngineProcess;
