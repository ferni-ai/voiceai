/**
 * A call Ferni places for a member keeps none of the other person's own words
 * (owner, 2026-11-01): only the summary model's read of the call, and only for
 * CALL_RESULT_TTL_DAYS. Before, when the model failed, the stored result fell
 * back to what they said, verbatim, and kept it with no end date.
 *
 * Real path: buildCallOutcome -> captureCallResult, with a fake Firestore that
 * keeps every doc written, and a spy on the outreach memory copy. Fictional
 * people and words only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const ref = (path: string): Record<string, unknown> => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: Record<string, unknown>) => void docs.set(path, { ...docs.get(path), ...data }), // prettier-ignore
    update: async (data: Record<string, unknown>) => void docs.set(path, { ...docs.get(path), ...data }), // prettier-ignore
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string): Record<string, unknown> => {
    const query = { where: () => query, orderBy: () => query, limit: () => query, get: async () => ({ docs: [], empty: true }) }; // prettier-ignore
    return {
      ...query,
      doc: (id: string) => ref(`${path}/${id}`),
      add: async () => ({ id: 'n-1' }),
    };
  };
  const db = {
    collection: (name: string) => col(name),
    batch: () => ({ update: () => undefined, commit: async () => undefined }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: (r: { get: () => Promise<unknown> }) => r.get(),
        set: (r: { path: string }, data: Record<string, unknown>) => void docs.set(r.path, { ...docs.get(r.path), ...data }), // prettier-ignore
      }),
  };
  return { docs, db };
});
vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => store.db }));
vi.mock('../delivery/push-notifications.js', () => ({
  isPushNotificationsAvailable: () => true,
  sendPushNotification: vi.fn(async () => [{ success: true }]),
}));
vi.mock('../guarded-text.js', () => ({ sendGuardedText: vi.fn(async () => ({ sent: true })) }));
vi.mock('../../calendar/index.js', () => ({
  hasAnyProviderConnected: async () => false,
  createEvent: vi.fn(),
}));
const memoryCopies = vi.hoisted(() => vi.fn());
vi.mock('../../data-layer/hooks/misc-hooks.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  onCallResultChange: memoryCopies,
  onFollowUpActionChange: memoryCopies,
}));

const { captureCallResult } = await import('../call-result-capture.js');
const { CALL_RESULT_TTL_DAYS } = await import('../call-result-expiry.js');
const { resetToldClaimsForTests } = await import('../call-result-claims.js');
const { buildCallOutcome, toOnBehalfCallRequest } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
const { shouldIndex } = await import('../../memory/persistence/indexing-policy.js');

/** What Priya said: distinctive enough that any copy of it, or of a piece of it, shows. */
const SAID = [
  'The marmalade festival moved to the old lighthouse on Thursday.',
  'Tell Riley the purple umbrella is in the blue cupboard by the stairs.',
];
const PIECES = /marmalade|lighthouse|purple umbrella|blue cupboard/i;
const HEARD = [
  { role: 'agent' as const, content: "Hi, it's Ferni, calling for Riley." },
  ...SAID.map((content) => ({ role: 'recipient' as const, content })),
];
const NOW = Date.parse('2026-11-01T15:00:00Z');
const DAY = 86_400_000;

function dispatch(callId: string) {
  return buildOnBehalfDispatch({
    callId,
    requester: { userId: 'u-riley', name: 'Riley Test', timezone: 'UTC', originalSessionId: 's-1' },
    contact: { name: 'Priya', phone: '+15555550123', relationship: 'friend' },
    purpose: 'check in about the weekend',
    objective: 'check_in',
    callType: 'personal',
  });
}

/** Every doc the capture wrote, as one string. */
const everythingWritten = () => JSON.stringify([...store.docs.entries()]);
const callDoc = (callId: string) => store.docs.get(`bogle_users/u-riley/on_behalf_calls/${callId}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  store.docs.clear();
  memoryCopies.mockClear();
  resetToldClaimsForTests();
  return () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  };
});

describe('the summary model failed: nothing they said is kept', () => {
  it.each([
    [
      'the call ran its course',
      'off',
      95,
      "I talked with Priya, but I couldn't put together a summary of the call.",
    ],
    [
      'they hung up early (CALL_FOLLOWTHROUGH)',
      'on',
      9,
      'I reached Priya, but they had to go before we really got to talk.',
    ],
  ])(
    '%s: no doc, copy or outcome holds their words',
    async (_why, followthrough, seconds, said) => {
      vi.stubEnv('CALL_FOLLOWTHROUGH', followthrough);
      const c = dispatch(`call-${seconds}`);
      const outcome = buildCallOutcome(c, HEARD, null, undefined, seconds);
      expect(outcome.outcome).toBe(said);
      expect(outcome.transcriptSummary).toBeUndefined();
      expect(outcome.message).toBeUndefined();

      await captureCallResult(c.callId, outcome, toOnBehalfCallRequest(c));

      expect(callDoc(c.callId)).toBeDefined(); // the result itself was stored
      expect(everythingWritten()).toContain('Priya');
      expect(everythingWritten()).not.toMatch(PIECES);
      expect(memoryCopies).toHaveBeenCalled();
      expect(JSON.stringify(memoryCopies.mock.calls)).not.toMatch(PIECES);
    }
  );

  it('marks the result as having no summary', () => {
    const outcome = buildCallOutcome(dispatch('call-plain'), HEARD, null, undefined, 95);
    expect(outcome.summaryUnavailable).toBe(true);
  });
});

describe('the result expires', () => {
  it(`the call doc and its While You Were Away copy carry expireAt, ${CALL_RESULT_TTL_DAYS} days out, as a Date`, async () => {
    const c = dispatch('call-ttl');
    await captureCallResult(c.callId, buildCallOutcome(c, HEARD, null, undefined, 95), toOnBehalfCallRequest(c)); // prettier-ignore

    const expireAt = callDoc(c.callId)?.expireAt;
    expect(expireAt).toBeInstanceOf(Date); // a TTL policy reads only a Timestamp, never an ISO string
    expect((expireAt as Date).getTime()).toBe(NOW + 90 * DAY);

    const copies = [...store.docs.entries()].filter(([k]) => k.includes('/background_results/'));
    expect(copies).toHaveLength(1);
    expect(copies[0][1].expireAt).toEqual(expireAt);
    expect(copies[0][1].expireAt).toBeInstanceOf(Date);
  });
});

describe('the outreach memory copies are not written at all', () => {
  // misc-hooks hands both to the data layer, which indexes only entity types with a policy.
  it.each(['call_result', 'follow_up_action'] as const)('%s has no indexing policy', (type) => {
    expect(shouldIndex(type, { summary: SAID.join(' ') })).toMatchObject({ shouldIndex: false });
  });
});
