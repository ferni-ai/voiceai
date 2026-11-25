/**
 * SELF_SHARE_STAYS=on (#3475): asked about himself, Ferni ends on his own
 * thing instead of handing the question straight back, and the next turn or
 * two hand the "still about him?" call to the model. Asserted on the request
 * the model is asked with, through the live reply path (crisis-gate.ts ->
 * turn-request.ts -> turn-notes-guarded.ts -> self-share-stays.ts ->
 * ferni-state.ts), and on ferniStateStays for the paraphrase tables (the
 * round-1 review's lines, both directions). Flag off, the turn is
 * ferni-state's, untouched. All caller lines are fictional.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gatedReply } from '../crisis-gate.js';
import { LOW_MOOD_SELF } from '../ferni-self-share.js';
import { ferniStateTurn, TASK_LINE } from '../ferni-state.js';
import { ASKED_NO_DETAIL, FIRST_REPLY_ASKED, resetRecentDetails } from '../self-share-asked.js';
import { ferniStateStays, type StayTurn } from '../self-share-stays.js';
import { QUESTION_LINE, turnShapeFor } from '../turn-shape.js';
import { regexSignals } from '../turn-extras.js';
import { setTurnUnderstander } from '../turn-understanding.js';

const NOON = new Date('2026-10-11T18:10:00Z');
const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const STATE_ON = { FERNI_STATE: 'on', SELF_SHARE_STAYS: 'on' };
const OFF = { SELF_SHARE_STAYS: 'off' };
/** ferni-state.ts's own wording: the hand-back on an asked turn, and the swing after his share. */
const TURN_BACK = ', then ask them something about theirs.';
const SWING = 'Your last reply was about you: this one is about them, their day or their world.';
/** What they become with the flag on (self-share-stays.ts). */
const STAYS_END = 'said plainly in your own words, and leave it there, no question back';
const CHECK_IN = 'If anything they said sounds low or hard, set yourself aside and check on them.';
const FOLLOW_UP = 'if they are still asking about you, stay on yourself a moment';
const NO_DETAIL = "say one more real thing about what you've already told them";

let n = 0;
function newCall() {
  const sessionId = `stays-${++n}`;
  return {
    sessionId,
    session: {
      userData: {
        personaId: 'ferni',
        services: { sessionId, sessionStartTime: Date.now() - 120_000 },
      },
    },
  };
}

/** Caller and Ferni lines alternating, starting and ending with the caller. */
function callOf(...lines: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  lines.forEach((text, i) =>
    ctx.addMessage({ role: i % 2 === 0 ? 'user' : 'assistant', content: text })
  );
  return ctx;
}

async function askedWith(ctx: llm.ChatContext, session: object): Promise<string> {
  let asked = '';
  const model = vi.fn(async (c: llm.ChatContext) => {
    const last = c.items[c.items.length - 1] as { textContent?: string };
    asked = last.textContent ?? '';
    return new ReadableStream({ start: (s) => s.close() });
  });
  await gatedReply(ctx, session as never, model as never, { wrap: (s: unknown) => s } as never, {
    env: PATTERNS_ONLY,
  });
  return asked;
}

/** The live request for every caller turn of one call, in order. */
async function liveScene(lines: string[]): Promise<string[]> {
  const { session } = newCall();
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 2)
    out.push(await askedWith(callOf(...lines.slice(0, i + 1)), session));
  return out;
}

/** ferniStateStays for every caller turn of one call, in order; the last turn's result. */
function lastTurn(lines: string[], env: Record<string, string> = STATE_ON): StayTurn {
  const { session } = newCall();
  let turn: StayTurn = { note: '', last: '' };
  for (let i = 0; i < lines.length; i += 2)
    turn = ferniStateStays(callOf(...lines.slice(0, i + 1)), session, { env });
  return turn;
}

