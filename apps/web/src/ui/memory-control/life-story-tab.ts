/**
 * "Your story" tab: where the user comes from, stories they've told,
 * turning points and chapters, threads that keep coming up, what matters to
 * them and how they decide. Add, correct and forget, against
 * `/api/memory/me/story`. (Faith & beliefs live in the Sensitive tab.)
 *
 * @module ui/memory-control/life-story-tab
 */

import { t } from '../../i18n/index.js';
import {
  addStoryItem,
  deleteStoryItem,
  editStoryItem,
  getStory,
  type StoryItem,
  type StoryKind,
  type StorySnapshot,
  type ValueItem,
} from '../../services/life-story.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import { esc, sourcesLabel } from './format.js';
import { ADD_CHOICES, STORY_GROUPS, storyDetail } from './life-story-config.js';
import { ICONS, renderError, renderLoading } from './states.js';
import { tf } from './work-places-config.js';

type Row = {
  id: string;
  title: string;
  detail: string;
  isValue: boolean;
  item: StoryItem | ValueItem;
};

const isValue = (item: StoryItem | ValueItem): item is ValueItem => item.id.startsWith('value_');

export class LifeStoryTab {
  private data: StorySnapshot | null = null;
  private editingId: string | null = null;
  private adding = false;
  private busy = false;
  private loadFailed = false;

