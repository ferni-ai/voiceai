/**
 * Ferni never claims an action no tool did this turn (action-claim-guard.ts).
 *
 * Prod call 2026-10-14 (synthetic paraphrase here): the caller asked Ferni to
 * phone a relative and gave a number; Ferni said he was calling right now and
 * would report back. No call tool was open to the call and nothing was dialed.
 */
import { initializeLogger, llm, voice } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  claimedAction,
  honestLine,
  kindsOfTool,
  turnActions,
  withActionClaimCheck,
  type ActionKind,
} from '../action-claim-guard.js';
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
    ['Calling your brother now.', 'call'],
    ["I'm dialing the number.", 'call'],
    ["It's ringing.", 'call'],
    ['I just called her.', 'call'],
    ["I've texted your sister.", 'send'],
    ['I sent the email.', 'send'],
    ['The message has been sent.', 'send'],
    ["I've put the dentist on your calendar for Friday.", 'schedule'],
    ["You're all booked.", 'schedule'],
    ["I've set a reminder for nine.", 'reminder'],
    ["The timer's running.", 'reminder'],
    ["I'll remind you at six.", 'reminder'],
    ["I've saved that.", 'save'],
    ["That's saved.", 'save'],
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
    "I'll call your brother at five five five, zero one nine nine, to check in. Should I go ahead?",
    'I called my sister last week and we talked for hours.',
    'Sending you good vibes.',
    'I called it, they won.',
    "I'm calling it a night soon too.",
    'That sounds like a rough day.',
    'Give her a call when you get a minute.',
    "I'll remember that.",
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

function turn(outputs: Array<[string, string, boolean?]>, earlier = false): llm.ChatContext {
  const chat = llm.ChatContext.empty();
  if (earlier) {
    chat.addMessage({ role: 'user', content: 'Can you ring my brother?' });
    chat.insert([
      llm.FunctionCall.create({ callId: 'old', name: 'callOnBehalf', args: '{}' }),
      llm.FunctionCallOutput.create({
        callId: 'old',
        name: 'callOnBehalf',
        output: '"Got it! I\'m calling him now."',
        isError: false,
      }),
    ]);
    chat.addMessage({ role: 'assistant', content: 'Done.' });
  }
  chat.addMessage({
    role: 'user',
    content: 'Can you ring my brother? Five five five, zero one nine nine.',
  });
  outputs.forEach(([name, output, isError], i) =>
    chat.insert([
      llm.FunctionCall.create({ callId: `c${i}`, name, args: '{}' }),
      llm.FunctionCallOutput.create({ callId: `c${i}`, name, output, isError: isError ?? false }),
    ])
  );
  return chat;
}

describe('turnActions', () => {
  it('counts only this turn, and only results that did not refuse', () => {
    expect([...turnActions(turn([], true)).done]).toEqual([]);
    const preview = turn([
      ['callOnBehalf', JSON.stringify('NOT SENT YET. Read this to the caller...')],
    ]);
    expect([...turnActions(preview).failed]).toEqual(['call']);
    const none = turn([['callOnBehalf', JSON.stringify('Nothing was dialed: no number.')]]);
    expect([...turnActions(none).done]).toEqual([]);
    const errored = turn([['quickText', 'boom', true]]);
    expect([...turnActions(errored).failed]).toEqual(['send']);
    const ok = turn([['callOnBehalf', JSON.stringify("Got it! I'm calling your brother now.")]]);
    expect([...turnActions(ok).done]).toEqual(['call']);
  });
});

describe('honestLine', () => {
  it('says plainly what did not happen and offers what Ferni can do, in voice-safe text', () => {
    const lines = [
      honestLine('call', 'no_tool', false),
      honestLine('call', 'no_tool', true),
      honestLine('call', 'failed', true),
      honestLine('send', 'not_called', true),
      honestLine('reminder', 'no_tool', false),
    ];
    expect(lines[0]).toBe(
      "I can't place calls from here, so I haven't called anyone. I can help you work out what to say, though."
    );
    expect(lines[1]).toContain('set a reminder for you to do it');
    expect(lines[2]).toMatch(/didn't go through/);
    expect(lines[3]).toBe("I haven't sent anything yet. Want me to?");
    for (const line of lines) expect(line).not.toMatch(/—|–|\.\.\.|…/);
  });
});

const chunk = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});
function streamOf(...parts: Array<string | llm.ChatChunk>): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(typeof p === 'string' ? chunk(p) : p);
      c.close();
    },
  });
}
async function textOf(stream: ReadableStream<llm.ChatChunk>): Promise<string> {
  let text = '';
  for await (const c of stream as unknown as AsyncIterable<llm.ChatChunk>)
    text += c.delta?.content ?? '';
  return text;
}
const toolsWith = (...names: string[]) => ({
  functionTools: Object.fromEntries(names.map((n) => [n, {}])),
});
const CLAIM = [
  "Okay, I'm calling",
  ' him right now. ',
  "I'll let you know as soon as I get ahold of him.",
];

