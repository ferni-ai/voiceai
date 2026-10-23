/**
 * FORGET_EVERY_READER and the greeting (#2662): the thread starter, the
 * proactive insight and the emotional check-in come from service methods,
 * which the prompt view passes through whole, so a topic the caller asked
 * Ferni to forget was spoken aloud in the greeting. Each is now checked at
 * the greeting's source. The real generateAndSpeakGreeting; the session
 * services, the voice session and the forget list are stubs at their edges.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const forget = vi.hoisted(() => ({ topics: ['Mindy'] as string[] }));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => forget.topics,
}));

const { generateAndSpeakGreeting } = await import('../greeting-handler.js');
const { getPersona } = await import('../../../personas/index.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

/** Anything the greeting reads that this test doesn't set: inert, never throws. */
function inert(name = 'stub'): unknown {
  const f = () => inert(`${name}()`);
  return new Proxy(f, {
    get(_t, p) {
      if (p === 'then') return undefined;
      if (p === Symbol.toPrimitive) return () => '';
      if (p === Symbol.iterator) return function* () {};
      if (p === 'length') return 0;
      return inert(`${name}.${String(p)}`);
    },
    apply: () => undefined,
  });
}

/** Own fields first; anything else is inert. Not thenable, so `await services` resolves. */
const fallback = (t: object, p: string | symbol): unknown =>
  p in t ? (t as Record<string | symbol, unknown>)[p] : p === 'then' ? undefined : inert(String(p));

type Source = 'thread' | 'insight' | 'checkIn';
let seq = 0;

async function greet(source: Source): Promise<string> {
  const spoken: string[] = [];
  const own = {
    userId: `member-greeting-forget-${++seq}`,
    userProfile: { id: 'p1', name: 'Sam', totalConversations: 6 },
    getOpenThreads: () => (source === 'thread' ? [{ questionsToAnswer: [] }] : []),
    getThreadConversationStarter: () => 'How did things go with Mindy after the hospital?',
    getProactiveInsights: async () =>
      source === 'insight'
        ? {
            highPriorityCount: 1,
            suggestedConversationStarter: 'Want to talk about Mindy and the relapse?',
            suggestedInsightId: 'i1',
          }
        : { highPriorityCount: 0 },
    emotionalMemory: {
      getCheckInSuggestions: () =>
        source === 'checkIn'
          ? [
              {
                type: 'worry',
                reference: 'Mindy',
                suggestedOpener: 'Last time you were worried about Mindy.',
                moment: { id: 'm1' },
              },
            ]
          : [],
      markFollowedUp: () => undefined,
    },
  };
  const services = new Proxy(own, {
    get: fallback,
  });
  const session = new Proxy(
    { say: (text: string) => void spoken.push(String(text)) },
    { get: fallback }
  );
  const result = await generateAndSpeakGreeting({
    sessionPersona: getPersona('generic-advisor' as never)!,
    services: services as never,
    userData: { name: 'Sam' } as never,
    sessionId: 'sess-greeting-forget',
    userId: own.userId,
    userName: 'Sam',
    isReturningUser: true,
    session: session as never,
    tagGreeting: (text: string) => text,
  });
  return [result.greeting, ...spoken].join(' | ');
}

beforeEach(() => {
  forget.topics = ['Mindy'];
  resetForgetTopicsSource();
  vi.stubEnv('FORGET_EVERY_READER', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('the greeting and a forgotten topic', () => {
  it.each<Source>(['thread', 'insight', 'checkIn'])(
    'on: the %s never speaks it',
    async (source) => {
      expect(await greet(source)).not.toContain('Mindy');
    }
  );

  it.each<Source>(['thread', 'insight', 'checkIn'])(
    'with nothing forgotten, the %s reaches the greeting (the path is real)',
    async (source) => {
      forget.topics = [];
      expect(await greet(source)).toContain('Mindy');
    }
  );
});
