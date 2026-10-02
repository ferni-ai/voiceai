/**
 * "Money" section of the Sensitive tab: what Ferni remembers about the user's
 * money (debts, savings, bills, worries, wins...), shown only while the Money
 * switch is on; otherwise one short line. Each note can be corrected or
 * forgotten, and a remembered amount can be forgotten on its own.
 *
 * The section renders into the Sensitive tab's markup (`html()`) and handles
 * its own clicks on the shared host; the tab re-renders through `onChange`.
 *
 * @module ui/memory-control/money-section
 */

import { getLocale, t } from '../../i18n/index.js';
import {
  FINANCE_KINDS,
  deleteFinanceItem,
  editFinanceItem,
  getFinances,
  type FinanceAmount,
  type FinanceItem,
  type FinanceKind,
  type FinanceSnapshot,
} from '../../services/finance-memory.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import { esc, formatDate } from './format.js';
import { ICONS } from './states.js';

const KIND_LABELS: Record<FinanceKind, () => string> = {
  debt: () => t('memoryControl.sensitive.money.kind.debt', 'Debts'),
  savings: () => t('memoryControl.sensitive.money.kind.savings', 'Saving for'),
  bill: () => t('memoryControl.sensitive.money.kind.bill', 'Bills'),
  purchase: () => t('memoryControl.sensitive.money.kind.purchase', 'Big purchases'),
  decision: () => t('memoryControl.sensitive.money.kind.decision', 'Decisions'),
  income: () => t('memoryControl.sensitive.money.kind.income', 'Income'),
  budget: () => t('memoryControl.sensitive.money.kind.budget', 'Budget'),
  worry: () => t('memoryControl.sensitive.money.kind.worry', 'Worries'),
  win: () => t('memoryControl.sensitive.money.kind.win', 'Wins'),
  feeling: () => t('memoryControl.sensitive.money.kind.feeling', 'How money feels'),
};

const PERIODS: Record<NonNullable<FinanceAmount['period']>, () => string> = {
  week: () => t('memoryControl.sensitive.money.perWeek', 'a week'),
  biweekly: () => t('memoryControl.sensitive.money.perTwoWeeks', 'every two weeks'),
  month: () => t('memoryControl.sensitive.money.perMonth', 'a month'),
  year: () => t('memoryControl.sensitive.money.perYear', 'a year'),
};

/** "$4,000 a month" in the active locale. */
export function formatAmount(amount: FinanceAmount): string {
  let money: string;
  try {
    money = new Intl.NumberFormat(getLocale(), {
      style: 'currency',
      currency: amount.currency,
      maximumFractionDigits: amount.value % 1 === 0 ? 0 : 2,
    }).format(amount.value);
  } catch {
    money = String(amount.value);
  }
  return amount.period ? `${money} ${PERIODS[amount.period]()}` : money;
}

