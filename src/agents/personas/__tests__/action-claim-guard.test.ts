/**
 * Ferni never claims an action no tool carried out (action-claim-guard.ts,
 * action-claims.ts).
 *
 * Prod call 2026-10-14 (synthetic paraphrase here): the caller asked Ferni to
 * phone a relative and gave a number; Ferni said he was calling right now and
 * would report back. No call tool was open to the call and nothing was dialed.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { honestLine, withActionClaimCheck } from '../action-claim-guard.js';
import { callActions, claimedAction, kindsOfTool, type ActionKind } from '../action-claims.js';
import { PersonaVoiceAgent } from '../ferni-agent.js';

initializeLogger({ pretty: false, level: 'warn' });

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('claimedAction', () => {
  it.each<[string, ActionKind]>([
    ["Okay, I'm calling him right now.", 'call'],
    ["I'll let you know as soon as I get ahold of her.", 'call'],
    ['Ringing her now.', 'call'],
    ['Okay, dialing.', 'call'],
    ['She should be getting a call any second.', 'call'],
    ["I've reached out to her.", 'call'],
    ["Calling her now, don't worry.", 'call'],
    ["I'm calling her right now, okay?", 'call'],
    ['Let me call her right now.', 'call'],
    ['On it, calling her.', 'call'],
    ["I'm on the phone with her now.", 'call'],
    ['Placing the call now.', 'call'],
    ["I'm getting her on the line.", 'call'],
    ["It's ringing.", 'call'],
    ["I'll ring her right away and let you know how it goes.", 'call'],
    ['Done! Message sent.', 'send'],
    ['Just sent it.', 'send'],
    ["I've texted your sister.", 'send'],
    ["I've let your brother know.", 'send'],
    ['I texted Dana for you earlier and she said yes.', 'send'],
    ["All set, she'll get the text.", 'send'],
    ['Message is on its way to Dana.', 'send'],
    ['I booked it.', 'schedule'],
    ['Got you a table at seven.', 'schedule'],
    ["I've put it in your calendar.", 'schedule'],
    ["You're all booked.", 'schedule'],
    ["Your reminder's all set.", 'reminder'],
    ["I've set a reminder for nine.", 'reminder'],
    ["Noted, I'll remind you at five.", 'reminder'],
    ['Saved.', 'save'],
    ["I've saved that.", 'save'],
  ])('%j claims %s', (sentence, kind) => {
    expect(claimedAction(sentence)).toBe(kind);
  });

  it.each([
    'Want me to call him?',
    'Should I text your sister?',
    'I can set a reminder for you, if you like.',
    "Once you say yes, I'll ring her.",
    "I can't place calls from here.",
    "I haven't called anyone.",
    "I'll call Dana at five five five, zero one nine nine, to say you're running late. Want me to go ahead?",
    "I'll text Dana that you're running late.",
    "I'll message you on the app later.",
    "I'll call you back if we get cut off.",
    'I called my sister after that and we both cried.',
    'I texted my mom about it and she laughed at me.',
    'I rang my dad every Sunday for years.',
    'When I called the hospital, they put me on hold for an hour.',
    'I called her yesterday.',
    "Yeah, I've called him a lot of names over the years.",
    "I'm sending you a big hug.",
    'Sending you so much love.',
    "I'm calling it, you're going to love that job.",
    'I called it, they won.',
    "I'll tell you what, let's talk to her together.",
    "It's booked solid on weekends, that place.",
    "I'll remind you of that next time you doubt yourself.",
    "I just want to remind you that you're doing great.",
    "I'm so glad you called.",
    "I'll keep you posted.",
    "I'll be here.",
    "I'll remember that.",
    'Give her a call when you get a minute.',
  ])('%j is not a claim', (sentence) => {
    expect(claimedAction(sentence)).toBeNull();
  });
});

describe('kindsOfTool', () => {
  it('reads tools by what they do, not by a substring', () => {
    expect(kindsOfTool('callOnBehalf')).toEqual(['call']);
    expect(kindsOfTool('reachOut')).toEqual(['call', 'send']);
    expect(kindsOfTool('setReminder')).toEqual(['reminder']);
    expect(kindsOfTool('createCalendarEvent')).toEqual(['schedule']);
    expect(kindsOfTool('recallFromMemory')).toEqual([]);
    expect(kindsOfTool('endCall')).toEqual([]);
  });
});

const user = (content: string): llm.ChatMessage =>
  llm.ChatMessage.create({ role: 'user', content });
const said = (content: string): llm.ChatMessage =>
  llm.ChatMessage.create({ role: 'assistant', content });
let n = 0;
const result = (name: string, output: string, isError = false): llm.FunctionCallOutput =>
  llm.FunctionCallOutput.create({ callId: `c${++n}`, name, output, isError });
const ctx = (...items: unknown[]) => ({ items });
const ASK = user('Can you ring my brother? Five five five, zero one nine nine.');

describe('callActions', () => {
  it('reads each kind by its latest result, across the whole call', () => {
    const preview = callActions(
      ctx(ASK, result('callOnBehalf', JSON.stringify('NOT SENT YET. Read this to the caller')))
    );
    expect([...preview.awaiting]).toEqual(['call']);
    const none = callActions(
      ctx(ASK, result('callOnBehalf', JSON.stringify('Nothing was dialed: no number.')))
    );
    expect([...none.failed]).toEqual(['call']);
    expect([...callActions(ctx(ASK, result('quickText', 'boom', true))).failed]).toEqual(['send']);
    const ok = callActions(
      ctx(ASK, result('callOnBehalf', JSON.stringify("Got it! I'm calling him now.")))
    );
    expect([...ok.done]).toEqual(['call']);
    // An earlier turn's send still counts; a later refusal of the same kind wins.
    const earlier = callActions(
      ctx(user('Text her.'), result('quickText', '"Sent."'), said('Sent.'), ASK)
    );
    expect([...earlier.done]).toEqual(['send']);
    const later = callActions(
      ctx(result('quickText', '"Sent."'), result('quickText', '"Nothing was sent: no number."'))
    );
    expect([...later.failed]).toEqual(['send']);
    // "Sorry for the wait" is not a refusal.
    const sorry = callActions(
      ctx(result('callOnBehalf', '"Sorry for the wait, the call is ringing now."'))
    );
    expect([...sorry.done]).toEqual(['call']);
  });
});

describe('honestLine', () => {
  it('says plainly what did not happen and offers what Ferni can do, in voice-safe text', () => {
    const lines = [
      honestLine('call', 'no_tool', false),
      honestLine('call', 'no_tool', true),
      honestLine('call', 'failed', true),
      honestLine('call', 'awaiting_yes', true),
      honestLine('send', 'not_called', true),
      honestLine('reminder', 'no_tool', false),
    ];
    expect(lines[0]).toBe(
      "I can't place calls from here, so I haven't called anyone. I can help you work out what to say, though."
    );
    expect(lines[1]).toContain('set a reminder for you to do it');
    expect(lines[2]).toMatch(/didn't go through/);
    expect(lines[3]).toBe("Nothing's been dialed yet, I need your yes first.");
    expect(lines[4]).toBe("I haven't sent anything yet. Want me to?");
    for (const line of lines) expect(line).not.toMatch(/—|–|\.\.\.|…/);
  });
});

const chunk = (content: string, extra: object = {}): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
  ...extra,
});
const toolCall = (name: string): llm.ChatChunk => ({
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: 'x', name, args: '{}' })],
  },
});
function streamOf(...parts: Array<string | llm.ChatChunk>): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(typeof p === 'string' ? chunk(p) : p);
      c.close();
    },
  });
}
async function chunksOf(stream: ReadableStream<llm.ChatChunk>): Promise<llm.ChatChunk[]> {
  const out: llm.ChatChunk[] = [];
  for await (const c of stream as unknown as AsyncIterable<llm.ChatChunk>) out.push(c);
  return out;
}
const textOf = async (stream: ReadableStream<llm.ChatChunk>): Promise<string> =>
  (await chunksOf(stream)).map((c) => c.delta?.content ?? '').join('');
const toolsWith = (...names: string[]) => ({
  functionTools: Object.fromEntries(names.map((name) => [name, {}])),
});
const CLAIM = [
  "Okay, I'm calling",
  ' him right now. ',
  "I'll let you know as soon as I get ahold of him.",
];
const check = (stream: ReadableStream<llm.ChatChunk>, items: unknown[], tools = toolsWith()) =>
  withActionClaimCheck(Promise.resolve(stream), ctx(...items), tools, {});

describe('withActionClaimCheck', () => {
  it('no call tool: the claim is dropped and Ferni says he cannot place calls', async () => {
    const text = await textOf(await check(streamOf(...CLAIM), [ASK], toolsWith('setReminder')));
    expect(text).not.toMatch(/calling|get ahold/i);
    expect(text).toBe(
      "I can't place calls from here, so I haven't called anyone. I can set a reminder for you to do it, if you like."
    );
  });

  it('the honest line goes where the claim was', async () => {
    const parts = ['Sure. ', "I'm calling her right now. ", "How's the rest of your day?"];
    expect(await textOf(await check(streamOf(...parts), [ASK]))).toBe(
      "Sure. I can't place calls from here, so I haven't called anyone. I can help you work out what to say, though. How's the rest of your day?"
    );
  });

  it('the call tool refused: Ferni says it did not go through', async () => {
    const items = [
      ASK,
      result('callOnBehalf', JSON.stringify("Nothing was dialed: I don't have a number.")),
    ];
    expect(await textOf(await check(streamOf(...CLAIM), items, toolsWith('callOnBehalf')))).toBe(
      "That call didn't go through, so nothing's been dialed. I can help you work out what to say, though."
    );
  });

  it('the confirm preview came back: a read-back offer is kept, a claim waits for the yes', async () => {
    const items = [
      ASK,
      result('quickText', JSON.stringify('NOT SENT YET. Read this to the caller')),
    ];
    const readBack = ["I'll text Dana that you're running late. ", 'Should I send it?'];
    const tools = toolsWith('quickText');
    expect(await textOf(await check(streamOf(...readBack), items, tools))).toBe(readBack.join(''));
    expect(await textOf(await check(streamOf('Done, sent it.'), items, tools))).toBe(
      "Nothing's gone out yet, I need your yes first."
    );
  });

  it('a send that went out on an earlier turn can be talked about', async () => {
    const items = [
      user('Text her.'),
      result('quickText', '"Sent to Dana."'),
      said('Sent.'),
      user('Did you text her?'),
    ];
    const reply = 'Yep, I texted her for you.';
    expect(await textOf(await check(streamOf(reply), items, toolsWith('quickText')))).toBe(reply);
  });

  it('the call tool is open but was not called: he has not yet, and asks', async () => {
    expect(await textOf(await check(streamOf(...CLAIM), [ASK], toolsWith('callOnBehalf')))).toBe(
      "I haven't placed that call yet. Want me to?"
    );
  });

  it('a call that went through keeps the words', async () => {
    const items = [ASK, result('callOnBehalf', JSON.stringify("Got it! I'm calling him now."))];
    expect(await textOf(await check(streamOf(...CLAIM), items, toolsWith('callOnBehalf')))).toBe(
      CLAIM.join('')
    );
  });

  it('a claim beside a call to the tool is dropped without a line: the result answers next', async () => {
    const stream = streamOf("I'm calling him now. ", toolCall('callOnBehalf'));
    const out = await chunksOf(await check(stream, [ASK], toolsWith('callOnBehalf')));
    expect(out.map((c) => c.delta?.content ?? '').join('')).toBe('');
    expect(out.some((c) => c.delta?.toolCalls?.length)).toBe(true);
  });

  it('words and tool calls keep their order, with a partial sentence before the call', async () => {
    const stream = streamOf('Sure, let me check the weather', toolCall('getWeather'));
    const out = await chunksOf(await check(stream, [ASK], toolsWith('getWeather')));
    expect(out[0].delta?.content).toBe('Sure, let me check the weather');
    expect(out[1].delta?.toolCalls?.[0].name).toBe('getWeather');
  });

  it('chunks out carry no usage of the chunk they came from', async () => {
    const stream = streamOf(chunk('Hi there. ', { usage: { completionTokens: 5 } }));
    expect((await chunksOf(await check(stream, [ASK]))).every((c) => !('usage' in c))).toBe(true);
  });

  it('a reply with no claim streams through unchanged', async () => {
    const parts = ['That sounds like a lot. ', 'Want me to set a reminder?'];
    expect(await textOf(await check(streamOf(...parts), [ASK]))).toBe(parts.join(''));
  });

  it('ACTION_CLAIM_GUARD=off returns the very same stream', async () => {
    const stream = streamOf(...CLAIM);
    const off = { ACTION_CLAIM_GUARD: 'off' };
    expect(await withActionClaimCheck(Promise.resolve(stream), ctx(ASK), toolsWith(), off)).toBe(
      stream
    );
  });
});

/** FakeLLM keyed on a fragment of the request's last item, since the turn reminder rides on the user's words. */
class ScriptLLM extends voice.testing.FakeLLM {
  constructor(private readonly script: voice.testing.FakeLLMResponse[]) {
    super(script);
  }
  lookup(input: string) {
    const hit = this.script.find((r) => input.includes(r.input));
    return hit ? super.lookup(hit.input) : undefined;
  }
}

