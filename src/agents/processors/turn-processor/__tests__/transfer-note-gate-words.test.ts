/**
 * The live call site gives the human-transfer note the turn's chat context (CRISIS_LEXICAL_V2),
 * so the note defers only on the words the gate scores (injection-builders/gate-words.ts).
 * Runs the real buildContextInjections with the turn hook's chat context. Fictional lines.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../services/cross-persona/team-huddle.js', () => ({
  generateTeamHuddle: vi.fn(async () => ({ observations: [] })),
  formatTeamHuddleForLLM: () => '',
}));
vi.mock('../../../../services/outreach/conversation-context-bridge.js', () => ({
  buildOutreachBridgeInjection: vi.fn(async () => null),
}));
vi.mock('../../../../services/session/session-summary.js', () => ({
  getActiveUserContext: vi.fn(async () => null),
  formatContextForVoiceCall: () => '',
}));
vi.mock('../../../../intelligence/context-builders/external/pending-call-results.js', () => ({
  buildAllPendingResultsContext: vi.fn(async () => null),
}));

const { buildContextInjections } = await import('../context-injections.js');

/** The turn hook's chat context: the caller's earlier words, not yet the new message. */
function hookCtx(...earlier: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const content of earlier) ctx.addMessage({ role: 'user', content });
  return ctx;
}

let n = 0;
async function categories(userText: string, turnCtx: llm.ChatContext) {
  n += 1;
  const args = [
    {
      turnCtx,
      services: { sessionId: `session-gate-words-${n}`, userId: `uid-gate-words-${n}` },
      userData: { turnCount: 4, callerTurn: 2 },
      persona: { id: 'ferni', name: 'Ferni' },
      userText,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    },
    { analysis: { intent: 'chat', emotion: 'neutral', topics: [] }, currentTopic: undefined },
    { primary: 'neutral', intensity: 0.2, distressLevel: 0 },
    { length: { guidance: 'Keep it short.' } },
    { needsReinforcement: false },
    null,
    undefined,
    {},
  ] as never as Parameters<typeof buildContextInjections>;
  return (await buildContextInjections(...args)).injections.map((i) => i.category);
}

afterEach(() => vi.unstubAllEnvs());

describe('the turn processor passes the turn chat context to the transfer note', () => {
  it('a crisis line the gate reads by itself: the note is left to the live gate', async () => {
    vi.stubEnv('CRISIS_LEXICAL_V2', 'on');
    vi.stubEnv('CRISIS_GUARD_MODE', 'live');
    expect(await categories('I want to kill myself', hookCtx())).not.toContain('crisis_transfer');
  });

  it('the same words after "I\'m not saying": the gate passes them, so the note stays', async () => {
    vi.stubEnv('CRISIS_LEXICAL_V2', 'on');
    vi.stubEnv('CRISIS_GUARD_MODE', 'live');
    const out = await categories('I want to die', hookCtx("I'm not saying"));
    expect(out).toContain('crisis_transfer');
  });
});
