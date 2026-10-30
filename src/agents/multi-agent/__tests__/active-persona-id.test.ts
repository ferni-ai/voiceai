/**
 * ACTIVE_PERSONA_ID (plan S1b): a call starts with Ferni and the real orchestrator hands
 * off to Maya through initializeMultiAgentSession. Then:
 * - a commitment the caller makes to Maya goes through the live capture path
 *   (buildLiveSuperhumanInjections → detectCommitmentE2E) and records who heard it;
 * - the after-call outreach analysis, given the call's personas as session-manager builds
 *   them, runs Maya's habit check because Maya spoke.
 * Flag off, both stay as before: Ferni, and no habit check for a call that started as Ferni.
 * The orchestrator, entry, setter, capture and outreach code are real; agents, stores and
 * publishers are fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonaAgent } from '../orchestrator.js';
import type { SessionServices } from '../../../services/types.js';

const stored = vi.hoisted(() => ({
  memories: [] as Array<Record<string, unknown>>,
  commitments: [] as Array<Record<string, unknown>>,
  habitChecks: 0,
}));

function fakeAgent(personaId: string): PersonaAgent {
  return {
    id: `${personaId}-${Math.random().toString(36).slice(2)}`,
    personaId,
    isActive: false,
    session: {},
    cleanup: vi.fn(async () => undefined),
    say: vi.fn(),
    setMuted: vi.fn(),
    interrupt: vi.fn(),
  };
}

vi.mock('../persona-agent-factory.js', () => ({
  createPersonaAgentFactory: () => async (personaId: string) => fakeAgent(personaId),
}));
vi.mock('../../realtime/frontend-publisher.js', () => ({
  initializeFrontendPublisher: vi.fn(),
}));
vi.mock('../../../services/engagement/team-engagement.js', () => ({
  getHandoffBanter: () => 'Goodbye!',
  getArrivingBanter: () => 'Hello!',
}));

// Capture stores (detection itself is real)
vi.mock('../../../services/superhuman/commitment-keeper.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  saveCommitment: vi.fn(async (c: Record<string, unknown>) => {
    stored.commitments.push(c);
    return { commitment: { ...c, id: 'c1' } };
  }),
}));
vi.mock('../../../memory/cross-persona/index.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  storeMemory: vi.fn(async (m: Record<string, unknown>) => {
    stored.memories.push(m);
    return null;
  }),
}));
vi.mock('../../../services/superhuman/commitment-keeper-e2e.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  checkProgressE2E: vi.fn(async () => ({ progressDetected: false, shouldCelebrate: false })),
}));
vi.mock('../../processors/live-superhuman-reads.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  startLiveSuperhumanReads: () => ({}),
}));
vi.mock('../../../services/trust-systems/unified-recorder.js', () => ({
  recordTrustMoment: vi.fn(),
}));

// After-call outreach: the habit check is the observed call; publishers are fakes
vi.mock('../../../config/feature-flags.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isOutreachTriggerCreationEnabled: () => true,
}));
vi.mock('../../../services/outreach/maya-habit-outreach.js', () => ({
  checkMilestonesToCelebrate: vi.fn(async () => {
    stored.habitChecks++;
    return [];
  }),
  checkStreaksAtRisk: vi.fn(async () => ({ atRisk: false, habits: [] })),
  publishStreakProtectionAlert: vi.fn(async () => false),
  publishMilestoneCelebration: vi.fn(async () => false),
}));
vi.mock('../../../services/outreach/trigger-publisher.js', () => ({
  publishCommitmentTrigger: vi.fn(async () => ({ success: false })),
  publishEmotionalSupportTrigger: vi.fn(async () => ({ success: false })),
  publishMilestoneTrigger: vi.fn(async () => ({ success: false })),
  publishOutreachTrigger: vi.fn(async () => ({ success: false })),
}));
vi.mock('../../../services/outreach/trust-outreach-bridge.js', () => ({
  evaluateTrustBasedOutreach: vi.fn(async () => ({ triggersCreated: 0, triggerTypes: [] })),
  handleConcernDetection: vi.fn(async () => false),
}));
vi.mock('../../../services/predictive-insights/data-collector.js', () => ({
  onSessionEnd: vi.fn(async () => undefined),
}));

const { AgentOrchestrator } = await import('../orchestrator.js');
const { initializeMultiAgentSession } = await import('../multi-agent-entry.js');
const { buildLiveSuperhumanInjections } =
  await import('../../processors/live-superhuman-injections.js');
const { analyzeSessionForOutreach } =
  await import('../../../services/outreach/session-integration.js');
const { createHandoffState } = await import('../../../services/handoff/handoff-state.js');
const { personasVisitedOf, startPersonaOf } =
  await import('../../../services/session/active-persona.js');

const userId = 'Rk2pXy7LmN4qTs9Wd3Fb8Hc00041'; // a member uid
let n = 0;

/** A call that starts with Ferni, then the real orchestrator hands off to Maya */
async function callHandedToMaya(flag: 'on' | 'off'): Promise<SessionServices> {
  vi.stubEnv('ACTIVE_PERSONA_ID', flag);
  const sessionId = `session-S1b_${++n}-1792867440000`;
  const services = {
    sessionId,
    userId,
    personaId: 'ferni',
    startPersonaId: 'ferni',
    sessionStartTime: Date.now(),
    handoffState: createHandoffState('ferni'),
  } as unknown as SessionServices;
  const { orchestrator } = await initializeMultiAgentSession({
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    initialPersonaId: 'ferni',
    services,
    userData: {} as never,
    sessionId,
    userId,
    enableFullHandlers: false,
  });
  expect(services.personaId).toBe('ferni'); // precondition: the call started with Ferni
  const result = await orchestrator.handoff({ targetPersonaId: 'maya-santos', reason: 'habits' });
  expect(result.success).toBe(true);
  expect(orchestrator.getCurrentPersonaId()).toBe('maya-santos');
  return services;
}

