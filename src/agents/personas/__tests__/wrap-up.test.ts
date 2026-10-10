import { afterEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { installDirectorNotes } from '../../multi-agent/turn-observers.js';
import { gatedReply } from '../crisis-gate.js';
import type { Line } from '../director-notes.js';
import type { UnderstandFn } from '../turn-understanding.js';
import { getWrapUp, parseDecided, setWrapUp, signingOff, WrapUp } from '../wrap-up.js';

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };

const LANDLORD = JSON.stringify({
  items: [
    { who: 'caller', what: 'call the landlord', when: 'tomorrow' },
    { who: 'ferni', what: 'check in', when: 'Thursday' },
  ],
  heavy: false,
});
const NOTHING = JSON.stringify({ items: [], heavy: false });

const CALLER_PLAN = "Yeah. Okay, I'll call him tomorrow morning.";
const FERNI_PLAN = "Good. I'll check in Thursday and see how it went.";
const PLAN_CALL: Line[] = [
  { speaker: 'user', text: "The heater's been out for a week and he won't answer my texts." },
  { speaker: 'ferni', text: 'A week? Ugh. Would a call land better than another text?' },
  { speaker: 'user', text: CALLER_PLAN },
  { speaker: 'ferni', text: FERNI_PLAN },
];

/** A model that answers `reply`, counting how often it is asked. */
function deciding(reply: string) {
  return vi.fn<UnderstandFn>(async () => reply);
}

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

const passThrough = { wrap: (stream: ReadableStream<unknown>) => stream };

/** What the reply model was asked for this caller turn, through the live reply path. */
async function askedFor(session: object, said: string): Promise<string> {
  const model = vi.fn(
    async (_ctx: llm.ChatContext) =>
      new ReadableStream<unknown>({
        start: (c) => {
          c.enqueue('ok');
          c.close();
        },
      })
  );
  const ctx = request(['user', CALLER_PLAN], ['assistant', FERNI_PLAN], ['user', said]);
  await gatedReply(ctx, session as never, model as never, passThrough as never, {
    env: PATTERNS_ONLY,
  });
  expect(model).toHaveBeenCalledTimes(1);
  const sent = model.mock.calls[0]?.[0].items.at(-1) as llm.ChatMessage | undefined;
  return sent?.textContent ?? '';
}

const sessions: object[] = [];
function callWith(decide: UnderstandFn): { session: object; wrapUp: WrapUp } {
  const session = { userData: undefined };
  const wrapUp = new WrapUp(decide);
  setWrapUp(session, wrapUp);
  sessions.push(session);
  return { session, wrapUp };
}

afterEach(() => {
  for (const s of sessions.splice(0)) setWrapUp(s, null);
});

describe('signingOff', () => {
  it('hears the caller wrapping up', () => {
    for (const said of [
      'Okay, I gotta go. Bye!',
      'Alright, talk soon.',
      "I'll let you go.",
      'I should probably run.',
      'Good night, Ferni.',
    ])
      expect(signingOff(said), said).toBe(true);
  });

  it('does not take a plan with "go" in it for a goodbye', () => {
    for (const said of [
      'I need to go to the dentist tomorrow.',
      'I have to go get the kids at three.',
      'Maybe I should go back to school.',
      "We're going to Denver.",
    ])
      expect(signingOff(said), said).toBe(false);
  });
});

describe('parseDecided', () => {
  it('keeps well-formed items and drops the rest', () => {
    const parsed = parseDecided(
      JSON.stringify({
        items: [
          { who: 'caller', what: 'call the landlord.', when: 'tomorrow' },
          { who: 'someone', what: 'x', when: null },
          { who: 'ferni', what: 'one two three four five six seven eight nine ten eleven' },
          { who: 'ferni', what: 'check in', when: '' },
        ],
        heavy: true,
      })
    );
    expect(parsed).toEqual({
      items: [
        { who: 'caller', what: 'call the landlord', when: 'tomorrow', detail: null },
        { who: 'ferni', what: 'check in', when: null, detail: null },
      ],
      heavy: true,
    });
    expect(parseDecided('not json')).toBeNull();
    expect(parseDecided('{"heavy":false}')).toBeNull();
  });
});

