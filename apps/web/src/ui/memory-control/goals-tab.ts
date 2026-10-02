/**
 * Goals & habits tab: the dreams, goals and habits Ferni keeps for the user,
 * linked upward (habit → goal → dream). View, edit, link, remove, and mark a
 * habit done for today.
 *
 * @module ui/memory-control/goals-tab
 */

import { getLocale, t } from '../../i18n/index.js';
import {
  checkInHabit,
  deleteAspiration,
  editAspiration,
  listAspirations,
  type Aspiration,
  type AspirationEdit,
  type AspirationLevel,
  type AspirationStatus,
} from '../../services/aspirations.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import { esc } from './format.js';
import { injectGoalsTabStyles } from './goals-tab.styles.js';
import { ICONS, renderEmpty, renderError, renderLoading } from './states.js';

const SECTIONS: ReadonlyArray<{ level: AspirationLevel; label: () => string }> = [
  { level: 'habit', label: () => t('memoryControl.goals.habits', 'Habits') },
  { level: 'goal', label: () => t('memoryControl.goals.goalsHeading', 'Goals') },
  { level: 'dream', label: () => t('memoryControl.goals.dreams', 'Dreams') },
];
const STATUSES: readonly AspirationStatus[] = ['active', 'paused', 'achieved', 'let-go', 'dormant'];
const RANK: Record<AspirationLevel, number> = { habit: 0, goal: 1, dream: 2 };

function statusLabel(status: AspirationStatus): string {
  const fallback: Record<AspirationStatus, string> = {
    active: 'Active',
    paused: 'Paused',
    achieved: 'Achieved',
    'let-go': 'Let go',
    dormant: 'Resting',
  };
  return t(
    `memoryControl.goals.status.${status === 'let-go' ? 'letGo' : status}`,
    fallback[status]
  );
}

function frequencyLabel(frequency: string): string {
  const fallback: Record<string, string> = {
    daily: 'Every day',
    weekdays: 'Weekdays',
    weekends: 'Weekends',
    weekly: 'Weekly',
    custom: 'Some days',
  };
  return t(`memoryControl.goals.frequency.${frequency}`, fallback[frequency] ?? frequency);
}

/** A YYYY-MM-DD calendar day in the active locale (no time-zone shift). */
export function formatDay(ymd: string | undefined): string {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  if (!m) return '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString(getLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
}

export class GoalsTab {
  private items: Aspiration[] | null = null;
  private editingId: string | null = null;
  private busyId: string | null = null;
  private loadFailed = false;