const OPENING = ['Hey.', 'Hey, good to hear you.', 'Long day, not much going on.', 'Ha, fair.'];
/** His answer about his day, once plain and once ending on a question back (issue r2). */
const HIS_SHARE = 'I was up around five checking the weather, and I am not even going anywhere.';
const HIS_SHARE_Q = `${HIS_SHARE} What about you, how was your afternoon?`;
const ASKED = [...OPENING, 'Enough about me. What did you do today?'];
/** Issue r1: he deflected with a question, then they asked again. */
const DEFLECTED = [...OPENING, 'Enough about me.', 'Fair enough, what is on your mind then?'];

/** Round-1 review: real follow-ups after his answer. */
const FOLLOW = [
  'Go on.',
  'And then what happened?',
  "Seriously though, what's new with you?",
  'What else?',
  'Wait, why?',
  'Huh. How come?',
  "Okay but like, what's actually going on with you?",
  "That's it? Come on.",
  'Keep going.',
  'And?',
  'No way. Then what?',
  'Why five though?',
  'What were you checking it for?',
  'Do you always do that?',
  'Nope, not letting you off that easy.',
  "Don't change the subject.",
  "Ha, and how'd that go?",
  'Sounds boring, give me something juicy.',
  "Okay but what's on your mind, really?",
  'No, something specific.',
  "What's been bugging you lately, and don't say nothing.",
  'Okay. And is that a normal day for you? or kind of a weird one?',
  "Hold on, that's not an answer.",
  'Lol, and?',
  'Huh, and what did your wife say?',
];
/** Round-1 review: not follow-ups, and not hard: the note may ride; the model judges. */
const MOVED_ON = [
  'Ugh, the traffic this morning was brutal.',
  'You know what, never mind.',
  'So the kids have a recital tonight.',
  "You won't believe what happened at work.",
  'Seriously, nobody listens at that office.',
  'Gotta run, talk later.',
  'Thanks, you are sweet.',
  "You're funny.",
  'Your weather sounds way better than ours.',
];
/** Look-ups and asks for something done: ferni-state's task line, never a note here. */
const TASKS = [
  'Is it supposed to rain tomorrow?',
  'Do you think it is going to snow?',
  'Tell me more.',
  'Can you set a reminder for me at six?',
];
/** Distress a shared reader marks (review lines plus fresh paraphrases): ferni-state's turn, untouched. */
const HARD = [
  'You ever feel like nothing matters?',
  'Work was rough, boss yelled again.',
  'Really rough day, not gonna lie.',
  'Feeling kind of lonely tonight, honestly.',
  "Honestly can't do this anymore.",
  "What's the point of any of it, honestly?",
  "I'm so tired of everything.",
  'Do you ever just want to disappear?',
  'Nobody would notice if I was gone.',
  'Everything is too much lately.',
  'I feel empty.',
  'My dad passed last week.',
];
/** Low lines no shared reader marks: the note may ride, and it carries the check-in. */
const LOW_UNREAD = [
  'Seriously, so done with everything.',
  "Can't sleep again, everything feels heavy.",
  'Whatever, does not matter.',
  'Come on, just tell me it gets better.',
  'Really missing the old days, you know?',
  "I don't really see a way forward.",
  'Kind of falling apart over here.',
  "Not great, if I'm honest.",
  'Is it normal to cry every day?',
  'How do you keep going when it all sucks?',
  "I'm just numb.",
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  process.env.FERNI_STATE = 'on';
  resetRecentDetails();
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.FERNI_STATE;
  delete process.env.SELF_SHARE_STAYS;
  delete process.env.SELF_SHARE_WHEN_ASKED;
});

describe('the lines it rewrites are the ones ferni-state writes', () => {
  it('an asked turn ends with the hand-back, and the turn after his share swings to them', () => {
    const env = { FERNI_STATE: 'on' };
    expect(ferniStateTurn(callOf(...ASKED), newCall().session, { env }).last).toContain(TURN_BACK);
    const after = ferniStateTurn(callOf(...ASKED, HIS_SHARE, 'Go on.'), newCall().session, { env });
    expect(after.last).toBe(`[${SWING}]`);
    expect(ASKED_NO_DETAIL.endsWith(TURN_BACK)).toBe(true);
  });
});

