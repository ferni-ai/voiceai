/**
 * Routine and idea icons are brand SVGs looked up by name. A template or a
 * saved routine carries a name; getIdeaIcon() is the only thing that turns it
 * into markup, so whatever string is stored never reaches innerHTML.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IDEA_ICONS,
  IDEA_ICON_FALLBACK,
  getIdeaIcon,
  resolveIdeaIconName,
  type IdeaIconName,
} from '../src/ui/icons/idea-icons.js';

const REPO = join(__dirname, '../../..');
const read = (file: string): string => readFileSync(join(REPO, file), 'utf8');
const NAMES = Object.keys(IDEA_ICONS) as IdeaIconName[];
const EVIL = '<img src=x onerror="alert(1)">';

/** The DOM's own serialization of an SVG string, for comparing with innerHTML. */
function dom(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.innerHTML;
}

const templates = vi.hoisted(() => ({ list: [] as unknown[] }));
const routines = vi.hoisted(() => ({ list: [] as unknown[] }));

vi.mock('../src/services/life-automation.service.js', () => ({
  getLifeAutomationService: () => ({
    listTemplates: async () => ({ templates: templates.list, categories: [], featured: [] }),
  }),
}));

vi.mock('../src/ui/ferni-care/routines-load.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/ui/ferni-care/routines-load.js')>()),
  loadRoutines: async () => ({ kind: 'ready', workflows: routines.list }),
}));

describe('getIdeaIcon', () => {
  it('returns the named brand icon', () => {
    expect(getIdeaIcon('moon')).toBe(IDEA_ICONS.moon);
    expect(getIdeaIcon('sunrise')).toBe(IDEA_ICONS.sunrise);
  });

  it('maps the emoji stored by older routines to the matching icon', () => {
    expect(resolveIdeaIconName('🌅')).toBe('sunrise');
    expect(resolveIdeaIconName('🌬️')).toBe('wind');
    expect(resolveIdeaIconName('🌬')).toBe('wind');
  });

  it.each([
    ['🦄'],
    ['rocket'],
    [''],
    [undefined],
    [null],
    [42],
    ['__proto__'],
    ['constructor'],
    ['toString'],
  ])('falls back to the neutral icon for %s', (name) => {
    expect(getIdeaIcon(name)).toBe(IDEA_ICONS[IDEA_ICON_FALLBACK]);
  });

  it('never echoes the stored string into the markup', () => {
    const out = getIdeaIcon(EVIL);
    expect(out).toBe(IDEA_ICONS[IDEA_ICON_FALLBACK]);
    expect(out).not.toContain('<img');
  });

  it('applies a size override', () => {
    expect(getIdeaIcon('home', 16)).toMatch(/^<svg width="16" height="16"/);
  });
});

describe('the idea icon set follows the brand style', () => {
  it.each(NAMES)('%s is a 24-viewBox, 2px, round, stroke-only SVG', (name) => {
    const icon = IDEA_ICONS[name];
    expect(icon).toContain('viewBox="0 0 24 24"');
    expect(icon).toContain('fill="none"');
    expect(icon).toContain('stroke="currentColor"');
    expect(icon).toContain('stroke-width="2"');
    expect(icon).toContain('stroke-linecap="round"');
    expect(icon).toContain('stroke-linejoin="round"');
    expect(icon).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('the server sends icon names the client knows', () => {
  const iconValues = (file: string): string[] =>
    [...read(file).matchAll(/^\s*icon:\s*'([^']*)'/gm)].map((m) => m[1]);

  it.each([
    'src/services/workflows/templates/template-library.ts',
    'src/services/workflows/workflow-engine.ts',
    'src/tools/domains/routines/index.ts',
  ])('%s', (file) => {
    const values = iconValues(file);
    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((v) => !NAMES.includes(v as IdeaIconName))).toEqual([]);
  });

  it('TemplateIconName on the server matches IDEA_ICONS on the client', () => {
    const text = read('src/services/workflows/templates/template-icons.ts');
    const union = text.match(/export type TemplateIconName =([^;]+);/)?.[1] ?? '';
    const serverNames = [...union.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(serverNames).toEqual([...NAMES].sort());
  });
});

describe('rendered cards', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('the ideas gallery draws brand SVGs and escapes template text', async () => {
    templates.list = [
      {
        id: 'a',
        name: 'Morning',
        description: 'd',
        category: 'morning',
        icon: 'sunrise',
        estimatedTimeToSetup: '1 minute',
        tags: ['x'],
      },
      {
        id: 'b"x',
        name: '<b>n</b>',
        description: 'd',
        category: 'morning',
        icon: EVIL,
        estimatedTimeToSetup: '<i>2</i>',
        tags: ['<u>t</u>'],
      },
    ];
    const { showIdeasGallery } = await import('../src/ui/ferni-care/ideas-gallery.ui.js');
    showIdeasGallery();
    await vi.waitFor(() => expect(document.querySelectorAll('.idea-card')).toHaveLength(2));

    const icons = [...document.querySelectorAll('.idea-card__icon')];
    expect(icons[0].innerHTML).toBe(dom(getIdeaIcon('sunrise', 22)));
    expect(icons[1].innerHTML).toBe(dom(getIdeaIcon(IDEA_ICON_FALLBACK, 22)));
    expect(
      document.querySelector(
        '.ideas-gallery-overlay img, .ideas-gallery-overlay b, .ideas-gallery-overlay u, .ideas-gallery-overlay i'
      )
    ).toBeNull();
    expect(document.querySelectorAll('.idea-card')[1].getAttribute('data-template-id')).toBe('b"x');
    const card = document.querySelectorAll('.idea-card')[1];
    expect(card.querySelector('.idea-card__name')?.textContent).toBe('<b>n</b>');
    expect(card.querySelector('.idea-card__tag')?.textContent).toBe('<u>t</u>');
  });

  it('the routine dashboard draws brand SVGs for names, legacy emoji and junk', async () => {
    routines.list = ['moon', '🚗', EVIL].map((icon, i) => ({
      id: `w${i}`,
      name: `r${i}`,
      status: 'active',
      trigger: { type: 'phrase', phrases: ['<b>hi</b>'] },
      actions: [],
      conditions: [],
      tags: [],
      icon,
    }));
    const { showFerniCareDashboard } = await import('../src/ui/ferni-care/dashboard.ui.js');
    showFerniCareDashboard();
    await vi.waitFor(() => expect(document.querySelectorAll('.ferni-routine')).toHaveLength(3));

    const icons = [...document.querySelectorAll('.ferni-routine__icon')].map((el) => el.innerHTML);
    expect(icons).toEqual([
      dom(getIdeaIcon('moon', 22)),
      dom(getIdeaIcon('car', 22)),
      dom(getIdeaIcon(IDEA_ICON_FALLBACK, 22)),
    ]);
    expect(document.querySelector('.ferni-routine img, .ferni-routine__trigger b')).toBeNull();
  });
});
