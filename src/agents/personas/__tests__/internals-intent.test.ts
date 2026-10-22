import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Director, setDirector } from '../director-notes.js';
import {
  installInternalsIntent,
  InternalsIntent,
  internalsIntentFor,
  parseIntent,
  setInternalsIntent,
} from '../internals-intent.js';
import { withTurnReminder } from '../turn-request.js';

const FLAG = 'NO_INVENTED_INTERNALS';
const prev = process.env[FLAG];
afterEach(() => {
  if (prev === undefined) delete process.env[FLAG];
  else process.env[FLAG] = prev;
  vi.restoreAllMocks();
});

const ASK = /asking what went wrong behind the scenes/;
const PUSH_NOTE = 'Answer their specific question about the backend service.';
const PRESS = "I'm in tech too, give it to me plain.";
const yes = async (): Promise<string> => '{"internals": true}';
const no = async (): Promise<string> => '{"internals": false}';

let n = 0;
function call(failed: boolean, ...said: string[]): llm.ChatContext {
  const callId = `i${++n}`;
  return new llm.ChatContext([
    llm.ChatMessage.create({ role: 'user', content: 'is there a game tonight?' }),
    llm.FunctionCall.create({ callId, name: 'searchWeb', args: '{}' }),
    llm.FunctionCallOutput.create({
      callId,
      name: 'searchWeb',
      output: failed ? 'No results for "game tonight".' : 'The Rays play at 7.',
      isError: false,
    }),
    llm.ChatMessage.create({ role: 'assistant', content: 'Hmm, I came up empty.' }),
    ...said.map((content) => llm.ChatMessage.create({ role: 'user', content })),
  ]);
}

