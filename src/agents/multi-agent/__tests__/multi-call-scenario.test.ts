/**
 * Three calls with one caller, through the real live-call pieces: recall,
 * the recorders and the per-reply notes, with an in-memory store in place of
 * Firestore. Checks what each moment is actually given, across calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYFUL_CUE, humorCue } from '../../../conversation/humor-fit.js';
import type { TalkPreference } from '../../../conversation/talk-preferences.js';
import type { SignificantDate } from '../../../memory/recall/significant-dates.js';
import type { ToldStory } from '../../../memory/recall/told-stories.js';
import { EXPRESSIVE_VOICE } from '../../../speech/expression/index.js';
import { replyCues } from '../../personas/reply-cues.js';
import { createMemoryRecall } from '../memory-recall-hook.js';
import { createSignificantDatesRecorder } from '../significant-dates-recorder.js';
import { createTalkPreferenceRecorder } from '../talk-preference-recorder.js';

const TZ = 'America/Denver';
// Tuesday Sep 29 2026, 18:00 in Denver; Friday Oct 2, 18:00; Tuesday Oct 6, 18:00
const CALL_1 = new Date('2026-09-30T00:00:00Z');
const CALL_2 = new Date('2026-10-03T00:00:00Z');
const CALL_3 = new Date('2026-10-07T00:00:00Z');

/** What Firestore would hold for this caller between calls. */
function memoryStore() {
  const summaries: Array<Record<string, unknown>> = [];
  const closed: string[] = [];
  const stories: ToldStory[] = [];
  const dates: SignificantDate[] = [];
  const talk = new Set<TalkPreference>();
  return {
    summaries,
    closed,
    stories,
    dates,
    talk,
    recallStore: {
      facts: async () => [],
      summaries: async () => [...summaries].reverse(),
      closedFollowUps: async () => [...closed],
      toldStories: async () => [...stories].reverse(),
    },
  };
}

/** One call: the pieces agent-setup wires, over the shared store. */
async function startCall(store: ReturnType<typeof memoryStore>, now: Date) {
  vi.setSystemTime(now);
  const userData: Record<string, unknown> = { userName: 'Sam', timezone: TZ };
  const recall = createMemoryRecall({
    userId: 'u1',
    userName: 'Sam',
    timezone: TZ,
    personaId: 'ferni',
    store: store.recallStore,
    closeFollowUp: (f) => store.closed.push(f.id),
    saveStory: (s) => store.stories.push(s),
  });
  const talk = createTalkPreferenceRecorder({
    userData,
    saveLasting: (p) => store.talk.add(p),
  });
  const dates = createSignificantDatesRecorder({
    userData,
    save: (d) => store.dates.push(d),
    now: () => now,
  });
  await recall.ready;
  talk.loaded([...store.talk]);
  dates.loaded([...store.dates]);
  const replies: string[] = [];
  return {
    userData,
    recall,
    /** The caller says something (a committed turn). */
    hear(text: string) {
      talk.heard(text);
      dates.heard(text);
      return recall.noteFor(text);
    },
    /** Ferni says something. */
    say(text: string) {
      replies.push(text);
      recall.agentSaid(text);
    },
    /** The notes the next reply to `userText` would get. */
    cues(userText: string) {
      return replyCues({
        userData,
        exchange: { user: userText, agent: replies.at(-1) },
        recentReplies: replies.slice(-3),
        voice: EXPRESSIVE_VOICE,
      });
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('three calls with one caller', () => {
  it('remembers, follows up once, stays gentle on a hard day, and never retells', async () => {
    vi.useFakeTimers();
    const store = memoryStore();

    // --- Call 1 (Tuesday) -----------------------------------------------
    const c1 = await startCall(store, CALL_1);
    c1.hear('I have a job interview on Thursday and I am so nervous');
    c1.say(
      'When I was a kid, my grandmother kept a tomato garden in Wyoming. She said nerves mean you care.'
    );
    c1.hear('I never want advice, I just want to vent sometimes');
    c1.hear('My dad died on October 2nd, 2019, so this week is always strange');
    expect(c1.cues('ok')).toEqual(
      expect.arrayContaining([expect.stringContaining('listened to, not fixed')])
    );
    // The end-of-call summarizer would write this
    store.summaries.push({
      timestamp: CALL_1.getTime(),
      emotionalArc: 'nervous about the interview, softer by the end',
      followUpItems: ['Ask how the job interview went'],
    });

    expect(store.stories).toHaveLength(1);
    expect([...store.talk]).toEqual(['just_listen']);
    expect(store.dates.map((d) => d.id)).toEqual(['loss-dad-10-2']);

    // --- Call 2 (Friday Oct 2, the anniversary) --------------------------
    const c2 = await startCall(store, CALL_2);
    const opening = await c2.recall.openingFacts();
    expect(opening['open thread from last time']).toMatch(
      /job interview .*\(said 3 days ago \(Tuesday\)\)/
    );
    expect(opening['how your last call felt']).toMatch(/^nervous about the interview/);

    // A playful humor read from earlier calls must not survive a hard day
    c2.userData.humorCue = humorCue({ calls: 5, laughs: 7 });
    expect(c2.userData.humorCue).toBe(PLAYFUL_CUE);
    const firstNote = c2.hear('Hey. Long week.') ?? '';
    expect(firstNote).toContain('grandmother kept a tomato garden');
    const cues = c2.cues('Hey. Long week.');
    expect(cues.join('\n')).toContain('anniversary of losing their dad (7 years)');
    expect(cues.join('\n')).toContain('listened to, not fixed');
    expect(cues).not.toContain(PLAYFUL_CUE);

    // Ferni asks about the interview; it is closed for good
    c2.say('How did the interview go on Thursday?');
    expect(store.closed).toContain('job-interview');
    // The same story told again is not saved as new
    c2.say('My grandma had a tomato garden back in Wyoming, did I ever say?');
    expect(store.stories).toHaveLength(1);

    // Leaving gets a friend's goodbye
    expect(c2.cues('I gotta run, talk soon').join('\n')).toMatch(/THEY ARE HEADING OFF/);

    // --- Call 3 (next Tuesday) -------------------------------------------
    const c3 = await startCall(store, CALL_3);
    const opening3 = await c3.recall.openingFacts();
    expect(opening3['open thread from last time']).toBeUndefined();
    expect(c3.userData.daysThatMatter).toBeNull();
    c3.userData.humorCue = humorCue({ calls: 5, laughs: 7 });
    expect(c3.cues('We had pizza tonight, it was great')).toContain(PLAYFUL_CUE);
  });
});
