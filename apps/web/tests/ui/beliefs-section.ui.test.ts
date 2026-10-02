/**
 * "Faith & beliefs" section of the Sensitive tab: hidden while Beliefs is
 * off, listed with correct / forget while it's on (service mocked).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  get: vi.fn(),
  edit: vi.fn(),
  del: vi.fn(),
  confirm: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: h.toast, whisper: h.toast }));
vi.mock('../../src/ui/memory-control/confirm-dialog.js', () => ({
  confirmAction: h.confirm,
  keepFocusInside: vi.fn(),
}));
vi.mock('../../src/services/life-story.service.js', () => ({
  getBeliefs: h.get,
  editBelief: h.edit,
  deleteBelief: h.del,
}));

import { BeliefsSection } from '../../src/ui/memory-control/beliefs-section.js';

const ITEM = {
  id: 'belief_mass',
  kind: 'practice' as const,
  title: 'Goes to mass on Sundays',
  source: 'stated' as const,
  userEdited: false,
  sourceConversationIds: ['c1'],
  updatedAt: '2026-09-30T10:00:00Z',
};

let host: HTMLElement;
let section: BeliefsSection;
const flush = () => new Promise((r) => setTimeout(r, 0));
const render = () => {
  host.innerHTML = section.html(true);
};

beforeEach(async () => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="host"></div>';
  host = document.getElementById('host')!;
  h.get.mockResolvedValue({ ok: true, value: { enabled: true, items: [ITEM] } });
  section = new BeliefsSection(host, render);
});

describe('Faith & beliefs section', () => {
  it('renders nothing while Beliefs is off', async () => {
    await section.load();
    expect(section.html(false)).toBe('');
  });

  it('lists what was shared with the never-judge note', async () => {
    await section.load();
    render();
    expect(host.textContent).toContain('Faith & beliefs');
    expect(host.textContent).toContain('I never bring faith up first');
    expect(host.querySelector('[data-belief-id="belief_mass"]')!.textContent).toContain('Practice');
  });

  it('corrects a belief', async () => {
    await section.load();
    render();
    h.edit.mockResolvedValue({
      ok: true,
      value: { ...ITEM, title: 'Goes to mass most Sundays', userEdited: true },
    });
    (host.querySelector('[data-action="belief-edit"]') as HTMLElement).click();
    await flush();
    (host.querySelector('[data-role="belief-edit"]') as HTMLTextAreaElement).value =
      'Goes to mass most Sundays';
    (host.querySelector('[data-action="belief-save"]') as HTMLElement).click();
    await flush();
    expect(h.edit).toHaveBeenCalledWith('belief_mass', { title: 'Goes to mass most Sundays' });
    expect(host.textContent).toContain('You corrected this');
  });

  it('forgets a belief after confirming', async () => {
    await section.load();
    render();
    h.confirm.mockResolvedValue(true);
    h.del.mockResolvedValue({ ok: true, value: { deleted: true } });
    (host.querySelector('[data-action="belief-delete"]') as HTMLElement).click();
    await flush();
    expect(h.del).toHaveBeenCalledWith('belief_mass');
    expect(host.textContent).toContain('Nothing yet');
    expect(h.toast.success).toHaveBeenCalledWith('Forgotten.');
  });
});
