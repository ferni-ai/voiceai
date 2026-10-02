/**
 * "Sensitive" tab of the memory panel: upfront consent, per-category
 * switches, the deletion offer on switch-off, the allergy safety note,
 * health edit/delete and mood delete. The service is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const confirm = vi.hoisted(() => ({
  answer: true,
  calls: [] as Array<{ title: string; message: string }>,
}));
vi.mock('../../src/ui/memory-control/confirm-dialog.js', () => ({
  confirmAction: vi.fn(async (o: { title: string; message: string }) => {
    confirm.calls.push(o);
    return confirm.answer;
  }),
  keepFocusInside: vi.fn(),
}));

type Cat = 'health' | 'finances' | 'beliefs';
const state = vi.hoisted(() => ({
  answeredAt: null as string | null,
  needsAnswer: undefined as boolean | undefined,
  enabled: { health: false, finances: false, beliefs: false } as Record<Cat, boolean>,
  stored: { health: 0, finances: 0, beliefs: 0 } as Record<Cat, number>,
  items: [] as Array<Record<string, unknown>>,
  timeline: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
}));

function view() {
  const cat = (c: Cat) => ({ enabled: state.enabled[c], updatedAt: null, source: null });
  return {
    consent: {
      version: 1,
      answeredAt: state.answeredAt,
      categories: { health: cat('health'), finances: cat('finances'), beliefs: cat('beliefs') },
      updatedAt: null,
    },
    ...(state.needsAnswer === undefined ? {} : { needsAnswer: state.needsAnswer }),
    stored: { ...state.stored },
    safetyExceptions: [],
  };
}

vi.mock('../../src/services/life-story.service.js', () => ({
  getBeliefs: async () => ({ ok: true, value: { enabled: false, items: [] } }),
  editBelief: vi.fn(),
  deleteBelief: vi.fn(),
}));
vi.mock('../../src/services/sensitive-memory.service.js', () => ({
  SENSITIVE_CATEGORIES: ['health', 'finances', 'beliefs'],
  getConsent: vi.fn(async () => ({ ok: true, value: view() })),
  answerConsent: vi.fn(async (agree: boolean) => {
    state.calls.push(`answer:${agree}`);
    state.answeredAt = '2026-10-01T00:00:00Z';
    for (const c of ['health', 'finances', 'beliefs'] as Cat[]) state.enabled[c] = agree;
    return { ok: true, value: view() };
  }),
  keepConsentChoices: vi.fn(async () => {
    state.calls.push('keep-choices');
    state.needsAnswer = false;
    return { ok: true, value: view() };
  }),
  setCategory: vi.fn(async (c: Cat, on: boolean) => {
    state.calls.push(`set:${c}:${on}`);
    state.answeredAt = state.answeredAt ?? 'now';
    state.enabled[c] = on;
    return { ok: true, value: view() };
  }),
  deleteCategoryData: vi.fn(async (c: Cat) => {
    state.calls.push(`delete-data:${c}`);
    state.stored[c] = 0;
    if (c === 'health') state.items = [];
    return { ok: true, value: { deleted: 1 } };
  }),
  getHealth: vi.fn(async () => ({
    ok: true,
    value: {
      enabled: state.enabled.health,
      items: state.items,
      safety: { allergies: [{ item: 'peanut', severity: 'severe' }], intolerances: [], note: '' },
      updatedAt: null,
    },
  })),
  editHealthItem: vi.fn(async (id: string, edit: { text: string }) => {
    state.calls.push(`edit:${id}:${edit.text}`);
    return { ok: true, value: { id, text: edit.text, userEdited: true } };
  }),
  deleteHealthItem: vi.fn(async (id: string) => {
    state.calls.push(`delete-health:${id}`);
    return { ok: true, value: { deleted: true } };
  }),
  getMood: vi.fn(async () => ({
    ok: true,
    value: {
      enabled: state.enabled.health,
      timeline: state.timeline,
      insight: state.timeline.length ? "You've seemed in good spirits lately." : null,
    },
  })),
  deleteMoodEntry: vi.fn(async (id: string) => {
    state.calls.push(`delete-mood:${id}`);
    return { ok: true, value: { deleted: true } };
  }),
}));

const { SensitiveTab } = await import('../../src/ui/memory-control/sensitive-tab.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const tab = new SensitiveTab(host);
  await tab.load();
  return host;
}
const click = async (el: Element | null) => {
  (el as HTMLElement).click();
  await flush();
  await flush();
};

beforeEach(() => {
  document.body.innerHTML = '';
  state.answeredAt = null;
  state.needsAnswer = undefined;
  state.enabled = { health: false, finances: false, beliefs: false };
  state.stored = { health: 0, finances: 0, beliefs: 0 };
  state.items = [];
  state.timeline = [];
  state.calls = [];
  confirm.answer = true;
  confirm.calls = [];
  vi.clearAllMocks();
});

describe('Sensitive tab', () => {
  it('asks the upfront question once, names health, money and beliefs, all off', async () => {
    const host = await mount();
    expect(host.textContent).toContain('your health, your money, and what you believe');
    const switches = host.querySelectorAll('[role="switch"]');
    expect(switches).toHaveLength(3);
    switches.forEach((s) => expect(s.getAttribute('aria-checked')).toBe('false'));
    expect(host.querySelector('[data-role="safety-note"]')?.textContent).toContain(
      'peanut (severe)'
    );

    await click(host.querySelector('[data-action="agree-all"]'));
    expect(state.calls).toEqual(['answer:true']);
    host
      .querySelectorAll('[role="switch"]')
      .forEach((s) => expect(s.getAttribute('aria-checked')).toBe('true'));
    expect(host.querySelector('[data-action="agree-all"]')).toBeNull();
  });

  it('asks once more after the wording changed; "keep my choices" changes no switch', async () => {
    state.answeredAt = 'then';
    state.needsAnswer = true;
    state.enabled.health = true;
    const host = await mount();
    expect(host.querySelector('[data-role="consent-reask"]')).not.toBeNull();
    expect(host.querySelector('[data-action="decline-all"]')).toBeNull();
    expect(host.querySelector('#memory-switch-health')?.getAttribute('aria-checked')).toBe('true');

    await click(host.querySelector('[data-action="keep-choices"]'));
    expect(state.calls).toEqual(['keep-choices']);
    expect(toast.success).toHaveBeenCalledWith('Got it. Nothing changed.');
    expect(host.querySelector('[data-action="keep-choices"]')).toBeNull();
    expect(host.querySelector('#memory-switch-health')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('#memory-switch-finances')?.getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('switching a category off offers to delete what is stored (and keeps allergies)', async () => {
    state.answeredAt = 'then';
    state.enabled.health = true;
    state.stored.health = 3;
    const host = await mount();
    await click(host.querySelector('#memory-switch-health'));
    expect(state.calls).toEqual(['set:health:false', 'delete-data:health']);
    expect(confirm.calls[0]?.message).toContain('3 things');
    expect(confirm.calls[0]?.message).toContain('allergies stay');
  });

  it('declining the offer keeps the data and shows a delete button', async () => {
    state.answeredAt = 'then';
    state.enabled.finances = true;
    state.stored.finances = 2;
    confirm.answer = false;
    const host = await mount();
    await click(host.querySelector('#memory-switch-finances'));
    expect(state.calls).toEqual(['set:finances:false']);
    const del = host.querySelector('[data-action="delete-category"][data-category="finances"]');
    expect(del).not.toBeNull();
    confirm.answer = true;
    await click(del);
    expect(state.calls).toContain('delete-data:finances');
  });

  it('corrects and forgets health notes; forgets a mood entry', async () => {
    state.answeredAt = 'then';
    state.enabled.health = true;
    state.items = [
      {
        id: 'health_1',
        kind: 'condition',
        subject: 'asthma',
        text: 'Has asthma',
        status: 'current',
        userEdited: false,
        lastMentionedAt: '2026-09-30T10:00:00Z',
        sourceConversationIds: [],
      },
    ];
    state.timeline = [
      {
        id: 'sess-1',
        personaId: 'ferni',
        startedAt: '2026-09-30T10:00:00Z',
        endedAt: '2026-09-30T10:20:00Z',
        dominantMood: 'calm',
        averageValence: 0.4,
        arc: 'lifting',
      },
    ];
    const host = await mount();
    expect(host.textContent).toContain('Has asthma');
    expect(host.textContent).toContain('Felt lighter by the end');
    expect(host.textContent).toContain("You've seemed in good spirits lately.");

    await click(host.querySelector('[data-health-id="health_1"] [data-action="edit-health"]'));
    const field = host.querySelector<HTMLTextAreaElement>('[data-role="health-edit"]')!;
    field.value = 'Mild asthma';
    await click(host.querySelector('[data-action="save-health-edit"]'));
    expect(state.calls).toContain('edit:health_1:Mild asthma');
    expect(host.textContent).toContain('Mild asthma');

    await click(host.querySelector('[data-health-id="health_1"] [data-action="delete-health"]'));
    expect(state.calls).toContain('delete-health:health_1');
    expect(host.querySelector('[data-health-id="health_1"]')).toBeNull();

    await click(host.querySelector('[data-mood-id="sess-1"] [data-action="delete-mood"]'));
    expect(state.calls).toContain('delete-mood:sess-1');
    expect(toast.success).toHaveBeenCalledWith('Forgotten.');
  });

  it('with Health off, explains that live attunement still works but nothing is kept', async () => {
    state.answeredAt = 'then';
    const host = await mount();
    expect(host.textContent).toContain("Health is off, so I'm not keeping health notes.");
    expect(host.textContent).toContain("I still listen for how you're feeling while we talk.");
  });
});