  constructor(private readonly host: HTMLElement) {
    host.addEventListener('click', (e) => void this.onClick(e));
    host.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  async load(): Promise<void> {
    this.loadFailed = false;
    this.host.innerHTML = renderLoading(t('lifeStory.loading', 'Gathering your story...'));
    const result = await getStory();
    if (!result.ok) {
      this.loadFailed = true;
      this.host.innerHTML = renderError(
        t('lifeStory.loadError', "I couldn't reach that just now.")
      );
      return;
    }
    this.data = result.value;
    this.render();
  }

  private row(item: StoryItem | ValueItem): Row {
    return isValue(item)
      ? {
          id: item.id,
          title: item.label,
          detail: item.statement === item.label ? '' : item.statement,
          isValue: true,
          item,
        }
      : { id: item.id, title: item.title, detail: storyDetail(item), isValue: false, item };
  }

  private render(): void {
    if (!this.data) return;
    const { items, values } = this.data;
    const groups = STORY_GROUPS.map((g) => ({
      g,
      list: items.filter((i) => g.kinds.includes(i.kind)),
    }))
      .filter(({ list }) => list.length > 0)
      .map(({ g, list }) =>
        this.renderGroup(
          g.id,
          g.label(),
          list.map((i) => this.row(i))
        )
      )
      .join('');
    const matters = [
      values.length
        ? this.renderGroup(
            'values',
            t('lifeStory.values', 'What matters to you'),
            values.map((v) => this.row(v))
          )
        : '',
      this.renderGroup(
        'decide',
        t('lifeStory.decide', 'How you decide'),
        items.filter((i) => i.kind === 'decision').map((i) => this.row(i))
      ),
    ].join('');
    const empty = !groups && !matters.includes('memory-item');
    this.host.innerHTML = `
      <section class="memory-area" aria-labelledby="memory-area-story">
        <div class="memory-area__head">
          <h3 class="memory-area__title" id="memory-area-story">${esc(t('lifeStory.title', 'Your story'))}</h3>
          ${this.adding ? '' : `<button type="button" class="memory-btn memory-btn--quiet" data-action="start-add">${esc(t('lifeStory.add', 'Add'))}</button>`}
        </div>
        <p class="memory-muted">${esc(
          t(
            'lifeStory.intro',
            "The story you've shared with me, so I can remember it with you and never ask twice."
          )
        )}</p>
        ${this.adding ? this.renderAddForm() : ''}
        ${empty ? `<p class="memory-muted">${esc(t('lifeStory.empty', "Tell me where you grew up, or a story you love. It'll show up here."))}</p>` : `${groups}${matters}`}
      </section>`;
  }

  private renderGroup(id: string, label: string, rows: Row[]): string {
    if (rows.length === 0) return '';
    return `
      <section class="memory-group" data-group="${id}" aria-label="${esc(label)}">
        <h4 class="memory-group__title">${esc(label)}</h4>
        <ul class="memory-list">${rows.map((r) => this.renderRow(r)).join('')}</ul>
      </section>`;
  }

  private renderRow(row: Row): string {
    if (this.editingId === row.id) return this.renderEditor(row);
    const { item } = row;
    const badge =
      item.source === 'user' && !item.userEdited
        ? t('lifeStory.youAdded', 'You added this')
        : item.userEdited
          ? t('memoryControl.youCorrected', 'You corrected this')
          : '';
    const meta = [
      esc(sourcesLabel(item.sourceConversationIds.length)),
      badge ? `<span class="memory-badge">${esc(badge)}</span>` : '',
    ].filter(Boolean);
    return `
      <li class="memory-item" data-story-id="${esc(row.id)}">
        <div class="memory-item__body">
          <p class="memory-item__text">${esc(row.title)}</p>
          ${row.detail ? `<p class="memory-item__detail">${esc(row.detail)}</p>` : ''}
          ${meta.length ? `<p class="memory-item__meta">${meta.map((m) => `<span>${m}</span>`).join('')}</p>` : ''}
        </div>
        <div class="memory-item__actions">
          <button type="button" class="memory-icon-btn" data-action="edit-story"
            aria-label="${esc(tf('memoryControl.editAria', 'Correct: {text}', { text: row.title }))}">${ICONS.edit}</button>
          <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="delete-story"
            aria-label="${esc(tf('memoryControl.deleteAria', 'Forget: {text}', { text: row.title }))}">${ICONS.trash}</button>
        </div>
      </li>`;
  }

  private renderEditor(row: Row): string {
    const disabled = this.busy ? 'disabled' : '';
    const story = row.isValue ? null : (row.item as StoryItem);
    return `
      <li class="memory-item memory-item--editing" data-story-id="${esc(row.id)}">
        <label class="memory-field"><span>${esc(row.isValue ? t('lifeStory.valueLabel', 'What matters') : t('lifeStory.whatLabel', 'What I remember'))}</span>
          <input class="memory-input" data-role="edit-title" value="${esc(row.title)}" maxlength="140" ${disabled} /></label>
        ${
          story
            ? `<label class="memory-field"><span>${esc(t('lifeStory.whenLabel', 'When (optional)'))}</span>
          <input class="memory-input" data-role="edit-period" value="${esc(story.period ?? '')}" maxlength="40" ${disabled} /></label>`
            : ''
        }
        <label class="memory-field"><span>${esc(t('lifeStory.detailLabel', 'In your words (optional)'))}</span>
          <textarea class="memory-input memory-textarea" rows="2" data-role="edit-detail" maxlength="400" ${disabled}>${esc(row.isValue ? (row.item as ValueItem).statement : (story?.detail ?? ''))}</textarea></label>
        <div class="memory-item__actions">
          <button type="button" class="memory-btn memory-btn--quiet" data-action="cancel-edit">${esc(t('memoryControl.cancel', 'Cancel'))}</button>
          <button type="button" class="memory-btn memory-btn--primary" data-action="save-edit" ${this.busy ? 'disabled aria-busy="true"' : ''}>${esc(this.busy ? t('memoryControl.saving', 'Saving...') : t('memoryControl.save', 'Save'))}</button>
        </div>
      </li>`;
  }

  private renderAddForm(): string {
    const options = ADD_CHOICES.map(
      ([k, label]) => `<option value="${k}">${esc(label())}</option>`
    ).join('');
    return `
      <div class="memory-card memory-add" data-role="add-form">
        <label class="memory-field"><span>${esc(t('lifeStory.addWhat', 'What is it?'))}</span>
          <select class="memory-input memory-select" data-role="add-kind">${options}</select></label>
        <label class="memory-field"><span>${esc(t('lifeStory.addTitle', 'In a few words'))}</span>
          <input class="memory-input" data-role="add-title" maxlength="140" /></label>
        <label class="memory-field"><span>${esc(t('lifeStory.whenLabel', 'When (optional)'))}</span>
          <input class="memory-input" data-role="add-period" maxlength="40" /></label>
        <div class="memory-item__actions">
          <button type="button" class="memory-btn memory-btn--quiet" data-action="cancel-add">${esc(t('memoryControl.cancel', 'Cancel'))}</button>
          <button type="button" class="memory-btn memory-btn--primary" data-action="save-add" ${this.busy ? 'disabled aria-busy="true"' : ''}>${esc(t('lifeStory.addSave', 'Add'))}</button>
        </div>
      </div>`;
  }

  private onKeydown(e: KeyboardEvent): void {
    const role = (e.target as HTMLElement).dataset.role ?? '';
    if (!role.startsWith('edit-') && !role.startsWith('add-')) return;
    if (e.key === 'Escape') {
      e.stopPropagation(); // leave the form, not the panel
      this.editingId = null;
      this.adding = false;
      this.render();
    } else if (e.key === 'Enter' && role !== 'edit-detail') {
      e.preventDefault();
      void (role.startsWith('add-') ? this.saveAdd() : this.saveEdit());
    }
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !this.host.contains(button)) return;
    const id = button.closest<HTMLElement>('[data-story-id]')?.dataset.storyId;
    switch (button.dataset.action) {
      case 'retry':
        if (this.loadFailed) await this.load();
        break;
      case 'start-add':
        this.adding = true;
        this.editingId = null;
        this.render();
        this.host.querySelector<HTMLElement>('[data-role="add-title"]')?.focus();
        break;
      case 'cancel-add':
        this.adding = false;
        this.render();
        break;
      case 'save-add':
        await this.saveAdd();
        break;
      case 'edit-story':
        if (id) {
          this.editingId = id;
          this.adding = false;
          this.render();
          this.host.querySelector<HTMLElement>('[data-role="edit-title"]')?.focus();
        }
        break;
      case 'cancel-edit':
        this.editingId = null;
        this.render();
        break;
      case 'save-edit':
        await this.saveEdit();
        break;
      case 'delete-story':
        if (id) await this.remove(id);
        break;
    }
  }