/** The request text with this classifier on the session, Math.random pinned. */
function request(c: llm.ChatContext, flag: 'on' | 'off', intent?: InternalsIntent): string {
  process.env[FLAG] = flag;
  const session = {};
  setDirector(session, { current: () => [PUSH_NOTE], told: () => '' } as unknown as Director);
  setInternalsIntent(session, intent ?? null);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  try {
    const out = withTurnReminder(c, session);
    return (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
  } finally {
    setDirector(session, null);
    setInternalsIntent(session, null);
  }
}

describe('parseIntent', () => {
  it('is true only for an explicit {"internals": true}', () => {
    expect(parseIntent('{"internals": true}')).toBe(true);
    expect(parseIntent('```json\n{"internals":true}\n```')).toBe(true);
    for (const r of ['{"internals": false}', '{"internals": "true"}', '', 'yes', '{oops'])
      expect(parseIntent(r), r).toBe(false);
  });
});

describe('InternalsIntent', () => {
  it('answers for exactly the words it classified', async () => {
    const intent = new InternalsIntent(yes);
    await intent.observe(PRESS);
    expect(intent.yesFor(PRESS)).toBe(true);
    expect(intent.yesFor("i'm in tech too give it to me plain")).toBe(true); // same words
    expect(intent.yesFor("I'm in tech too, give it to me plain. Also, hi.")).toBe(false);
    intent.newTurn();
    expect(intent.yesFor(PRESS)).toBe(false);
  });

  it('is "no" when the model says no, throws, or times out', async () => {
    const said = new InternalsIntent(no);
    await said.observe(PRESS);
    expect(said.yesFor(PRESS)).toBe(false);
    const threw = new InternalsIntent(async () => Promise.reject(new Error('down')));
    await threw.observe(PRESS);
    expect(threw.yesFor(PRESS)).toBe(false);
    const hung = new InternalsIntent(
      () =>
        new Promise<string>(() => {
          // never settles
        }),
      20
    );
    await hung.observe(PRESS);
    expect(hung.yesFor(PRESS)).toBe(false);
  });

  it('runs one call at a time and classifies the latest words', async () => {
    const seen: string[] = [];
    const intent = new InternalsIntent(async (_s, input) => {
      seen.push(JSON.parse(input).NOW);
      return '{"internals": true}';
    });
    await Promise.all([
      intent.observe("I'm in tech", [], { final: false }),
      intent.observe("I'm in tech too give", [], { final: false }),
      intent.observe(PRESS),
    ]);
    expect(seen[0]).toBe("i'm in tech");
    expect(seen.at(-1)).toBe("i'm in tech too give it to me plain");
    expect(seen.length).toBeLessThanOrEqual(2);
    expect(intent.yesFor(PRESS)).toBe(true);
  });

  it('an answer covers its words and one more, not two', async () => {
    const intent = new InternalsIntent(yes);
    await intent.observe('why did your search', [], { final: false });
    expect(intent.yesFor('why did your search fail')).toBe(true);
    expect(intent.yesFor('why did your search fail today')).toBe(false);
    expect(intent.yesFor('why did my search fail')).toBe(false);
  });

  it('debounces interims: 3 words first, then only when more than one word changed', async () => {
    const intent = new InternalsIntent(yes);
    const said = async (t: string, final = false) => intent.observe(t, [], { final });
    await said('why did');
    expect(intent.calls).toBe(0);
    await said('why did your');
    await said('why did your search');
    expect(intent.calls).toBe(1);
    await said('why did your search fail on');
    expect(intent.calls).toBe(2);
    await said('why did your search fail on', true); // final, already asked
    expect(intent.calls).toBe(2);
    await said('why?', true); // a short final is still asked
    expect(intent.calls).toBe(3);
  });

  it('caps calls at 4 per caller turn (the last kept for the final words) and 12 per failure window', async () => {
    const intent = new InternalsIntent(no);
    const lines = (k: number) =>
      Array.from({ length: 6 }, (_, i) => `line ${k} ${'word '.repeat(2 * i + 3)}`);
    const turn = async (k: number, window: number) => {
      for (const l of lines(k)) await intent.observe(l, [], { final: false, window });
      await intent.observe(`final ${k} words here`, [], { final: true, window });
    };
    for (const l of lines(0)) await intent.observe(l, [], { final: false, window: 7 });
    expect(intent.calls).toBe(3); // the 4th is kept for the final words
    await intent.observe('final 0 words here', [], { final: true, window: 7 });
    expect(intent.calls).toBe(4);
    await intent.observe('one more final', [], { final: true, window: 7 });
    expect(intent.calls).toBe(4);
    for (let t = 1; t <= 3; t++) {
      intent.newTurn();
      await turn(t, 7);
    }
    expect(intent.calls).toBe(12);
    intent.newTurn();
    await intent.observe('a new failure here now', [], { final: false, window: 9 });
    expect(intent.calls).toBe(13);
  });
});

describe('what reaches the model', () => {
  it('caller lines only, never a context note, and at most 600 characters', async () => {
    const { TURN_CONTEXT_HEADER } = await import('../../multi-agent/turn-context-header.js');
    process.env[FLAG] = 'on';
    const inputs: string[] = [];
    const note = `${TURN_CONTEXT_HEADER} ${'private context '.repeat(150)}`;
    const callId = 'ctx1';
    const ctx = new llm.ChatContext([
      llm.ChatMessage.create({ role: 'user', content: 'x'.repeat(500) }),
      llm.ChatMessage.create({ role: 'user', content: note }),
      llm.FunctionCall.create({ callId, name: 'searchWeb', args: '{}' }),
      llm.FunctionCallOutput.create({
        callId,
        name: 'searchWeb',
        output: 'No results',
        isError: false,
      }),
      llm.ChatMessage.create({ role: 'user', content: note }),
    ]);
    const observer = installInternalsIntent(
      {
        session: { on: vi.fn(), off: vi.fn() } as never,
        agent: () => ({ chatCtx: ctx }),
        cleanupFunctions: [],
      },
      async (_s, input) => {
        inputs.push(input);
        return '{"internals": false}';
      }
    );
    observer?.onTranscript('why did your search fail?', true);
    await vi.waitFor(() => expect(inputs).toHaveLength(1));
    expect(inputs[0]).not.toContain('private context');
    expect(inputs[0].length).toBeLessThanOrEqual(600);
    expect(JSON.parse(inputs[0]).NOW).toBe('why did your search fail');
  });

  it('context notes are not caller turns: the window counts caller lines', async () => {
    const { TURN_CONTEXT_HEADER } = await import('../../multi-agent/turn-context-header.js');
    const { turnsSinceFailure } = await import('../no-invented-internals.js');
    const c = call(
      true,
      'one',
      `${TURN_CONTEXT_HEADER} note`,
      'two',
      `${TURN_CONTEXT_HEADER} note`
    );
    expect(turnsSinceFailure(c.items as never)).toBe(2);
  });
});

describe('withTurnReminder with the classifier', () => {
  it('flag on, a yes after a failed search: the honest note rides and the push is dropped', async () => {
    const intent = new InternalsIntent(yes);
    await intent.observe(PRESS);
    const text = request(call(true, PRESS), 'on', intent);
    expect(text).toMatch(ASK);
    expect(text).not.toContain(PUSH_NOTE);
  });

  it('no failure, or a "no", or no answer yet: nothing changes', async () => {
    const said = new InternalsIntent(yes);
    await said.observe(PRESS);
    expect(request(call(false, PRESS), 'on', said)).not.toMatch(ASK);
    const nope = new InternalsIntent(no);
    await nope.observe(PRESS);
    expect(request(call(true, PRESS), 'on', nope)).not.toMatch(ASK);
    expect(request(call(true, PRESS), 'on', new InternalsIntent(yes))).not.toMatch(ASK);
  });

  it('flag off: the same text as with no classifier at all', async () => {
    const intent = new InternalsIntent(yes);
    await intent.observe(PRESS);
    expect(request(call(true, PRESS), 'off', intent)).toBe(request(call(true, PRESS), 'off'));
  });

  it('"who made you?" stays on the AI path even if the model says yes', async () => {
    const intent = new InternalsIntent(yes);
    await intent.observe('who made you?');
    expect(request(call(true, 'who made you?'), 'on', intent)).not.toMatch(ASK);
  });

  it('more than 3 caller turns after the failure, a yes does not fire', async () => {
    const intent = new InternalsIntent(yes);
    await intent.observe(PRESS);
    expect(request(call(true, 'ok', 'anyway', 'so', PRESS), 'on', intent)).not.toMatch(ASK);
  });
});

describe('installInternalsIntent', () => {
  const session = () => ({ on: vi.fn(), off: vi.fn() }) as never;
  it('is null with the flag off', () => {
    process.env[FLAG] = 'off';
    expect(
      installInternalsIntent(
        { session: session(), agent: () => ({ chatCtx: { items: [] } }), cleanupFunctions: [] },
        yes
      )
    ).toBeNull();
  });

  it('asks the model only within two caller turns of a failed tool', async () => {
    process.env[FLAG] = 'on';
    const ask = vi.fn(yes);
    const s = session();
    let ctx = call(false);
    const observer = installInternalsIntent(
      { session: s, agent: () => ({ chatCtx: ctx }), cleanupFunctions: [] },
      ask
    );
    observer?.onTranscript(PRESS, true);
    expect(ask).not.toHaveBeenCalled();
    ctx = call(true);
    observer?.onTranscript(PRESS, true);
    await vi.waitFor(() => expect(internalsIntentFor(s, PRESS)).toBe(true));
    expect(ask).toHaveBeenCalledTimes(1);
  });
});
