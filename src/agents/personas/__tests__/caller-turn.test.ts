/**
 * An unprompted reply (silence remark, handoff greeting) must not reach Gemini
 * with the SDK's "." as the caller's last words (caller-turn.ts). On 2026-10-17
 * the model answered that "." into a silence: "Sometimes a quiet dot is all
 * the conversation we need." Checked against the SDK's real Google format.
 */
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import { endsOnModelTurn, NO_NEW_WORDS_NOTE, withCallerTurn } from '../caller-turn.js';

type Turn = { role: string; parts: { text?: string }[] };

async function googleTurns(ctx: llm.ChatContext): Promise<Turn[]> {
  const [turns] = (await ctx.toProviderFormat('google')) as [Turn[], unknown];
  return turns;
}

/** A silence remark's request: instructions, then the call so far, ending on Ferni's line. */
function silenceRequest(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: "You are Ferni.\n[They've been quiet for a bit.]" });
  ctx.addMessage({ role: 'user', content: 'Doing pretty good.' });
  ctx.addMessage({ role: 'assistant', content: "I'm really glad to hear that." });
  return ctx;
}

const lastTurn = async (ctx: llm.ChatContext): Promise<Turn | undefined> =>
  (await googleTurns(ctx)).at(-1);

describe('withCallerTurn', () => {
  it('without it the SDK sends "." as the caller\'s last turn (the bug)', async () => {
    expect(await lastTurn(silenceRequest())).toEqual({ role: 'user', parts: [{ text: '.' }] });
  });

  it('a silence request ends on a caller turn that says nothing was said, not "."', async () => {
    const sent = withCallerTurn(silenceRequest(), {});
    const turns = await googleTurns(sent);
    expect(turns.at(-1)).toEqual({ role: 'user', parts: [{ text: NO_NEW_WORDS_NOTE }] });
    expect(turns.some((t) => t.parts.some((p) => p.text === '.'))).toBe(false);
  });

  it('leaves the original context untouched (saved history never sees the note)', () => {
    const original = silenceRequest();
    const before = original.items.length;
    withCallerTurn(original, {});
    expect(original.items.length).toBe(before);
  });

  it('a request that already ends on the caller is sent unchanged', async () => {
    const ctx = silenceRequest();
    ctx.addMessage({ role: 'user', content: 'Hey Ferni.' });
    expect(withCallerTurn(ctx, {})).toBe(ctx);
    expect((await lastTurn(ctx))?.parts).toEqual([{ text: 'Hey Ferni.' }]);
  });

  it('a request ending on a tool result is sent unchanged', () => {
    const ctx = silenceRequest();
    ctx.insert([
      llm.FunctionCall.create({ callId: 'c1', name: 'getWeather', args: '{}' }),
      llm.FunctionCallOutput.create({
        callId: 'c1',
        name: 'getWeather',
        output: 'sunny',
        isError: false,
      }),
    ]);
    expect(endsOnModelTurn(ctx.items)).toBe(false);
    expect(withCallerTurn(ctx, {})).toBe(ctx);
  });

  it('a later system note counts as a caller turn, as in the SDK format', async () => {
    const ctx = silenceRequest();
    ctx.addMessage({ role: 'system', content: 'Mid-call note.' });
    expect(endsOnModelTurn(ctx.items)).toBe(false);
    expect((await lastTurn(ctx))?.role).toBe('user');
  });

  it('an empty trailing caller message adds no turn, so the note is still added', () => {
    const ctx = silenceRequest();
    ctx.addMessage({ role: 'user', content: '' });
    expect(endsOnModelTurn(ctx.items)).toBe(true);
  });

  it('CALLER_TURN_NOTE=off sends the old request', () => {
    const ctx = silenceRequest();
    expect(withCallerTurn(ctx, { CALLER_TURN_NOTE: 'off' })).toBe(ctx);
  });
});
