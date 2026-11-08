import { afterEach, describe, expect, it, vi } from 'vitest';
import { voice } from '@livekit/agents';
import {
  claimOpenerFollowUp,
  claimProactiveSlot,
  clearOpenerClaims,
  peekProactiveSlot,
} from '../../../memory/recall/opener-claim.js';
import {
  crisisReadInFlight,
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';
import { createPredictionCheckIn, forgetPredictionCheckIns } from '../prediction-check-in.js';
import type { OpenCommitment } from '../../../services/superhuman/commitment-follow-up.js';

// A fake Firestore that records how dynamic_facts is queried.
const fake = vi.hoisted(() => {
  const calls: string[] = [];
  let ordered: Array<Record<string, unknown>> = [];
  const plain = [{ entityName: 'Biscuit', key: 'breed', value: 'golden retriever' }];
  const query = (orderedBy?: string) => ({
    orderBy: (field: string, dir: string) => {
      calls.push(`orderBy:${field}:${dir}`);
      return query(field);
    },
    limit: (n: number) => {
      calls.push(`limit:${n}`);
      return {
        get: async () => ({
          docs: (orderedBy ? ordered : plain).map((d) => ({ data: () => d })),
        }),
      };
    },
  });
  const db = {
    collection: () => ({ doc: () => ({ collection: () => query() }) }),
  };
  return { calls, db, setOrdered: (d: Array<Record<string, unknown>>) => (ordered = d) };
});
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));

import {
  addRecallNote,
  createMemoryRecall,
  firestoreRecallStore,
  memoryRecallMode,
  type RecallAgent,
} from '../memory-recall-hook.js';

describe('firestoreRecallStore.facts', () => {
  it('loads the newest facts first, not an arbitrary 300', async () => {
    fake.calls.length = 0;
    fake.setOrdered([
      { entityName: 'Biscuit', key: 'age', value: 'three', extractedAt: '2026-10-04' },
    ]);
    const facts = await firestoreRecallStore.facts('u1');
    expect(fake.calls).toContain('orderBy:extractedAt:desc');
    expect(facts).toEqual([
      { entityName: 'Biscuit', key: 'age', value: 'three', extractedAt: '2026-10-04' },
    ]);
  });

  it('falls back to the plain query when no fact has a date', async () => {
    fake.calls.length = 0;
    fake.setOrdered([]);
    const facts = await firestoreRecallStore.facts('u1');
    expect(facts).toEqual([{ entityName: 'Biscuit', key: 'breed', value: 'golden retriever' }]);
  });
});

const store = {
  facts: async () => [
    { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 },
  ],
  summaries: async () => [
    { callerProvenance: 1, followUpItems: ['Ask how Biscuit is settling in'] },
  ],
};

