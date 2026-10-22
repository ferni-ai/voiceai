/**
 * A reply that says it will check and calls no tool is logged as
 * ANNOUNCED_CHECK_NO_TOOL, with no words in the log (announced-check.ts).
 * Prod 2026-10-17: "I'll check the current weather for <city> right now." and
 * no tool call; then a temperature the model made up.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', () => {
  const l: Record<string, unknown> = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
  l.child = () => l; // modules loaded through the memory barrel make child loggers at import
  return { getLogger: () => l, createLogger: () => l, safeLog: () => l };
});

import { withActionClaimCheck } from '../action-claim-guard.js';
import { announcesCheck, withAnnouncedCheckLog } from '../announced-check.js';

const chunk = (content: string): llm.ChatChunk => ({
  id: 'r1',
  delta: { role: 'assistant', content },
});
const toolCall = (name: string): llm.ChatChunk => ({
  id: 'r1',
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
async function drain(stream: ReadableStream<llm.ChatChunk>): Promise<llm.ChatChunk[]> {
  const out: llm.ChatChunk[] = [];
  for await (const c of stream as unknown as AsyncIterable<llm.ChatChunk>) out.push(c);
  return out;
}
const tools = { functionTools: { getWeather: {}, playMusic: {} } };
const ANNOUNCE = ["I'll check the current weather ", 'for you right now.'];
const flagged = (): unknown[][] =>
  warn.mock.calls.filter((c) => c[1] === 'ANNOUNCED_CHECK_NO_TOOL');

describe('announcesCheck', () => {
  it.each([
    "I'll check the current weather for you right now.",
    'Let me look that up.',
    'Give me a second, let me pull up the forecast.',
    'Checking now.',
    'One sec, let me see what the score was.',
    'I’m going to check the news for you.',
  ])('flags %s', (text) => expect(announcesCheck(text)).toBe(true));

  it.each([
    'Let me check in with you about last week.',
    "I'll check back with you tomorrow.",
    'It is seventy-four degrees out.',
    'That sounds like a long day.',
  ])('leaves %s alone', (text) => expect(announcesCheck(text)).toBe(false));
});

describe('withAnnouncedCheckLog', () => {
  beforeEach(() => warn.mockClear());

  it('logs an announced check with no tool call, counts only, and passes the reply through', async () => {
    const out = await drain(
      await withAnnouncedCheckLog(Promise.resolve(streamOf(...ANNOUNCE)), tools, {})
    );
    expect(out.map((c) => c.delta?.content).join('')).toBe(ANNOUNCE.join(''));
    expect(flagged()).toHaveLength(1);
    expect(flagged()[0][0]).toEqual({ toolsOpen: 2, liveDataToolOpen: true });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/weather for you/);
  });

  it('does not log when the reply calls a tool', async () => {
    const stream = streamOf(...ANNOUNCE, toolCall('getWeather'));
    const out = await drain(await withAnnouncedCheckLog(Promise.resolve(stream), tools, {}));
    expect(out).toHaveLength(3);
    expect(flagged()).toHaveLength(0);
  });

  it('does not log a reply that announces nothing', async () => {
    await drain(await withAnnouncedCheckLog(Promise.resolve(streamOf('Sounds good.')), tools, {}));
    expect(flagged()).toHaveLength(0);
  });

  it('ANNOUNCED_CHECK_LOG=off returns the very same stream', async () => {
    const stream = streamOf(...ANNOUNCE);
    const off = { ANNOUNCED_CHECK_LOG: 'off' };
    expect(await withAnnouncedCheckLog(Promise.resolve(stream), tools, off)).toBe(stream);
  });

  it('is on the live reply path: withActionClaimCheck (ferni-agent llmNode) logs it', async () => {
    const chatCtx = llm.ChatContext.empty();
    chatCtx.addMessage({ role: 'user', content: 'can you check the weather?' });
    await drain(
      await withActionClaimCheck(Promise.resolve(streamOf(...ANNOUNCE)), chatCtx, tools, undefined, {})
    );
    expect(flagged()).toHaveLength(1);
  });

  it('also with the action-claim guard off', async () => {
    const chatCtx = llm.ChatContext.empty();
    const off = { ACTION_CLAIM_GUARD: 'off' };
    await drain(
      await withActionClaimCheck(Promise.resolve(streamOf(...ANNOUNCE)), chatCtx, tools, undefined, off)
    );
    expect(flagged()).toHaveLength(1);
  });
});
