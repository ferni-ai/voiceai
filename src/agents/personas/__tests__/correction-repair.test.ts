import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCrisisGuidance, detectCrisis } from '../../safety/crisis-guard.js';
import { isCorrection } from '../correction-repair.js';
import { gatedReply } from '../crisis-gate.js';
import { withTurnReminder } from '../turn-request.js';

/** Seth's prod call 2026-10-11: Ferni's wrong clock, then where Ferni put him. */
const CLOCK = 'Yeah, five am on a Sunday. My body just does not believe in sleeping in anymore.';
const DUBLIN = 'Dublin has that kind of grit to it, with the river right through the middle.';

function call(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

/** What the model is sent after the caller's words: the per-turn reminder. */
const sent = (ctx: llm.ChatContext, session: object): string =>
  (withTurnReminder(ctx, session).items.at(-1) as llm.ChatMessage).textContent ?? '';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCorrection', () => {
  it.each([
    ["No, it's two in the morning here, not five.", CLOCK],
    ['No, it is 2am.', CLOCK],
    ["No, it's two.", CLOCK],
    ['No, it was Saturday.', CLOCK],
    ["That's not true, it's Saturday.", CLOCK],
    ["That's not what I said. I said I'm going to Galway, not Dublin.", DUBLIN],
    ['Galway, not Dublin.', DUBLIN],
    ['I never said that.', 'So the trip is off.'],
    ['You misheard me, I said Galway.', DUBLIN],
  ])('takes "%s" as correcting Ferni', (said, ferni) => {
    expect(isCorrection(said, [ferni])).toBe(true);
  });

  it.each([
    ['No, that one.', CLOCK], // "one" is no time
    ['No, I have 3 kids.', CLOCK], // nor is a count
    ['No, it is five am.', CLOCK], // the same time he gave
    ['Not really.', DUBLIN],
    ['Not really.', 'That was a really good movie.'], // a hedge, even when he said the word
    ["No, it's 5 o'clock.", CLOCK], // "5" is the "five" he gave
    ['No, not bad, just long.', 'Bad day?'], // answering a question
    ['No, I have not been there.', 'Have you been to Ireland?'],
    ["No, I'm good.", 'Want another coffee?'],
    ['My boss yelled at me. That is not right.', CLOCK], // disputing someone else
    ['Right. Why are you saying that?', CLOCK],
    ['You took a wrong turn.', 'My fault, I took a wrong turn there.'],
  ])('does not take "%s" as a correction', (said, ferni) => {
    expect(isCorrection(said, [ferni])).toBe(false);
  });
});

describe('the correction notes on the reply request (withTurnReminder)', () => {
  const CORRECTED = call(
    ['assistant', CLOCK],
    ['user', "No, it's two in the morning here, not five."]
  );

  it('reach the request only with REPAIR_MODE=on', () => {
    vi.stubEnv('REPAIR_MODE', '');
    expect(sent(CORRECTED, {})).not.toContain('corrected you');
    vi.stubEnv('REPAIR_MODE', 'on');
    const text = sent(CORRECTED, {});
    expect(text).toContain(
      'They just corrected you ("No, it\'s two in the morning here, not five."). Own it in one short line'
    );
    expect(text).not.toContain('Earlier on this call');
  });

  it('owns nothing when nothing was corrected', () => {
    vi.stubEnv('REPAIR_MODE', 'on');
    expect(
      sent(call(['assistant', 'Want another coffee?'], ['user', "No, I'm good."]), {})
    ).not.toContain('corrected you');
  });

  it('keeps the correction for the rest of the call, once, the latest first', () => {
    vi.stubEnv('REPAIR_MODE', 'on');
    const session = {};
    const later = call(
      ['assistant', CLOCK],
      ['user', "No, it's two in the morning here, not five."],
      ['assistant', 'Ah, my mistake. Two it is.'],
      ['user', 'Anyway, what are you up to?']
    );
    expect(sent(later, session)).not.toContain('corrected you'); // nothing carried yet
    // The preemptive request saw only the first words; the final one all of them.
    sent(call(['assistant', CLOCK], ['user', "No, it's two"]), session);
    sent(CORRECTED, session);
    sent(CORRECTED, session);
    expect(sent(later, session)).toContain(
      'Earlier on this call they corrected you ("No, it\'s two in the morning here, not five."): go by what they said'
    );
    expect(sent(later, session)).not.toContain('They just corrected you');

    sent(call(['assistant', DUBLIN], ['user', 'Galway, not Dublin.']), session);
    expect(sent(later, session)).toContain(
      '("Galway, not Dublin."; "No, it\'s two in the morning here, not five.")'
    );
  });

  it('carries at most three', () => {
    vi.stubEnv('REPAIR_MODE', 'on');
    const session = {};
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday'])
      sent(call(['assistant', 'It is Sunday.'], ['user', `No, it's ${day}.`]), session);
    const text = sent(call(['assistant', 'Okay.'], ['user', 'So anyway.']), session);
    expect(text).toContain('("No, it\'s Thursday."; "No, it\'s Wednesday."; "No, it\'s Tuesday.")');
    expect(text).not.toContain('Monday');
  });

  it('stays out of a reply with crisis guidance, and is not kept from it', async () => {
    vi.stubEnv('REPAIR_MODE', 'on');
    const session = { userData: undefined };
    const asked: llm.ChatContext[] = [];
    const model = async (ctx: llm.ChatContext) => {
      asked.push(ctx);
      return new ReadableStream<string>({
        start: (c) => {
          c.enqueue('ok');
          c.close();
        },
      });
    };
    const hard = "No, it's two in the morning, not five. I hope I don't wake up tomorrow.";
    await gatedReply(
      call(['assistant', CLOCK], ['user', hard]),
      session,
      model as never,
      {
        wrap: (s: ReadableStream<unknown>) => s,
      } as never,
      { env: { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' } }
    );
    const guided = (asked.at(-1)?.items.at(-1) as llm.ChatMessage).textContent ?? '';
    expect(guided).toContain(buildCrisisGuidance(detectCrisis(hard)));
    expect(guided).not.toContain('corrected you');
    expect(sent(call(['assistant', 'I am here.'], ['user', 'Okay.']), session)).not.toContain(
      'corrected you'
    );
  });
});