describe('withActionClaimCheck', () => {
  it('no call tool: the claim is dropped and Ferni says he cannot place calls', async () => {
    const out = await withActionClaimCheck(
      Promise.resolve(streamOf(...CLAIM)),
      turn([]),
      toolsWith('setReminder'),
      undefined,
      {}
    );
    const text = await textOf(out);
    expect(text).not.toMatch(/calling|get ahold/i);
    expect(text).toBe(
      "I can't place calls from here, so I haven't called anyone. I can set a reminder for you to do it, if you like."
    );
  });

  it('the call tool refused: the claim is dropped and Ferni says it did not go through', async () => {
    const chat = turn([
      ['callOnBehalf', JSON.stringify("Nothing was dialed: I don't have a number.")],
    ]);
    const text = await textOf(
      await withActionClaimCheck(
        streamOf('Sure. ', ...CLAIM),
        chat,
        toolsWith('callOnBehalf'),
        undefined,
        {}
      )
    );
    expect(text).toBe(
      "Sure. That call didn't go through, so nothing's been dialed. I can help you work out what to say, though."
    );
  });

  it('the call tool exists but was not called: Ferni says he has not called yet and asks', async () => {
    const text = await textOf(
      await withActionClaimCheck(
        streamOf(...CLAIM),
        turn([]),
        toolsWith('callOnBehalf'),
        undefined,
        {}
      )
    );
    expect(text).toBe("I haven't placed that call yet. Want me to?");
  });

  it('a call that went through this turn keeps the words', async () => {
    const chat = turn([['callOnBehalf', JSON.stringify("Got it! I'm calling your brother now.")]]);
    const text = await textOf(
      await withActionClaimCheck(streamOf(...CLAIM), chat, toolsWith('callOnBehalf'), undefined, {})
    );
    expect(text).toBe(CLAIM.join(''));
  });

  it('a claim beside a call to the tool is dropped without a line: the result answers next', async () => {
    const call: llm.ChatChunk = {
      id: 'r',
      delta: {
        role: 'assistant',
        toolCalls: [llm.FunctionCall.create({ callId: 'x', name: 'callOnBehalf', args: '{}' })],
      },
    };
    const out = await withActionClaimCheck(
      streamOf("I'm calling him now. ", call),
      turn([]),
      toolsWith('callOnBehalf'),
      undefined,
      {}
    );
    const seen: llm.ChatChunk[] = [];
    for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) seen.push(c);
    expect(seen.map((c) => c.delta?.content ?? '').join('')).toBe('');
    expect(seen.some((c) => c.delta?.toolCalls?.length)).toBe(true);
  });

  it('a reply with no claim streams through unchanged', async () => {
    const parts = ['That sounds like a lot. ', 'Want me to set a reminder?'];
    const text = await textOf(
      await withActionClaimCheck(streamOf(...parts), turn([]), toolsWith(), undefined, {})
    );
    expect(text).toBe(parts.join(''));
  });

  it('ACTION_CLAIM_GUARD=off returns the very same stream', async () => {
    const stream = streamOf(...CLAIM);
    const out = await withActionClaimCheck(
      Promise.resolve(stream),
      turn([]),
      toolsWith(),
      undefined,
      { ACTION_CLAIM_GUARD: 'off' }
    );
    expect(out).toBe(stream);
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
  const ASK = 'Can you ring my brother? His number is five five five, zero one nine nine.';
  async function run(env: Record<string, string>, tools: Record<string, unknown> = {}) {
    Object.assign(process.env, env);
    const script: voice.testing.FakeLLMResponse[] = [
      {
        input: 'ring my brother',
        content:
          "Okay, I'm calling him right now. I'll let you know as soon as I get ahold of him.",
      },
    ];
    const model = new ScriptLLM(script);
    const agent = new PersonaVoiceAgent('You are Ferni.', {
      tools: tools as unknown as llm.ToolContext,
      skipGreeting: true,
    });
    const session = new voice.AgentSession({ llm: model, userData: { personaId: 'ferni' } });
    await session.start({ agent });
    const result = session.run({ userInput: ASK });
    await result.wait();
    const said = result.events
      .filter((e) => e.type === 'message')
      .map((e) => (e as { item: llm.ChatMessage }).item.textContent)
      .join(' ');
    await session.close();
    return said;
  }

  it('with no call tool, Ferni says he cannot place the call and offers help instead', async () => {
    const said = await run({});
    expect(said).not.toMatch(/calling him|get ahold/i);
    expect(said).toMatch(/can't place calls from here/);
  });

  it('with a reminder tool open, he offers to set a reminder to call', async () => {
    const setReminder = llm.tool({
      description: 'Set a reminder.',
      parameters: z.object({ what: z.string() }),
      execute: async () => 'set',
    });
    const said = await run({}, { setReminder });
    expect(said).toMatch(/can't place calls from here.*set a reminder/);
  });

  it('with the guard off, the false claim is spoken (the prod call)', async () => {
    const said = await run({ ACTION_CLAIM_GUARD: 'off' });
    expect(said).toMatch(/calling him right now/);
  });
});
