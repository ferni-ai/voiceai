/**
 * The words after an emergency line (emergencyRemainder) are never judged as an
 * emergency again (#1866 review). If the remainder read as one, re-judging it
 * would recurse until the stack overflowed, and the caller in crisis would hear
 * nothing. The remainder is stubbed here to force the shapes that could loop.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';

const stub = vi.hoisted(() => ({ rest: (_text: string): string => '' }));
vi.mock('../action-claims.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../action-claims.js')>()),
  emergencyRemainder: (text: string) => stub.rest(text),
}));

import { withActionClaimCheck } from '../action-claim-guard.js';
import { EMERGENCY_LINE } from '../emergency-claim.js';

initializeLogger({ pretty: false, level: 'warn' });

const CRISIS = llm.ChatMessage.create({ role: 'user', content: 'He collapsed, not breathing.' });
const DONE_CALL = llm.FunctionCallOutput.create({
  callId: 'c1',
  name: 'callOnBehalf',
  output: '"Calling Dana now."',
  isError: false,
});

async function reply(items: unknown[], sentence: string): Promise<string> {
  const stream = new ReadableStream<llm.ChatChunk>({
    start(c) {
      c.enqueue({ id: 'r', delta: { role: 'assistant', content: sentence } });
      c.close();
    },
  });
  const tools = { functionTools: { callOnBehalf: {} } };
  const out = await withActionClaimCheck(stream, { items }, tools, undefined, {});
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) {
    text += c.delta?.content ?? '';
  }
  return text;
}

describe('the remainder after an emergency line', () => {
  it.each([
    ['is itself an emergency claim', (): string => "I've called 911."],
    ['is the same sentence again', (text: string): string => text],
    ['claims a call that a tool really made', (): string => "I'm calling her now."],
  ])('%s: no recursion, the line goes out once and the claim is dropped', async (_label, rest) => {
    stub.rest = rest;
    // A call really went out, so a plain call claim would otherwise stand.
    const text = await reply([CRISIS, DONE_CALL], "I'm calling 911 now.");
    expect(text).toBe(EMERGENCY_LINE);
  });

  it('a remainder with no claim still follows the line', async () => {
    stub.rest = () => 'Start chest compressions.';
    expect(await reply([CRISIS], "I'm calling 911 now.")).toBe(
      `${EMERGENCY_LINE} Start chest compressions.`
    );
  });
});
