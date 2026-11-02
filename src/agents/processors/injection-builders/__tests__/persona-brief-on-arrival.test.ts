/**
 * A specialist handed the call mid-way is briefed on its arrival turn, once.
 *
 * buildPersonaSpecificContextInjections ran a persona builder on turn 0, every
 * 10th turn, or when userData.isHandoff was set, and nothing ever set it. So a
 * specialist arriving at turn 7 got no briefing and met the caller cold. The
 * dispatcher now reads this call's pending handoff arrival (a peek that takes
 * nothing) for a persona whose briefing flag is on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ran, arrivalsSeen } = vi.hoisted(() => ({
  ran: [] as string[],
  arrivalsSeen: [] as Array<string | null>,
}));

/** Stands in for a real builder: it takes this call's arrival itself, as the real ones do. */
async function takingBuilder(name: string, canonicalId: string) {
  const { takeHandoffArrival } = await import('../../../../tools/handoff/handoff-arrival.js');
  return {
    [name]: async (input: { services?: { sessionId?: string } }) => {
      ran.push(name);
      arrivalsSeen.push(
        takeHandoffArrival(input.services?.sessionId, canonicalId)?.summary ?? null
      );
      return [{ content: `briefing from ${name}`, priority: 'standard' }];
    },
  };
}

vi.mock('../../../../intelligence/context-builders/personas/ferni-coordinator-insights.js', () =>
  takingBuilder('buildFerniCoordinatorIntelligenceContext', 'ferni')
);
vi.mock('../../../../intelligence/context-builders/personas/peter-research-insights/index.js', () =>
  takingBuilder('buildPeterResearchInsightsContext', 'peter-john')
);
vi.mock('../../../../intelligence/context-builders/personas/maya-coaching-insights/index.js', () =>
  takingBuilder('buildMayaCoachingInsightsContext', 'maya-santos')
);
vi.mock(
  '../../../../intelligence/context-builders/personas/jordan-milestone-insights/index.js',
  () => takingBuilder('buildJordanMilestoneInsightsContext', 'jordan-taylor')
);
vi.mock(
  '../../../../intelligence/context-builders/personas/alex-communication-insights/index.js',
  () => takingBuilder('buildAlexCommunicationInsightsContext', 'alex-chen')
);
vi.mock('../../../../intelligence/context-builders/personas/nayan-wisdom-insights/index.js', () =>
  takingBuilder('buildNayanWisdomInsightsContext', 'nayan-patel')
);
vi.mock('../../../../intelligence/context-builders/personas/joel-dickson-insights/index.js', () =>
  takingBuilder('buildLifeMentorInsightsContext', 'joel-dickson')
);

const { buildPersonaSpecificContextInjections } = await import('../intelligence-builders.js');
const { captureHandoffContext, clearHandoffArrivals, getHandoffContext } =
  await import('../../../../tools/handoff/handoff-arrival.js');
type Input = Parameters<typeof buildPersonaSpecificContextInjections>[0];

const BRIEFING_FLAGS = [
  'PERSONA_BRIEFING_MAYA',
  'PERSONA_BRIEFING_JORDAN',
  'PERSONA_BRIEFING_ALEX',
  'PERSONA_BRIEFING_NAYAN',
  'PERSONA_BRIEFING_PETER_HANDOFF',
];

const SPECIALISTS = ['alex-chen', 'jordan-taylor', 'maya-santos', 'nayan-patel', 'peter-john'];

function turn(personaId: string, turnCount: number, sessionId = 'session-a'): Input {
  return {
    services: { userId: 'user-fictional-0202', sessionId },
    userData: {},
    persona: { id: personaId },
    userText: 'so about that',
    analysis: {},
    turnCount,
  } as unknown as Input;
}

async function contents(input: Input): Promise<string[]> {
  return (await buildPersonaSpecificContextInjections(input)).map((i) => i.content);
}

