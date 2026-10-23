/**
 * FORGET_EVERY_READER and a call Ferni places to its own user: why it called
 * (the job's triggerReason), a commitment and the last talk reach the opener
 * only if they are not about a topic the caller asked to forget. Same real
 * path as proactive-reason-opener.test.ts (metadata parser → orchestrator →
 * directedGreeting → director); only the model behind the actor is faked.
 */
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actor = vi.hoisted(() => ({ prompts: [] as string[] }));
vi.mock('../../../config/generative-model.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/generative-model.js')>()),
  getGenerativeModel: async () => ({
    generateContent: async (prompt: string) => {
      actor.prompts.push(prompt);
      return { response: { text: () => "Hey Sam, it's Ferni, just calling to check in." } };
    },
  }),
}));
vi.mock('../../../memory/recall/forget.js', async (original) => ({
  ...(await original<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => ['Biscuit'],
}));

const { setupCallTypeContexts } = await import('../../voice-agent-entry/metadata-parser.js');
const { AgentOrchestrator } = await import('../orchestrator.js');
const { signDispatch } = await import('../../../services/outreach/on-behalf-dispatch.js');
const { resetForgetTopicsSource } = await import('../../../memory/recall/forget-topics-source.js');

const SECRET = 'lk-test-secret';
const USER = 'member-proactive-forget';

async function openerPrompt(sessionId: string): Promise<string> {
  vi.stubEnv('LIVEKIT_API_SECRET', SECRET);
  const metadata = {
    type: 'proactive_outreach',
    userId: USER,
    userName: 'Sam',
    triggerType: 'commitment_followup',
    triggerReason: 'Sam wanted a call about how Biscuit is doing after the vet',
    relatedCommitment: { summary: 'take Biscuit to the vet on Friday' },
    lastSessionSummary: 'Biscuit chewed the couch again.',
  };
  const raw = JSON.stringify(signDispatch(metadata, SECRET));
  await setupCallTypeContexts(
    JSON.parse(raw),
    'proactive_outreach',
    sessionId,
    `room-${sessionId}`,
    raw
  );
  const say = vi.fn();
  const orchestrator = new AgentOrchestrator({
    ctx: {} as never,
    room: new EventEmitter() as never,
    userParticipant: { identity: 'app_sam', attributes: {} } as never,
    createPersonaAgent: async () =>
      ({
        id: 'agent-1',
        personaId: 'ferni',
        say,
        setMuted: vi.fn(),
        userData: { userName: 'Sam', userId: USER },
        session: {},
      }) as never,
    sessionId,
  });
  await orchestrator.start('ferni');
  await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1), { timeout: 3000 });
  return actor.prompts.at(-1) ?? '';
}

describe('the opener of a call Ferni places, and a forgotten topic', () => {
  beforeEach(() => {
    actor.prompts = [];
    resetForgetTopicsSource();
    vi.stubEnv('PROACTIVE_REASON_OPENER', 'on');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('on: why it called, the commitment and the last talk stay out when they are about it', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'on');
    const prompt = await openerPrompt('pro-forget-on');
    expect(prompt).not.toMatch(/biscuit/i);
    expect(prompt).not.toMatch(/why you called them|something they said|talked about last time/);
  });

  it('off: the opener is given all three, as before', async () => {
    vi.stubEnv('FORGET_EVERY_READER', 'off');
    const prompt = await openerPrompt('pro-forget-off');
    expect(prompt).toContain('- why you called them: Sam wanted a call about how Biscuit');
    expect(prompt).toContain('- something they said they would do: take Biscuit to the vet');
    expect(prompt).toContain('- what you talked about last time: Biscuit chewed the couch');
  });
});
