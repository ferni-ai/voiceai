// Run by exit-worker.test.ts in a plain node process: the end of the worker's shutdown, where
// the only thing left is a flushBqEvents-style wait raced against an unref'd timer. With
// `hold`, holdEventLoop keeps the process alive and "Shutdown complete" prints.
import { setTimeout as sleep } from 'node:timers/promises';
import { holdEventLoop } from '../../exit-worker.js';

async function shutdownTail(): Promise<void> {
  if (process.argv[2] === 'hold') holdEventLoop();
  process.stdout.write('Batched memory work drained\n');
  await Promise.race([new Promise(() => {}), sleep(300, undefined, { ref: false })]);
  process.stdout.write('Shutdown complete\n');
  process.exit(0);
}
void shutdownTail();
