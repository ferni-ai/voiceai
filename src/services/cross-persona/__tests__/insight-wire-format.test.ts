import { describe, expect, it } from 'vitest';
import type { CrossPersonaInsight } from '../cross-persona-insights.js';
import { SUMMARY_MAX_CHARS, summarizeInsight, toClientInsight } from '../insight-wire-format.js';

const insight: CrossPersonaInsight = {
  id: 'cpi-1',
  source: 'ferni',
  target: 'maya',
  priority: 'high',
  content: 'You mentioned something you wanted to do: "call mom". Just checking in - no pressure.',
  category: 'commitment-followup',
  createdAt: 1_700_000_000_000,
  expiresAt: 1_800_000_000_000,
  proactive: true,
  oneTime: true,
  metadata: { internal: 'not for the client' },
};

describe('toClientInsight', () => {
  it('gives every insight a summary and drops internal fields', () => {
    expect(toClientInsight(insight)).toEqual({
      id: 'cpi-1',
      source: 'ferni',
      category: 'commitment-followup',
      summary: 'You mentioned something you wanted to do: "call mom".',
      content: insight.content,
      priority: 'high',
      createdAt: 1_700_000_000_000,
      isNew: true,
    });
  });
});

describe('summarizeInsight', () => {
  it('keeps a short first sentence whole', () => {
    expect(summarizeInsight('Budget is 80% used this month. Worth keeping in mind.')).toBe(
      'Budget is 80% used this month.'
    );
  });

  it('cuts a long sentence at a word boundary with an ellipsis', () => {
    const long = 'Your keystone habit is holding strong and every small morning walk is making the rest of the week easier to carry';
    const summary = summarizeInsight(long);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(summary.endsWith('…')).toBe(true);
    expect(long.startsWith(summary.slice(0, -1))).toBe(true);
    expect(summary.slice(0, -1)).not.toMatch(/\s$/);
  });

  it('does not split on a decimal point or abbreviation dot inside a word', () => {
    expect(summarizeInsight('Spending is up 2.5x this week')).toBe('Spending is up 2.5x this week');
  });
});
