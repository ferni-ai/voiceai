/**
 * TURN_RECEIPT reports the llm_metrics of the request that produced the reply,
 * not the first one of the turn (a dropped preemptive request or a warm).
 */
import { describe, expect, it } from 'vitest';
import { TurnReceiptRecorder, type TurnReceipt } from '../turn-receipt.js';
import { replyMetric, thoughtTokens } from '../turn-receipt-llm.js';
import type { LlmMetric } from '../turn-metrics.js';

const metric = (o: Partial<LlmMetric>): LlmMetric => ({
  type: 'llm_metrics',
  ttftMs: 600,
  promptTokens: 14_000,
  promptCachedTokens: 12_000,
  completionTokens: 30,
  ...o,
});
/** What LiveKit reports for a stream closed before Gemini sent usage. */
const DROPPED = metric({
  cancelled: true,
  ttftMs: -1,
  promptTokens: 0,
  promptCachedTokens: 0,
  completionTokens: 0,
});

function recorder(env: Record<string, string> = {}) {
  const receipts: TurnReceipt[] = [];
  const rec = new TurnReceiptRecorder({
    sessionId: 'RM_llm',
    userId: undefined,
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    env,
  });
  rec.onMetric({ type: 'eou_metrics', endOfUtteranceDelayMs: 300, transcriptionDelayMs: 90 });
  const end = (): TurnReceipt => {
    rec.onAgentState('speaking');
    rec.onItem({ role: 'assistant', textContent: 'Sure thing.' });
    rec.onAgentState('listening');
    expect(receipts).toHaveLength(1);
    return receipts[0];
  };
  return { rec, end };
}

describe('TURN_RECEIPT llm metric', () => {
  it('reports the real request after a cancelled preemptive one, with its tools', () => {
    const { rec, end } = recorder();
    rec.onRequest([], 90); // preemptive, dropped once the caller's words changed
    rec.onMetric({ ...DROPPED });
    rec.onRequest([], 113); // the reply, after a topic load
    rec.onMetric({ ...metric({ ttftMs: 640, totalTokens: 14_100 }) });
    const r = end();
    expect(r.tokens).toMatchObject({
      prompt: 14_000,
      promptCached: 12_000,
      completion: 30,
      thought: 70,
      cancelled: false,
    });
    expect(r.timing.llmTtftMs).toBe(640);
    expect(r.tools.offered).toBe(113);
  });

  it('on a tool turn keeps the first completed request and the tools it carried', () => {
    const { rec, end } = recorder();
    rec.onRequest([], 90);
    rec.onMetric({ ...metric({ ttftMs: 700, promptTokens: 13_000 }) }); // the tool call
    rec.onRequest([], 113); // the reply after the tool's output, with more tools
    rec.onMetric({ ...metric({ ttftMs: 500, promptTokens: 13_500 }) });
    const r = end();
    expect(r.tokens?.prompt).toBe(13_000);
    expect(r.timing.llmTtftMs).toBe(700);
    expect(r.tools.offered).toBe(90);
  });

  it('on a tool turn, prompt, tools and director all come from the request the tokens are from', () => {
    const message = (chars: number) => ({
      type: 'message',
      role: 'user',
      content: ['x'.repeat(chars)],
    });
    // Baseline: the tool call's request alone.
    const alone = recorder();
    alone.rec.onReminder({ reminder: 'r', directorNotes: 'd', offered: 2, droppedIdx: [1] });
    alone.rec.onRequest([message(400)], 90);
    alone.rec.onMetric({ ...metric({ ttftMs: 700, promptTokens: 13_000 }) });
    const expected = alone.end();

    const { rec, end } = recorder();
    rec.onReminder({ reminder: 'r', directorNotes: 'd', offered: 2, droppedIdx: [1] });
    rec.onRequest([message(400)], 90); // the tool call's request, with a director note
    rec.onMetric({ ...metric({ ttftMs: 700, promptTokens: 13_000 }) });
    rec.onRequest([message(4_000)], 113); // the reply after the tool: bigger prompt, no note
    rec.onMetric({ ...metric({ ttftMs: 500, promptTokens: 13_500 }) });
    const r = end();
    expect(r.tokens?.prompt).toBe(13_000);
    expect(r.timing.llmTtftMs).toBe(700);
    expect(r.tools.offered).toBe(90);
    expect(r.director).toEqual({ offered: 2, kept: 1, droppedIdx: [1] });
    expect(r.prompt.requests).toBe(2);
    expect(r.prompt.sections).toEqual(expected.prompt.sections);
    expect(r.prompt.totalTokensEst).toBe(expected.prompt.totalTokensEst);
  });

  it('on a tool turn, lane and tool schema come from the reported request too', () => {
    const { rec, end } = recorder({ CASCADE_FAST_LANE: 'on' });
    const said = [{ type: 'message', role: 'user', textContent: 'hello there' }];
    rec.onRequest(said as never, 90, 111);
    rec.onMetric({ ...metric({ ttftMs: 700, promptTokens: 13_000 }) });
    rec.onRequest([{ type: 'function_call', name: 'getWeather' }], 113, 999); // after the tool
    rec.onMetric({ ...metric({ ttftMs: 500, promptTokens: 13_500 }) });
    const r = end();
    expect(r.prompt.lane).toEqual({ lane: 'fast', reason: 'chat' });
    expect(r.tools).toMatchObject({ offered: 90, schemaChars: 111 });
  });

  it("a metric from before the first request of its turn still reports that turn's own request", () => {
    const { rec, end } = recorder();
    rec.onMetric({ ...metric({ ttftMs: 300, promptTokens: 12_000 }) }); // an earlier turn's reply
    rec.onRequest([], 113);
    const r = end();
    expect(r.tokens?.prompt).toBe(12_000);
    expect(r.tools.offered).toBe(113);
  });

  it('a reply the caller cut beats an earlier dropped one', () => {
    const { rec, end } = recorder();
    rec.onRequest([], 90);
    rec.onMetric({ ...DROPPED });
    rec.onMetric({ ...metric({ cancelled: true, ttftMs: 820 }) });
    const r = end();
    expect(r.tokens).toMatchObject({ prompt: 14_000, cancelled: true });
    expect(r.timing.llmTtftMs).toBe(820);
  });

  it('with only a dropped request still reports it, as before', () => {
    const { rec, end } = recorder();
    rec.onRequest([], 90);
    rec.onMetric({ ...DROPPED });
    expect(end().tokens).toMatchObject({ prompt: 0, cancelled: true, thought: null });
  });
});

describe('replyMetric / thoughtTokens', () => {
  it('ranks completed over cut over unbilled', () => {
    const done = metric({});
    const cut = metric({ cancelled: true });
    expect(replyMetric(DROPPED, cut)).toBe(cut);
    expect(replyMetric(cut, done)).toBe(done);
    expect(replyMetric(done, cut)).toBe(done);
    expect(replyMetric(done, metric({}))).toBe(done);
  });

  it('among cut ones the last wins', () => {
    const first = metric({ cancelled: true, ttftMs: 800 });
    const last = metric({ cancelled: true, ttftMs: 900 });
    expect(replyMetric(first, last)).toBe(last);
  });

  it('prefers the plugin reasoning count, else total minus prompt and completion', () => {
    expect(thoughtTokens(metric({ reasoningTokens: 12, totalTokens: 14_100 }))).toBe(12);
    expect(thoughtTokens(metric({ reasoningTokens: 0, totalTokens: 14_100 }))).toBe(70);
    expect(thoughtTokens(metric({}))).toBeNull();
  });
});
