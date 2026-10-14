/**
 * The handoff tool itself holds an unasked handoff (HANDOFF_ASK_FIRST=on)
 * before it reaches the executor. A free user's handoff to Alex is refused by
 * the unlock check ("Don't retry"), so reaching that refusal proves the call
 * got past the consent gate, and the consent message proves it did not.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHandoffTools } from '../handoff-factory.js';

interface HandoffTool {
  execute: (args: object, ctx: object) => Promise<Record<string, unknown>>;
}

function runCtx(lastUserWords: string) {
  const history = new llm.ChatContext();
  history.addMessage({ role: 'assistant', content: 'Hey Sam, up late?' });
  history.addMessage({ role: 'user', content: lastUserWords });
  return {
    ctx: {
      session: { history },
      userData: {
        services: {
          sessionId: 'ask-first-wiring',
          userProfile: { totalConversations: 0, subscription: { tier: 'free' } },
        },
      },
    },
  };
}

async function handoffToAlex(lastUserWords: string) {
  const { tools } = await buildHandoffTools('ferni');
  return (tools['handoffToAlex'] as HandoffTool).execute(
    { reason: 'help drafting a text' },
    runCtx(lastUserWords)
  );
}

const saved = { ask: process.env.HANDOFF_ASK_FIRST, bypass: process.env.BYPASS_TEAM_UNLOCKS };
afterEach(() => {
  for (const [k, v] of [
    ['HANDOFF_ASK_FIRST', saved.ask],
    ['BYPASS_TEAM_UNLOCKS', saved.bypass],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('the handoff tool with HANDOFF_ASK_FIRST', () => {
  it('holds a handoff the caller never asked for, before the executor runs', async () => {
    process.env.HANDOFF_ASK_FIRST = 'on';
    delete process.env.BYPASS_TEAM_UNLOCKS;
    const result = await handoffToAlex('My friend Dana has not texted back in four days.');
    expect(result['unavailable']).toBe(true);
    expect(String(result['instruction'])).toMatch(/didn't ask for Alex/);
  }, 30_000);

  it('lets the same call through to the executor when the flag is off', async () => {
    delete process.env.HANDOFF_ASK_FIRST;
    delete process.env.BYPASS_TEAM_UNLOCKS;
    const result = await handoffToAlex('My friend Dana has not texted back in four days.');
    expect(String(result['instruction'])).toMatch(/Don't retry/);
  }, 30_000);

  it('lets it through when the caller asked for the teammate', async () => {
    process.env.HANDOFF_ASK_FIRST = 'on';
    delete process.env.BYPASS_TEAM_UNLOCKS;
    const result = await handoffToAlex('Can I talk to Alex about how to word it?');
    expect(String(result['instruction'])).toMatch(/Don't retry/);
  }, 30_000);
});