  private find(id: string): StoryItem | ValueItem | undefined {
    return this.data?.items.find((i) => i.id === id) ?? this.data?.values.find((v) => v.id === id);
  }

  private replace(next: StoryItem | ValueItem): void {
    if (!this.data) return;
    if (isValue(next))
      this.data.values = [next, ...this.data.values.filter((v) => v.id !== next.id)];
    else this.data.items = [next, ...this.data.items.filter((i) => i.id !== next.id)];
  }

  private value(role: string): string {
    return (
      this.host
        .querySelector<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >(`[data-role="${role}"]`)
        ?.value.trim() ?? ''
    );
  }

  private async saveAdd(): Promise<void> {
    if (this.busy) return;
    const kind = this.value('add-kind') as StoryKind | 'value';
    const title = this.value('add-title');
    const period = this.value('add-period');
    if (title.length < 2) {
      toast.warning(t('lifeStory.addEmpty', 'Add a few words first'));
      this.host.querySelector<HTMLElement>('[data-role="add-title"]')?.focus();
      return;
    }
    this.busy = true;
    const result = await addStoryItem({
      kind,
      title,
      ...(period && kind !== 'value' ? { period } : {}),
    });
    this.busy = false;
    if (!result.ok) {
      toast.error(t('lifeStory.addError', "Couldn't add that. Try again?"));
      return;
    }
    this.replace(result.value);
    this.adding = false;
    this.render();
    toast.success(t('lifeStory.added', "Added! I'll remember it."));
  }

  private async saveEdit(): Promise<void> {
    const id = this.editingId;
    const current = id ? this.find(id) : undefined;
    if (!id || !current || this.busy) return;
    const title = this.value('edit-title');
    const detail = this.value('edit-detail');
    if (title.length < 2) {
      toast.warning(t('memoryControl.emptyEdit', 'Add a few words first'));
      return;
    }
    this.busy = true;
    const period = isValue(current) ? undefined : this.value('edit-period');
    const result = await editStoryItem<StoryItem | ValueItem>(id, {
      title,
      detail: detail || null,
      ...(period !== undefined ? { period: period || null } : {}),
    });
    this.busy = false;
    if (!result.ok) {
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    this.replace(result.value);
    this.editingId = null;
    this.render();
    toast.success(t('memoryControl.saved', "Got it. I'll remember it that way."));
  }

  private async remove(id: string): Promise<void> {
    const item = this.find(id);
    if (!item || !this.data) return;
    const text = isValue(item) ? item.label : item.title;
    const confirmed = await confirmAction({
      title: t('memoryControl.forgetFactTitle', 'Forget this?'),
      message: tf(
        'lifeStory.forgetBody',
        'I\'ll stop remembering "{text}" and won\'t learn it again from past conversations.',
        { text }
      ),
      confirmLabel: t('memoryControl.forget', 'Forget'),
    });
    if (!confirmed) return;
    const before = { items: this.data.items, values: this.data.values };
    this.data.items = before.items.filter((i) => i.id !== id);
    this.data.values = before.values.filter((v) => v.id !== id);
    this.render();
    const result = await deleteStoryItem(id);
    if (!result.ok) {
      this.data.items = before.items;
      this.data.values = before.values;
      this.render();
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }
}