describe('specialist briefed on its arrival turn', () => {
  beforeEach(() => {
    for (const flag of BRIEFING_FLAGS) vi.stubEnv(flag, '');
    clearHandoffArrivals();
    ran.length = 0;
    arrivalsSeen.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    clearHandoffArrivals();
  });

  it('briefs Alex on turn 7 when he is handed the call, once', async () => {
    vi.stubEnv('PERSONA_BRIEFING_ALEX', 'on');
    captureHandoffContext({ summary: 'a note to the landlord' }, 'session-a', 'alex-chen');

    expect(await contents(turn('alex-chen', 7))).toEqual([
      'briefing from buildAlexCommunicationInsightsContext',
    ]);
    // His builder got the arrival: the dispatcher only peeked
    expect(arrivalsSeen).toEqual(['a note to the landlord']);
    expect(await contents(turn('alex-chen', 8))).toEqual([]);
    expect(ran).toEqual(['buildAlexCommunicationInsightsContext']);
  });

  it('injects nothing for Alex on turn 7 with his flag off', async () => {
    captureHandoffContext({ summary: 'a note to the landlord' }, 'session-a', 'alex-chen');
    expect(await contents(turn('alex-chen', 7))).toEqual([]);
    expect(ran).toEqual([]);
  });

  it('with every briefing flag off, briefs no specialist on arrival', async () => {
    for (const id of SPECIALISTS) captureHandoffContext({ summary: `to ${id}` }, `call-${id}`, id);
    const turns = await Promise.all(SPECIALISTS.map((id) => contents(turn(id, 7, `call-${id}`))));
    expect(turns).toEqual(SPECIALISTS.map(() => []));
    expect(ran).toEqual([]);
  });

  it('briefs Peter on arrival only behind his handoff flag', async () => {
    captureHandoffContext({ summary: 'index funds' }, 'session-a', 'peter-john');
    expect(await contents(turn('peter-john', 7))).toEqual([]);

    vi.stubEnv('PERSONA_BRIEFING_PETER_HANDOFF', 'on');
    expect(await contents(turn('peter-john', 7))).toEqual([
      'briefing from buildPeterResearchInsightsContext',
    ]);
    expect(arrivalsSeen).toEqual(['index funds']);
  });

  it('gives Ferni nothing new on turn 7 after a hand-back, even with every flag on', async () => {
    for (const flag of BRIEFING_FLAGS) vi.stubEnv(flag, 'on');
    captureHandoffContext({ summary: 'back to ferni' }, 'session-a', 'ferni');
    expect(await contents(turn('ferni', 7))).toEqual([]);
    captureHandoffContext({ summary: 'over to joel' }, 'session-a', 'joel-dickson');
    expect(await contents(turn('joel-dickson', 7))).toEqual([]);
    expect(ran).toEqual([]);
  });

  it('does not brief another persona the call was not handed to', async () => {
    for (const flag of BRIEFING_FLAGS) vi.stubEnv(flag, 'on');
    captureHandoffContext({ summary: 'habits' }, 'session-a', 'maya-santos');
    expect(await contents(turn('alex-chen', 7))).toEqual([]);
  });

  it('never briefs one call from an arrival on another call on the same worker', async () => {
    vi.stubEnv('PERSONA_BRIEFING_ALEX', 'on');
    captureHandoffContext({ summary: 'call a only' }, 'session-a', 'alex-chen');

    const [onB, onA] = await Promise.all([
      contents(turn('alex-chen', 7, 'session-b')),
      contents(turn('alex-chen', 7, 'session-a')),
    ]);
    expect(onB).toEqual([]);
    expect(onA).toEqual(['briefing from buildAlexCommunicationInsightsContext']);
    expect(arrivalsSeen).toEqual(['call a only']);
  });

  it('leaves the arrival readable by its existing reader after the briefing', async () => {
    vi.stubEnv('PERSONA_BRIEFING_JORDAN', 'on');
    captureHandoffContext({ summary: 'the promotion' }, 'session-a', 'jordan-taylor');
    await contents(turn('jordan-taylor', 7));
    expect(ran).toEqual(['buildJordanMilestoneInsightsContext']);
    expect(getHandoffContext('session-a')?.summary).toBe('the promotion');
  });
});