describe('SELF_SHARE_STAYS=on: the ask about him', () => {
  beforeEach(() => {
    process.env.SELF_SHARE_STAYS = 'on';
  });

  it('asked what he did today: his day detail, ending on his thing, a check-in only if low', async () => {
    const [, , asked] = await liveScene(ASKED);
    expect(asked).toContain('Otherwise, they asked about you: answer from your day');
    expect(asked).toContain(STAYS_END);
    expect(asked).toContain(`[${CHECK_IN} Otherwise, they asked about you`);
    expect(asked).not.toContain(TURN_BACK);
    expect(asked).toContain(QUESTION_LINE.stays);
    expect(asked).not.toContain(QUESTION_LINE.noneUnlessOwn);
    expect(asked).not.toMatch(/You may ask one question/);
  });

  it.each([
    'No. Actually. Like, what did you actually do? Something specific.',
    'Yeah, fine. What about you, what did you do today?',
    'I guess. Anyway, how has your day been?',
    'Nope. Your turn, what did you do today?',
    'Good, good. What did you do today?',
  ])('after his question, "%s" still stays (an answer word is no hold)', (said) => {
    for (const whenAsked of [{}, { SELF_SHARE_WHEN_ASKED: 'on' }] as Array<
      Record<string, string>
    >) {
      const turn = lastTurn([...DEFLECTED, said], { ...STATE_ON, ...whenAsked });
      expect(turn.stays).toBe('asked');
      expect(turn.last).not.toContain(TURN_BACK);
    }
  });

  it('just an answer to his question ("Yes.") is not an ask: nothing rewritten', () => {
    const turn = lastTurn([...OPENING, 'Hm.', 'Are you doing okay tonight?', 'Yes.']);
    expect(turn.stays).toBeUndefined();
  });

  it('the first reply keeps "say you\'re good, then turn to them" (no detail to stay on yet)', () => {
    const turn = lastTurn(['Hey Ferni, how are you? You go first.'], {
      ...STATE_ON,
      SELF_SHARE_WHEN_ASKED: 'on',
    });
    expect(turn.last).toContain(FIRST_REPLY_ASKED);
    expect(turn.stays).toBeUndefined();
  });

  it('a distress line read as an ask ("Do you ever feel like nothing matters?"): untouched', () => {
    const turn = lastTurn([...OPENING, 'Do you ever feel like nothing matters?']);
    expect(turn.stays).toBeUndefined();
  });

  it('a low ask no reader marks ("Do you ever feel like giving up?"): the line leads with the check-in', () => {
    const turn = lastTurn([...OPENING, 'Do you ever feel like giving up?']);
    expect(turn.stays).toBe('asked');
    expect(turn.last.startsWith(`[${CHECK_IN}`)).toBe(true);
  });

  it('details spent: "doing well" becomes one more real thing, with the check-in', () => {
    const turn = spentAsk();
    expect(turn.stays).toBe('no_detail');
    expect(turn.last).toContain(NO_DETAIL);
    expect(turn.last).toContain(CHECK_IN);
    expect(turn.last).not.toContain(ASKED_NO_DETAIL);
    expect(turn.brief).toBe(true);
    expect(spentAsk(OFF).last).toContain(ASKED_NO_DETAIL);
  });

  it('after a crisis line on the call, nothing is rewritten', async () => {
    const { session } = newCall();
    await askedWith(callOf('I want to kill myself.'), session);
    const asked = await askedWith(
      callOf('I want to kill myself.', 'I am here with you.', 'What did you do today?'),
      session
    );
    expect(asked).not.toContain(STAYS_END);
  });

  it('his last reply sounded flat: the correction stays, nothing rewritten', () => {
    const flat = 'Honestly, it all feels like a chore, too much effort.';
    const turn = lastTurn([...ASKED, flat, 'What did you do after that?']);
    expect(turn.last).toContain('You sounded flat');
    expect(turn.stays).toBeUndefined();
  });
});

