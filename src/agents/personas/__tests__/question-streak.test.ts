/**
 * QUESTION_STREAK_GUARD (question-streak.ts) and the broader safety-line check
 * the told-this-call note uses (phrase-loops.ts isSafetyLine).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Director, type Line } from '../director-notes.js';
import { isSafetyLine } from '../phrase-loops.js';
import { formatQuestionStreak, questionStreak } from '../question-streak.js';
import { formatTold, keptTold, toldThisCall } from '../told-this-call.js';
import { CUT_MARK, CUT_REST_MARK } from '../../shared/cut-reply-history.js';
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../../services/safety/crisis-call-risk.js';

const user = (text: string): Line => ({ speaker: 'user', text });
const ferni = (text: string): Line => ({ speaker: 'ferni', text });
const STREAK_NOTE = "End this one without asking one, unless you need to check they're safe.";

// Three replies in a row ending on a question, the middle one cut off, a backchannel between.
const interview: Line[] = [
  user('I went hiking this weekend.'),
  ferni('Oh nice, I love that. Where did you go?'),
  user('Up near the lake.'),
  // As cut-reply-history.ts puts it in the chat: the mark first.
  ferni(`${CUT_MARK} [laughter] The lake trail is gorgeous. Did you make it to the top?`),
  ferni('Mhm.'),
  user('Yeah, all the way up.'),
  ferni('That climb is no joke. How are your legs feeling today?'),
];

beforeEach(() => {
  resetCrisisCallRisk();
  process.env.QUESTION_STREAK_GUARD = 'on';
});
afterEach(() => {
  resetCrisisCallRisk();
  delete process.env.QUESTION_STREAK_GUARD;
});

describe('question streak', () => {
  it('counts replies in a row ending on a question, cut ones included, backchannels skipped', () => {
    expect(questionStreak(interview)).toBe(3);
    expect(questionStreak(interview.slice(0, 2))).toBe(1);
  });

  it('a reply that ends on a statement ends the streak', () => {
    const lines = [...interview, user('Sore!'), ferni("Ha, that's the best kind of sore.")];
    expect(questionStreak(lines)).toBe(0);
    expect(questionStreak([...lines, user('Right.'), ferni('What did you eat after?')])).toBe(1);
  });

  it('a streak that holds a safety question gets no note', () => {
    const lines: Line[] = [
      user('I just feel done.'),
      ferni("I'm really glad you told me. Are you somewhere safe right now?"),
      user('I guess.'),
      ferni('Thank you for telling me. Do you have a plan to hurt yourself tonight?'),
    ];
    expect(questionStreak(lines)).toBe(0);
  });

  it('skips the unheard rest of a part-heard reply, and counts a question ending in an emoji', () => {
    const lines: Line[] = [
      user('Long day.'),
      ferni('Oh no, what happened at work today? 😊'),
      user('Meetings.'),
      ferni('Ugh, meetings all day sounds rough.'),
      ferni(`${CUT_REST_MARK} Were they at least short ones?`),
    ];
    expect(questionStreak(lines)).toBe(0); // the heard part is a statement
    expect(questionStreak(lines.slice(0, 2))).toBe(1);
  });

  it('a safety sentence anywhere in a streak reply gets no note, not only the last one', () => {
    const lines: Line[] = [
      user('Everything is too much.'),
      ferni('That sounds so heavy. Are you thinking about killing yourself? Can you tell me what is going on?'),
      user('I dunno.'),
      ferni('I am here and listening. What happened today?'),
    ];
    expect(questionStreak(lines)).toBe(0);
  });

  it('writes the note from two in a row', () => {
    expect(formatQuestionStreak(1)).toBe('');
    expect(formatQuestionStreak(2)).toContain(STREAK_NOTE);
  });

  it('rides the told note with the flag on, and is absent with it off', () => {
    expect(formatTold(keptTold(toldThisCall(interview), () => true))).toContain(
      `Your last 3 replies ended on a question. ${STREAK_NOTE}`
    );
    process.env.QUESTION_STREAK_GUARD = 'off';
    const off = toldThisCall(interview);
    expect(off.questionStreak).toBeUndefined();
    expect(formatTold(keptTold(off, () => true))).not.toContain(STREAK_NOTE);
  });

  it('is held while a crisis read is in flight, and kept once it settles clean', async () => {
    const director = new Director({ sessionId: 'reading-call', writeNotes: false });
    await director.observe(interview);
    let settle: (v: { risk: string }) => void = () => {};
    const read = trackCrisisRead('reading-call', 'How are your legs feeling today?', new Promise<{ risk: string }>((r) => (settle = r))); // prettier-ignore
    expect(director.told()).not.toContain(STREAK_NOTE);
    settle({ risk: 'none' });
    await read;
    expect(director.told()).toContain(STREAK_NOTE);
  });

  it('is dropped once the call has crisis risk noted, through the real director', async () => {
    const director = new Director({ sessionId: 'streak-call', writeNotes: false });
    await director.observe(interview);
    expect(director.told()).toContain(STREAK_NOTE);
    noteCrisisRisk('streak-call');
    expect(director.told()).not.toContain(STREAK_NOTE);
  });
});

describe('safety lines the scripts do not word are never quoted (#2804 follow-up)', () => {
  // Paraphrases from the #2804 verify that the script match alone missed.
  const paraphrases = [
    'Do you have a plan to hurt yourself tonight?',
    'You can call or text 988 any time, day or night.',
    'Is there someone with you right now who can stay close?',
    "I want to make sure you're okay and not in any danger tonight, are you safe?",
  ];

  it('flags each paraphrase', () => {
    for (const line of paraphrases) expect(isSafetyLine(line), line).toBe(true);
  });

  it('never quotes one said twice, with no crisis risk noted', () => {
    for (const line of paraphrases) {
      const lines = [user('hey'), ferni(`Okay. ${line}`), user('hm'), ferni(`Alright. ${line}`)];
      const told = toldThisCall(lines);
      expect(formatTold(told), line).toContain(line.slice(0, 20)); // precondition: recorded
      expect(formatTold(keptTold(told, () => true)), line).not.toContain(line.slice(0, 20));
    }
  });

  it('leaves an ordinary line quotable', () => {
    expect(isSafetyLine('The quiet hum of a winter night still feels like coming home.')).toBe(
      false
    );
  });
});