describe('createMemoryRecall', () => {
  it('recalls for the transcript, offers follow-ups once, and does not repeat a fact', async () => {
    const recall = createMemoryRecall({ userId: 'u1', userName: 'Sam', store });
    await recall.ready;

    const first = recall.noteFor('Hey, how are you?');
    expect(first).toContain('Ask how Biscuit is settling in');

    const second = recall.noteFor('Biscuit chewed my shoes again');
    expect(second).toContain('- Biscuit: breed = golden retriever');
    expect(second).not.toContain('settling in');

    expect(recall.noteFor('Biscuit is asleep now')).toBeNull();
  });

  it('recalls at most 4 facts, 2 per entity, per user turn across interim transcripts, then resets', async () => {
    const many = {
      facts: async () =>
        Array.from({ length: 12 }, (_, i) => ({
          entityName: i % 2 ? 'Biscuit' : 'Mochi',
          key: `fact_${i}`,
          value: `detail number ${i}`,
          confidence: 1,
        })),
      summaries: async () => [],
    };
    const recall = createMemoryRecall({ userId: 'u1', store: many });
    await recall.ready;

    const count = (note: string | null, who = 'Biscuit') =>
      (note?.match(new RegExp(`^- ${who}:`, 'gm')) ?? []).length;
    let biscuit = 0;
    let all = 0;
    for (const interim of [
      'Biscuit and Mochi',
      'Biscuit and Mochi did',
      'Biscuit and Mochi did it',
    ]) {
      const note = recall.noteFor(interim);
      biscuit += count(note);
      all += count(note) + count(note, 'Mochi');
    }
    expect(biscuit).toBe(2);
    expect(all).toBe(4);

    recall.newTurn();
    expect(count(recall.noteFor('Biscuit again'))).toBe(2);
  });

  it('leads the first note with what they said they would do, once', async () => {
    const recall = createMemoryRecall({
      userId: 'u1',
      store,
      checkIns: async () => [
        {
          id: 'c1',
          statement: "I'm going to send my resume to Dana by Thursday.",
          createdAt: Date.now() - 3 * 86_400_000,
          followUpAfter: Date.now(),
          followUpCount: 0,
        },
      ],
    });
    await recall.ready;

    const first = recall.noteFor('Hey, how are you?');
    expect(first?.startsWith('[THINGS THEY SAID THEY WOULD DO]')).toBe(true);
    expect(first).toContain('send my resume to Dana by Thursday');
    expect(first).toContain('they said this 3 days ago');
    expect(recall.noteFor('Biscuit chewed my shoes again')).not.toContain('resume');
  });

  it('brings no check-ins with COACH_FOLLOW_THROUGH unset', async () => {
    const recall = createMemoryRecall({ userId: 'u1', store });
    await recall.ready;
    expect(recall.noteFor('Hey, how are you?')).not.toContain('THINGS THEY SAID');
  });

  it('returns null instead of waiting while memory is still loading', () => {
    const slow = {
      facts: () =>
        new Promise<Array<Record<string, unknown>>>((resolve) => {
          setTimeout(() => resolve([]), 500);
        }),
      summaries: async () => [],
    };
    const recall = createMemoryRecall({ userId: 'u1', store: slow });
    expect(recall.noteFor('Biscuit is great')).toBeNull();
  });

  it('with OPENER_FOLLOW_UP, the first note asks Ferni to follow up on a thread, once', async () => {
    const on = createMemoryRecall({ userId: 'u1', userName: 'Maya', store, opener: true });
    await on.ready;
    const first = on.noteFor("Hey Ferni, it's me!");
    expect(first).toContain('Ask how Biscuit is settling in');
    expect(first).toMatch(/start of the call\. After saying hello, ask about the one open thread/);
    expect(on.noteFor('Biscuit chewed my shoes again')).not.toMatch(/start of the call/);

    const off = createMemoryRecall({ userId: 'u1', userName: 'Maya', store, opener: false });
    await off.ready;
    expect(off.noteFor("Hey Ferni, it's me!")).not.toMatch(/start of the call/);

    const noThreads = createMemoryRecall({
      userId: 'u1',
      store: { ...store, summaries: async () => [] },
      opener: true,
    });
    await noThreads.ready;
    expect(noThreads.noteFor('Biscuit is asleep')).not.toMatch(/start of the call/);
  });

  it('asks one follow-up per call opener: a greeting check-in or pondered item, or a check-in note, wins', async () => {
    const opening = (userId: string, checkIns?: () => Promise<OpenCommitment[]>) =>
      createMemoryRecall({
        userId,
        userName: 'Maya',
        store,
        opener: true,
        ...(checkIns && { checkIns }),
      });
    const THREAD = /start of the call\. After saying hello/;

    // The greeting already asked about something: the note leaves the thread line out.
    claimOpenerFollowUp('u-greeted', 'greeting');
    const greeted = opening('u-greeted');
    await greeted.ready;
    expect(greeted.noteFor("Hey Ferni, it's me!")).not.toMatch(THREAD);

    // The claim was taken with that call's first note: the next call asks as usual.
    const next = opening('u-greeted');
    await next.ready;
    expect(next.noteFor("Hey Ferni, it's me!")).toMatch(THREAD);

    // A check-in in the first note is the one follow-up.
    const withCheckIn = opening('u-check', async () => [
      {
        id: 'c1',
        statement: "I'm going to send my resume to Dana by Thursday.",
        createdAt: Date.now() - 3 * 86_400_000,
        followUpAfter: Date.now(),
        followUpCount: 0,
      },
    ]);
    await withCheckIn.ready;
    const first = withCheckIn.noteFor("Hey Ferni, it's me!");
    expect(first).toContain('send my resume to Dana');
    expect(first).not.toMatch(THREAD);
  });

  it('with RECALL_PEOPLE, the first note says who is who and forbids guessing', async () => {
    // The benchmark miss: asked for a daughter's name, Ferni said "Joan", the
    // sister, named only in an open thread.
    const family = {
      facts: async () => [
        {
          entityName: 'Joan',
          key: 'sister of speaker',
          value: "The speaker's sister is named Joan",
          confidence: 0.9,
        },
        { entityName: 'Walt', key: 'spouse of', value: 'User', confidence: 0.9 },
        { entityName: 'Walt', key: 'pet owned', value: 'Pepper (cat)', confidence: 0.9 },
      ],
      summaries: async () => [
        { callerProvenance: 1, followUpItems: ["Ask how Joan's Thanksgiving visit went"] },
      ],
    };
    const on = createMemoryRecall({
      userId: 'u-fam',
      userName: 'Ruth',
      store: family,
      people: true,
    });
    await on.ready;
    const first = on.noteFor("What's my daughter's name?");
    expect(first).toContain('People in their life: Joan (sister), Walt (spouse).');
    expect(first).toContain("Animals: Pepper (Walt's cat).");
    expect(first).toMatch(/never guess how someone is related/i);
    expect(on.noteFor('And how is Walt?')).not.toContain('People in their life'); // once a call

    const off = createMemoryRecall({
      userId: 'u-fam',
      userName: 'Ruth',
      store: family,
      people: false,
    });
    await off.ready;
    expect(off.noteFor("What's my daughter's name?")).not.toMatch(
      /People in their life|never guess/i
    );
  });

  it('offers a shared inside joke once per call, on a turn that touches its line, only with INSIDE_JOKES=on', async () => {
    const withJokes = {
      facts: store.facts,
      summaries: async () => [
        {
          insideJokes: [
            {
              bit: 'the mushroom thing',
              quote: 'the fungus incident in the risotto',
              speaker: 'user',
            },
          ],
        },
      ],
    };
    vi.stubEnv('INSIDE_JOKES', 'on');
    try {
      const recall = createMemoryRecall({ userId: 'u1', store: withJokes });
      await recall.ready;
      expect(recall.noteFor('Hey, how are you?') ?? '').not.toContain('mushroom');
      expect(recall.noteFor('The fungus is back in my risotto')).toContain('- the mushroom thing');
      expect(recall.noteFor('The risotto fungus again') ?? '').not.toContain('mushroom');

      vi.stubEnv('INSIDE_JOKES', 'off');
      const off = createMemoryRecall({ userId: 'u1', store: withJokes });
      await off.ready;
      expect(off.noteFor('The fungus is back in my risotto') ?? '').not.toContain('mushroom');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('is on by default and turns off with MEMORY_RECALL=off', () => {
    expect(memoryRecallMode({})).toBe(true);
    expect(memoryRecallMode({ MEMORY_RECALL: 'off' })).toBe(false);
  });
});

describe('addRecallNote', () => {
  it("puts the note in the real SDK agent's context before returning", () => {
    const agent = new voice.Agent({ instructions: 'You are Ferni.' });
    const before = agent.chatCtx.items.length;

    addRecallNote(
      agent as unknown as RecallAgent,
      '[WHAT YOU REMEMBER] Biscuit is a golden retriever'
    );

    // Synchronous: preemptive generation copies the context in the same tick.
    const items = agent.chatCtx.items;
    expect(items.length).toBe(before + 1);
    const last = items[items.length - 1] as { role?: string; textContent?: string };
    expect(last.role).toBe('system');
    expect(last.textContent).toContain('golden retriever');
  });
});

// B0: the opener thread line is one of the call's proactive asks (PROACTIVE_BUDGET).
describe('the opener thread line in the call budget', () => {
  const THREAD = /start of the call\. After saying hello/;
  const opening = async (sessionId?: string) => {
    const recall = createMemoryRecall({ userId: 'u-budget', store, opener: true, sessionId });
    await recall.ready;
    return recall.noteFor("Hey Ferni, it's me!");
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    clearOpenerClaims();
    resetCrisisCallRisk();
  });

  it('asks when the slot is free, and then holds it', async () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    expect(peekProactiveSlot('call-free')).toBeUndefined();
    expect(await opening('call-free')).toMatch(THREAD);
    expect(peekProactiveSlot('call-free')).toBe('recall-thread');
  });

  it('leaves the line out when the greeting or another asker holds the slot', async () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    claimOpenerFollowUp('u-budget', 'greeting', 'call-greeted');
    expect(await opening('call-greeted')).not.toMatch(THREAD);
    expect(claimProactiveSlot('call-insight', 'commitment-insight')).toEqual({ ok: true });
    expect(await opening('call-insight')).not.toMatch(THREAD);
    expect(peekProactiveSlot('call-insight')).toBe('commitment-insight');
  });

  it('leaves the line out with no sessionId', async () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    expect(await opening(undefined)).not.toMatch(THREAD);
  });

  it('off: asks as on main, with or without a sessionId, and holds no slot', async () => {
    claimProactiveSlot('call-off', 'commitment-insight');
    expect(await opening('call-off')).toMatch(THREAD);
    expect(await opening(undefined)).toMatch(THREAD);
    expect(peekProactiveSlot('call-off')).toBe('commitment-insight');
  });
});