describe('SELF_SHARE_STAYS=on: the turns after it', () => {
  it.each(FOLLOW)('"%s" after his answer: the follow-up note', (said) => {
    for (const share of [HIS_SHARE, HIS_SHARE_Q]) {
      for (const whenAsked of [{}, { SELF_SHARE_WHEN_ASKED: 'on' }] as Array<
        Record<string, string>
      >) {
        const turn = lastTurn([...ASKED, share, said], { ...STATE_ON, ...whenAsked });
        expect(turn.stays === 'follow_up' || turn.stays === 'asked').toBe(true);
        expect(turn.last).not.toContain(SWING);
        expect(turn.last).not.toContain('keep this reply on them');
      }
    }
  });

  it.each(MOVED_ON)('"%s" after his answer: the note rides, and it lets them move on', (said) => {
    const turn = lastTurn([...ASKED, HIS_SHARE, said]);
    expect(turn.stays).toBe('follow_up');
    expect(turn.last).toContain('if they have moved on to something of theirs, go with them');
  });

  it.each(TASKS)('"%s" after his answer: the task line, no note', (said) => {
    const turn = lastTurn([...ASKED, HIS_SHARE, said]);
    expect(turn.last).toContain(TASK_LINE);
    expect(turn.stays).toBeUndefined();
  });

  it.each(HARD)('"%s" after his answer: ferni-state\'s turn, no note', (said) => {
    for (const share of [HIS_SHARE, HIS_SHARE_Q]) {
      const turn = lastTurn([...ASKED, share, said]);
      expect(turn.stays).toBeUndefined();
      expect(turn.last).not.toContain(FOLLOW_UP);
    }
  });

  it.each(LOW_UNREAD)('"%s" (no reader marks it): the note carries the check-in', (said) => {
    const turn = lastTurn([...ASKED, HIS_SHARE, said]);
    expect(turn.stays).toBe('follow_up');
    expect(turn.last.startsWith(`[${CHECK_IN}`)).toBe(true);
  });

  it("a follow-up keeps the turn shape's own question line (only the ask bars the turn-back)", async () => {
    process.env.SELF_SHARE_STAYS = 'on';
    const [, , , specific] = await liveScene([...ASKED, HIS_SHARE, 'No, something specific.']);
    expect(specific).toContain(FOLLOW_UP);
    expect(specific).not.toContain(QUESTION_LINE.stays);
  });

  it('the model read their mood as tender or venting: no note, whatever the words', () => {
    for (const mood of ['tender', 'venting', 'bad_news']) {
      const { session } = newCall();
      const reads = { forTurn: () => ({ result: { mood } }) };
      setTurnUnderstander(session, reads as never);
      ferniStateStays(callOf(...ASKED), session, { env: STATE_ON });
      const turn = ferniStateStays(callOf(...ASKED, HIS_SHARE, 'Go on.'), session, {
        env: STATE_ON,
      });
      expect(turn.stays).toBeUndefined();
    }
  });

  it("no ask about him before: ferni-state's swing, no note", () => {
    const turn = lastTurn([...OPENING, 'Yeah, quiet one.', HIS_SHARE, 'Go on.']);
    expect(turn.last).toBe(`[${SWING}]`);
    expect(turn.stays).toBeUndefined();
  });

  it("two follow-ups at most, then ferni-state's lines again", () => {
    const scene = [...ASKED, HIS_SHARE, 'Go on.', HIS_SHARE, 'And?', HIS_SHARE, 'Keep going.'];
    const { session } = newCall();
    const kinds = [];
    for (let i = 0; i < scene.length; i += 2)
      kinds.push(
        ferniStateStays(callOf(...scene.slice(0, i + 1)), session, { env: STATE_ON }).stays
      );
    expect(kinds).toEqual([undefined, undefined, 'asked', 'follow_up', 'follow_up', undefined]);
  });

  it('the same words again later in the call are not a stays turn (review round 2)', () => {
    const scene = [
      ...ASKED,
      HIS_SHARE,
      'Ha.',
      'Ha, yeah, a little silly.',
      'So my car broke down on the way home.',
      'Oh no, where did it stop on you?',
      'Right by the gas station on Elm, of all places.',
      'Well, at least that is close to help.',
      'The tow truck took an hour to show up.',
      'An hour, that is a long wait.',
      'The guy said it is the alternator.',
      'Okay, so that is fixable at least.',
      'Should be ready Thursday, they said.',
      'Thursday is not too bad.',
      'Ha.',
      'Ha, yeah.',
      'Anyway, I have to pick up the kids from practice soon.',
    ];
    const { session } = newCall();
    const turns: StayTurn[] = [];
    for (let i = 0; i < scene.length; i += 2)
      turns.push(ferniStateStays(callOf(...scene.slice(0, i + 1)), session, { env: STATE_ON }));
    const kinds = turns.map((t) => t.stays);
    expect(kinds.slice(2, 4)).toEqual(['asked', 'follow_up']);
    const kids = turns[turns.length - 1];
    expect(kids.stays).toBeUndefined();
    // ferni-state's own line rides; keyed by words alone, the old "Ha." made this a follow-up.
    expect(kids.last).toContain("They're telling you something of theirs");
    expect(kids.last).not.toContain(FOLLOW_UP);
  });

  it('reading the same follow-up turn twice gives the same note', () => {
    const scene = [...ASKED, HIS_SHARE, 'Go on.'];
    const { session } = newCall();
    const kinds = [];
    for (let i = 0; i < scene.length; i += 2)
      kinds.push(
        ferniStateStays(callOf(...scene.slice(0, i + 1)), session, { env: STATE_ON }).stays
      );
    kinds.push(ferniStateStays(callOf(...scene), session, { env: STATE_ON }).stays);
    expect(kinds).toEqual([undefined, undefined, 'asked', 'follow_up', 'follow_up']);
  });

  it('a trimmed history that shifts positions fails closed: no note from a stale entry', () => {
    const scene = [...ASKED, HIS_SHARE, 'Go on.'];
    const { session } = newCall();
    for (let i = 0; i < scene.length; i += 2)
      ferniStateStays(callOf(...scene.slice(0, i + 1)), session, { env: STATE_ON });
    // The first exchange dropped: the ask now sits where 'Go on.' was remembered.
    const trimmed = [
      ...scene.slice(2),
      'Ha, keep going then.',
      'Anyway, the kids have practice tonight.',
    ];
    const turn = ferniStateStays(callOf(...trimmed), session, { env: STATE_ON });
    expect(turn.stays).toBeUndefined();
  });

  it('the same words on a fresh call (no stays turn before them): no note', () => {
    const { session } = newCall();
    const turn = ferniStateStays(callOf(...ASKED, HIS_SHARE, 'Go on.'), session, { env: STATE_ON });
    expect(turn.stays).toBeUndefined();
  });
});

