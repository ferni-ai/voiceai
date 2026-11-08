/**
 * The life-coaching tools read crisis through the crisis guard first (assessSafety,
 * tools/domains/life-coaching-shared/safety-guards.ts). Before, assessSafety read only its own
 * phrase list, so "i took all my pills" read 'safe' and the anger tool coached it like a bad day.
 * Each line below reads nothing on the phrase floor (checked first), so the read under test can
 * only come from the guard. All lines are fictional.
 */
import { describe, expect, it, vi } from 'vitest';

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
import {
  assessSafety,
  checkSafety,
  CRISIS_RESOURCES,
  getCrisisResponse,
} from '../../../tools/domains/life-coaching-shared/safety-guards.js';
import { EMERGENCY_FOR_THEM, IN_DANGER_NOW, coachingFloorRead } from '../index.js';

const ctx = { userId: 'u', agentId: 'ferni', agentDisplayName: 'Ferni' } as unknown as ToolContext;

async function tool(
  load: () => Promise<Array<{ id: string; create: (c: ToolContext) => unknown }>>,
  id: string
) {
  const def = (await load()).find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  return (def.create(ctx) as { execute: (args: Record<string, unknown>) => Promise<unknown> })
    .execute;
}

const TOOK_PILLS = 'i took all my pills';
const FOR_THEM = 'my dad collapsed and he is not breathing';
const BURDEN = "i'm such a burden to everyone";
const NO_POINT = "i feel like there's no point anymore";

describe('guard first: lines the phrase floor never read', () => {
  it.each([TOOK_PILLS, FOR_THEM, BURDEN, NO_POINT])('%j reads nothing on the floor', (line) => {
    expect(coachingFloorRead(line)).toEqual({ hits: [], concerns: 0 });
  });

  it('anger: "i took all my pills" gets the crisis response, 911 first, then 988', async () => {
    const out = String(
      await (
        await tool(anger, 'angerInTheMoment')
      )({ intensity: 'hot', situation: TOOK_PILLS })
    );
    expect(out).toContain('I take it seriously');
    expect(out).toContain(IN_DANGER_NOW);
    expect(out).toContain('988');
    expect(out).not.toContain('Right now, in this moment');
  });

  it('body image: checkSafety blocks it and hands over the same crisis response', async () => {
    expect(checkSafety(TOOK_PILLS).isSafe).toBe(false);
    const out = String(await (await tool(body, 'bodyImageExplore'))({ struggle: TOOK_PILLS }));
    expect(out).toBe(getCrisisResponse(assessSafety(TOOK_PILLS)));
    expect(out).toContain(IN_DANGER_NOW);
  });

  it('a self crisis offers the lifeline and the text line, and recommends a referral', () => {
    const a = assessSafety(BURDEN);
    expect(a.level).toBe('crisis');
    expect(a.recommendedAction).toBe('immediate_referral');
    expect(a.resources).toEqual([CRISIS_RESOURCES.general, CRISIS_RESOURCES.text]);
    expect(getCrisisResponse(a)).not.toContain(IN_DANGER_NOW);
  });

  it('someone else down and not breathing: 911 for them, not "if you have taken something"', () => {
    const out = getCrisisResponse(assessSafety(FOR_THEM));
    expect(out).toContain(EMERGENCY_FOR_THEM);
    expect(out).not.toContain(IN_DANGER_NOW);
    expect(assessSafety(FOR_THEM).resources).toEqual([CRISIS_RESOURCES.general]);
  });

  it('a distress signal below crisis is a check-in, as on a voice turn', () => {
    const a = assessSafety(NO_POINT);
    expect(a.level).toBe('concerning');
    expect(a.recommendedAction).toBe('check_in');
    expect(checkSafety(NO_POINT).isSafe).toBe(true);
  });
});

describe('the floor still reads what the guard misses (never lower)', () => {
  it.each([
    ["he won't let me leave", CRISIS_RESOURCES.domesticViolence],
    ["i've been using laxatives", CRISIS_RESOURCES.eatingDisorder],
  ])('%j stays crisis with its resource and 988', (line, resource) => {
    const a = assessSafety(line);
    expect(a.level).toBe('crisis');
    expect(a.resources).toEqual([resource, CRISIS_RESOURCES.general]);
  });

  it('abuse the guard reads (K1e) keeps the floor resource and adds the lifeline', () => {
    const a = assessSafety('he hits me when he drinks');
    expect(a.level).toBe('crisis');
    expect(a.resources).toEqual([
      CRISIS_RESOURCES.domesticViolence,
      CRISIS_RESOURCES.general,
      CRISIS_RESOURCES.text,
    ]);
  });

  it('an ordinary line stays safe', () => {
    expect(assessSafety('what should i cook for dinner').level).toBe('safe');
  });
});
