/**
 * #4287: the first-call goodbye note asked every persona for "tell me how X goes"
 * and quoted one, so all six closed alike, and on a call with no plan one invented
 * the topic of his own question. FIRST_CALL_GOODBYE_GROUNDED=on lets the model
 * judge from the call (no word list gates it), gives a heavy call a plain gentle
 * goodbye, and keeps HAPPY_EXITS from contradicting it; off, nothing changes.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

const forgotten = vi.hoisted(() => new Map<string, string[]>());
vi.mock('../../../memory/index.js', async (actual) => ({
  ...(await actual<typeof import('../../../memory/index.js')>()),
  forgottenInProcess: (userId: string) => forgotten.get(userId) ?? [],
}));

import { FIRST_GOODBYE_NOTE, FIRST_GOODBYE_PLAIN, firstCallNote } from '../first-call-rapport.js';
import { happyExitFor, happyExitNote } from '../happy-exits.js';
import { withTurnReminder } from '../turn-request.js';

afterEach(() => {
  vi.unstubAllEnvs();
  forgotten.clear();
});

const OFF = { FIRST_CALL_RAPPORT: 'on' };
const ON = { FIRST_CALL_RAPPORT: 'on', FIRST_CALL_GOODBYE_GROUNDED: 'on' };
const firstCall = { userData: { userId: 'u_synthetic_1', isReturningUser: false } };
const BYE = 'Okay, thanks, this was fun. I gotta go, bye.';

/** The grounded notes, as the model reads them (first-call-goodbye.ts). */
const JUDGED =
  /Only if they told you about something coming up for them, you may say in your own words that you'd like to hear how it goes next time\. Something you asked them about is not something they told you\./;
const NEVER_INVENT =
  /If they told you of nothing coming up, just a plain, warm goodbye, and never make one up\./;
const HEAVY =
  /it has been a heavy call\. A gentle, plain goodbye .*nothing to hear about next time/;
/** Nothing of theirs is quoted for the model to repeat. */
const QUOTED = /their words|"/;
/** HAPPY_EXITS's simple line, which would contradict a callback. */
const NOTHING_NEXT = 'nothing about what they are doing next';

function chat(...lines: Array<['agent' | 'user', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const [who, text] of lines)
    ctx.addMessage({ role: who === 'agent' ? 'assistant' : 'user', content: text });
  return ctx;
}

/** The rt-1122-nayan-bad-at shape: the big change is in his question, never in theirs. */
const noPlan = chat(
  ['agent', "Hey, I'm Nayan. What should I call you?"],
  ['user', "I'm Dana. Just bored, honestly."],
  ['agent', 'Fair. Any big changes coming up for you this year?'],
  ['user', BYE]
);
const interview = chat(
  ['agent', 'Hey, how is your week going?'],
  ['user', "I have a job interview Friday and I'm nervous."],
  ['agent', 'That makes sense. What is the job?'],
  ['user', BYE]
);
const hospice = chat(
  ['agent', 'Hey, how are you doing tonight?'],
  ['user', "My dad's in hospice. I'm seeing my dad tonight, maybe the last time."],
  ['agent', 'I am so sorry. I am glad you get to be with him.'],
  ['user', BYE]
);
const sistersPoint = chat(
  ['agent', 'So what did you two argue about?'],
  ['user', "I'm seeing my sister's point now, yeah."],
  ['user', BYE]
);

describe('flag off: the goodbye note is unchanged', () => {
  it('is the exact current text, callback demand and quoted example included', () => {
    const note = firstCallNote(noPlan, firstCall, BYE, OFF);
    expect(note).toBe(FIRST_GOODBYE_NOTE);
    expect(note).toBe(
      'They\'re heading off. Keep the goodbye to one or two short sentences, by name if you know it, and name one specific thing they told you that you\'d like to hear about next time ("tell me how the interview goes"). No question, and no pitch for the app.'
    );
    for (const ctx of [interview, hospice, sistersPoint])
      expect(firstCallNote(ctx, firstCall, BYE, OFF)).toBe(FIRST_GOODBYE_NOTE);
  });

  it('SCRIPT_FREE_REMINDER still gets the plain version', () => {
    expect(firstCallNote(noPlan, firstCall, BYE, OFF, true)).toBe(FIRST_GOODBYE_PLAIN);
  });
});

