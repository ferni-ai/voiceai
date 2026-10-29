/**
 * Every live persona id reaches its own briefing builder (#2836).
 *
 * The lookup matched 'peter-john' and 'joel-dickson' but only the bare names
 * 'maya', 'jordan', 'alex' and 'nayan'. The live ids come from the persona
 * bundles (maya-santos, jordan-taylor, alex-chen, nayan-patel), so those four
 * builders never ran on a call. The lookup now resolves through the canonical
 * persona ids, and the four builders wait behind their own off-by-default flags.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { ran, builderFor } = vi.hoisted(() => {
  const ran: string[] = [];
  const builderFor = (name: string) => ({
    [name]: async () => {
      ran.push(name);
      return [{ content: `briefing from ${name}`, priority: 'standard' }];
    },
  });
  return { ran, builderFor };
});

vi.mock('../../../../intelligence/context-builders/personas/ferni-coordinator-insights.js', () =>
  builderFor('buildFerniCoordinatorIntelligenceContext')
);
vi.mock('../../../../intelligence/context-builders/personas/peter-research-insights/index.js', () =>
  builderFor('buildPeterResearchInsightsContext')
);
vi.mock('../../../../intelligence/context-builders/personas/maya-coaching-insights/index.js', () =>
  builderFor('buildMayaCoachingInsightsContext')
);
vi.mock(
  '../../../../intelligence/context-builders/personas/jordan-milestone-insights/index.js',
  () => builderFor('buildJordanMilestoneInsightsContext')
);
vi.mock(
  '../../../../intelligence/context-builders/personas/alex-communication-insights/index.js',
  () => builderFor('buildAlexCommunicationInsightsContext')
);
vi.mock('../../../../intelligence/context-builders/personas/nayan-wisdom-insights/index.js', () =>
  builderFor('buildNayanWisdomInsightsContext')
);
vi.mock('../../../../intelligence/context-builders/personas/joel-dickson-insights/index.js', () =>
  builderFor('buildLifeMentorInsightsContext')
);

const { buildPersonaSpecificContextInjections } = await import('../intelligence-builders.js');
type Input = Parameters<typeof buildPersonaSpecificContextInjections>[0];

/** The builder each bundle persona should get; null where it has none. */
const EXPECTED: Record<string, { builder: string; flag?: string } | null> = {
  ferni: { builder: 'buildFerniCoordinatorIntelligenceContext' },
  'peter-john': { builder: 'buildPeterResearchInsightsContext' },
  'maya-santos': { builder: 'buildMayaCoachingInsightsContext', flag: 'PERSONA_BRIEFING_MAYA' },
  'jordan-taylor': {
    builder: 'buildJordanMilestoneInsightsContext',
    flag: 'PERSONA_BRIEFING_JORDAN',
  },
  'alex-chen': { builder: 'buildAlexCommunicationInsightsContext', flag: 'PERSONA_BRIEFING_ALEX' },
  'nayan-patel': { builder: 'buildNayanWisdomInsightsContext', flag: 'PERSONA_BRIEFING_NAYAN' },
  'joel-dickson': { builder: 'buildLifeMentorInsightsContext' },
  'peter-lynch': null,
  'john-bogle': null,
};
const ALL_FLAGS = [
  'PERSONA_BRIEFING_MAYA',
  'PERSONA_BRIEFING_JORDAN',
  'PERSONA_BRIEFING_ALEX',
  'PERSONA_BRIEFING_NAYAN',
];

/** The persona ids live calls carry: the id in each bundle's manifest. */
function liveBundleIds(): string[] {
  const dir = fileURLToPath(new URL('../../../../personas/bundles/', import.meta.url));
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .flatMap((entry) => {
      try {
        const raw = readFileSync(`${dir}${entry.name}/persona.manifest.json`, 'utf8');
        return [(JSON.parse(raw) as { identity: { id: string } }).identity.id];
      } catch {
        return [];
      }
    })
    .sort();
}

function firstTurn(personaId: string): Input {
  return {
    services: { userId: 'user-fictional-0101', sessionId: 'session-0101' },
    userData: {},
    persona: { id: personaId },
    userText: 'hi',
    analysis: {},
    turnCount: 0,
  } as unknown as Input;
}

async function builderRunFor(personaId: string): Promise<string[]> {
  ran.length = 0;
  await buildPersonaSpecificContextInjections(firstTurn(personaId));
  return [...ran];
}

describe('persona builders by live persona id (#2836)', () => {
  beforeEach(() => {
    for (const flag of ALL_FLAGS) vi.stubEnv(flag, '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('knows every persona the bundles ship', () => {
    expect(liveBundleIds()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('runs each live persona its own builder when its flag is on', async () => {
    for (const flag of ALL_FLAGS) vi.stubEnv(flag, 'on');
    for (const id of liveBundleIds()) {
      const expected = EXPECTED[id];
      expect(await builderRunFor(id), id).toEqual(expected ? [expected.builder] : []);
    }
  });

  it('puts the builder output in the turn context', async () => {
    vi.stubEnv('PERSONA_BRIEFING_JORDAN', 'on');
    const injections = await buildPersonaSpecificContextInjections(firstTurn('jordan-taylor'));
    expect(injections.map((i) => i.content)).toEqual([
      'briefing from buildJordanMilestoneInsightsContext',
    ]);
  });

  it('keeps the four never-run builders off until their flag is on', async () => {
    for (const [id, expected] of Object.entries(EXPECTED)) {
      const want = expected && !expected.flag ? [expected.builder] : [];
      expect(await builderRunFor(id), id).toEqual(want);
    }
  });

  it('turns on one builder per flag', async () => {
    vi.stubEnv('PERSONA_BRIEFING_NAYAN', 'on');
    expect(await builderRunFor('nayan-patel')).toEqual(['buildNayanWisdomInsightsContext']);
    expect(await builderRunFor('maya-santos')).toEqual([]);
  });

  it('gives an unknown or custom agent no builder, not Ferni', async () => {
    expect(await builderRunFor('my-custom-agent')).toEqual([]);
    // A real person's name never resolves to a persona (alias-resolution.test.ts).
    expect(await builderRunFor('joel')).toEqual([]);
  });
});
