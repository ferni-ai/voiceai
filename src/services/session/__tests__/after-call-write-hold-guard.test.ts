/**
 * runAfterCallTasks tells write-hold.ts the call has ended before it starts the tasks. That note
 * must never stop them: a throw there would skip every after-call task for the call. The failure
 * is logged by its error kind only, with no ids and no error text. Every id below is invented.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ msg: string; data: Record<string, unknown> }>);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    info: (data: Record<string, unknown>, msg: string) => logged.push({ msg, data }),
    warn: (data: Record<string, unknown>, msg: string) => logged.push({ msg, data }),
    debug: () => undefined,
    error: () => undefined,
  };
  return { createLogger: () => logger, getLogger: () => logger };
});
vi.mock('../../../utils/write-hold.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  noteSessionEnded: () => {
    throw new TypeError('an invented failure with s-guard-1 in it');
  },
}));

import {
  clearAfterCallTasks,
  drainAfterCallTasks,
  registerAfterCallTask,
  runAfterCallTasks,
  type AfterCallContext,
} from '../after-call-tasks.js';

const ctx: AfterCallContext = {
  userId: 'u-guard-1',
  sessionId: 's-guard-1',
  turns: [],
  startedAt: new Date(),
};

afterEach(async () => {
  clearAfterCallTasks();
  await drainAfterCallTasks(50);
  logged.length = 0;
});

describe('runAfterCallTasks: the write-hold call-end note', () => {
  it('a throwing noteSessionEnded still lets the after-call tasks run', async () => {
    const ran = vi.fn(async () => undefined);
    registerAfterCallTask('next', ran);
    expect(() => runAfterCallTasks(ctx)).not.toThrow();
    expect(await drainAfterCallTasks(1_000)).toBe(0);
    expect(ran).toHaveBeenCalledWith(ctx);
    const note = logged.find((l) => l.msg === 'Write-hold call end not noted');
    expect(note?.data).toEqual({ errorKind: 'TypeError' }); // the kind only: no ids, no text
  });
});
