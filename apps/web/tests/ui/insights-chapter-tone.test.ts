/**
 * "Your Current Chapter" copy is toned by the chapter's type.
 *
 * Before: a loss chapter had no copy of its own, fell back to the default and
 * read "Something beautiful is taking shape" under "Saying Goodbye".
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({ apiGet: vi.fn() }));
vi.mock('../../src/ui/better-than-human.ui.js', () => ({ playMicroExpression: vi.fn() }));

const { getInsightsView } = await import('../../src/ui/insights-view.ui.js');
type Chapter = NonNullable<import('../../src/ui/insights-view.ui.js').InsightData['chapter']>;

const chapterText = () =>
  document.querySelector('.insights-section--chapter')?.textContent?.replace(/\s+/g, ' ') ?? '';

// The view is a singleton that keeps its element, and setup.ts empties the body
// before each test, so every case runs inside one test.
const CASES: Array<{ type: Chapter['type']; title: string; says: string }> = [
  { type: 'loss', title: 'Saying Goodbye', says: 'Go gently' },
  { type: 'decision', title: 'Choosing', says: 'Big choices take time' },
  { type: 'connection', title: 'The Bond', says: 'matter to you' },
  { type: 'triumph', title: 'The Victory', says: 'You did it' },
];

describe('Your Current Chapter', () => {
  it('tones the copy by chapter type, and shows nothing without a chapter', () => {
    const view = getInsightsView();
    view.initialize();
    for (const { type, title, says } of CASES) {
      view.update({ chapter: { type, title } });
      expect(chapterText(), type).toContain(title);
      expect(chapterText(), type).toContain(says);
      expect(chapterText(), type).not.toMatch(/beautiful/i);
      expect(chapterText(), type).not.toMatch(/\u2014/); // no em dashes in copy
    }
    // Not enough data yet: the server sends no chapter, and none is shown
    view.update({});
    expect(document.querySelector('.insights-section--chapter')).toBeNull();
  });
});
