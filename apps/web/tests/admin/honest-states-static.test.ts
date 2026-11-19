/**
 * #4069 honest states, part 3: no dead what-if slider in Trust, no "Coming Soon" list
 * or misleading music status in the Dev Panel, and no demo or sample data in the
 * static dashboards. Each test fails if the fabricated piece comes back.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string): string => readFileSync(resolve(__dirname, '../..', path), 'utf8');

describe('Trust (TR3)', () => {
  it('has no warmth preview slider that nothing wires up', () => {
    const src = source('src/admin/sections/TrustSection.ts');
    expect(src).not.toContain('warmthPreviewSlider');
    expect(src).not.toContain('setupWarmthPreview');
  });
});

describe('Dev Panel (DP1, DP3)', () => {
  const panel = source('src/ui/dev-panel.ui.ts');

  it('has no "Coming Soon" ideas list', () => {
    expect(panel).not.toMatch(/Coming Soon/i);
  });

  it('music status says the API was unreachable rather than "Not Connected"', () => {
    expect(panel).not.toContain('Not Connected');
    expect(panel).toContain('Status API ${status.unavailable}');
  });

  it('the music status and checks print no literal ${ICONS...} text', () => {
    const music = panel.slice(
      panel.indexOf('async function fetchMusicStatus'),
      panel.indexOf('// VOICE MODE TESTING')
    );
    expect(music.length).toBeGreaterThan(1000);
    expect(music).not.toMatch(/'[^'\n]*\$\{ICONS\.[^'\n]*'/);
  });
});

describe('static dashboards (ST1, ST2)', () => {
  it('the cognitive dashboard has no random demo mode', () => {
    const page = source('public/cognitive-dashboard.html');
    expect(page).not.toContain('Math.random');
    expect(page).not.toMatch(/demo/i);
  });

  it('the tools dashboard shows the error instead of sample data', () => {
    const page = source('public/tools-dashboard.html');
    expect(page).not.toContain('getMockData');
    expect(page).not.toContain('Sample Data');
    expect(page).toContain('showUnavailable(indicator, `HTTP ${response.status}`)');
  });
});
