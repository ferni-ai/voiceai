/**
 * Our Story So Far layout (2026-11-16 audit, items 13):
 * - "Right Now" drew a heading over nothing when the person had no energy,
 *   mood or capacity data. A section with nothing under its heading is gone.
 * - "What I've Done for You" repeated its section title inside its own card,
 *   and its inline styles named tokens this app never defines
 *   (--font-size-*, --viz-space-tight, --viz-space-micro), so labels fell back
 *   to the inherited 16px and the card's padding and gaps collapsed to zero.
 * - A visualization whose row partner had no data sat at half width.
 *
 * Rendered with the REAL dashboard and REAL builders on the demo story data.
 *
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '../../src/i18n/index.js';
import { createDemoStoryData, type YourStoryData } from '../../src/ui/visualizations/index.js';
import { getVisualizationStyles } from '../../src/ui/visualizations/styles/visualization.css.js';
import { getYourStoryUI } from '../../src/ui/your-story-dashboard.ui.js';
import { pruneEmptySections } from '../../src/ui/your-story-layout.js';

const ACTIONS = {
  recentCare: [],
  summary: { callsMade: 0, messagesSent: 0, remindersKept: 0, commitmentsFulfilled: 0 },
  commitmentProgress: { kept: 0, pending: 13, total: 13 },
  totalActions: 0,
};

const sectionTitles = (): string[] =>
  [...document.querySelectorAll('.your-story__section-title')].map((h) => h.textContent ?? '');

function show(edit: (d: YourStoryData) => void = () => {}): void {
  const data = createDemoStoryData('demo-user');
  edit(data);
  getYourStoryUI().show(data);
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(ACTIONS), { status: 200 }))
  );
});
afterEach(() => {
  getYourStoryUI().destroy();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('a section with nothing under its heading', () => {
  it('"Right Now" is not drawn when there is no energy, mood or capacity data', () => {
    show((d) => {
      d.energyRings = undefined;
      d.moodCalendar = undefined;
      d.burnoutGauge = undefined;
    });
    expect(sectionTitles()).not.toContain(t('yourStory.sections.rightNow'));
    // the other sections are untouched
    expect(sectionTitles()).toContain(t('yourStory.sections.care'));
    expect(sectionTitles()).toContain(t('yourStory.sections.yourGrowth'));
  });

  it('"Right Now" stays when it has something to show', () => {
    show((d) => {
      d.moodCalendar = undefined;
      d.burnoutGauge = undefined;
    });
    expect(sectionTitles()).toContain(t('yourStory.sections.rightNow'));
    expect(document.getElementById('viz-energy-rings')).not.toBeNull();
  });

  it('pruning removes emptied rows and heading-only sections, nothing else', () => {
    document.body.innerHTML = `
      <section class="your-story__section" id="a"><h3 class="your-story__section-title">A</h3><div class="your-story__viz-row"></div></section>
      <section class="your-story__section" id="b"><h3 class="your-story__section-title">B</h3><p class="your-story__insight">kept</p></section>`;
    pruneEmptySections(document.body);
    expect(document.getElementById('a')).toBeNull();
    expect(document.getElementById('b')).not.toBeNull();
  });
});

describe('"What I\'ve Done for You" card', () => {
  async function care(): Promise<HTMLElement> {
    show();
    const el = document.getElementById('viz-actions-taken')!;
    await vi.waitFor(() => expect(el.querySelector('.viz-stat-card')).not.toBeNull());
    return el;
  }

  it('does not repeat the section title inside the card', async () => {
    const el = await care();
    const title = t('visualizations.actionsTaken.title', "What I've Done for You");
    expect(el.textContent).not.toContain(title);
    expect(el.textContent).toContain(t('visualizations.actionsTaken.keptProgress', { kept: 0, total: 13 }));
  });

  it('names only tokens that exist (every device variant), so labels, padding and gaps are styled', async () => {
    const el = await care();
    const builder = readFileSync(resolve(__dirname, '../../src/ui/visualizations/builders/actions-taken.ts'), 'utf8');
    const used = new Set([...builder.matchAll(/var\((--(?:viz|font-size)-[a-z0-9-]+)/g)].map((m) => m[1]!));
    expect(used.size).toBeGreaterThan(5);
    const defined = getVisualizationStyles() + (document.getElementById('viz-actions-taken-styles')?.textContent ?? '');
    expect([...used].filter((name) => !defined.includes(`${name}:`))).toEqual([]);
    // and the rendered card really carries them (the desktop builder, in jsdom)
    expect(el.querySelector<HTMLElement>('.viz-stat-card__label')!.style.fontSize).toBe('var(--viz-text-sm)');
  });

  it('keeps the kept-count badge from shrinking into the edge', async () => {
    const badge = (await care()).querySelector<HTMLElement>('.viz-badge')!;
    expect(badge.style.flexShrink).toBe('0');
    expect(badge.style.whiteSpace).toBe('nowrap');
  });
});

describe('a visualization alone in its row', () => {
  it('spans the full width, and Open Loops always gets a full-width row', () => {
    show((d) => {
      d.growthRadar = undefined;
    });
    const css = document.getElementById('your-story-styles')?.textContent ?? '';
    expect(css).toMatch(/\.your-story__viz-row > :only-child,\s*\.your-story__viz-row--stack > \*\s*\{\s*grid-column: 1 \/ -1;/);
    const arcs = document.getElementById('viz-emotional-arcs')!;
    expect(arcs.parentElement!.children.length).toBe(1); // the radar's box is gone, the arc is the only child
    expect(document.getElementById('viz-open-loops')!.parentElement!.classList).toContain('your-story__viz-row--stack');
  });
});
