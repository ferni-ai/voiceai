/**
 * WORLD_FACTS_IN_CALL on the live request path (turn-request.ts
 * withTurnReminder, which gatedReply calls from FerniAgent.llmNode): the
 * caller's current world facts, loaded once per call, reach the request in
 * the legacy turn note (CONTEXT_PACKET off) or the packet's "Your life right
 * now" section (on). Off: the request is byte-identical.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { WORLD_FACTS_RULE } from '../../../intelligence/world-model/temporal/in-call.js';
import { loadWorldFactsForCall } from '../../../intelligence/world-model/temporal/in-call-load.js';
import { recordWorldObservations } from '../../../intelligence/world-model/temporal/ingest.js';
import { createMemoryWorldFactStore } from '../../../intelligence/world-model/temporal/__tests__/memory-store.js';
import { setDirector, type Director } from '../director-notes.js';
import { withTurnReminder } from '../turn-request.js';

const ON = { WORLD_MODEL_TEMPORAL: 'on', WORLD_FACTS_IN_CALL: 'on' };
const lastText = (ctx: llm.ChatContext): string =>
  (ctx.items.at(-1) as llm.ChatMessage).textContent ?? '';

async function store() {
  const s = createMemoryWorldFactStore();
  const deps = { store: s, env: ON, judge: async () => [] };
  const self = (value: string, at: string, extra = {}) => ({
    subject: 'self',
    subjectKind: 'self',
    attribute: 'job',
    value,
    observedAt: at,
    confidence: 0.9,
    source: { kind: 'summary', sessionId: 's' },
    ...extra,
  });
  await recordWorldObservations('u1', 'c1', [self('works at Acme', '2026-10-01T18:00:00Z')], deps);
  await recordWorldObservations(
    'u1',
    'c2',
    [
      self('started at Beta', '2026-10-09T18:00:00Z', { since: '2026-10-05' }),
      self('interview at Stripe', '2026-10-09T18:00:00Z', {
        attribute: 'event',
        eventDate: '2026-10-15',
      }),
    ],
    deps
  );
  return s;
}

function call(words: string): { chat: llm.ChatContext; session: { userData: object } } {
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: 'Long week.' });
  chat.addMessage({ role: 'assistant', content: 'Yeah? Tell me.' });
  chat.addMessage({ role: 'user', content: words });
  const session = {
    userData: {
      userId: 'u1',
      userName: 'Sam',
      personaId: 'ferni',
      callerTimezone: 'America/Denver',
    },
  };
  const director = { current: () => ['They sound tired.'], told: () => '' };
  setDirector(session, director as unknown as Director);
  return { chat, session };
}

async function loaded(words: string) {
  const c = call(words);
  await loadWorldFactsForCall(c.session.userData, 'u1', {
    store: await store(),
    forgotten: async () => [],
    env: ON,
  });
  return c;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T18:00:00Z'));
  vi.spyOn(Math, 'random').mockReturnValue(0.42);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('WORLD_FACTS_IN_CALL off', () => {
  for (const packet of ['off', 'on']) {
    it(`sends the same request as a call with no facts (CONTEXT_PACKET=${packet})`, async () => {
      vi.stubEnv('CONTEXT_PACKET', packet);
      const plain = call('Acme called me today.');
      const withFacts = await loaded('Acme called me today.'); // loaded, then the flag is off
      vi.stubEnv('WORLD_FACTS_IN_CALL', 'off');
      const sent = lastText(withTurnReminder(withFacts.chat, withFacts.session, { shape: false }));
      expect(sent).toBe(lastText(withTurnReminder(plain.chat, plain.session, { shape: false })));
      expect(sent).not.toMatch(/Beta|Stripe|life right now/);
    });
  }
});

describe('WORLD_FACTS_IN_CALL on', () => {
  beforeEach(() => vi.stubEnv('WORLD_FACTS_IN_CALL', 'on'));

  it('legacy turn note: the current job and the date, never the old job as current', async () => {
    const { chat, session } = await loaded('Long day at work.');
    const sent = lastText(withTurnReminder(chat, session, { shape: false }));
    expect(sent).toContain(`[Their life right now. ${WORLD_FACTS_RULE}]`);
    expect(sent).toContain('(you said on Oct 9) Sam event: interview at Stripe, Thu Oct 15');
    expect(sent).toContain('(you said on Oct 9) Sam job: started at Beta, since Mon Oct 5');
    expect(sent).not.toContain('Acme');
  });

  it('legacy turn note: the old job only as over, when they name it', async () => {
    const { chat, session } = await loaded('Acme called me today.');
    const sent = lastText(withTurnReminder(chat, session, { shape: false }));
    expect(sent).toContain('started at Beta, since Mon Oct 5; no longer: works at Acme');
  });

  it('context packet: its own section after What I remember', async () => {
    vi.stubEnv('CONTEXT_PACKET', 'on');
    const { chat, session } = await loaded('Long day at work.');
    const sent = lastText(withTurnReminder(chat, session, { shape: false }));
    const section = sent.split('\n\n').find((b) => b.startsWith('## Your life right now'));
    expect(section?.split('\n')).toEqual([
      '## Your life right now',
      WORLD_FACTS_RULE,
      '- (you said on Oct 9) Sam event: interview at Stripe, Thu Oct 15',
      '- (you said on Oct 9) Sam job: started at Beta, since Mon Oct 5',
    ]);
    expect(sent).not.toContain('[Their life right now.');
    expect(sent).not.toContain('Acme');
  });

  it('no block before the facts have loaded', () => {
    const { chat, session } = call('Long day at work.');
    expect(lastText(withTurnReminder(chat, session, { shape: false }))).not.toMatch(
      /Beta|life right now/
    );
  });
});
