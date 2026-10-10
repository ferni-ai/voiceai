/**
 * A memory the server could not date is shown without a date, not as
 * "Invalid Date" and not as today (the server no longer invents "now").
 */
import { describe, expect, it } from 'vitest';

const { getCognitiveInsightsUI } = await import('../src/ui/cognitive-insights.ui.js');

describe('cognitive insights: undated memories', () => {
  it('renders a memory with no learnedAt without an invalid date', () => {
    getCognitiveInsightsUI().show({
      memories: [
        { id: 'a', type: 'preference', content: 'likes tea', confidence: 0.8, source: 'Ferni' },
        {
          id: 'b',
          type: 'fact',
          content: 'has a dog',
          confidence: 0.9,
          source: 'Ferni',
          learnedAt: '2026-01-05T12:00:00.000Z',
        },
      ],
      patterns: [],
      totalInteractions: 0,
      knowledgeScore: 0,
    });

    const items = Array.from(document.querySelectorAll('.cognitive-insights__memory'));
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('likes tea');
    expect(items[0].textContent).not.toMatch(/invalid/i);
    expect(items[0].querySelectorAll('.cognitive-insights__memory-meta span')).toHaveLength(1);
    expect(items[1].querySelectorAll('.cognitive-insights__memory-meta span')).toHaveLength(2);
  });
});
