/**
 * The memory view in the DOM: sections with provenance, the caller's text
 * only ever as text, loading / failed / empty states, row actions that match
 * what each kind allows, the inline correction, and a full open → forget →
 * re-read round trip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/i18n/index.js', () => ({
  t: (key: string) => key,
  formatDate: (d: Date, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(d),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../../src/ui/whisper.ui.js', () => ({ toast }));
const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../../src/utils/api.js', () => api);

import { openMemoryView, renderKnownView } from '../../../src/ui/memory/known-view.ui.js';
import type { KnownItem, KnownView } from '../../../src/ui/memory/known.js';

const mindy: KnownItem = {
  id: 'w1',
  kind: 'world',
  text: 'health: recovering from knee surgery',
  about: 'Mindy',
  relation: 'sister',
  source: 'told',
  quote: 'her knee surgery went fine',
  at: '2026-10-09T18:00:00.000Z',
};
const reading: KnownItem = {
  id: 'jokes-when-anxious',
  kind: 'pattern',
  text: 'jokes when anxious, then wants practical help',
  source: 'noticed',
  at: '2026-10-08T00:00:00.000Z',
};
const view: KnownView = { people: [mindy], readsYou: [reading] };
const handlers = () => ({ act: vi.fn(), retry: vi.fn() });
const rows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('.ferni-known__row')];
const buttons = (row: HTMLElement) =>
  [...row.querySelectorAll<HTMLButtonElement>('.ferni-known__actions button')].map(
    (b) => b.textContent
  );

describe('renderKnownView', () => {
  it('shows each section with who, what, the caller’s words and where it came from', () => {
    const body = renderKnownView(view, handlers());
    expect([...body.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'ferniKnows.people',
      'memoryView.readsYou',
    ]);
    expect(body.querySelector('.ferni-known__note')?.textContent).toBe('memoryView.readsYouNote');
    const [row] = rows(body);
    expect(row!.querySelector('.ferni-known__about')?.textContent).toBe('Mindy · sister');
    expect(row!.querySelector('.ferni-known__quote')?.textContent).toBe(
      'her knee surgery went fine'
    );
    expect(row!.querySelector('.ferni-known__meta')?.textContent).toBe(
      'ferniKnows.sourceExplicit · Oct 9'
    );
    expect(rows(body)[1]!.querySelector('.ferni-known__meta')?.textContent).toBe(
      'ferniKnows.sourceInferred · Oct 8'
    );
  });

  it('never parses the caller’s text as HTML', () => {
    const body = renderKnownView(
      {
        lifeNow: [
          {
            ...mindy,
            about: undefined,
            text: '<img src=x onerror="alert(1)">',
            quote: '<b>hi</b>',
          },
        ],
      },
      handlers()
    );
    expect(body.querySelector('img')).toBeNull();
    expect(body.querySelector('b')).toBeNull();
    expect(body.querySelector('.ferni-known__text')?.textContent).toBe(
      '<img src=x onerror="alert(1)">'
    );
  });

  it('shows loading, a failure with retry, and an empty memory differently', () => {
    expect(renderKnownView(undefined, handlers()).getAttribute('aria-busy')).toBe('true');
    const h = handlers();
    const failed = renderKnownView(null, h);
    expect(failed.textContent).toContain('app.couldNotLoadMemories');
    failed.querySelector('button')!.click();
    expect(h.retry).toHaveBeenCalled();
    expect(renderKnownView({}, handlers()).textContent).toBe('memoryView.empty');
  });

  it('offers Correct for facts and only That’s wrong / Forget for readings', () => {
    const h = handlers();
    const [fact, pattern] = rows(renderKnownView(view, h));
    const more = fact!.querySelector<HTMLButtonElement>('.ferni-known__more')!;
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(buttons(fact!)).toEqual(['ferniKnows.correctButton', 'memoryView.forget']);
    expect(buttons(pattern!)).toEqual(['memoryView.thatsWrong', 'memoryView.forget']);
    pattern!.querySelector<HTMLButtonElement>('.ferni-known__actions button')!.click();
    expect(h.act).toHaveBeenCalledWith(reading, 'wrong');
  });

  it('corrects inline: a changed value is sent, an unchanged one or Escape just closes', () => {
    const h = handlers();
    const [row] = rows(renderKnownView(view, h));
    const correct = () => {
      row!.querySelector<HTMLButtonElement>('.ferni-known__actions button')!.click();
      return row!.querySelector<HTMLInputElement>('.ferni-known__input')!;
    };
    let input = correct();
    expect(input.value).toBe(mindy.text);
    input.form!.requestSubmit();
    expect(h.act).not.toHaveBeenCalled();
    expect(row!.querySelector('form')).toBeNull();
    input = correct();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(row!.querySelector('form')).toBeNull();
    input = correct();
    input.value = 'health: hip surgery';
    input.form!.requestSubmit();
    expect(h.act).toHaveBeenCalledWith(mindy, 'correct', 'health: hip surgery');
  });
});

describe('openMemoryView', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('opens labelled, forgets through the API, then shows what the server now has', async () => {
    api.apiGet
      .mockResolvedValueOnce({ ok: true, status: 200, data: view })
      .mockResolvedValueOnce({ ok: true, status: 200, data: { readsYou: [reading] } });
    api.apiPost.mockResolvedValue({ ok: true, status: 200 });
    await openMemoryView();
    const dialog = document.querySelector('dialog.ferni-known')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe('ferni-known-title');
    expect(rows(dialog)).toHaveLength(2);
    const forget = [
      ...rows(dialog)[0]!.querySelectorAll<HTMLButtonElement>('.ferni-known__actions button'),
    ].at(-1)!;
    forget.click();
    await vi.waitFor(() => expect(rows(dialog)).toHaveLength(1));
    expect(api.apiPost).toHaveBeenCalledWith('/api/memories/known/world/w1', { action: 'forget' });
    expect(toast.success).toHaveBeenCalledWith('app.memoryRemoved');
    expect(document.activeElement?.id).toBe('ferni-known-title');
  });

  it('closes with its close button', async () => {
    api.apiGet.mockResolvedValue({ ok: true, status: 200, data: {} });
    await openMemoryView();
    document.querySelector<HTMLButtonElement>('.ferni-known__close')!.click();
    expect(document.querySelector('dialog.ferni-known')).toBeNull();
  });
});