export class MoneySection {
  private snapshot: FinanceSnapshot | null = null;
  private editingId: string | null = null;
  private saving = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly onChange: () => void
  ) {
    host.addEventListener('click', (e) => void this.onClick(e));
    host.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  async load(): Promise<void> {
    const result = await getFinances();
    this.snapshot = result.ok ? result.value : null;
  }

  /** Markup for the section. `enabled` is the Money switch. */
  html(enabled: boolean): string {
    const title = esc(t('memoryControl.sensitive.money.title', 'Money'));
    const head = `<h3 class="memory-group__title">${title}</h3>`;
    if (!enabled) {
      return `<section class="memory-group" aria-label="${title}" data-section="money">${head}
        <p class="memory-muted">${esc(t('memoryControl.sensitive.money.off', "Money is off, so I'm not keeping money notes."))}</p></section>`;
    }
    const privacy = `<p class="memory-muted" data-role="money-privacy">${esc(
      t(
        'memoryControl.sensitive.money.privacy',
        'I never keep card or account numbers, passwords or PINs.'
      )
    )}</p>`;
    const items = this.snapshot?.items ?? [];
    if (items.length === 0) {
      return `<section class="memory-group" aria-label="${title}" data-section="money">${head}
        <p class="memory-muted">${esc(t('memoryControl.sensitive.money.empty', "Nothing yet. When you talk about money, it'll show up here."))}</p>${privacy}</section>`;
    }
    const groups = FINANCE_KINDS.map(
      (kind) => [kind, items.filter((i) => i.kind === kind)] as const
    )
      .filter(([, list]) => list.length > 0)
      .map(
        ([kind, list]) => `
      <h4 class="memory-item__detail">${esc(KIND_LABELS[kind]())}</h4>
      <ul class="memory-list">${list.map((i) => this.itemHtml(i)).join('')}</ul>`
      )
      .join('');
    return `<section class="memory-group" aria-label="${title}" data-section="money">${head}${privacy}${groups}</section>`;
  }

  private itemHtml(item: FinanceItem): string {
    if (this.editingId === item.id) {
      const saving = this.saving;
      return `
      <li class="memory-item memory-item--editing" data-money-id="${esc(item.id)}">
        <label class="memory-visually-hidden" for="memory-money-edit">${esc(
          t('memoryControl.editLabel', 'Correct this memory')
        )}</label>
        <textarea id="memory-money-edit" class="memory-input memory-textarea" rows="2"
          data-role="money-edit" ${saving ? 'disabled' : ''}>${esc(item.text)}</textarea>
        <div class="memory-item__actions">
          <button type="button" class="memory-btn memory-btn--quiet" data-action="cancel-money-edit" ${saving ? 'disabled' : ''}>${esc(
            t('memoryControl.cancel', 'Cancel')
          )}</button>
          <button type="button" class="memory-btn memory-btn--primary" data-action="save-money-edit" ${
            saving ? 'disabled aria-busy="true"' : ''
          }>${esc(saving ? t('memoryControl.saving', 'Saving...') : t('memoryControl.save', 'Save'))}</button>
        </div>
      </li>`;
    }
    const date = formatDate(item.lastMentionedAt);
    const meta = [
      item.amount ? esc(formatAmount(item.amount)) : '',
      item.dueDay
        ? esc(t('memoryControl.sensitive.money.dueDay', 'Due on day {day}', { day: item.dueDay }))
        : '',
      item.status === 'done' ? esc(t('memoryControl.sensitive.money.done', 'Done')) : '',
      item.aspirationId ? esc(t('memoryControl.sensitive.money.linkedGoal', 'In your goals')) : '',
      date ? esc(t('memoryControl.sensitive.mentioned', 'Mentioned {date}', { date })) : '',
      item.userEdited
        ? `<span class="memory-badge">${esc(t('memoryControl.youCorrected', 'You corrected this'))}</span>`
        : '',
    ].filter(Boolean);
    const forgetAmount = item.amount
      ? `<button type="button" class="memory-btn memory-btn--danger-quiet" data-action="forget-money-amount">${esc(
          t('memoryControl.sensitive.money.forgetAmount', 'Forget the amount')
        )}</button>`
      : '';
    return `
    <li class="memory-item" data-money-id="${esc(item.id)}">
      <div class="memory-item__body">
        <p class="memory-item__text">${esc(item.text)}</p>
        ${meta.length ? `<p class="memory-item__meta">${meta.map((m) => `<span>${m}</span>`).join('')}</p>` : ''}
      </div>
      <div class="memory-item__actions">
        ${forgetAmount}
        <button type="button" class="memory-icon-btn" data-action="edit-money"
          aria-label="${esc(t('memoryControl.editAria', 'Correct: {text}', { text: item.text }))}">${ICONS.edit}</button>
        <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="delete-money"
          aria-label="${esc(t('memoryControl.deleteAria', 'Forget: {text}', { text: item.text }))}">${ICONS.trash}</button>
      </div>
    </li>`;
  }

  private focus(selector: string): void {
    this.host.querySelector<HTMLElement>(selector)?.focus();
  }

  private onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.dataset.role !== 'money-edit') return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.editingId = null;
      this.onChange();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void this.saveEdit();
    }
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !this.host.contains(button)) return;
    const id = button.closest<HTMLElement>('[data-money-id]')?.dataset.moneyId;
    switch (button.dataset.action) {
      case 'edit-money':
        if (id) this.startEdit(id);
        break;
      case 'cancel-money-edit':
        this.editingId = null;
        this.onChange();
        break;
      case 'save-money-edit':
        await this.saveEdit();
        break;
      case 'forget-money-amount':
        if (id) await this.forgetAmount(id);
        break;
      case 'delete-money':
        if (id) await this.remove(id);
        break;
    }
  }

  private replace(id: string, item: FinanceItem): void {
    if (!this.snapshot) return;
    this.snapshot.items = this.snapshot.items.map((i) => (i.id === id ? item : i));
  }

  private startEdit(id: string): void {
    this.editingId = id;
    this.onChange();
    const field = this.host.querySelector<HTMLTextAreaElement>('[data-role="money-edit"]');
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }

  private async saveEdit(): Promise<void> {
    const id = this.editingId;
    const current = this.snapshot?.items.find((i) => i.id === id);
    if (!id || !current || this.saving) return;
    const field = this.host.querySelector<HTMLTextAreaElement>('[data-role="money-edit"]');
    const text = field?.value.trim() ?? '';
    if (!text) {
      toast.warning(t('memoryControl.emptyEdit', 'Add a few words first'));
      field?.focus();
      return;
    }
    if (text === current.text) {
      this.editingId = null;
      this.onChange();
      return;
    }
    this.saving = true;
    this.onChange();
    const result = await editFinanceItem(id, { text });
    this.saving = false;
    if (!result.ok) {
      this.onChange();
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    this.replace(id, result.value);
    this.editingId = null;
    this.onChange();
    // Finance ids are `fin_<hex>`: safe in a selector without escaping.
    this.focus(`[data-money-id="${id}"] [data-action="edit-money"]`);
    toast.success(t('memoryControl.saved', "Got it. I'll remember it that way."));
  }

  private async forgetAmount(id: string): Promise<void> {
    const result = await editFinanceItem(id, { amount: null });
    if (!result.ok) {
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    this.replace(id, result.value);
    this.onChange();
    this.focus(`[data-money-id="${id}"] [data-action="edit-money"]`);
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }

  private async remove(id: string): Promise<void> {
    const item = this.snapshot?.items.find((i) => i.id === id);
    if (!item || !this.snapshot) return;
    const confirmed = await confirmAction({
      title: t('memoryControl.forgetFactTitle', 'Forget this?'),
      message: t(
        'memoryControl.forgetFactBody',
        'I\'ll stop remembering "{text}" and won\'t learn it again from past conversations.',
        { text: item.text }
      ),
      confirmLabel: t('memoryControl.forget', 'Forget'),
    });
    if (!confirmed) return;
    const before = this.snapshot.items;
    this.snapshot.items = before.filter((i) => i.id !== id);
    this.onChange();
    const result = await deleteFinanceItem(id);
    if (!result.ok) {
      this.snapshot.items = before;
      this.onChange();
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }
}
