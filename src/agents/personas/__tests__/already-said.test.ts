/**
 * ALREADY_SAID_LEDGER: a sentence two of Ferni's recent replies said word for
 * word reaches the next request, so he doesn't say it a third time. Off, the
 * told-this-call note is byte for byte what it was. All lines are fictional.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';

import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { installDirectorNotes } from '../../multi-agent/turn-observers.js';
import { ALREADY_SAID, alreadySaid, formatAlreadySaid } from '../already-said.js';
import { Director, getDirector, setDirector, type Line } from '../director-notes.js';
import { normalized } from '../phrase-loops.js';
import { toldThisCall, toldThisCallNote } from '../told-this-call.js';
import { withTurnReminder } from '../turn-request.js';

const user = (text: string): Line => ({ speaker: 'user', text });
const ferni = (text: string): Line => ({ speaker: 'ferni', text });

/** "That's a big step" in three replies, once shouted: the told note never quotes it. */
const pottery: Line[] = [
  user('I finally signed up for the pottery class.'),
  ferni("That's a big step. What made you go for it this time?"),
  user('A friend dared me, honestly.'),
  ferni("That's a big step! Dares are the best reason to try anything."),
  user('First class is on Thursday.'),
  ferni("Thursday will be here before you know it. Do you know what you'll make first?"),
  user('Probably a lopsided bowl.'),
  ferni("THAT'S A BIG STEP... a lopsided bowl is still a bowl, and a bowl holds soup."),
  user('Ha, true.'),
];

/** The note main gave for `pottery` before this flag existed. */
const POTTERY_NOTE_BEFORE =
  '[Already said this call: Don\'t say again: "a lopsided bowl is still a bowl, and a bowl holds soup."; "Thursday will be here before you know it."; "Dares are the best reason to try anything."]';

const sentences = (...replies: string[]): string[][] =>
  replies.map((r) => r.split(/(?<=[.!?])\s+/));

const ledgerOf = (note: string): string => note.match(/You've already said: [^\]]*/)?.[0] ?? '';

/** Ordinary replies with numbers (the #3483 round-2 verify): none may switch the ledger off. */
const ORDINARY_NUMBERS = [
  "That's $120 for the lot.",
  'We moved here in 2019.',
  'Room 204 is on the left.',
  'Take bus 101 downtown.',
  "I'll call you back at 6.",
  'I ran 5 miles today.',
  'It cost $1,000 in the end.',
  'The party is at 9:11 sharp.',
];

/** The note a live call's request carries after `lines`, the caller now saying `callerSays`. */
async function liveNote(lines: Line[], sessionId: string, callerSays: string): Promise<string> {
  const handlers: Array<(ev: unknown) => void> = [];
  const session = {
    userData: { services: { sessionId } },
    on: (_e: string, h: (ev: unknown) => void) => handlers.push(h),
    off: () => {},
  };
  const items = lines.map((l) => ({
    type: 'message',
    role: l.speaker === 'ferni' ? 'assistant' : 'user',
    textContent: l.text,
  }));
  await installDirectorNotes({
    session: session as never,
    sessionId,
    userName: undefined,
    agent: { chatCtx: { items } },
    cleanupFunctions: [],
  });
  expect(getDirector(session)).toBeDefined();
  handlers.forEach((h) => h({ newState: 'speaking' }));
  handlers.forEach((h) => h({ newState: 'listening' }));
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: callerSays });
  const sent = (withTurnReminder(ctx, session).items.at(-1) as llm.ChatMessage).textContent;
  setDirector(session, null);
  return sent ?? '';
}

afterEach(() => {
  delete process.env.ALREADY_SAID_LEDGER;
  delete process.env.PHRASE_LOOP_GUARD;
  delete process.env.TOLD_THIS_CALL;
});

describe('the off path (ALREADY_SAID_LEDGER unset or off)', () => {
  it('gives the told-this-call note and record exactly as before', () => {
    expect(toldThisCallNote(pottery)).toBe(POTTERY_NOTE_BEFORE);
    expect('said' in toldThisCall(pottery)).toBe(false);
    process.env.ALREADY_SAID_LEDGER = 'off';
    expect(toldThisCallNote(pottery)).toBe(POTTERY_NOTE_BEFORE);
    expect(Object.keys(toldThisCall(pottery)).sort()).toEqual(
      ['askedAboutFerni', 'names', 'recentLines', 'repeated', 'selfStories'].sort()
    );
  });

  it('leaves the note unchanged on the director a live call uses', async () => {
    const director = new Director({ sessionId: 'off-path', writeNotes: false });
    await director.observe(pottery);
    expect(director.told()).toBe(POTTERY_NOTE_BEFORE);
    expect(director.told(() => true, 'Sorry, can you say that again?')).toBe(POTTERY_NOTE_BEFORE);
  });
});