describe('the eval scenario, turn by turn (scripts/voice-eval/scenarios/self-share-stays.txt)', () => {
  const SCENE = [
    "Hey Ferni, it's me again.",
    'Hey, good to hear from you. How has your week been?',
    'Good, good. Okay, enough about me.',
    'Ha, alright.',
    'What did you do today?',
    HIS_SHARE,
    'No, something specific.',
    'Okay, honestly, I keep checking it because I miss having somewhere to be.',
    "What's been bugging you lately, and don't say nothing.",
    'The real answer is I keep looking at flights and never booking one.',
    "Ha, okay, that's fair. I'm going to make some dinner soon, I think pasta.",
  ];

  it("on: the ask stays, both follow-ups get the note, the normal turn is ferni-state's", async () => {
    process.env.SELF_SHARE_STAYS = 'on';
    const [, , today, specific, bugging, dinner] = await liveScene(SCENE);
    expect(today).toContain(STAYS_END);
    expect(specific).toContain(FOLLOW_UP);
    expect(bugging).toContain(FOLLOW_UP);
    for (const asked of [today, specific, bugging]) expect(asked).not.toContain(TURN_BACK);
    expect(dinner).toContain(SWING);
    expect(dinner).not.toContain(FOLLOW_UP);
  });

  it('off: the hand-back and the swing, as before', async () => {
    const [, , today, specific, bugging] = await liveScene(SCENE);
    expect(today).toContain(TURN_BACK);
    expect(specific).toContain(SWING);
    expect(bugging).toContain(SWING);
  });
});

