/**
 * HANDOFF_CACHE_WARM: the incoming persona's own prefix is warmed once per
 * handoff, and a warm that fails never reaches the handoff.
 */
import { describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { warmIncomingPersona } from '../handoff-cache-warm.js';

const ON = { CASCADE_CACHE_WARM: 'on', HANDOFF_CACHE_WARM: 'on' };
const SETTLE_MS = 5;
const settled = async (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 60);
  });

class OneChunk extends llm.LLMStream {
  protected async run(): Promise<void> {
    this.queue.put({ id: 'warm', delta: { role: 'assistant', content: 'Hey.' } });
  }
}

class FakeLLM extends llm.LLM {
  requests: Array<{ said: string[]; tools: string[] }> = [];
  constructor(private readonly fail = false) {
    super();
    this.on('error', () => undefined);
  }
  label(): string {
    return 'primary';
  }
  chat(opts: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    if (this.fail) throw new Error('quota');
    this.requests.push({
      said: opts.chatCtx.items.map((i) => ('textContent' in i ? (i.textContent ?? '') : '')),
      tools: Object.keys(llm.toToolContext(opts.toolCtx)?.functionTools ?? {}),
    });
    return new OneChunk(this, {
      chatCtx: opts.chatCtx,
      toolCtx: opts.toolCtx,
      connOptions: opts.connOptions!,
    });
  }
}

/** The call's session after a swap to Peter: his Agent, with the talk so far. */
function swappedToPeter(model: llm.LLM) {
  const chatCtx = new llm.ChatContext();
  chatCtx.addMessage({ role: 'system', content: 'You are Peter, the research nerd.' });
  chatCtx.addMessage({ role: 'user', content: 'can Peter look this up?' });
  const toolCtx = new llm.ToolContext({
    searchPapers: llm.tool({ description: 'Search papers', execute: async () => 'ok' }),
  });
  return { llm: model, userData: {}, currentAgent: { chatCtx, toolCtx } };
}

describe('warmIncomingPersona', () => {
  it("flag on: one warm per handoff, with the incoming persona's instructions and tools", async () => {
    const model = new FakeLLM();
    const session = swappedToPeter(model);
    await warmIncomingPersona(session, ON, SETTLE_MS);
    await warmIncomingPersona(session, ON, SETTLE_MS); // armed once per Agent: no second bill
    // The first warm loads the turn helpers (toolsForTurn), which takes a while in a test.
    await vi.waitFor(() => expect(model.requests.length).toBeGreaterThan(0), { timeout: 15_000 });
    await settled();
    expect(model.requests).toEqual([
      {
        said: ['You are Peter, the research nerd.', 'can Peter look this up?', 'Hey.'],
        tools: ['searchPapers'],
      },
    ]);
  });

  it('flag off: no warm', async () => {
    const off = new FakeLLM();
    const control = new FakeLLM(); // flag on, armed at the same time: once it warms, off had time to
    await warmIncomingPersona(swappedToPeter(off), { CASCADE_CACHE_WARM: 'on' }, SETTLE_MS);
    await warmIncomingPersona(swappedToPeter(control), ON, SETTLE_MS);
    await vi.waitFor(() => expect(control.requests).toHaveLength(1), { timeout: 15_000 });
    await settled();
    expect(off.requests).toHaveLength(0);
  });

  it('a failing warm never throws or rejects into the handoff', async () => {
    const throwing = {
      get currentAgent(): never {
        throw new Error('AgentSession is not running');
      },
    };
    await expect(warmIncomingPersona(throwing, ON, SETTLE_MS)).resolves.toBeUndefined();
    await expect(
      warmIncomingPersona(swappedToPeter(new FakeLLM(true)), ON, SETTLE_MS)
    ).resolves.toBeUndefined();
    await settled(); // the failing model's warm ran (and was swallowed) after the handoff moved on
  });
});
