/**
 * Every consumer of assessSafety / getCrisisResponse, through its real code
 * path, with SAFETY_WHOLE_WORD_SITES on: for each line whose only crisis
 * indicator lies inside a listed everyday word ('soft'), the output must be
 * exactly what it is with the flag off (main). A soft hit must never move the
 * guards tier: the anger tool returns the crisis response only for 'crisis',
 * so anything lower would drop the 988 response there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => ({ execute: config.execute })) },
}));
vi.mock('../../../tools/domains/life-coaching-shared/user-profile.js', () => ({
  getLifeCoachingProfile: vi.fn().mockResolvedValue({ userId: 'u', boundaryHistory: [] }),
  updateLifeCoachingProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../tools/domains/life-coaching-shared/tool-content-integration.js', () => ({
  getEnhancedToolContext: vi.fn().mockResolvedValue({ personaId: 'ferni', methodology: {} }),
  getOpeningPhrase: vi.fn().mockReturnValue('opening'),
  getValidationPhrase: vi.fn().mockReturnValue('validation'),
  getEncouragementPhrase: vi.fn().mockReturnValue('encouragement'),
  buildResearchBackedResponse: vi.fn().mockReturnValue('research'),
  getCognitiveDistortionContext: vi.fn().mockReturnValue({}),
  getDBTSkillContext: vi.fn().mockReturnValue({}),
}));

import type { ToolContext } from '../../../tools/registry/types.js';
import { getToolDefinitions as anger } from '../../../tools/domains/anger/index.js';
import { getToolDefinitions as body } from '../../../tools/domains/body-relationship/index.js';
import { getToolDefinitions as trauma } from '../../../tools/domains/trauma-support/index.js';
import {
  checkSafety,
  checkSafetyForDomain,
} from '../../../tools/domains/life-coaching-shared/safety-guards.js';

afterEach(() => vi.unstubAllEnvs());

const ctx = { userId: 'u', agentId: 'ferni', agentDisplayName: 'Ferni' } as unknown as ToolContext;

/** One real tool's execute, by domain loader and tool id. */
async function tool(
  load: () => Promise<Array<{ id: string; create: (c: ToolContext) => unknown }>>,
  id: string
) {
  const def = (await load()).find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  return (def.create(ctx) as { execute: (args: Record<string, unknown>) => Promise<unknown> })
    .execute;
}

// Lines whose only crisis indicator lies inside a listed everyday word.
const SOFT = [
  "i'll send it all to my sister before i go",
  "i'm going to spend it all tonight, i won't need it after",
  "i'll skill myself",
  "I can't go online at work",
  'the self-harmony workshop',
];

type Call = [string, (line: string) => Promise<unknown>];
const CALLS: Call[] = [
  [
    'anger angerInTheMoment',
    async (line) => (await tool(anger, 'angerInTheMoment'))({ intensity: 'hot', situation: line }),
  ],
  [
    'body-relationship bodyImageExplore',
    async (line) => (await tool(body, 'bodyImageExplore'))({ struggle: line }),
  ],
  [
    'body-relationship innerCriticBody',
    async (line) => (await tool(body, 'innerCriticBody'))({ whatItSays: line }),
  ],
  [
    'body-relationship emotionalEating',
    async (line) => (await tool(body, 'emotionalEating'))({ trigger: line }),
  ],
  [
    'trauma-support groundingForTrauma',
    async (line) => (await tool(trauma, 'groundingForTrauma'))({ currentState: line }),
  ],
  ['life-coaching-shared checkSafety', async (line) => checkSafety(line)],
  [
    'life-coaching-shared checkSafetyForDomain (high)',
    async (line) => checkSafetyForDomain(line, 'trauma-support'),
  ],
  [
    'life-coaching-shared checkSafetyForDomain (standard)',
    async (line) => checkSafetyForDomain(line, 'productivity'),
  ],
];

describe('every assessSafety consumer: a soft line reads exactly as main', () => {
  for (const [name, call] of CALLS) {
    it.each(SOFT)(`${name}: %j is the same off and on`, async (line) => {
      vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'off');
      const off = await call(line);
      vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'on');
      expect(await call(line)).toEqual(off);
    });
  }

  it('anger: "send it all to my sister before i go" returns the crisis response with 988', async () => {
    vi.stubEnv('SAFETY_WHOLE_WORD_SITES', 'on');
    const out = String(
      await (
        await tool(anger, 'angerInTheMoment')
      )({
        intensity: 'hot',
        situation: "i'll send it all to my sister before i go",
      })
    );
    expect(out).toContain('I take it seriously');
    expect(out).toContain('988');
  });
});
