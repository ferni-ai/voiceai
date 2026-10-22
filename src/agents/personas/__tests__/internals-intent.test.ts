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
    const hung = new InternalsIntent(() => new Promise<string>(() => undefined), 20);
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
      intent.observe("I'm in"),
      intent.observe("I'm in tech"),
      intent.observe(PRESS),
    ]);
    expect(seen[0]).toBe("i'm in");
    expect(seen.at(-1)).toBe("i'm in tech too give it to me plain");
    expect(seen.length).toBeLessThanOrEqual(2);
    expect(intent.yesFor(PRESS)).toBe(true);
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
