/**
 * HANDOFF_HELD_TRUTHFUL (#2387), on the real handoff tool (buildHandoffTools) with
 * HANDOFF_ASK_FIRST on. Synthetic versions of the two situations in the issue:
 * - a pronoun ask to bring the teammate in, after Ferni offered the teammate twice and last
 *   called him "he", was held, and Ferni then claimed the teammate was away;
 * - a short-name ask ("Al") was held (right: no name, no yes), and the director, reading
 *   the held result's start, wrote that Alex was unavailable.
 *
 * As in handoff-ask-first-wiring.test.ts, a free caller's handoff to Alex is refused by
 * the unlock check ("Don't retry"): reaching that refusal proves the consent gate let the
 * handoff through, and the held result proves it did not.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolLog } from '../../../agents/personas/director-tool-state.js';
import { buildHandoffTools } from '../handoff-factory.js';
import { handoffConsent } from '../handoff-consent.js';

interface HandoffTool {
  execute: (args: object, ctx: object) => Promise<Record<string, unknown>>;
}

type Turn = ['user' | 'assistant', string];

function chat(...turns: Turn[]): llm.ChatContext {
  const ctx = new llm.ChatContext();
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

/** Ferni offered Alex twice, then called him "he" */
const OFFERED: Turn[] = [
  ['assistant', 'Alex is great at wording hard messages. Would you like me to bring him in?'],
  ['user', 'Hmm, maybe. Give me a sec.'],
  ['assistant', 'Sure, take your time. Alex would be happy to help.'],
  ['user', 'What would he even say?'],
  ['assistant', "He'd help you find the words. He's a great guy."],
];

async function handoffToAlex(history: llm.ChatContext) {
  const { tools } = await buildHandoffTools('ferni');
  const runCtx = {
    ctx: {
      session: { history },
      userData: {
        services: {
          sessionId: 'held-truthful',
          userProfile: { totalConversations: 0, subscription: { tier: 'free' } },
        },
      },
    },
  };
  return (tools['handoffToAlex'] as HandoffTool).execute({ reason: 'wording a text' }, runCtx);
}

/** What the director's prompt shows for the tool call (director-tool-state.ts) */
function directorSees(result: Record<string, unknown>): string {
  const log = new ToolLog();
  log.finished('c1', 'handoffToAlex', JSON.stringify(result), false);
  return log.lines().join('\n');
}

beforeEach(() => {
  vi.stubEnv('HANDOFF_ASK_FIRST', 'on');
  vi.stubEnv('BYPASS_TEAM_UNLOCKS', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('"bring him in" after Ferni named the teammate', () => {
  const bringHimIn = () =>
    chat(...OFFERED, ['user', 'go ahead and bring him in, I want a word with him']);

  it('off: held, as in the prod call', async () => {
    const result = await handoffToAlex(bringHimIn());
    expect(result['unavailable']).toBe(true);
    expect(String(result['instruction'])).toMatch(/didn't ask for Alex/);
  }, 30_000);

  it('on: goes through the consent gate', async () => {
    vi.stubEnv('HANDOFF_HELD_TRUTHFUL', 'on');
    const result = await handoffToAlex(bringHimIn());
    expect(String(result['instruction'])).toMatch(/Don't retry/);
  }, 30_000);
});

describe('a held handoff (the caller asked for "Al")', () => {
  const askedForAl = () =>
    chat(['assistant', 'Hey Sam, up late?'], ['user', 'could I speak to Al?']);

  it('off: the director reads "unavailable"', async () => {
    const result = await handoffToAlex(askedForAl());
    expect(directorSees(result)).toContain('unavailable');
  }, 30_000);

  it('on: still held, but nothing says Alex is unavailable and no reason may be made up', async () => {
    vi.stubEnv('HANDOFF_HELD_TRUTHFUL', 'on');
    const result = await handoffToAlex(askedForAl());
    expect(result['transferred']).toBe(false);
    expect(result).not.toHaveProperty('unavailable');
    expect(directorSees(result)).not.toContain('unavailable');
    const instruction = String(result['instruction']);
    expect(instruction).toContain('never say Alex is away, busy or unavailable');
    expect(instruction).toContain("don't make up a reason");
    expect(instruction).toContain('ask who they mean');
  }, 30_000);
});

describe('pronoun asks (HANDOFF_HELD_TRUTHFUL on)', () => {
  const ON = { HANDOFF_HELD_TRUTHFUL: 'on' };
  const after = (said: string, turns: Turn[] = OFFERED) => chat(...turns, ['user', said]);

  it.each([
    'bring him in',
    'Can I talk to him?',
    'ok get him on',
    'put him through please',
    'let me speak with him',
  ])('"%s" asks for the teammate Ferni named lately', (said) => {
    expect(handoffConsent(after(said), 'Alex Chen', ON)).toBe('asked');
    expect(handoffConsent(after(said), 'Alex Chen', {})).not.toBe('asked');
  });

  it('is not a request for a teammate Ferni did not name', () => {
    expect(handoffConsent(after('bring him in'), 'Peter John', ON)).toBe('none');
  });

  it('is not a request when the teammate was named more than three of his lines back', () => {
    const long: Turn[] = [
      ...OFFERED.slice(0, 2),
      ['assistant', 'No rush at all.'],
      ['user', 'ok'],
      ['assistant', 'How did the interview go, by the way?'],
      ['user', 'fine'],
      ['assistant', 'Glad to hear it.'],
    ];
    expect(handoffConsent(after('bring him in', long), 'Alex Chen', ON)).toBe('none');
  });

  it('is not a request about someone else ("I need to talk to him about the rent")', () => {
    const landlord: Turn[] = [['assistant', 'Oof, your landlord again?']];
    expect(
      handoffConsent(after('yeah I need to talk to him about the rent', landlord), 'Alex Chen', ON)
    ).toBe('none');
  });
});