describe('wrap-up through the reply path (gatedReply)', () => {
  it('closes the loop in the goodbye after something was decided', async () => {
    const { session, wrapUp } = callWith(deciding(LANDLORD));
    expect(await askedFor(session, 'Okay, I gotta go. Bye!')).not.toContain('Wrapping up');
    await wrapUp.observe(PLAN_CALL);
    const asked = await askedFor(session, 'Okay, I gotta go. Bye!');
    expect(asked).toContain('Wrapping up');
    expect(asked).toContain("they'll call the landlord tomorrow");
    expect(asked).toContain("you said you'd check in Thursday");
    expect(asked).toContain('Not a list, not a recap');
  });

  it('adds no goodbye note when only the recap text reads the call', async () => {
    const session = { userData: undefined };
    const wrapUp = new WrapUp(deciding(LANDLORD), undefined, false);
    setWrapUp(session, wrapUp);
    sessions.push(session);
    await wrapUp.observe(PLAN_CALL);
    expect(wrapUp.reading().items).toHaveLength(2);
    expect(await askedFor(session, 'Okay, I gotta go. Bye!')).not.toContain('Wrapping up');
  });

  it('adds nothing mid-call, only when they sign off', async () => {
    const { session, wrapUp } = callWith(deciding(LANDLORD));
    await wrapUp.observe(PLAN_CALL);
    expect(await askedFor(session, 'What should I say to him?')).not.toContain('Wrapping up');
  });

  it('adds nothing on a call where nothing was decided', async () => {
    const { session, wrapUp } = callWith(deciding(NOTHING));
    await wrapUp.observe(PLAN_CALL);
    expect(await askedFor(session, 'Okay, I gotta go. Bye!')).not.toContain('Wrapping up');
  });

  it('never asks the model when no line could carry a plan', async () => {
    const decide = deciding(LANDLORD);
    const { session, wrapUp } = callWith(decide);
    await wrapUp.observe([
      { speaker: 'user', text: 'It was a long day honestly.' },
      { speaker: 'ferni', text: 'Long how? The good kind or the other kind?' },
    ]);
    expect(decide).not.toHaveBeenCalled();
    expect(await askedFor(session, 'Okay, bye!')).not.toContain('Wrapping up');
  });

  it('stays out after hard news, from the call or from the reading', async () => {
    const hard = callWith(deciding(LANDLORD));
    await hard.wrapUp.observe([
      { speaker: 'user', text: "My dad's in the hospital, I'll drive up tomorrow." },
      { speaker: 'ferni', text: "Oh no. I'll check in Thursday." },
    ]);
    expect(await askedFor(hard.session, 'Okay, I gotta go. Bye!')).not.toContain('Wrapping up');

    const heavy = callWith(deciding(LANDLORD.replace('"heavy":false', '"heavy":true')));
    await heavy.wrapUp.observe(PLAN_CALL);
    expect(await askedFor(heavy.session, 'Okay, I gotta go. Bye!')).not.toContain('Wrapping up');
  });

  it('stays out of a goodbye that gets crisis guidance', async () => {
    const { session, wrapUp } = callWith(deciding(LANDLORD));
    await wrapUp.observe(PLAN_CALL);
    expect(await askedFor(session, "I hope I don't wake up tomorrow. Bye.")).not.toContain(
      'Wrapping up'
    );
  });

  it('closes the loop once: not again after that goodbye was spoken', async () => {
    const { session, wrapUp } = callWith(deciding(LANDLORD));
    await wrapUp.observe(PLAN_CALL);
    expect(await askedFor(session, 'Okay, I gotta go. Bye!')).toContain('Wrapping up');
    // A preemptive and a final request for the same goodbye both carry it.
    expect(await askedFor(session, 'Okay, I gotta go. Bye!')).toContain('Wrapping up');
    await wrapUp.observe([...PLAN_CALL, { speaker: 'ferni', text: 'Talk Thursday. Bye!' }]);
    expect(await askedFor(session, 'Bye!')).not.toContain('Wrapping up');
  });

  it('never waits on the reading: the goodbye is asked for while it is still running', async () => {
    let finish: (reply: string) => void = () => undefined;
    const decide = vi.fn<UnderstandFn>(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        })
    );
    const { session, wrapUp } = callWith(decide);
    const reading = wrapUp.observe(PLAN_CALL);
    expect(decide).toHaveBeenCalledTimes(1);
    // The goodbye arrives before the reading is back: replied to at once, no note, no new call.
    expect(await askedFor(session, 'Okay, I gotta go. Bye!')).not.toContain('Wrapping up');
    expect(decide).toHaveBeenCalledTimes(1);
    finish(LANDLORD);
    await reading;
    expect(await askedFor(session, 'Okay, I gotta go. Bye!')).toContain('Wrapping up');
    expect(decide).toHaveBeenCalledTimes(1);
  });
});

describe('installed on a live call', () => {
  afterEach(() => {
    delete process.env.WRAP_UP;
    delete process.env.RECAP_TEXT;
    delete process.env.TOLD_THIS_CALL;
  });

  async function install(): Promise<{ session: object; cleanup: Array<() => void> }> {
    const session = { on: () => undefined, off: () => undefined };
    const cleanup: Array<() => void> = [];
    await installDirectorNotes({
      session: session as never,
      sessionId: 's',
      userName: undefined,
      agent: { chatCtx: { items: [] } },
      cleanupFunctions: cleanup,
    });
    return { session, cleanup };
  }

  it('reads the call only with WRAP_UP=on, even with the director off, and lets go at cleanup', async () => {
    process.env.TOLD_THIS_CALL = 'off';
    expect(getWrapUp((await install()).session)).toBeUndefined();
    process.env.WRAP_UP = 'on';
    const { session, cleanup } = await install();
    expect(getWrapUp(session)).toBeInstanceOf(WrapUp);
    cleanup.forEach((c) => c());
    expect(getWrapUp(session)).toBeUndefined();
  });

  it('reads the call for the recap text alone, without a goodbye note', async () => {
    process.env.TOLD_THIS_CALL = 'off';
    process.env.RECAP_TEXT = 'on';
    const { session, cleanup } = await install();
    expect(getWrapUp(session)).toBeInstanceOf(WrapUp);
    cleanup.forEach((c) => c());
  });
});