beforeEach(() => {
  // Each handoff line is waited out for its estimated length (seconds); nothing plays here
  vi.spyOn(
    AgentOrchestrator.prototype as unknown as { estimateSpeechDuration: (t: string) => number },
    'estimateSpeechDuration'
  ).mockReturnValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  stored.memories.length = 0;
  stored.commitments.length = 0;
  stored.habitChecks = 0;
  vi.unstubAllEnvs();
});

describe('ACTIVE_PERSONA_ID: Ferni hands off to Maya', () => {
  it.each([
    ['on', 'maya-santos'],
    ['off', 'ferni'],
  ] as const)('flag %s: a commitment made to Maya is captured by %s', async (flag, expected) => {
    const services = await callHandedToMaya(flag);
    await buildLiveSuperhumanInjections({
      userId,
      sessionId: services.sessionId,
      userText: "I'm going to call my sister tonight about the wedding",
      emotionalState: { primary: 'neutral', intensity: 0.3, valence: 0, distressLevel: 0 },
      analysis: { intent: 'statement', emotion: 'neutral', confidence: 0.9, topics: [] },
      turnCount: 4,
      services,
    } as unknown as Parameters<typeof buildLiveSuperhumanInjections>[0]);

    // The capture is fire-and-forget on the live path
    await vi.waitFor(() => expect(stored.memories).toHaveLength(1));
    expect(stored.memories[0]).toMatchObject({ category: 'commitment', capturedBy: expected });
    expect(stored.commitments).toEqual([expect.objectContaining({ personaId: expected })]);
  });

  it.each([
    ['on', 1],
    ['off', 0],
  ] as const)('flag %s: the after-call Maya habit check runs %i time(s)', async (flag, runs) => {
    const services = await callHandedToMaya(flag);
    // As session-manager's endSession builds it
    await analyzeSessionForOutreach({
      userId,
      sessionId: services.sessionId,
      personaId: startPersonaOf(services),
      personasVisited: personasVisitedOf(services),
      turns: [{ role: 'user', content: 'I kept my walking streak going this week.' }],
      durationMinutes: 6,
      satisfaction: 'unknown',
    });
    expect(startPersonaOf(services)).toBe('ferni'); // follow-ups still belong to the first persona
    expect(stored.habitChecks).toBe(runs);
  });
});