describe('a call request on a real agent session', () => {
  const SPOKEN = 'Can you ring my brother? His number is five five five, zero one nine nine.';
  async function run(env: Record<string, string>, tools: Record<string, unknown> = {}) {
    Object.assign(process.env, env);
    const model = new ScriptLLM([
      {
        input: 'ring my brother',
        content:
          "Okay, I'm calling him right now. I'll let you know as soon as I get ahold of him.",
      },
    ]);
    const agent = new PersonaVoiceAgent('You are Ferni.', {
      tools: tools as unknown as llm.ToolContext,
      skipGreeting: true,
    });
    const session = new voice.AgentSession({ llm: model, userData: { personaId: 'ferni' } });
    await session.start({ agent });
    const turn = session.run({ userInput: SPOKEN });
    await turn.wait();
    const words = turn.events
      .filter((e) => e.type === 'message')
      .map((e) => (e as { item: llm.ChatMessage }).item.textContent)
      .join(' ');
    await session.close();
    return words;
  }

  it('with no call tool, Ferni says he cannot place the call and offers help instead', async () => {
    const words = await run({});
    expect(words).not.toMatch(/calling him|get ahold/i);
    expect(words).toMatch(/can't place calls from here/);
  });

  it('with a reminder tool open, he offers to set a reminder to call', async () => {
    const setReminder = llm.tool({
      description: 'Set a reminder.',
      parameters: z.object({ what: z.string() }),
      execute: async () => 'set',
    });
    expect(await run({}, { setReminder })).toMatch(/can't place calls from here.*set a reminder/);
  });

  it('with the guard off, the false claim is spoken (the prod call)', async () => {
    expect(await run({ ACTION_CLAIM_GUARD: 'off' })).toMatch(/calling him right now/);
  });
});
