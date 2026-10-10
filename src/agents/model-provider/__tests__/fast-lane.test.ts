import { describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';
import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-intelligence.js';
import { withTurnStyleReminder } from '../../personas/turn-style.js';
import { buildFastLane, buildCascadeLLMOptions } from '../cartesia-cascade.js';
import { callerTurn, chitChat, fastLaneEnabled, FastLaneLLM, laneReason } from '../fast-lane.js';

class FakeStream extends llm.LLMStream {
  constructor(
    private readonly fake: FakeLLM,
    opts: Parameters<llm.LLM['chat']>[0]
  ) {
    super(fake, { chatCtx: opts.chatCtx, toolCtx: opts.toolCtx, connOptions: opts.connOptions! });
  }
  protected async run(): Promise<void> {
    this.queue.put({ id: this.fake.name, delta: { role: 'assistant', content: this.fake.name } });
  }
}

class FakeLLM extends llm.LLM {
  calls = 0;
  constructor(readonly name: string) {
    super();
  }
  label(): string {
    return this.name;
  }
  chat(opts: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    this.calls++;
    return new FakeStream(this, opts);
  }
}

const said = (...lines: string[]) =>
  lines.map((textContent) => ({ type: 'message', role: 'user', textContent }));

describe('fast lane', () => {
  it('is off unless CASCADE_FAST_LANE=on', () => {
    expect(fastLaneEnabled({})).toBe(false);
    expect(fastLaneEnabled({ CASCADE_FAST_LANE: 'on' })).toBe(true);
    expect(buildFastLane({}, buildCascadeLLMOptions({}))).toBeNull();
    const fast = buildFastLane({ CASCADE_FAST_LANE: 'on' }, buildCascadeLLMOptions({}));
    expect(fast?.options.model).toBe('gemini-3.5-flash-lite');
    expect(fast?.hedgeAfterMs).toBe(900);
  });

  it('sends chit-chat to the fast model', () => {
    for (const t of [
      "ugh, it's been kind of a long day",
      'my cat just knocked water onto my keyboard again',
      'what are you up to?',
      'haha she definitely did it on purpose',
    ])
      expect(chitChat(t), t).toBe(true);
  });

  it('keeps anything that may need a tool on the main model', () => {
    for (const t of [
      'can you set a timer for ten minutes',
      "what's the weather like",
      'remind me to call my mom',
      'play something mellow',
      'Honestly, throw on some jazz while I cook.',
      'can you put on that podcast',
      'who won the game last night?',
      'remember that my sister is visiting',
      '',
    ])
      expect(chitChat(t), t).toBe(false);
    expect(chitChat(null)).toBe(false);
  });

  it("reads only the caller's words since Ferni spoke, not injected notes", () => {
    const items = [
      { type: 'message', role: 'user', textContent: 'set a timer' },
      { type: 'message', role: 'assistant', textContent: 'Done.' },
      ...said('so anyway,', 'long day'),
      { type: 'message', role: 'user', textContent: `${TURN_CONTEXT_HEADER} remind them later` },
    ];
    expect(callerTurn(items)).toBe('so anyway, long day');
  });

  it('ignores the per-turn reminder appended to the caller message (live: every turn went main)', () => {
    const ctx = new llm.ChatContext();
    ctx.addMessage({ role: 'user', content: "it's been a long day" });
    const withReminder = withTurnStyleReminder(ctx);
    const items = withReminder.items as Parameters<typeof callerTurn>[0];
    expect(callerTurn(items)).toBe("it's been a long day");
    expect(chitChat(callerTurn(items))).toBe(true);
  });

  it('names why a turn stays on the main model', () => {
    expect(laneReason(null)).toBe('after_tool');
    expect(laneReason('')).toBe('no_words');
    expect(laneReason('set a timer for five minutes')).toBe('request');
    expect(laneReason('who won the game last night?')).toBe('question');
    expect(laneReason('what have you been up to today?')).toBe('chat');
  });

  it('keeps the reply after a tool result on the main model', () => {
    const items = [
      ...said('my cat is so funny'),
      { type: 'function_call' },
      { type: 'function_call_output' },
    ];
    expect(callerTurn(items)).toBeNull();
  });

  it('routes each turn to one model and streams its reply', async () => {
    const fast = new FakeLLM('fast');
    const main = new FakeLLM('main');
    const router = new FastLaneLLM(fast, main);
    const replyTo = async (text: string) => {
      const chatCtx = new llm.ChatContext();
      chatCtx.addMessage({ role: 'user', content: text });
      const stream = router.chat({
        chatCtx,
        connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 5000 },
      });
      let out = '';
      for await (const chunk of stream) out += chunk.delta?.content ?? '';
      return out;
    };
    expect(await replyTo("it's been a long day")).toBe('fast');
    expect(await replyTo('set a timer for five minutes')).toBe('main');
    expect([fast.calls, main.calls]).toEqual([1, 1]);
  });
});
