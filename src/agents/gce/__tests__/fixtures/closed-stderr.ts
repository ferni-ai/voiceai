// Run by exit-worker.test.ts in a plain node process, usually one whose stderr reader has
// already gone away (#3320): it logs through the real app logger, which writes to fd 2, then
// ends the way the worker's shutdown does, through exitAfterFlush. Progress goes to stdout, and
// at exit it says how many 'error' listeners the exit added (a listener would swallow errors).
import { EventEmitter } from 'node:events';
import { writeSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { createLogger } from '../../../../utils/safe-logger.js';
import { exitAfterFlush } from '../../exit-worker.js';

function countErrorListeners(): () => number {
  let added = 0;
  const proto = EventEmitter.prototype as unknown as Record<string, unknown>;
  for (const name of ['on', 'once', 'addListener', 'prependListener', 'prependOnceListener']) {
    const original = proto[name] as (
      this: EventEmitter,
      event: unknown,
      ...rest: unknown[]
    ) => EventEmitter;
    proto[name] = function (this: EventEmitter, event: unknown, ...rest: unknown[]) {
      if (event === 'error') added++;
      return original.call(this, event, ...rest);
    };
  }
  return () => added;
}

async function main(): Promise<void> {
  await sleep(Number(process.env.CLOSED_STDERR_WAIT_MS ?? 300)); // the reader is gone by now
  const log = createLogger({ module: 'closed-stderr-probe' });
  for (let i = 0; i < Number(process.env.CLOSED_STDERR_LINES ?? 200); i++) {
    log.info({ i }, 'a line nobody reads');
  }
  process.stdout.write('logged\n');
  process.on('exit', () => writeSync(1, `error listeners added: ${added()}\n`));
  const added = countErrorListeners();
  await exitAfterFlush(0);
}
void main();
