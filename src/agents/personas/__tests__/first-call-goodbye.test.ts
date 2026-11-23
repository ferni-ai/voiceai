/**
 * #4287: the first-call goodbye note asked every persona for "tell me how X goes"
 * and quoted one, so all six closed alike, and on a call with no plan one invented
 * the topic of his own question. FIRST_CALL_GOODBYE_GROUNDED=on grounds it in the
 * caller's own words; off, the note is unchanged.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FIRST_GOODBYE_NOTE, FIRST_GOODBYE_PLAIN, firstCallNote } from '../first-call-rapport.js';
import { withTurnReminder } from '../turn-request.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const OFF = { FIRST_CALL_RAPPORT: 'on' };
const ON = { FIRST_CALL_RAPPORT: 'on', FIRST_CALL_GOODBYE_GROUNDED: 'on' };
const firstCall = { userData: { userId: 'u1', isReturningUser: false } };
const BYE = 'Ha, okay. Thanks, this was fun. I gotta go, bye.';
/** The grounded notes, as the model reads them (first-call-goodbye.ts). */
const WARM =
  /^They're heading off\. .*Just a plain, warm goodbye: don't ask them to tell you how anything goes/;
const callback = (plan: string): string =>
  `They told you about one thing coming up (their words: "${plan}")`;

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

const withPlan = chat(
  ['agent', 'Hey, how is your evening going?'],
  ['user', "Good. I'm having dinner with my sister tonight, first time in months."],
  ['agent', 'That sounds lovely.'],
  ['user', BYE]
);

describe('flag off: the goodbye note is unchanged', () => {
  it('is the exact current text, callback demand and quoted example included', () => {
    const note = firstCallNote(noPlan, firstCall, BYE, OFF);
    expect(note).toBe(FIRST_GOODBYE_NOTE);
    expect(note).toBe(
      'They\'re heading off. Keep the goodbye to one or two short sentences, by name if you know it, and name one specific thing they told you that you\'d like to hear about next time ("tell me how the interview goes"). No question, and no pitch for the app.'
    );
    expect(firstCallNote(withPlan, firstCall, BYE, OFF)).toBe(FIRST_GOODBYE_NOTE);
  });

  it('SCRIPT_FREE_REMINDER still gets the plain version', () => {
    expect(firstCallNote(noPlan, firstCall, BYE, OFF, true)).toBe(FIRST_GOODBYE_PLAIN);
  });
});

describe('flag on: a callback only on a plan the caller told us', () => {
  it('no plan on the call: a plain warm goodbye, no tell-me-how-it-goes, no invented topic', () => {
    const note = firstCallNote(noPlan, firstCall, BYE, ON);
    expect(note).toMatch(WARM);
    expect(note).not.toContain('next time');
    expect(note).not.toContain('their words');
    expect(note).not.toMatch(/tell me how|interview|big change/i);
    expect(note).toMatch(/plain, warm goodbye/);
    expect(note).toMatch(/don't ask them to tell you how anything goes/);
  });

  it('the plan they named, in their words, is the only thing it may reference', () => {
    const note = firstCallNote(withPlan, firstCall, BYE, ON);
    expect(note).toContain(callback('dinner with my sister'));
    expect(note).toMatch(/hear how that goes next time/);
    expect(note).toMatch(/mention nothing else they didn't tell you/);
    expect(note).not.toMatch(/interview|"tell me how/i);
  });

  it('a plan they turned down is not one', () => {
    const declined = chat(
      ['agent', 'Doing anything tonight?'],
      ['user', "No, I'm not having dinner with my sister after all."],
      ['user', BYE]
    );
    expect(firstCallNote(declined, firstCall, BYE, ON)).toMatch(WARM);
  });

  it('reads the goodbye line itself when the context does not hold it yet', () => {
    const said = "I'm meeting my brother for coffee, gotta go. Bye!";
    const ctx = chat(['agent', 'Hey.'], ['user', 'Hi.']);
    expect(firstCallNote(ctx, firstCall, said, ON)).toContain(
      callback('meeting my brother for coffee')
    );
  });

  it('held turns still get no goodbye note', () => {
    expect(firstCallNote(withPlan, firstCall, BYE, ON, false, { exitsHeld: true })).toBe('');
    expect(firstCallNote(withPlan, firstCall, BYE, ON, false, { crisis: true })).toBe('');
  });

  it('no em dash, ellipsis or quoted line to copy in either note', () => {
    for (const note of [noPlan, withPlan].map((c) => firstCallNote(c, firstCall, BYE, ON))) {
      expect(note).not.toMatch(/[—…]|\.\.\./);
      expect(note).not.toMatch(/\("/);
    }
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
    expect(sent(noPlan)).not.toMatch(/Just a plain, warm goodbye/);
    vi.stubEnv('FIRST_CALL_GOODBYE_GROUNDED', 'on');
    expect(sent(noPlan)).toMatch(/Just a plain, warm goodbye/);
    expect(sent(noPlan)).not.toContain(FIRST_GOODBYE_NOTE);
    expect(sent(withPlan)).toContain(callback('dinner with my sister'));
  });
});
