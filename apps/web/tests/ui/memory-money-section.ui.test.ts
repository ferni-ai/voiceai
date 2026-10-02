/**
 * Money section of the Sensitive tab: shown only with the Money switch on
 * (otherwise one short line), notes grouped by kind with the amount the user
 * said, correct / forget a note, forget just the amount. Services are mocked.
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

const confirm = vi.hoisted(() => ({ answer: true }));
vi.mock('../../src/ui/memory-control/confirm-dialog.js', () => ({
  confirmAction: vi.fn(async () => confirm.answer),
  keepFocusInside: vi.fn(),
}));

const state = vi.hoisted(() => ({
  finances: false,
  items: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
  failNext: false,
}));

vi.mock('../../src/services/sensitive-memory.service.js', () => {
  const view = () => {
    const cat = (on: boolean) => ({ enabled: on, updatedAt: null, source: null });
    return {
      consent: {
        version: 1,
        answeredAt: 'then',
        categories: { health: cat(false), finances: cat(state.finances), beliefs: cat(false) },
        updatedAt: null,
      },
      stored: { health: 0, finances: state.items.length, beliefs: 0 },
      safetyExceptions: [],
    };
  };
  return {
    SENSITIVE_CATEGORIES: ['health', 'finances', 'beliefs'],
    getConsent: vi.fn(async () => ({ ok: true, value: view() })),
    answerConsent: vi.fn(),
    setCategory: vi.fn(async (_c: string, on: boolean) => {
      state.finances = on;
      return { ok: true, value: view() };
    }),
    deleteCategoryData: vi.fn(async () => {
      state.items = [];
      return { ok: true, value: { deleted: 1 } };
    }),
    getHealth: vi.fn(async () => ({
      ok: true,
      value: {
        enabled: false,
        items: [],
        safety: { allergies: [], intolerances: [], note: '' },
        updatedAt: null,
      },
    })),
    editHealthItem: vi.fn(),
    deleteHealthItem: vi.fn(),
    getMood: vi.fn(async () => ({
      ok: true,
      value: { enabled: false, timeline: [], insight: null },
    })),
    deleteMoodEntry: vi.fn(),
  };
});

vi.mock('../../src/services/finance-memory.service.js', () => ({
  FINANCE_KINDS: [
    'debt',
    'savings',
    'bill',
    'purchase',
    'decision',
    'income',
    'budget',
    'worry',
    'win',
    'feeling',
  ],
  getFinances: vi.fn(async () => ({
    ok: true,
    value: { enabled: state.finances, items: state.items, updatedAt: null },
  })),
  editFinanceItem: vi.fn(async (id: string, edit: Record<string, unknown>) => {
    state.calls.push(`edit:${id}:${JSON.stringify(edit)}`);
    if (state.failNext) {
      state.failNext = false;
      return { ok: false, error: new Error('nope') };
    }
    const item = state.items.find((i) => i.id === id)!;
    const next = { ...item, ...edit, userEdited: true };
    if (edit.amount === null) delete next.amount;
    state.items = state.items.map((i) => (i.id === id ? next : i));
    return { ok: true, value: next };
  }),
  deleteFinanceItem: vi.fn(async (id: string) => {
    state.calls.push(`delete:${id}`);
    state.items = state.items.filter((i) => i.id !== id);
    return { ok: true, value: { deleted: true } };
  }),
}));

const { SensitiveTab } = await import('../../src/ui/memory-control/sensitive-tab.js');

const flush = () => new Promise((r) => setTimeout(r, 0));
async function mount(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  await new SensitiveTab(host).load();
  return host;
}
const click = async (el: Element | null) => {
  (el as HTMLElement).click();
  await flush();
  await flush();
};

const card = {
  id: 'fin_aaaaaaaaaaaaaaaaaaaaaaaa',
  kind: 'debt',
  subject: 'credit card',
  text: 'Paying off their credit card',
  status: 'active',
  amount: { value: 4000, currency: 'USD', said: '$4,000' },
  source: 'explicit',
  sourceConversationIds: ['c1'],
  userEdited: false,
  lastMentionedAt: '2026-09-30T10:00:00Z',
  updatedAt: '2026-09-30T10:00:00Z',
};
const rent = {
  ...card,
  id: 'fin_bbbbbbbbbbbbbbbbbbbbbbbb',
  kind: 'bill',
  subject: 'rent',
  text: 'Rent due on the 1st',
  dueDay: 1,
  amount: undefined,
};

beforeEach(() => {
  document.body.innerHTML = '';
  state.finances = false;
  state.items = [];
  state.calls = [];
  state.failNext = false;
  confirm.answer = true;
  vi.clearAllMocks();
});

describe('Money section', () => {
  it('with Money off shows one short line and no notes', async () => {
    state.items = [card];
    const host = await mount();
    const section = host.querySelector('[data-section="money"]')!;
    expect(section.textContent).toContain("Money is off, so I'm not keeping money notes.");
    expect(section.querySelector('[data-money-id]')).toBeNull();
  });

  it('with Money on and nothing yet, says so and promises no account numbers', async () => {
    state.finances = true;
    const host = await mount();
    const section = host.querySelector('[data-section="money"]')!;
    expect(section.textContent).toContain('Nothing yet.');
    expect(section.querySelector('[data-role="money-privacy"]')?.textContent).toContain(
      'never keep card or account numbers'
    );
  });

  it('groups notes by kind and shows the amount and due day', async () => {
    state.finances = true;
    state.items = [rent, card];
    const host = await mount();
    const section = host.querySelector('[data-section="money"]')!;
    const headings = [...section.querySelectorAll('h4')].map((h) => h.textContent);
    expect(headings).toEqual(['Debts', 'Bills']);
    expect(section.textContent).toContain('$4,000');
    expect(section.textContent).toContain('Due on day 1');
  });

  it('corrects a note, forgets just the amount, then forgets the note', async () => {
    state.finances = true;
    state.items = [card];
    const host = await mount();
    const sel = `[data-money-id="${card.id}"]`;

    await click(host.querySelector(`${sel} [data-action="edit-money"]`));
    const field = host.querySelector<HTMLTextAreaElement>('[data-role="money-edit"]')!;
    expect(document.activeElement).toBe(field);
    field.value = 'Paying down the Visa';
    await click(host.querySelector('[data-action="save-money-edit"]'));
    expect(state.calls[0]).toBe(`edit:${card.id}:{"text":"Paying down the Visa"}`);
    expect(host.textContent).toContain('Paying down the Visa');
    expect(host.textContent).toContain('You corrected this');

    await click(host.querySelector(`${sel} [data-action="forget-money-amount"]`));
    expect(state.calls[1]).toBe(`edit:${card.id}:{"amount":null}`);
    expect(host.textContent).not.toContain('$4,000');
    expect(host.querySelector(`${sel} [data-action="forget-money-amount"]`)).toBeNull();

    await click(host.querySelector(`${sel} [data-action="delete-money"]`));
    expect(state.calls[2]).toBe(`delete:${card.id}`);
    expect(host.querySelector(sel)).toBeNull();
    expect(toast.success).toHaveBeenLastCalledWith('Forgotten.');
  });

  it('keeps the note when the user cancels, and says so kindly when saving fails', async () => {
    state.finances = true;
    state.items = [card];
    confirm.answer = false;
    const host = await mount();
    await click(host.querySelector('[data-action="delete-money"]'));
    expect(state.calls).toEqual([]);
    expect(host.querySelector(`[data-money-id="${card.id}"]`)).not.toBeNull();

    state.failNext = true;
    await click(host.querySelector('[data-action="edit-money"]'));
    host.querySelector<HTMLTextAreaElement>('[data-role="money-edit"]')!.value = 'Changed';
    await click(host.querySelector('[data-action="save-money-edit"]'));
    expect(toast.error).toHaveBeenCalledWith("Couldn't save that. Try again?");
  });

  it('switching Money on from the card shows the notes', async () => {
    state.items = [card];
    const host = await mount();
    await click(host.querySelector('#memory-switch-finances'));
    expect(host.querySelector(`[data-money-id="${card.id}"]`)).not.toBeNull();
  });
});
