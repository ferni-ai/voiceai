/**
 * The dynamic domain executor hands a routed tool the session's caller the
 * way LiveKit does (`opts.ctx.userData.userId`). Called with no second
 * argument, tools that key data by caller saw nobody: a member's events
 * were dropped instead of saved to their own doc.
 *
 * @module agents/shared/tool-executors/__tests__/dynamic-domain-executor-caller.test
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../../../../services/persistence/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createPersistenceStore: () => ({
    load: vi.fn(async (userId: string) =>
      docs.has(userId) ? structuredClone(docs.get(userId)) : null
    ),
    get: vi.fn(async () => null),
    set: vi.fn((userId: string, data: unknown) => docs.set(userId, structuredClone(data))),
    setImmediate: vi.fn(async (userId: string, data: unknown) => docs.set(userId, data)),
    delete: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
  }),
}));

import { dynamicDomainExecutor, resetDynamicExecutor } from '../dynamic-domain-executor.js';

const LOAD_TIMEOUT_MS = 120_000;

describe('dynamicDomainExecutor passes the caller to routed tools', () => {
  beforeAll(() => {
    resetDynamicExecutor();
  });

  it(
    "saves a member's event to their own doc",
    async () => {
      const reply = await dynamicDomainExecutor.execute(
        'manageEvent',
        {
          name: 'Routed party',
          type: 'birthday',
          date: 'December 15, 2030',
          guestCount: 10,
          budget: 500,
        },
        { userId: 'user-routed', personaId: 'ferni', sessionId: 's1' }
      );

      expect(String(reply)).toContain('Routed party');
      const saved = docs.get('user-routed') as { events: Array<{ name: string }> } | undefined;
      expect(saved?.events.map((e) => e.name)).toEqual(['Routed party']);
      expect([...docs.keys()]).toEqual(['user-routed']);
    },
    LOAD_TIMEOUT_MS
  );
});
