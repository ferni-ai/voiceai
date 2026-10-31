/**
 * How many Firestore clients a call opens: each one pays its own channel, TLS and auth
 * setup on its first read in a fresh process (~100 ms per extra client locally,
 * voiceai-evidence two-jobs-proof SUMMARY 2026-10-29).
 *
 * Runs what a job child runs for a call, against clients that record their construction
 * (reads are refused by the test guard, so every store takes its unavailable path): the
 * child's warm-up before `ready`, session start (initializeSession), and the first
 * caller turn's context build (the turn-intelligence hook). Memory uses Firestore, as in
 * prod (MEMORY_STORE_TYPE).
 *
 * On origin/main at 6bd4a5d2e this built 21 clients from 18 call sites: 20
 * `new Firestore()` and firebase-admin's. With utils/shared-firestore.ts it builds 3:
 * the shared client with ignoreUndefinedProperties (getFirestoreDb, persistence), the
 * one without, and firebase-admin's (trust-doc.ts).
 */
import { llm } from '@livekit/agents';
import { afterAll, describe, expect, it, vi } from 'vitest';

const MAX_CLIENTS = 3;

const clients = vi.hoisted(() => {
  const made: Array<{ site: string; settings: Record<string, unknown> }> = [];
  /** The first app frame that isn't the client factory itself: the module that asked. */
  function site(): string {
    const frames = (new Error().stack ?? '').split('\n').slice(1);
    const app = frames.find(
      (l) =>
        l.includes('/src/') &&
        !/node_modules|call-firestore-clients|shared-firestore|firebase-admin-app/.test(l)
    );
    return (
      app
        ?.trim()
        .replace(/^at /, '')
        .replace(/\(?\/.*?\/src\//, 'src/')
        .replace(/\)$/, '') ?? 'unknown'
    );
  }
  return {
    made,
    record: (settings: Record<string, unknown>) => made.push({ site: site(), settings }),
  };
});

vi.mock('@google-cloud/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google-cloud/firestore')>();
  class Firestore extends actual.Firestore {
    constructor(settings?: ConstructorParameters<typeof actual.Firestore>[0]) {
      clients.record({ ...settings });
      super(settings);
    }
  }
  return { ...actual, Firestore, default: { ...actual, Firestore } };
});
// firebase-admin builds one client per database id (its own cache): counted once.
vi.mock('firebase-admin/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin/firestore')>();
  const { Firestore } = await import('@google-cloud/firestore');
  const byDatabase = new Map<string, unknown>();
  return {
    ...actual,
    getFirestore: (...args: unknown[]) => {
      const databaseId = args.find((a): a is string => typeof a === 'string') ?? '(default)';
      if (!byDatabase.has(databaseId)) byDatabase.set(databaseId, new Firestore({ databaseId }));
      return byDatabase.get(databaseId);
    },
  };
});
// The real helpers (setup.ts mocks them): they build the clients being counted.
vi.mock('../../../utils/firestore-utils.js', (importOriginal) => importOriginal());
vi.mock('../../../services/superhuman/firestore-utils.js', (importOriginal) => importOriginal());

const savedEnv = { MEMORY_STORE_TYPE: process.env.MEMORY_STORE_TYPE };
process.env.MEMORY_STORE_TYPE = 'firestore';
afterAll(() => {
  if (savedEnv.MEMORY_STORE_TYPE === undefined) delete process.env.MEMORY_STORE_TYPE;
  else process.env.MEMORY_STORE_TYPE = savedEnv.MEMORY_STORE_TYPE;
});

describe('Firestore clients a call opens', () => {
  it(`warm-up, session start and the first turn open at most ${MAX_CLIENTS}`, async () => {
    const { warmFirestoreClients } = await import('../child-firestore-warm.js');
    await warmFirestoreClients(() => {});

    const { initializeSession } = await import('../../voice-agent/session-init-handler.js');
    const persona = { id: 'ferni', name: 'Ferni', displayName: 'Ferni' } as never;
    const { services, userData } = await initializeSession({
      sessionId: 'firestore-clients-session',
      userId: 'firestore-clients-user',
      userName: 'Sam',
      userAccent: 'us',
      sessionPersona: persona,
    });

    const { createTurnIntelligenceHook } = await import('../../multi-agent/turn-intelligence.js');
    const firstTurn = createTurnIntelligenceHook({ persona, services, userData });
    const chat = llm.ChatContext.empty();
    await firstTurn(chat, chat.addMessage({ role: 'user', content: 'I had a rough day at work.' }));
    // Session start and the turn leave reads running in the background.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2_000);
    });

    const report = clients.made.map((c) => `${c.site} ${JSON.stringify(c.settings)}`).join('\n');
    expect(clients.made.length, `clients built:\n${report}`).toBeLessThanOrEqual(MAX_CLIENTS);
    // Every client is on the process's database.
    for (const c of clients.made) expect(c.settings.databaseId).toBe('(default)');
  }, 120_000);
});
