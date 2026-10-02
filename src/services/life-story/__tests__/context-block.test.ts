/**
 * "Their Story & Values" prompt block: budget, ordering, boundaries, and
 * faith only with consent (never raised first).
 */

import { describe, expect, it } from 'vitest';
import { buildLifeStoryBlock, DEFAULT_LIFE_STORY_BUDGET } from '../context-block.js';
import type { BeliefItem, StoryItem, ValueItem } from '../types.js';

const base = {
  key: 'k',
  source: 'stated' as const,
  confidence: 0.85,
  userEdited: false,
  sourceFactIds: [],
  mentions: 1,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  lastMentionedAt: '2026-09-01T00:00:00Z',
};

function story(
  id: string,
  kind: StoryItem['kind'],
  title: string,
  extra: Partial<StoryItem> = {}
): StoryItem {
  return { ...base, id, area: 'story', kind, title, sourceConversationIds: ['c1'], ...extra };
}

const value = (label: string): ValueItem => ({
  id: `value_${label}`,
  label,
  category: 'family',
  statement: `${label} matters most to me`,
  importance: 0.8,
  mentions: 1,
  source: 'stated',
  userEdited: false,
  sourceConversationIds: ['c1'],
  sourceFactIds: [],
  updatedAt: base.updatedAt,
});

const belief: BeliefItem = {
  ...base,
  id: 'belief_1',
  area: 'beliefs',
  kind: 'practice',
  title: 'Goes to mass on Sundays',
  sourceConversationIds: ['c1'],
};

const STORY = [
  story('s1', 'origin', 'Grew up in Ohio'),
  story('s2', 'family', 'The youngest of four'),
  story('s3', 'story', 'my brother Sam and I built a treehouse', {
    period: 'age 9',
    sourceConversationIds: ['c1', 'c2'],
  }),
  story('s4', 'story', 'I got lost at the state fair'),
  story('s5', 'turning_point', 'Moving to Berlin for that job'),
  story('s6', 'theme', 'Always the one who holds it together'),
  story('s7', 'decision', 'Sleep on big decisions'),
  story('s8', 'story', 'my dad taught me to fish'),
];

describe('life story block', () => {
  it('lists roots, stories (most retold first), values and how they decide, in third person', () => {
    const block = buildLifeStoryBlock({
      story: STORY,
      values: [value('family'), value('honesty')],
      beliefs: [],
    });
    expect(block).toContain('## Their Story & Values');
    expect(block).toContain('Roots: Grew up in Ohio; The youngest of four.');
    expect(block).toMatch(
      /Stories they've told you: their brother Sam and they built a treehouse \(age 9\);/
    );
    expect(block).toContain('What matters most to them: family, honesty.');
    expect(block).toContain('How they decide: Sleep on big decisions.');
    expect(block).toContain("don't ask about what's already here");
    expect(block).not.toMatch(/faith/i);
  });

  it('stays within the budget', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      story(`x${i}`, 'story', `a long story number ${i} about a summer by the lake with cousins`)
    );
    const block = buildLifeStoryBlock({
      story: [...STORY, ...many],
      values: [value('family')],
      beliefs: [belief],
    });
    expect(block.length).toBeLessThanOrEqual(DEFAULT_LIFE_STORY_BUDGET);
    expect(
      buildLifeStoryBlock({ story: STORY, values: [], beliefs: [] }, 200).length
    ).toBeLessThanOrEqual(200);
  });

  it('includes faith only when given (consent on), with the never-raise-first rule', () => {
    const block = buildLifeStoryBlock({ story: [], values: [], beliefs: [belief] });
    expect(block).toContain('Faith (they shared this): Goes to mass on Sundays.');
    expect(block).toContain('never raise faith first, never judge or preach');
  });

  it('leaves out topics the user asked Ferni to avoid', () => {
    const block = buildLifeStoryBlock({
      story: STORY,
      values: [],
      beliefs: [belief],
      allowed: (text) => !/\b(dad|faith)\b/i.test(text),
    });
    expect(block).not.toContain('fish');
    expect(block).not.toContain('mass');
    expect(block).toContain('treehouse');
  });

  it('is empty when there is nothing to say', () => {
    expect(buildLifeStoryBlock({ story: [], values: [], beliefs: [] })).toBe('');
  });
});
