import { describe, expect, it, onTestFinished } from 'vitest';
import { llm } from '@livekit/agents';
import { HedgedLLM } from '../hedged-llm.js';

interface Script {
  /** Delay before each chunk; `null` content sends an empty delta. */
  chunks: Array<{ afterMs: number; content: string | null }>;
  failAfterMs?: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

class FakeStream extends llm.LLMStream {
  constructor(
    private readonly fake: FakeLLM,
    opts: Parameters<llm.LLM['chat']>[0]
  ) {
    super(fake, { chatCtx: opts.chatCtx, toolCtx: opts.toolCtx, connOptions: opts.connOptions! });
  }

  close(): void {
    this.fake.closed = true;
    super.close();
  }

  protected async run(): Promise<void> {
    const { chunks, failAfterMs } = this.fake.script;
    if (failAfterMs !== undefined) {
      await sleep(failAfterMs);
      throw new Error(`${this.fake.name} failed`);
    }
    for (const c of chunks) {
      await sleep(c.afterMs);
      // Like the Google plugin (patched): a cancelled request ends quietly.
      if (this.fake.closed) return;
      this.queue.put({
        id: this.fake.name,
        delta: { role: 'assistant', content: c.content ?? '' },
      });
    }
  }
}

class FakeLLM extends llm.LLM {
  calls = 0;
  maxRetries: number[] = [];
  closed = false;
  constructor(
    readonly name: string,
    readonly script: Script
  ) {
    super();
  }
  label(): string {
    return this.name;
  }
  chat(opts: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    this.calls++;
    this.maxRetries.push(opts.connOptions?.maxRetry ?? -1);
    return new FakeStream(this, opts);
  }
}

async function reply(model: HedgedLLM): Promise<{ text: string; ids: Set<string> }> {
  const stream = model.chat({
    chatCtx: new llm.ChatContext(),
    connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 5000 },
  });
  let text = '';
  const ids = new Set<string>();
  for await (const chunk of stream) {
    text += chunk.delta?.content ?? '';
    ids.add(chunk.id);
  }
  return { text, ids };
}

describe('HedgedLLM', () => {
  it('uses a fast primary and never starts the backup', async () => {
    const primary = new FakeLLM('primary', {
      chunks: [
        { afterMs: 10, content: 'Hi ' },
        { afterMs: 5, content: 'there.' },
      ],
    });
    const backup = new FakeLLM('backup', { chunks: [{ afterMs: 1, content: 'Backup.' }] });
    const out = await reply(new HedgedLLM(primary, backup, 100));
    expect(out.text).toBe('Hi there.');
    expect(backup.calls).toBe(0);
  });

  it('switches to the backup when the primary is silent past the hedge delay, and closes the primary', async () => {
    const primary = new FakeLLM('primary', { chunks: [{ afterMs: 400, content: 'Too late.' }] });
    const backup = new FakeLLM('backup', {
      chunks: [
        { afterMs: 10, content: 'Quick ' },
        { afterMs: 5, content: 'answer.' },
      ],
    });
    const started = Date.now();
    const out = await reply(new HedgedLLM(primary, backup, 50));
    expect(out.text).toBe('Quick answer.');
    expect([...out.ids]).toEqual(['backup']);
    expect(primary.closed).toBe(true);
    expect(Date.now() - started).toBeLessThan(300);
  });

  it('keeps the primary if it answers first after the backup has started', async () => {
    const primary = new FakeLLM('primary', { chunks: [{ afterMs: 70, content: 'Primary.' }] });
    const backup = new FakeLLM('backup', { chunks: [{ afterMs: 200, content: 'Backup.' }] });
    const out = await reply(new HedgedLLM(primary, backup, 30));
    expect(out.text).toBe('Primary.');
    expect(backup.calls).toBe(1);
    expect(backup.closed).toBe(true);
  });

  it('does not let an empty delta count as the first word', async () => {
    const primary = new FakeLLM('primary', {
      chunks: [
        { afterMs: 5, content: null },
        { afterMs: 400, content: 'Late words.' },
      ],
    });
    const backup = new FakeLLM('backup', { chunks: [{ afterMs: 10, content: 'On time.' }] });
    const out = await reply(new HedgedLLM(primary, backup, 50));
    expect(out.text).toBe('On time.');
  });

  it('starts the backup at once when the primary fails before any output', async () => {
    // The SDK's stream task rejects with nobody awaiting it (prod logs these
    // via the process handler in shutdown-handler.ts); expected here.
    const expected = (reason: unknown): void => {
      if (!String(reason).includes('primary failed')) throw reason;
    };
    process.on('unhandledRejection', expected);
    onTestFinished(() => {
      setTimeout(() => process.off('unhandledRejection', expected), 50);
    });
    const primary = new FakeLLM('primary', { chunks: [], failAfterMs: 5 });
    const backup = new FakeLLM('backup', { chunks: [{ afterMs: 5, content: 'Recovered.' }] });
    const started = Date.now();
    const out = await reply(new HedgedLLM(primary, backup, 1000));
    expect(out.text).toBe('Recovered.');
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("leaves retries to itself: children don't retry on their own", async () => {
    const primary = new FakeLLM('primary', { chunks: [{ afterMs: 5, content: 'hi' }] });
    const backup = new FakeLLM('backup', { chunks: [{ afterMs: 5, content: 'yo' }] });
    const stream = new HedgedLLM(primary, backup, 1000).chat({
      chatCtx: new llm.ChatContext(),
      connOptions: { maxRetry: 3, retryIntervalMs: 0, timeoutMs: 5000 },
    });
    for await (const _ of stream) {
      // drain
    }
    expect(primary.maxRetries).toEqual([0]);
  });

  it('ends quietly when the reply is cancelled while the models are still working', async () => {
    const primary = new FakeLLM('primary', { chunks: [{ afterMs: 200, content: 'late' }] });
    const backup = new FakeLLM('backup', { chunks: [{ afterMs: 200, content: 'late too' }] });
    const hedged = new HedgedLLM(primary, backup, 20);
    const errors: unknown[] = [];
    hedged.on('error', (e) => errors.push(e));
    const stream = hedged.chat({
      chatCtx: new llm.ChatContext(),
      connOptions: { maxRetry: 3, retryIntervalMs: 0, timeoutMs: 5000 },
    });
    await sleep(50); // backup has started too
    stream.close();
    await sleep(300);
    expect(primary.closed && backup.closed).toBe(true);
    expect(primary.calls + backup.calls).toBe(2); // nothing was retried
    expect(errors).toEqual([]);
  });
});
