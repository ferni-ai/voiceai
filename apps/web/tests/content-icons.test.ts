/**
 * The emoji that decorated feature cards, stats and headers became brand
 * SVGs from CONTENT_ICONS. Each must match the icon style, and the screens
 * that used emoji must now render SVG.
 */

import { describe, expect, it } from 'vitest';
import { CONTENT_ICONS, contentIcon, type ContentIconName } from '../src/ui/icons/content-icons.js';

const NAMES = Object.keys(CONTENT_ICONS) as ContentIconName[];

describe('content icons follow the brand style', () => {
  it.each(NAMES)('%s is a 24-viewBox, 2px, round, stroke-only SVG', (name) => {
    const icon = CONTENT_ICONS[name];
    expect(icon).toMatch(
      /^<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">/
    );
    expect(icon).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('sizes an icon', () => {
    expect(contentIcon('lock', 12)).toMatch(/^<svg width="12" height="12" viewBox="0 0 24 24"/);
  });
});

describe('screens that used emoji now draw SVG', () => {
  const data = {
    recentCare: [
      {
        id: '1',
        type: 'called_for_you',
        narrative: 'Called the dentist',
        timestamp: new Date().toISOString(),
        persona: 'ferni',
        success: true,
      },
      {
        id: '2',
        type: 'remembered',
        narrative: 'Remembered your trip',
        timestamp: new Date().toISOString(),
        persona: 'ferni',
        success: true,
      },
    ],
    summary: { callsMade: 2, messagesSent: 3, remindersKept: 1, commitmentsFulfilled: 4 },
    commitmentProgress: { kept: 1, pending: 1, total: 2 },
    totalActions: 10,
  } as const;

  it.each(['tablet', 'mobile'] as const)(
    'actions taken (%s) draws SVG icons, no emoji',
    async (type) => {
      const { buildActionsTaken } =
        await import('../src/ui/visualizations/builders/actions-taken.js');
      const container = document.createElement('div');
      const context = {
        type,
        platform: 'web',
        width: 800,
        height: 600,
        prefersReducedMotion: true,
        isDarkMode: false,
      };
      buildActionsTaken(container, data as never, context as never);
      expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
      expect(container.textContent ?? '').not.toMatch(/\p{Extended_Pictographic}/u);
    }
  );
});