describe('the ledger (ALREADY_SAID_LEDGER on)', () => {
  beforeEach(() => {
    process.env.ALREADY_SAID_LEDGER = 'on';
  });

  it('names a short line he keeps saying, which the told note alone never quotes', () => {
    const note = toldThisCallNote(pottery);
    expect(POTTERY_NOTE_BEFORE).not.toContain("That's a big step"); // the gap
    expect(ledgerOf(note)).toBe(
      `You've already said: "That's a big step.". Say it fresh or not at all.`
    );
    // The rest of the note is unchanged, and nothing it quotes is named twice.
    expect(note.startsWith(POTTERY_NOTE_BEFORE.slice(0, -1))).toBe(true);
    expect(note.match(/Thursday will be here/g)).toHaveLength(1);
  });

  it('catches a near-duplicate once case and punctuation are normalised', () => {
    const said = alreadySaid(
      sentences("That's a big step. Tell me more.", "THAT'S A BIG STEP... really.")
    );
    expect(said.repeated).toEqual(["That's a big step."]);
    expect(said.caught).toBe(true);
    // Curly apostrophes and markup are the same words too.
    const curly = alreadySaid(
      sentences('That’s a big step.', "<emphasis>That's</emphasis> a big step!")
    );
    expect(curly.repeated).toHaveLength(1);
  });

  it('never names a line said once, opener or not', () => {
    const said = alreadySaid(
      sentences(
        'Oh, that sounds lovely. Where was it?',
        'Good for you, honestly. When?',
        'Your garden sounds like a whole project, honestly.'
      )
    );
    expect(said).toEqual({ repeated: [], caught: false });
    expect(formatAlreadySaid(said)).toBe('');
  });

  it('counts a sentence said twice in one reply as one reply', () => {
    const once = alreadySaid(sentences("That's a big step. That's a big step."));
    expect(once.repeated).toEqual([]);
  });

  it('marks caught only when the newest reply repeats', () => {
    const line = "That's a big step.";
    expect(alreadySaid(sentences(line, line)).caught).toBe(true);
    expect(alreadySaid(sentences(line, line, 'Tell me about the glaze.')).caught).toBe(false);
  });

  it('lets an old line expire once it falls out of the window', () => {
    const old = "That's a big step.";
    const filler = Array.from(
      { length: ALREADY_SAID.replyWindow },
      (_, i) => `Fresh thought number ${i} here.`
    );
    // Both inside the window: named. One reply later the first has expired.
    expect(alreadySaid(sentences(old, old, ...filler.slice(2))).repeated).toEqual([old]);
    expect(alreadySaid(sentences(old, old, ...filler.slice(1))).repeated).toEqual([]);
  });

  it('names at most maxPhrases sentences, most-said first', () => {
    const lines = [
      'The kiln sounds wonderful.',
      'Glaze takes real patience.',
      'Clay remembers every thumbprint.',
      'Pottery class sounds fun.',
      'Your studio sounds cozy.',
    ];
    const twice = lines.join(' ');
    const said = alreadySaid(sentences(twice, twice, 'Your studio sounds cozy.'));
    expect(said.repeated[0]).toBe('Your studio sounds cozy.');
    const named = formatAlreadySaid(said).match(/"[^"]+"/g) ?? [];
    expect(named).toHaveLength(ALREADY_SAID.maxPhrases);
  });

  it('handles a call with nothing said yet', () => {
    expect(alreadySaid([])).toEqual({ repeated: [], caught: false });
    expect(formatAlreadySaid(alreadySaid([]))).toBe('');
    expect(toldThisCallNote([])).toBe('');
    expect(toldThisCallNote([user('hi there')])).toBe('');
  });

  it('never names a question, a number, a short confirmation or a sign-off, even said twice', () => {
    for (const line of [
      'Which glaze did your teacher pick?',
      'Their line is 13 11 14.',
      'Okay, got it.',
      'Yeah. Totally.',
      'Talk soon, take care of yourself.',
    ]) {
      expect(alreadySaid(sentences(line, line)).repeated, line).toEqual([]);
    }
  });

  it('reads only his lines: what the caller repeats is never named', () => {
    const lines = [
      user('My sister keeps the blue kettle on the stove.'),
      ferni('The kiln sounds wonderful.'),
      user('My sister keeps the blue kettle on the stove.'),
      ferni('The kiln sounds wonderful.'),
      user('My sister keeps the blue kettle on the stove.'),
    ];
    const note = toldThisCallNote(lines);
    expect(ledgerOf(note)).toContain('The kiln sounds wonderful.');
    expect(note).not.toMatch(/kettle|sister/i);
  });

  it('drops a sentence the keep filter rejects', async () => {
    const director = new Director({ sessionId: 'ledger-keep', writeNotes: false });
    await director.observe(pottery);
    expect(ledgerOf(director.told())).toContain("That's a big step."); // precondition
    expect(ledgerOf(director.told((t) => !/big step/i.test(t)))).toBe('');
  });

  it('reaches the next request on a live call', async () => {
    const sent = await liveNote(pottery, 'ledger-live', 'Anyway, how was your day?');
    expect(sent).toContain(`You've already said: "That's a big step."`);
  });

  it('skips the ledger on a turn where the caller asks him to say it again', async () => {
    for (const ask of [
      'Sorry, can you say that again?',
      'What was that?',
      'Can you repeat that?',
      "I didn't catch that.",
      'Huh?',
      'Pardon?',
      'Pardon me?',
      'Sorry?',
      'Sorry, what?',
      'Wait, what did you add?',
      'What did you say?',
    ]) {
      const sent = await liveNote(pottery, `ledger-again-${ask.length}`, ask);
      expect(sent, ask).not.toContain("You've already said");
      expect(sent, ask).toContain(POTTERY_NOTE_BEFORE); // the told note itself stays
    }
  });

  it('keeps the ledger on a turn that only sounds like an ask', async () => {
    for (const said of ["Sorry I'm late, the bus was slow.", 'What a week it has been.']) {
      const sent = await liveNote(pottery, `ledger-not-again-${said.length}`, said);
      expect(sent, said).toContain(`You've already said: "That's a big step."`);
    }
  });

  it('never names a sentence the note already quotes', () => {
    const said = { repeated: ["That's a big step."], caught: true };
    expect(formatAlreadySaid(said)).toContain("That's a big step."); // precondition
    expect(formatAlreadySaid(said, ["THAT'S a big step!"])).toBe('');
  });

  it('keeps the ledger on when replies hold ordinary numbers', () => {
    const repeat = 'Your garden sounds like a whole project.';
    for (const ordinary of ORDINARY_NUMBERS) {
      const said = alreadySaid(sentences(`${repeat} ${ordinary}`, `${ordinary} ${repeat}`));
      expect(said.repeated, ordinary).toEqual([repeat]);
      expect(said.caught, ordinary).toBe(true);
    }
  });
});