describe('SELF_SHARE_STAYS off (default): ferni-state untouched', () => {
  const CALLS = [ASKED, [...ASKED, HIS_SHARE, 'Go on.'], [...DEFLECTED, 'What did you do today?']];

  it('through the wrapper, every turn equals ferni-state on its own', () => {
    for (const lines of CALLS) {
      const a = newCall();
      const b = { session: { userData: { ...a.session.userData } } };
      for (let i = 0; i < lines.length; i += 2) {
        const ctx = callOf(...lines.slice(0, i + 1));
        const env = { FERNI_STATE: 'on', ...OFF };
        const wrapped = ferniStateStays(ctx, a.session, { env });
        expect(wrapped).toEqual(ferniStateTurn(ctx, b.session, { env }));
      }
    }
  });

  it('on the live path the hand-back and the swing are as before', async () => {
    const [, , asked, after] = await liveScene([...ASKED, HIS_SHARE, 'Go on.']);
    expect(asked).toContain(TURN_BACK);
    expect(after).toContain(SWING);
  });
});

describe('the shape line with selfStays', () => {
  it('no "then ask them one", and no question allowance, even on a draw that allows one', () => {
    const said = 'What did you do today?';
    const sig = { ...regexSignals(said, 'about_ferni'), ownStory: true };
    const allow = () => 0.1; // every draw under 0.25: the question allowance would fire
    const before = turnShapeFor(said, allow, 'model', sig);
    const after = turnShapeFor(said, allow, 'model', { ...sig, selfStays: true });
    expect(before.extras).toContain('curious_question');
    expect(after.extras).not.toContain('curious_question');
    expect(after.reminder).toContain(QUESTION_LINE.stays);
    const never = () => 0.9;
    expect(turnShapeFor(said, never, 'dice', sig).reminder).toContain(QUESTION_LINE.noneUnlessOwn);
    const stays = turnShapeFor(said, never, 'dice', { ...sig, selfStays: true }).reminder;
    expect(stays).not.toContain(QUESTION_LINE.noneUnlessOwn);
    expect(stays).toContain(QUESTION_LINE.stays);
  });
});

describe('voice text rules', () => {
  it('no em dashes, ellipses, stock openers or low-mood wording in any rewritten line', () => {
    const turns = [lastTurn(ASKED), lastTurn([...ASKED, HIS_SHARE, 'Go on.']), spentAsk()];
    expect(turns.map((t) => t.stays)).toEqual(['asked', 'follow_up', 'no_detail']);
    for (const { last } of turns) {
      expect(last).not.toMatch(/[—…]|\.\.\./);
      expect(last).not.toMatch(LOW_MOOD_SELF);
      expect(last).not.toMatch(
        /Okay, honestly|The real answer is|book that trip|that was my morning/
      );
    }
  });
});

/**
 * SELF_SHARE_WHEN_ASKED on: ten day details, each once a call, so ask until none is left.
 * The turn returned is the first ask with no detail.
 */
function spentAsk(flags: Record<string, string> = {}): StayTurn {
  const env = { ...STATE_ON, SELF_SHARE_WHEN_ASKED: 'on', ...flags };
  const { session } = newCall();
  const lines = [...OPENING];
  for (let i = 0; i < 12; i++) {
    const turn = ferniStateStays(callOf(...lines, `What did you do today, part ${i}?`), session, {
      env,
    });
    if (!/answer from your day/.test(turn.last)) return turn;
    lines.push(`What did you do today, part ${i}?`, 'Ha, fair enough.');
  }
  throw new Error('the details never ran out');
}
