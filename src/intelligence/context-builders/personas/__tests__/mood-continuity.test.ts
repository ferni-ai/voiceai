import { describe, expect, it } from 'vitest';

import type { PersonaConfig } from '../../../../personas/types.js';
import { buildHumanizingContext } from '../../humanization/humanizing.js';
import { getMoodContext, personaMoodFor, selectPersonaMood } from '../persona-mood.js';

const persona = {
  id: 'ferni',
  name: 'Ferni',
  personality: { energy: 0.7 },
} as unknown as PersonaConfig;

const turn = (overrides: Record<string, unknown> = {}) =>
  buildHumanizingContext({
    persona,
    userMessage: 'Tell me about your week',
    currentTopic: 'chat',
    recentTopics: ['chat'],
    turnCount: 3,
    sessionCount: 4,
    isVulnerableMoment: false,
    userEmotionIntensity: 0.3,
    ...overrides,
  });

const share = (moods: string[], mood: string) =>
  moods.filter((m) => m === mood).length / moods.length;

describe('persona mood continuity', () => {
  it('holds the conversation mood instead of re-rolling it every turn', () => {
    const moods = Array.from({ length: 30 }, () => turn({ currentMood: 'nostalgic' }).mood.state);
    expect(new Set(moods)).toEqual(new Set(['nostalgic']));
  });

  it('builds the full mood for a known state', () => {
    const mood = personaMoodFor(persona, 'playful');
    expect(mood.state).toBe('playful');
    expect(mood.moodPhrases.length).toBeGreaterThan(0);
  });

  it("lets a recent conversation's mood linger and an old one give way", () => {
    const pick = (hours: number) =>
      Array.from(
        { length: 2000 },
        () => selectPersonaMood(persona, getMoodContext(0, 'nostalgic', hours)).state
      );
    expect(share(pick(2), 'nostalgic')).toBeGreaterThan(share(pick(72), 'nostalgic') * 2);
  });
});