// Round 2: a call safety holds counts as asked, so the week's predictions stay out beside it.
describe('the week line beside a safety-held call', () => {
  const WEEK = 'Last week Sam guessed the move would go smoothly. Ask how it went.';
  const firstNote = async (state: 'risk' | 'reading' | 'free', sessionId: string) => {
    const userId = `u-${sessionId}`;
    const week = createPredictionCheckIn({ userId, personaId: 'ferni', load: async () => WEEK });
    const recall = createMemoryRecall({ userId, store, opener: true, sessionId, week });
    await Promise.all([recall.ready, week.ready]);
    if (state !== 'free') claimOpenerFollowUp(userId, 'greeting', sessionId); // the hello asked
    if (state === 'risk') noteCrisisRisk(sessionId);
    if (state === 'reading') void trackCrisisRead(sessionId, 'Hey', new Promise<null>(() => {}));
    return recall.noteFor('Hey, the boxes are finally unpacked.', { final: true }) ?? '';
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    clearOpenerClaims();
    resetCrisisCallRisk();
    forgetPredictionCheckIns();
  });

  it('on: crisis risk noted after the greeting asked leaves the week line out', async () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    expect(peekProactiveSlot('call-risk')).toBeUndefined();
    const note = await firstNote('risk', 'call-risk');
    expect(peekProactiveSlot('call-risk')).toBe('safety');
    expect(note).not.toContain(WEEK);
  });

  it('on: a crisis read in flight on ordinary words leaves the week line out', async () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    const note = await firstNote('reading', 'call-reading');
    expect(crisisReadInFlight('call-reading')).toBe(true);
    expect(note).not.toContain(WEEK);
  });

  it('on: with no safety hold and no ask, the week line comes as on main', async () => {
    vi.stubEnv('PROACTIVE_BUDGET', 'on');
    expect(await firstNote('free', 'call-free-week')).toContain(WEEK);
  });

  it('off: the same as main in all three states', async () => {
    expect(await firstNote('risk', 'off-risk')).not.toContain(WEEK);
    expect(await firstNote('reading', 'off-reading')).not.toContain(WEEK);
    expect(await firstNote('free', 'off-free')).toContain(WEEK);
  });
});
