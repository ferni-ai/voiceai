/**
 * endSession hands the finished call to the theory-of-mind writer, and never
 * waits on it. Drives the real session services; only the writer is a spy.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const writer = vi.hoisted(() => ({
  calls: [] as Array<{ userId: string; sessionId: string; turns: unknown[] }>,
  hang: false,
}));
vi.mock('../../../intelligence/theory-of-mind/after-call.js', () => ({
  updateTheoryOfMindAfterCall: vi.fn(
    (input: { userId: string; sessionId: string; turns: unknown[] }) => {
      writer.calls.push(input);
      return writer.hang ? new Promise(() => {}) : Promise.resolve(null);
    }
  ),
}));

import { createSessionServices, initializeServices } from '../../index.js';

async function oneCall(sessionId: string) {
  const services = await createSessionServices({ sessionId, userId: 'tom-wiring-user-1' });
  services.addTurn('user', "Honestly I'm a wreck, interview at Stripe Monday.");
  services.addTurn('assistant', 'Oof. What part is worrying you most?');
  services.addTurn('user', 'The system design round. Just tell me how to prep.');
  return services;
}

describe('endSession → theory of mind writer', () => {
  beforeAll(async () => {
    await initializeServices(false);
  }, 60_000);

  it('passes the finished call to the writer', async () => {
    writer.calls.length = 0;
    const services = await oneCall(`tom-wiring-${Date.now()}`);
    await services.endSession();
    await vi.waitFor(() => expect(writer.calls).toHaveLength(1));
    expect(writer.calls[0]?.userId).toBe('tom-wiring-user-1');
    expect(writer.calls[0]?.sessionId).toBe(services.sessionId);
    expect(writer.calls[0]?.turns.length).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('does not wait for the writer to finish', async () => {
    writer.calls.length = 0;
    writer.hang = true;
    const services = await oneCall(`tom-wiring-hang-${Date.now()}`);
    await services.endSession(); // resolves although the writer never does
    await vi.waitFor(() => expect(writer.calls).toHaveLength(1));
    writer.hang = false;
  }, 20_000);
});
