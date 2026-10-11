import { describe, expect, it } from 'vitest';
import { llm } from '@livekit/agents';
import { modelsToWarm, warmPromptCache } from '../cache-warm.js';
import { FastLaneLLM } from '../fast-lane.js';

class FakeStream extends llm.LLMStream {
  constructor(
    private readonly fake: FakeLLM,
    opts: Parameters<llm.LLM['chat']>[0]
  ) {
    super(fake, { chatCtx: opts.chatCtx, toolCtx: opts.toolCtx, connOptions: opts.connOptions! });
  }
  close(): void {
    this.fake.closed++;
    super.close();
  }
  protected async run(): Promise<void> {
    // Like the Google plugin: a failed request reports on the model's 'error'
    // event and then just ends (hedged-llm.ts).
    if (this.fake.fail) {
      this.fake.emit('error', { error: new Error('quota') } as never);
      return;
    }
    for (const content of ['Hey', ' there', '.']) {
      this.queue.put({ id: this.fake.name, delta: { role: 'assistant', content } });
    }
  }
}

class FakeLLM extends llm.LLM {
  requests: Array<{ said: string[]; tools: string[] }> = [];
  closed = 0;
  constructor(
    readonly name: string,
    readonly fail = false
  ) {
    super();
    this.on('error', () => undefined);
  }
  label(): string {
    return this.name;
  }
  chat(opts: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    this.requests.push({
      said: opts.chatCtx.items.map((i) => ('textContent' in i ? (i.textContent ?? '') : '')),
      tools: Object.keys(llm.toToolContext(opts.toolCtx)?.functionTools ?? {}),
    });
    return new FakeStream(this, opts);
  }
}

function sessionWith(model: unknown) {
  const chatCtx = new llm.ChatContext();
  chatCtx.addMessage({ role: 'system', content: 'You are Ferni.' });
  const toolCtx = new llm.ToolContext({
    quickTimer: llm.tool({ description: 'Set a timer', execute: async () => 'ok' }),
  });
  return { llm: model, currentAgent: { chatCtx, toolCtx } };
}

describe('cache warm', () => {
  it('does nothing unless CASCADE_CACHE_WARM=on', async () => {
    const model = new FakeLLM('main');
    await warmPromptCache(sessionWith(model), {});
    expect(model.requests).toHaveLength(0);
  });

  it('also warms under FIRST_TURN_FAST=on', async () => {
    const model = new FakeLLM('main');
    await warmPromptCache(sessionWith(model), { FIRST_TURN_FAST: 'on' });
    expect(model.requests).toHaveLength(1);
  });

  it("warms both fast-lane models with the agent's own instructions and tools", async () => {
    const fast = new FakeLLM('fast');
    const main = new FakeLLM('main');
    expect(modelsToWarm(new FastLaneLLM(fast, main))).toEqual([fast, main]);
    await warmPromptCache(sessionWith(new FastLaneLLM(fast, main)), { CASCADE_CACHE_WARM: 'on' });
    for (const model of [fast, main]) {
      expect(model.requests).toEqual([{ said: ['You are Ferni.', 'Hey.'], tools: ['quickTimer'] }]);
      expect(model.closed).toBeGreaterThan(0);
    }
  });

  it('never throws when the model fails or there is no agent yet', async () => {
    await expect(
      warmPromptCache(sessionWith(new FakeLLM('main', true)), { CASCADE_CACHE_WARM: 'on' }, 1000)
    ).resolves.toBeTypeOf('string');
    await expect(warmPromptCache({}, { CASCADE_CACHE_WARM: 'on' })).resolves.toBeNull();
    await expect(warmPromptCache(undefined, { CASCADE_CACHE_WARM: 'on' })).resolves.toBeNull();
  });
});