  constructor(private readonly host: HTMLElement) {
    injectGoalsTabStyles();
    host.addEventListener('click', (e) => void this.onClick(e));
    host.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  async load(): Promise<void> {
    this.loadFailed = false;
    this.host.innerHTML = renderLoading(
      t('memoryControl.goals.loading', 'Gathering your goals and habits...')
    );
    const result = await listAspirations();
    if (!result.ok) {
      this.loadFailed = true;
      this.host.innerHTML = renderError(
        t('memoryControl.goals.loadError', "I couldn't reach your goals just now.")
      );
      return;
    }
    this.items = result.value.aspirations;
    this.render();
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  private render(): void {
    const items = this.items;
    if (!items) return;
    if (items.length === 0) {
      this.host.innerHTML = renderEmpty(
        t('memoryControl.goals.emptyTitle', 'No goals or habits yet'),
        t(
          'memoryControl.goals.emptyBody',
          "Tell me what you're working toward, a habit you're building or a someday dream, and it'll show up here."
        )
      );
      return;
    }
    this.host.innerHTML = SECTIONS.map(({ level, label }) => {
      const list = items.filter((a) => a.level === level);
      if (list.length === 0) return '';
      return `
        <section class="memory-group" aria-labelledby="goals-heading-${level}">
          <h3 class="memory-group__title" id="goals-heading-${level}">${esc(label())}</h3>
          <ul class="memory-list">${list.map((a) => this.renderItem(a)).join('')}</ul>
        </section>`;
    }).join('');
  }

  private byId(id: string | null): Aspiration | undefined {
    return id ? this.items?.find((a) => a.id === id) : undefined;
  }

  private renderMeta(a: Aspiration): string {
    const parts: string[] = [];
    if (a.status !== 'active')
      parts.push(`<span class="memory-badge">${esc(statusLabel(a.status))}</span>`);
    const parent = this.byId(a.parentId);
    if (parent)
      parts.push(esc(t('memoryControl.goals.partOf', 'Part of {title}', { title: parent.title })));
    if (a.habit) {
      parts.push(esc(frequencyLabel(a.habit.frequency)));
      if (a.habit.streak > 0) {
        parts.push(
          esc(t('memoryControl.goals.streak', '{count} in a row', { count: a.habit.streak }))
        );
      }
      if (a.habit.dueToday) {
        parts.push(
          `<span class="goals-due">${esc(t('memoryControl.goals.dueToday', 'Due today'))}</span>`
        );
      }
    }
    if (a.progress !== undefined) {
      parts.push(
        esc(t('memoryControl.goals.progress', '{percent}% there', { percent: a.progress }))
      );
    }
    if (a.targetDate)
      parts.push(
        esc(t('memoryControl.goals.target', 'By {date}', { date: formatDay(a.targetDate) }))
      );
    if (!a.confirmed) {
      parts.push(
        `<span class="memory-badge">${esc(t('memoryControl.goals.notSure', 'Still getting a sense of this'))}</span>`
      );
    }
    return parts.length
      ? `<p class="memory-item__meta">${parts.map((p) => `<span>${p}</span>`).join('')}</p>`
      : '';
  }

  private renderItem(a: Aspiration): string {
    if (this.editingId === a.id) return this.renderEditor(a);
    const busy = this.busyId === a.id;
    const canMarkDone = a.level === 'habit' && a.status === 'active' && a.habit?.dueToday;
    const progressBar =
      a.progress !== undefined
        ? `<div class="goals-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${a.progress}"
            aria-label="${esc(t('memoryControl.goals.progress', '{percent}% there', { percent: a.progress }))}">
            <span style="width: ${Math.max(0, Math.min(100, a.progress))}%"></span></div>`
        : '';
    return `
      <li class="memory-item" data-asp-id="${esc(a.id)}">
        <div class="memory-item__body">
          <p class="memory-item__text">${esc(a.title)}</p>
          ${a.why ? `<p class="memory-item__detail">${esc(a.why)}</p>` : ''}
          ${progressBar}
          ${this.renderMeta(a)}
        </div>
        <div class="memory-item__actions">
          ${
            canMarkDone
              ? `<button type="button" class="memory-btn memory-btn--quiet goals-done" data-action="done" ${
                  busy ? 'disabled aria-busy="true"' : ''
                } aria-label="${esc(t('memoryControl.goals.markDoneAria', 'Mark {title} done for today', { title: a.title }))}">${esc(
                  t('memoryControl.goals.markDone', 'Done today')
                )}</button>`
              : ''
          }
          <button type="button" class="memory-icon-btn" data-action="edit"
            aria-label="${esc(t('memoryControl.goals.editAria', 'Edit {title}', { title: a.title }))}">${ICONS.edit}</button>
          <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="delete"
            aria-label="${esc(t('memoryControl.goals.deleteAria', 'Remove {title}', { title: a.title }))}">${ICONS.trash}</button>
        </div>
      </li>`;
  }

  private renderEditor(a: Aspiration): string {
    const saving = this.busyId === a.id;
    const id = esc(a.id);
    const parents = (this.items ?? []).filter(
      (p) => RANK[p.level] > RANK[a.level] && p.id !== a.id
    );
    const option = (value: string, label: string, selected: boolean): string =>
      `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
    return `
      <li class="memory-item memory-item--editing" data-asp-id="${id}">
        <label class="goals-label" for="goals-title-${id}">${esc(t('memoryControl.goals.titleLabel', 'Title'))}</label>
        <input id="goals-title-${id}" class="memory-input" data-role="title" value="${esc(a.title)}" ${saving ? 'disabled' : ''} />
        <label class="goals-label" for="goals-why-${id}">${esc(t('memoryControl.goals.whyLabel', 'Why it matters'))}</label>
        <textarea id="goals-why-${id}" class="memory-input memory-textarea" rows="2" data-role="why" ${
          saving ? 'disabled' : ''
        }>${esc(a.why ?? '')}</textarea>
        <div class="goals-row">
          <div class="goals-field">
            <label class="goals-label" for="goals-status-${id}">${esc(t('memoryControl.goals.statusLabel', 'Status'))}</label>
            <select id="goals-status-${id}" class="memory-input memory-select" data-role="status" ${saving ? 'disabled' : ''}>
              ${STATUSES.map((s) => option(s, statusLabel(s), s === a.status)).join('')}
            </select>
          </div>
          ${
            a.level === 'dream'
              ? ''
              : `<div class="goals-field">
            <label class="goals-label" for="goals-parent-${id}">${esc(t('memoryControl.goals.parentLabel', 'Part of'))}</label>
            <select id="goals-parent-${id}" class="memory-input memory-select" data-role="parent" ${saving ? 'disabled' : ''}>
              ${option('', t('memoryControl.goals.noParent', 'Nothing'), !a.parentId)}
              ${parents.map((p) => option(p.id, p.title, p.id === a.parentId)).join('')}
            </select>
          </div>`
          }
        </div>
        <div class="memory-item__actions">
          <button type="button" class="memory-btn memory-btn--quiet" data-action="cancel" ${saving ? 'disabled' : ''}>${esc(
            t('memoryControl.cancel', 'Cancel')
          )}</button>
          <button type="button" class="memory-btn memory-btn--primary" data-action="save" ${
            saving ? 'disabled aria-busy="true"' : ''
          }>${esc(saving ? t('memoryControl.saving', 'Saving...') : t('memoryControl.save', 'Save'))}</button>
        </div>
      </li>`;
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  private onKeydown(e: KeyboardEvent): void {
    if (!this.editingId || e.key !== 'Escape') return;
    // Leave edit mode instead of closing the panel
    e.stopPropagation();
    this.cancelEdit();
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !this.host.contains(button)) return;
    const id = button.closest<HTMLElement>('[data-asp-id]')?.dataset.aspId ?? null;
    switch (button.dataset.action) {
      case 'retry':
        if (this.loadFailed) await this.load();
        break;
      case 'edit':
        if (id) this.startEdit(id);
        break;
      case 'cancel':
        this.cancelEdit();
        break;
      case 'save':
        await this.saveEdit();
        break;
      case 'delete':
        if (id) await this.remove(id);
        break;
      case 'done':
        if (id) await this.markDone(id);
        break;
    }
  }

  private focus(id: string, action: string): void {
    const el = this.host.querySelector<HTMLElement>(
      `[data-asp-id="${CSS.escape(id)}"] [data-action="${action}"]`
    );
    (el ?? this.host.querySelector<HTMLElement>('[data-action="edit"]'))?.focus();
  }

  private replace(updated: Aspiration): void {
    if (this.items) this.items = this.items.map((a) => (a.id === updated.id ? updated : a));
  }

  private startEdit(id: string): void {
    this.editingId = id;
    this.render();
    this.host.querySelector<HTMLInputElement>('[data-role="title"]')?.focus();
  }

  private cancelEdit(): void {
    const id = this.editingId;
    this.editingId = null;
    this.render();
    if (id) this.focus(id, 'edit');
  }

  private async saveEdit(): Promise<void> {
    const current = this.byId(this.editingId);
    if (!current || this.busyId) return;
    const value = (role: string): string =>
      this.host.querySelector<HTMLInputElement>(`[data-role="${role}"]`)?.value.trim() ?? '';
    const title = value('title');
    if (!title) {
      toast.warning(t('memoryControl.emptyEdit', 'Add a few words first'));
      this.host.querySelector<HTMLInputElement>('[data-role="title"]')?.focus();
      return;
    }
    const why = value('why');
    const status = value('status') as AspirationStatus;
    const parentSelect = this.host.querySelector<HTMLSelectElement>('[data-role="parent"]');
    const edit: AspirationEdit = {};
    if (title !== current.title) edit.title = title;
    if (why !== (current.why ?? '')) edit.why = why || null;
    if (status && status !== current.status) edit.status = status;
    if (parentSelect && (parentSelect.value || null) !== current.parentId)
      edit.parentId = parentSelect.value || null;
    if (Object.keys(edit).length === 0) {
      this.cancelEdit();
      return;
    }
    this.busyId = current.id;
    this.render();
    const result = await editAspiration(current.id, edit);
    this.busyId = null;
    if (!result.ok) {
      this.render();
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      this.host.querySelector<HTMLInputElement>('[data-role="title"]')?.focus();
      return;
    }
    this.replace(result.value);
    this.editingId = null;
    this.render();
    this.focus(current.id, 'edit');
    toast.success(t('memoryControl.goals.saved', 'Saved!'));
  }

  private async markDone(id: string): Promise<void> {
    if (this.busyId) return;
    this.busyId = id;
    this.render();
    const result = await checkInHabit(id, 'done');
    this.busyId = null;
    if (!result.ok) {
      this.render();
      this.focus(id, 'done');
      toast.error(t('memoryControl.goals.checkInError', "Couldn't mark that. Try again?"));
      return;
    }
    this.replace(result.value);
    this.render();
    this.focus(id, 'edit');
    const streak = result.value.habit?.streak ?? 0;
    toast.success(
      streak > 1
        ? t('memoryControl.goals.doneStreak', "Nice! That's {count} in a row.", { count: streak })
        : t('memoryControl.goals.done', 'Nice! Marked done.')
    );
  }

  private async remove(id: string): Promise<void> {
    const item = this.byId(id);
    const items = this.items;
    if (!item || !items) return;
    const confirmed = await confirmAction({
      title: t('memoryControl.goals.removeTitle', 'Remove this?'),
      message: t(
        'memoryControl.goals.removeBody',
        'I\'ll stop keeping "{title}" and won\'t pick it up again from past conversations.',
        { title: item.title }
      ),
      confirmLabel: t('memoryControl.goals.remove', 'Remove'),
    });
    if (!confirmed) return;
    // Optimistic: children lose their link on the server too; restore on failure.
    const before = items;
    this.items = items
      .filter((a) => a.id !== id)
      .map((a) => (a.parentId === id ? { ...a, parentId: null } : a));
    this.render();
    this.host.querySelector<HTMLElement>('[data-action="edit"]')?.focus();
    const result = await deleteAspiration(id);
    if (!result.ok) {
      this.items = before;
      this.render();
      toast.error(t('memoryControl.goals.removeError', "Couldn't remove that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.goals.removed', 'Removed.'));
  }
}
