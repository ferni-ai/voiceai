/**
 * ALREADY_SAID_LEDGER: Ferni's own openers and the sentences he has said word
 * for word reach the next request, so he doesn't say them again. Off, the
 * told-this-call note is byte for byte what it was. All lines are fictional.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';

import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { installDirectorNotes } from '../../multi-agent/turn-observers.js';
import { ALREADY_SAID, alreadySaid, formatAlreadySaid } from '../already-said.js';
import { Director, getDirector, setDirector, type Line } from '../director-notes.js';
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
  });
});

describe('the ledger (ALREADY_SAID_LEDGER on)', () => {
  beforeEach(() => {
    process.env.ALREADY_SAID_LEDGER = 'on';
  });

  it('names a short line he keeps saying, which the told note alone never quotes', () => {
    const note = toldThisCallNote(pottery);
    expect(POTTERY_NOTE_BEFORE).not.toContain("That's a big step"); // the gap
    expect(note).toContain(`You've already said: "That's a big step."`);
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

  it('lists his recent openers before he repeats one, newest first', () => {
    const said = alreadySaid(
      sentences('Oh, that sounds lovely. Where was it?', 'Good for you, honestly. When?')
    );
    expect(said.repeated).toEqual([]);
    expect(said.caught).toBe(false);
    expect(said.openers).toEqual(['Good for you, honestly.', 'Oh, that sounds lovely.']);
    expect(formatAlreadySaid(said)).toBe(
      `You've already said: "Good for you, honestly."; "Oh, that sounds lovely.". Open differently, and don't say them again.`
    );
  });

  it('lets an old line expire once it falls out of the window', () => {
    const old = "That's a big step.";
    const filler = Array.from(
      { length: ALREADY_SAID.replyWindow },
      (_, i) => `Fresh opener number ${i} here.`
    );
    // Both inside the window: named. One reply later the first has expired: not repeated.
    expect(alreadySaid(sentences(old, old, ...filler.slice(2))).repeated).toEqual([old]);
    expect(alreadySaid(sentences(old, old, ...filler.slice(1))).repeated).toEqual([]);
    // A whole window later neither is named, not even as an opener.
    const expired = alreadySaid(sentences(old, old, ...filler));
    expect(expired.repeated).toEqual([]);
    expect(expired.openers).not.toContain(old);
    expect(expired.openers).toHaveLength(ALREADY_SAID.replyWindow);
  });

  it('handles a call with nothing said yet', () => {
    expect(alreadySaid([])).toEqual({ repeated: [], openers: [], caught: false });
    expect(formatAlreadySaid(alreadySaid([]))).toBe('');
    expect(toldThisCallNote([])).toBe('');
    expect(toldThisCallNote([user('hi there')])).toBe('');
  });

  it('never names a line too short to be a habit', () => {
    expect(alreadySaid(sentences('Yeah. Totally.', 'Yeah. Totally.'))).toEqual({
      repeated: [],
      openers: [],
      caught: false,
    });
  });

  it('reaches the next request on a live call', async () => {
    const handlers: Array<(ev: unknown) => void> = [];
    const session = {
      userData: { services: { sessionId: 'ledger-live' } },
      on: (_e: string, h: (ev: unknown) => void) => handlers.push(h),
      off: () => {},
    };
    const items: Array<{ type: string; role: string; textContent: string }> = [];
    await installDirectorNotes({
      session: session as never,
      sessionId: 'ledger-live',
      userName: undefined,
      agent: { chatCtx: { items } },
      cleanupFunctions: [],
    });
    expect(getDirector(session)).toBeDefined();
    for (const l of pottery)
      items.push({
        type: 'message',
        role: l.speaker === 'ferni' ? 'assistant' : 'user',
        textContent: l.text,
      });
    handlers.forEach((h) => h({ newState: 'speaking' }));
    handlers.forEach((h) => h({ newState: 'listening' }));
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'Anyway, how was your day?' });
    const sent = (withTurnReminder(ctx, session).items.at(-1) as llm.ChatMessage).textContent;
    expect(sent).toContain(`You've already said: "That's a big step."`);
    setDirector(session, null);
  });
});

describe('crisis, safety and notice lines stay word for word (ALREADY_SAID_LEDGER on)', () => {
  beforeEach(() => {
    resetCrisisCallRisk();
    process.env.ALREADY_SAID_LEDGER = 'on';
  });

  const SAFE = 'Are you somewhere safe right now?';
  const LINE_988 = 'You can call or text 988 any time, day or night.';
  const NOTICE = "Just so you know, I'm an AI, not a real person.";

  it('never lists a safety question, a 988 line or a notice, even said twice', () => {
    for (const line of [SAFE, LINE_988, NOTICE]) {
      const said = alreadySaid(sentences(`${line} I'm here.`, `${line} Take your time.`));
      expect([...said.repeated, ...said.openers], line).toEqual([]);
      expect(said.caught, line).toBe(false);
    }
  });

  it('keeps a reply with a crisis resource out of the ledger entirely', () => {
    const said = alreadySaid(
      sentences(
        'Your garden sounds like a whole project. Please call 988.',
        'Your garden sounds like a whole project.'
      )
    );
    expect(said.repeated).toEqual([]);
    expect(said.openers).toEqual(['Your garden sounds like a whole project.']);
  });

  it('drops the whole ledger from the note once the call has crisis risk noted', async () => {
    const director = new Director({ sessionId: 'ledger-crisis', writeNotes: false });
    await director.observe(pottery);
    expect(director.told()).toContain("You've already said"); // precondition
    noteCrisisRisk('ledger-crisis');
    expect(director.told()).not.toContain("You've already said");
  });
});
