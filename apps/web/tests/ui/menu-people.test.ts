/**
 * "People You've Told Me About": everyone the server returns is listed under a heading,
 * and the panel's four states (loading, ready, empty, error) are distinct and always end.
 *
 * Professional contacts (and any relationship without a heading) used to vanish: the
 * list only rendered people whose relationship had a heading of its own.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn());
const enUS = JSON.parse(
  readFileSync(resolve(__dirname, '../../src/i18n/locales/en-US.json'), 'utf8')
) as Record<string, unknown>;
const text = (key: string): string | undefined => {
  const value = key.split('.').reduce<unknown>((node, part) => {
    return typeof node === 'object' && node !== null
      ? (node as Record<string, unknown>)[part]
      : undefined;
  }, enUS);
  return typeof value === 'string' ? value : undefined;
};

vi.mock('../../src/utils/api-helpers.js', () => ({ apiFetch }));
vi.mock('../../src/utils/environment.js', () => ({ shouldUseDemoData: () => false }));
vi.mock('../../src/i18n/index.js', () => ({
  t: (key: string, fallback?: unknown) =>
    text(key) ?? (typeof fallback === 'string' ? fallback : key),
}));

import { openYourPeople, closeYourPeople } from '../../src/ui/your-people.ui.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const person = (name: string, relationship: string) => ({
  id: name,
  contactId: name,
  name,
  relationship,
  strengthScore: 50,
});

function serve(contacts: () => Promise<Response>) {
  apiFetch.mockImplementation(async (url: string) =>
    url === '/api/contacts' ? contacts() : json({ nudges: [] })
  );
}
const panel = () => document.querySelector('.your-people-panel') as HTMLElement;
const settled = () =>
  vi.waitFor(() => expect(panel()?.getAttribute('data-state')).not.toBe('loading'));
const sections = () =>
  [...document.querySelectorAll('.yp-section')].map((section) => ({
    heading: section.querySelector('.yp-section-title')?.textContent?.trim(),
    names: [...section.querySelectorAll('.yp-person-name')].map((p) => p.textContent?.trim()),
  }));

describe("menu: People You've Told Me About", () => {
  beforeEach(() => {
    closeYourPeople();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a professional contact is listed under a Professional heading', async () => {
    serve(async () =>
      json({ contacts: [person('Dr. Okafor', 'professional'), person('Rosa', 'family')] })
    );
    await openYourPeople();
    await settled();

    expect(sections()).toEqual(
      expect.arrayContaining([
        { heading: 'Professional', names: ['Dr. Okafor'] },
        { heading: 'Family', names: ['Rosa'] },
      ])
    );
    const labels = [...document.querySelectorAll('.yp-person-meta span')].map((s) => s.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Professional', 'Family']));
    expect(panel().getAttribute('data-state')).toBe('ready');
  });

  it('a relationship with no heading of its own is listed under Other, not dropped', async () => {
    serve(async () => json({ contacts: [person('Ines', 'neighbor')] }));
    await openYourPeople();
    await settled();

    expect(sections()).toContainEqual({ heading: 'Other', names: ['Ines'] });
  });

  it('no people: the empty state, in my voice, says how this fills', async () => {
    serve(async () => json({ contacts: [] }));
    await openYourPeople();
    await settled();

    expect(panel().getAttribute('data-state')).toBe('empty');
    expect(document.querySelector('.yp-empty-text')?.textContent).toBe(
      "Tell me about someone you care about and I'll keep them here."
    );
  });

  it('a failed load is the error state with Try again, not the empty state', async () => {
    serve(async () => json({ error: 'Failed to load contacts' }, 500));
    await openYourPeople();
    await settled();

    expect(panel().getAttribute('data-state')).toBe('error');
    expect(document.querySelector('.yp-error-message')?.textContent).toBe(
      'Something unexpected happened. Want to try again?'
    );
    expect(document.querySelector('.yp-error-retry')?.textContent).toBe('Try again');
    expect(document.querySelector('.yp-empty')).toBeNull();
  });

  it('a request that never answers ends in the error state within 10 s', async () => {
    vi.useFakeTimers();
    serve(() => new Promise<Response>(() => {}));
    void openYourPeople();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(panel().getAttribute('data-state')).toBe('error');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  // 2026-10-18 UI audit: search took focus on phones too, throwing up the keyboard over the list
  it.each([
    ['desktop (fine pointer) starts in search', true, true],
    ['touch never autofocuses search', false, false],
  ])('%s', async (_label, fine, focused) => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: fine && query === '(pointer: fine)', media: query }) as MediaQueryList
    );
    serve(async () => json({ contacts: [person('Rosa', 'family')] }));
    await openYourPeople();
    await new Promise((r) => setTimeout(r, 400)); // the focus waits out the entrance
    const search = document.querySelector('.yp-search-input');
    expect(search).not.toBeNull();
    expect(document.activeElement === search).toBe(focused);
    matchMedia.mockRestore();
  });

  it('closing and reopening at once keeps the new panel (the old close timer used to remove it)', async () => {
    vi.useFakeTimers();
    serve(async () => json({ contacts: [person('Rosa', 'family')] }));
    await openYourPeople();
    closeYourPeople();
    await openYourPeople();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(panel()).not.toBeNull();
    expect(document.querySelectorAll('.your-people-panel')).toHaveLength(1);
  });
});
