/**
 * Promises in the Your Day hub: each row's state in plain words, server
 * values rendered as text (never markup), a failed load said out loud rather
 * than shown as "nothing open", and nothing at all with the flag off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('../../src/utils/api.js', () => api);

import {
  mountPromisesSection,
  PROMISES_PANEL_STORAGE_KEY,
  promisesPanelEnabled,
  renderPromisesSection,
  stateWords,
  type PromiseRow,
} from '../../src/ui/hub-promises.ui.js';

const NOW = new Date('2026-10-14T18:00:00.000Z');
const row = (over: Partial<PromiseRow>): PromiseRow => ({
  id: 'f1',
  kind: 'commitment',
  text: 'call mom',
  status: 'open',
  dueAt: null,
  raisedVia: null,
  waitingOnYou: false,
  outcome: null,
  ...over,
});

const HOSTILE = '<img src=x onerror="alert(1)">';
const QUOTE_BREAK = '"><script>alert(2)</script><b x="';

/** A hub content element with its Quick Connections section, as ferni-hub.ui.ts renders it. */
function hubContent(): HTMLElement {
  const content = document.createElement('div');
  content.className = 'ferni-hub-content';
  content.innerHTML = '<section class="ferni-hub-section ferni-hub-section-connections"></section>';
  document.body.appendChild(content);
  return content;
}

beforeEach(() => {
  localStorage.setItem(PROMISES_PANEL_STORAGE_KEY, 'true');
});
afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  api.apiGet.mockReset();
  vi.unstubAllEnvs();
});

describe('stateWords', () => {
  it('says each state in plain words', () => {
    const says = (over: Partial<PromiseRow>) => stateWords(row(over), NOW);
    expect(says({})).toBe('Whenever it fits');
    expect(says({ dueAt: '2026-10-14T17:00:00.000Z' })).toBe('Due now');
    expect(says({ dueAt: '2026-10-16T17:00:00.000Z' })).toMatch(/^Coming up /);
    expect(says({ status: 'surfaced', raisedVia: 'opener' })).toBe('I asked you about this');
    expect(says({ status: 'surfaced', raisedVia: 'text' })).toBe('I texted you about this');
    expect(says({ waitingOnYou: true })).toBe('Waiting for your yes');
    expect(says({ outcome: 'failed' })).toBe("Didn't go through");
    expect(says({ status: 'done' })).toBe('Done');
    expect(says({ status: 'released' })).toBe('You let this go');
    expect(says({ status: 'expired' })).toBe('Let go after a while');
  });
});

describe('the Promises section', () => {
  it('renders hostile server values as text: no element, no handler, no broken attribute', () => {
    const el = document.createElement('div');
    el.innerHTML = renderPromisesSection(
      {
        open: [row({ id: QUOTE_BREAK, text: HOSTILE, status: QUOTE_BREAK })],
        recent: [row({ id: 'f2', text: QUOTE_BREAK, status: 'done' })],
      },
      NOW
    );
    expect(el.querySelector('img, script, b')).toBeNull();
    const items = el.querySelectorAll('.ferni-hub-promise');
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector('.ferni-hub-promise-text')?.textContent).toBe(HOSTILE);
    expect([...(items[0]?.attributes ?? [])].map((a) => a.name)).toEqual([
      'class',
      'data-promise-id',
      'data-status',
    ]);
    expect(items[0]?.getAttribute('data-promise-id')).not.toMatch(/[<>"]/);
    expect(items[1]?.querySelector('.ferni-hub-promise-text')?.textContent).toBe(QUOTE_BREAK);
    expect(items[1]?.querySelector('.ferni-hub-promise-state')?.textContent).toBe('Done');
  });

  it('mounts above Quick Connections with what the route sent', async () => {
    api.apiGet.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        open: [row({ text: 'book the dentist' })],
        recent: [row({ id: 'f2', status: 'done' })],
      },
    });
    const content = hubContent();
    await mountPromisesSection(content);
    expect(api.apiGet).toHaveBeenCalledWith('/api/promises', undefined, expect.any(Object));
    const section = content.querySelector('.ferni-hub-promises');
    expect(section?.nextElementSibling?.classList.contains('ferni-hub-section-connections')).toBe(
      true
    );
    expect(
      [...content.querySelectorAll('.ferni-hub-promise-text')].map((e) => e.textContent)
    ).toEqual(['book the dentist', 'call mom']);
  });

  it('a failed load says so instead of "nothing open"', async () => {
    api.apiGet.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    const content = hubContent();
    await mountPromisesSection(content);
    expect(content.querySelector('.ferni-hub-promises')?.textContent).toContain(
      "I couldn't load these just now."
    );
    expect(content.textContent).not.toContain('Nothing open right now.');
  });

  it('with the flag off: no request, no section', async () => {
    localStorage.clear();
    vi.stubEnv('VITE_PROMISES_PANEL', '');
    expect(promisesPanelEnabled()).toBe(false);
    const content = hubContent();
    await mountPromisesSection(content);
    expect(api.apiGet).not.toHaveBeenCalled();
    expect(content.querySelector('.ferni-hub-promises')).toBeNull();
    vi.stubEnv('VITE_PROMISES_PANEL', 'true');
    expect(promisesPanelEnabled()).toBe(true);
  });
});