describe('crisis, safety and notice lines stay word for word (ALREADY_SAID_LEDGER on)', () => {
  beforeEach(() => {
    resetCrisisCallRisk();
    process.env.ALREADY_SAID_LEDGER = 'on';
  });

  /** Short safety and notice lines (the #3483 verify probes): none may ever be named. */
  const PROBES = [
    'You can call or text 988 any time.',
    'Please call or text the lifeline.',
    'Are you safe right now?',
    "I'm worried about you.",
    "I'm really worried about you right now.",
    'Text HOME to 741741.',
    'Is anyone there with you tonight?',
    'Have you taken anything tonight?',
    'Would you be willing to talk to someone tonight?',
    'Is there someone you can call right now?',
    "You don't have to go through this alone.",
    "I'm really glad you told me.",
    'Your life matters to me.',
    'Can you put the bottle down for me?',
    'Can you step away from the edge?',
    'Can you tell me where you are right now?',
    'I want you to stay with me.',
    'Please stay on the line with me.',
    'Please reach out to a trusted adult.',
    'Please call 999 right now.',
    'Call 112 right now, please.',
    'Text SHOUT to 85258.',
    'Can you get somewhere with other people?',
    'Can you call your sister right now?',
    'Let me get you some help.',
    'I hear you, and I believe you.',
    "That sounds like so much pain. I'm glad you told me.",
    "I'm here. You don't have to face this alone.",
    'You deserve to feel safe.',
    'Nobody should put their hands on you.',
    'Is the person who hurt you still there?',
    'Lock the door and stay inside.',
    'Do you need me to call someone?',
    "Just so you know, I'm an AI, not a real person.",
    "We've been talking a while, so a quick reminder, I'm an AI, not a person.",
    "I'm an AI.",
    "Hey, it's Ferni, Sam's AI friend.",
    "Remember, I'm AI, not human.",
    "Quick reminder that I'm a bot.",
    'I keep only a short summary of this call.',
    "I won't keep anything from this call.",
    'Nothing from this call is shared.',
    "I'll remember the highlights, not the details.",
    "I can't give medical advice, but your doctor can.",
    "I'm not a doctor, so check with your physician.",
    'This is not legal advice.',
    "I'm not a lawyer, just so you know.",
    'This call may be recorded.',
    'I need your okay before I save that.',
  ];
  /** Round-2 probes: help by name or in words, emergency services, means, grounding, notices. */
  const PROBES_2 = [
    'Call nine one one now.',
    'Text nine eight eight.',
    'Ring nine nine nine now.',
    'Call triple zero.',
    'Call one one two.',
    'Call the police now.',
    'Get to the ER.',
    'Go to the nearest A&E.',
    'An ambulance is on the way.',
    'The paramedics will help you.',
    'Put the knife away.',
    'Move away from the window.',
    'Step back from the bridge.',
    'Put it away somewhere else.',
    'Breathe in slowly with me.',
    'Take a slow breath with me.',
    'Samaritans are there to listen.',
    'Childline is free to call.',
    'Shout is there by text, day or night.',
    'This conversation is being logged.',
    'This chat gets transcribed.',
  ];
  const calm = ['I had a rough week.', 'It is just a lot.', 'I do not know.', 'Yeah.'];
  const shapes = (p: string): Record<string, Line[]> => ({
    opener: [
      user(calm[0]),
      ferni(`${p} Take your time.`),
      user(calm[1]),
      ferni(`${p} I'm listening.`),
      user(calm[2]),
      ferni(`${p} Okay.`),
      user(calm[3]),
    ],
    middle: [
      user(calm[0]),
      ferni(`Okay, I hear that. ${p} Take your time.`),
      user(calm[1]),
      ferni(`Mm, that is heavy. ${p} I'm listening.`),
      user(calm[2]),
    ],
    once: [user(calm[0]), ferni(`${p} Take your time with it.`), user(calm[1])],
  });

  it('pins all 70 probes: on, the note is exactly the off note, in every shape', async () => {
    expect(PROBES).toHaveLength(49);
    expect(PROBES_2).toHaveLength(21);
    const named: string[] = [];
    const notes = async (lines: Line[], flag: string, id: string): Promise<string[]> => {
      process.env.ALREADY_SAID_LEDGER = flag;
      const director = new Director({ sessionId: id, writeNotes: false });
      await director.observe(lines);
      return [toldThisCallNote(lines), director.told()];
    };
    for (const [i, p] of [...PROBES, ...PROBES_2].entries()) {
      for (const [shape, lines] of Object.entries(shapes(p))) {
        const off = await notes(lines, 'off', `probe-${i}-${shape}-off`);
        const on = await notes(lines, 'on', `probe-${i}-${shape}-on`);
        if (on.join('|') !== off.join('|') || on.some(ledgerOf)) named.push(`${shape}: ${p}`);
      }
    }
    expect(named).toEqual([]);
  });

  it('never names a probe in the ledger alone, said once, twice or three times', () => {
    const named: string[] = [];
    for (const p of [...PROBES, ...PROBES_2]) {
      const own = new Set(p.split(/(?<=[.!?])\s+/).map(normalized));
      for (const times of [1, 2, 3]) {
        for (const reply of [p, `Okay, I hear that. ${p} Take your time.`]) {
          const said = alreadySaid(sentences(...Array.from({ length: times }, () => reply)));
          if (said.repeated.some((s) => own.has(normalized(s)))) named.push(`${times}x: ${p}`);
        }
      }
    }
    expect(named).toEqual([]);
  });

  it('drops the whole window when any reply in it touches safety or a number to call', () => {
    const repeat = 'Your garden sounds like a whole project.';
    expect(alreadySaid(sentences(repeat, repeat)).repeated).toEqual([repeat]); // precondition
    for (const touch of [
      'Are you somewhere safe right now?',
      'Please call 988.',
      'You can ring 999.',
      'Call 112 if you need to.',
      'Dial 000.',
      'You can ring 111 for advice.',
      'Text SHOUT to 85258.',
      'Samaritans are on 116 123.',
      'Lifeline is 13 11 14.',
      'Call nine one one now.',
      'Get to the ER.',
      'Samaritans are there to listen.',
    ]) {
      const said = alreadySaid(sentences(`${repeat} ${touch}`, repeat, 'Tell me more.'));
      expect(said.repeated, touch).toEqual([]);
      expect(said.caught, touch).toBe(false);
    }
  });

  it('drops the whole ledger from the note once the call has crisis risk noted', async () => {
    const director = new Director({ sessionId: 'ledger-crisis', writeNotes: false });
    await director.observe(pottery);
    expect(director.told()).toContain("You've already said"); // precondition
    noteCrisisRisk('ledger-crisis');
    expect(director.told()).not.toContain("You've already said");
  });
});
