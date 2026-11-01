/**
 * A call records how many times the user spoke, so sessions-together can count only
 * calls where they did (a call where only the agent's greeting played is not a session).
 */
import { describe, expect, it, vi } from 'vitest';

const updates: Array<Record<string, unknown>> = [];

vi.mock('@google-cloud/firestore', () => {
  const doc = {
    collection: () => ({ add: async () => ({ id: 't1' }), doc: () => doc }),
    update: async (data: Record<string, unknown>) => void updates.push(data),
  };
  return {
    FieldValue: { increment: (n: number) => ({ increment: n }) },
    Firestore: class {
      collection = () => ({ doc: () => doc });
    },
  };
});

const { persistTurn } = await import('../realtime-memory.js');

describe('persistTurn turn counts', () => {
  it.each([
    { role: 'assistant' as const, userTurn: false },
    { role: 'user' as const, userTurn: true },
  ])('a $role turn: userTurnCount incremented = $userTurn', async ({ role, userTurn }) => {
    updates.length = 0;
    await persistTurn('u1', 'conv1', { role, content: 'hi', timestamp: new Date() });
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]?.turnCount).toEqual({ increment: 1 });
    expect('userTurnCount' in (updates[0] ?? {})).toBe(userTurn);
  });
});
