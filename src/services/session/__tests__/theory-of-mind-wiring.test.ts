/**
 * The theory-of-mind update runs after a call through the after-call registry:
 * registered by agents/after-call-register.ts, started by the real endSession,
 * never awaited by it, and counted until it settles so the job process waits
 * for it. Only the writer itself is a spy.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const writer = vi.hoisted(() => ({
  calls: [] as Array<{ userId: string; sessionId: string; turns: unknown[] }>,
  release: null as null | (() => void),
}));
vi.mock('../../../intelligence/theory-of-mind/after-call.js', () => ({
  updateTheoryOfMindAfterCall: vi.fn(
    (input: { userId: string; sessionId: string; turns: unknown[] }) => {
      writer.calls.push(input);
      return new Promise<null>((resolve) => {
        writer.release = () => resolve(null);
      });
    }
  ),
}));

// The one import the voice agent entry makes; it must register the task.
await import('../../../agents/after-call-register.js');
const { drainAfterCallTasks, pendingAfterCallTasks, registeredAfterCallTasks } =
  await import('../after-call-tasks.js');
const { createSessionServices, initializeServices } = await import('../../index.js');

describe('endSession → after-call registry → theory of mind', () => {
  beforeAll(async () => {
    await initializeServices(false);
  }, 60_000);

  it('is registered by the agent entry, with its own timeout', () => {
    expect(registeredAfterCallTasks()).toContain('theory-of-mind');
  });

  it('runs on the finished call without endSession waiting for it', async () => {
    writer.calls.length = 0;
    const services = await createSessionServices({
      sessionId: `tom-wiring-${Date.now()}`,
      userId: 'tom-wiring-user-1',
    });
    services.addTurn('user', "Honestly I'm a wreck, interview at Stripe Monday.");
    services.addTurn('assistant', 'Oof. What part is worrying you most?');
    services.addTurn('user', 'The system design round. Just tell me how to prep.');

    await services.endSession(); // resolves while the writer is still running
    await vi.waitFor(() => expect(writer.calls).toHaveLength(1));
    expect(writer.calls[0]?.userId).toBe('tom-wiring-user-1');
    expect(writer.calls[0]?.sessionId).toBe(services.sessionId);
    expect(writer.calls[0]?.turns.length).toBeGreaterThanOrEqual(3);

    // Still pending, so a per-call job process would wait for it before exiting.
    const pending = pendingAfterCallTasks();
    expect(pending).toBeGreaterThanOrEqual(1);
    writer.release?.();
    await drainAfterCallTasks(1_000);
    expect(pendingAfterCallTasks()).toBeLessThan(pending);
  }, 60_000);
});