describe('flag on: the model judges from the call', () => {
  it('no plan on the call: a callback only if they told one, never invented', () => {
    const note = firstCallNote(noPlan, firstCall, BYE, ON);
    expect(note).toMatch(JUDGED);
    expect(note).toMatch(NEVER_INVENT);
    expect(note).not.toMatch(QUOTED);
    expect(note).not.toMatch(/big change|interview|"tell me how/i);
  });

  it('an interview Friday keeps its callback: the note allows one (no detector gates it)', () => {
    const note = firstCallNote(interview, firstCall, BYE, ON);
    expect(note).toMatch(JUDGED);
    expect(note).not.toMatch(HEAVY);
    expect(note).not.toMatch(/don't ask them to tell you how/);
  });

  it('a heavy call (hospice) gets a gentle plain goodbye, nothing to hear about next time', () => {
    const note = firstCallNote(hospice, firstCall, BYE, ON);
    expect(note).toMatch(HEAVY);
    expect(note).not.toMatch(JUDGED);
    expect(note).not.toMatch(/hospice|tonight/i);
  });

  it('"seeing my sister\'s point" is no plan: no hint, nothing named', () => {
    const note = firstCallNote(sistersPoint, firstCall, BYE, ON);
    expect(note).toMatch(NEVER_INVENT);
    expect(note).not.toMatch(QUOTED);
    expect(note).not.toMatch(/sister/i);
  });

  it('a topic forgotten on this call: bring up nothing forgotten, without naming it', () => {
    expect(firstCallNote(interview, firstCall, BYE, ON)).not.toMatch(/forget/);
    forgotten.set('u_synthetic_1', ['interview']);
    const note = firstCallNote(interview, firstCall, BYE, ON);
    expect(note).toMatch(/Bring up nothing they asked you to forget\./);
    expect(note).not.toMatch(/interview/i);
  });

  it('reads the goodbye line itself when the context does not hold it yet', () => {
    const said = "My dad's in hospice, I have to go. Bye.";
    const ctx = chat(['agent', 'Hey.'], ['user', 'Hi.']);
    expect(firstCallNote(ctx, firstCall, said, ON)).toMatch(HEAVY);
  });

  it('held turns still get no goodbye note', () => {
    expect(firstCallNote(interview, firstCall, BYE, ON, false, { exitsHeld: true })).toBe('');
    expect(firstCallNote(interview, firstCall, BYE, ON, false, { crisis: true })).toBe('');
  });

  it('no em dash, ellipsis or quoted line to copy', () => {
    for (const ctx of [noPlan, interview, hospice]) {
      const note = firstCallNote(ctx, firstCall, BYE, ON);
      expect(note).not.toMatch(/[—…]|\.\.\./);
      expect(note).not.toMatch(QUOTED);
    }
  });
});

describe('with HAPPY_EXITS on, the grounded first-call note decides what is next', () => {
  const PLAIN = ['Hey. Just wanted to say hi.', BYE];
  const input = (callerTurns: string[]) => ({
    said: callerTurns[callerTurns.length - 1],
    callerTurns,
    careful: false,
    rng: () => 0.99,
  });
  const HAPPY = { ...ON, HAPPY_EXITS: 'on' };

  it('a first call: the warm exit without "nothing about what they are doing next"', () => {
    const note = happyExitNote(firstCall, input(PLAIN), HAPPY);
    expect(note).toMatch(/let them go happily/);
    expect(note).not.toContain(NOTHING_NEXT);
  });

  it('unchanged with the flag off, without FIRST_CALL_RAPPORT, or on a returning call', () => {
    const returning = { userData: { userId: 'u_synthetic_1', isReturningUser: true } };
    const noRapport = { HAPPY_EXITS: 'on', FIRST_CALL_GOODBYE_GROUNDED: 'on' };
    expect(happyExitNote(firstCall, input(PLAIN), { ...OFF, HAPPY_EXITS: 'on' })).toContain(
      NOTHING_NEXT
    );
    expect(happyExitNote(firstCall, input(PLAIN), noRapport)).toContain(NOTHING_NEXT);
    expect(happyExitNote(returning, input(PLAIN), HAPPY)).toContain(NOTHING_NEXT);
  });

  it("a heavy first call still gets HAPPY_EXITS's heavy goodbye, and a plan is still kept", () => {
    const heavy = happyExitFor(
      { ...input(["My dad's in the hospital.", BYE]), firstCallGrounded: true },
      HAPPY
    );
    expect(heavy.fired).toBe('heavy');
    const planned = happyExitFor(
      { ...input(["I'm having dinner with my sister tonight.", BYE]), firstCallGrounded: true },
      HAPPY
    );
    expect(planned.plan).toBe('dinner with my sister');
    expect(planned.note).not.toMatch(/dinner/);
  });
});

describe('the live request path (withTurnReminder)', () => {
  const session = {
    userData: { ...firstCall.userData, services: { sessionId: 'first-call-goodbye' } },
  };
  const sent = (ctx: llm.ChatContext): string => {
    const last = withTurnReminder(ctx, session).items.at(-1);
    return last?.type === 'message' ? (last.textContent ?? '') : '';
  };

  it('carries the old note with the flag off and the grounded one with it on', () => {
    vi.stubEnv('FIRST_CALL_RAPPORT', 'on');
    vi.stubEnv('FIRST_CALL_GOODBYE_GROUNDED', '');
    expect(sent(noPlan)).toContain(FIRST_GOODBYE_NOTE);
    expect(sent(noPlan)).not.toMatch(JUDGED);
    vi.stubEnv('FIRST_CALL_GOODBYE_GROUNDED', 'on');
    expect(sent(noPlan)).toMatch(JUDGED);
    expect(sent(noPlan)).not.toContain(FIRST_GOODBYE_NOTE);
    expect(sent(hospice)).toMatch(HEAVY);
  });

  it('with HAPPY_EXITS on too, the request has no line contradicting the callback', () => {
    vi.stubEnv('FIRST_CALL_RAPPORT', 'on');
    vi.stubEnv('HAPPY_EXITS', 'on');
    vi.stubEnv('FIRST_CALL_GOODBYE_GROUNDED', '');
    expect(sent(interview)).toContain(NOTHING_NEXT);
    vi.stubEnv('FIRST_CALL_GOODBYE_GROUNDED', 'on');
    const text = sent(interview);
    expect(text).toMatch(JUDGED);
    expect(text).toMatch(/let them go happily/);
    expect(text).not.toContain(NOTHING_NEXT);
  });
});
