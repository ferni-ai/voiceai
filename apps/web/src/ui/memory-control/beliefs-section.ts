/**
 * "Faith & beliefs" section of the Sensitive tab: what the user has shared
 * about their faith, spiritual practice and beliefs (correct / forget),
 * against `/api/memory/me/beliefs`. Shown only while the Beliefs switch is
 * on; the switch itself (and "delete what you have") stays in the consent
 * card.
 *
 * Self-contained so the Sensitive tab only has to place it: it handles its
 * own `belief-*` actions on the shared host and asks the tab to re-render.
 *
 * @module ui/memory-control/beliefs-section
 */

import { t } from '../../i18n/index.js';
import {
  deleteBelief,
  editBelief,
  getBeliefs,
  type BeliefItem,
  type BeliefKind,
} from '../../services/life-story.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import { esc, sourcesLabel } from './format.js';
import { ICONS } from './states.js';
import { tf } from './work-places-config.js';

const KIND_LABELS: Record<BeliefKind, () => string> = {
  faith: () => t('lifeStory.beliefs.kind.faith', 'Faith'),
  practice: () => t('lifeStory.beliefs.kind.practice', 'Practice'),
  belief: () => t('lifeStory.beliefs.kind.belief', 'Beliefs'),
  questioning: () => t('lifeStory.beliefs.kind.questioning', 'Questions you carry'),
};

export class BeliefsSection {
  private items: BeliefItem[] | null = null;
  private editingId: string | null = null;
  private saving = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly rerender: () => void
  ) {
    host.addEventListener('click', (e) => void this.onClick(e));
    host.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  /** Fetch what's stored (in parallel with the rest of the tab; shown only while Beliefs is on). */
  async load(): Promise<void> {
    const result = await getBeliefs();
    this.items = result.ok ? result.value.items : null;
  }

  /** HTML for the section; empty while Beliefs is off. */
  html(enabled: boolean): string {
    if (!enabled || !this.items) return '';
    const title = esc(t('lifeStory.beliefs.title', 'Faith & beliefs'));
    const note = `<p class="memory-muted">${esc(
      t(
        'lifeStory.beliefs.note',
        "Only what you've shared. I never bring faith up first, and I'll never judge it."
      )
    )}</p>`;
    if (this.items.length === 0) {
      return `<section class="memory-group" data-role="beliefs-section" aria-label="${title}">
        <h3 class="memory-group__title">${title}</h3>${note}
        <p class="memory-muted">${esc(t('lifeStory.beliefs.empty', "Nothing yet. If you share what you believe, it'll show up here."))}</p></section>`;
    }
    return `<section class="memory-group" data-role="beliefs-section" aria-label="${title}">
      <h3 class="memory-group__title">${title}</h3>${note}
      <ul class="memory-list">${this.items.map((i) => this.renderItem(i)).join('')}</ul></section>`;
  }

  private renderItem(item: BeliefItem): string {
    if (this.editingId === item.id) {
      return `
      <li class="memory-item memory-item--editing" data-belief-id="${esc(item.id)}">
        <label class="memory-visually-hidden" for="memory-belief-edit">${esc(t('memoryControl.editLabel', 'Correct this memory'))}</label>
        <textarea id="memory-belief-edit" class="memory-input memory-textarea" rows="2" data-role="belief-edit"
          maxlength="140" ${this.saving ? 'disabled' : ''}>${esc(item.title)}</textarea>
        <div class="memory-item__actions">
          <button type="button" class="memory-btn memory-btn--quiet" data-action="belief-cancel">${esc(t('memoryControl.cancel', 'Cancel'))}</button>
          <button type="button" class="memory-btn memory-btn--primary" data-action="belief-save" ${this.saving ? 'disabled aria-busy="true"' : ''}>${esc(this.saving ? t('memoryControl.saving', 'Saving...') : t('memoryControl.save', 'Save'))}</button>
        </div>
      </li>`;
    }
    const meta = [
      esc(KIND_LABELS[item.kind]?.() ?? item.kind),
      esc(sourcesLabel(item.sourceConversationIds.length)),
      item.userEdited
        ? `<span class="memory-badge">${esc(t('memoryControl.youCorrected', 'You corrected this'))}</span>`
        : '',
    ].filter(Boolean);
    return `
      <li class="memory-item" data-belief-id="${esc(item.id)}">
        <div class="memory-item__body">
          <p class="memory-item__text">${esc(item.title)}</p>
          <p class="memory-item__meta">${meta.map((m) => `<span>${m}</span>`).join('')}</p>
        </div>
        <div class="memory-item__actions">
          <button type="button" class="memory-icon-btn" data-action="belief-edit"
            aria-label="${esc(tf('memoryControl.editAria', 'Correct: {text}', { text: item.title }))}">${ICONS.edit}</button>
          <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="belief-delete"
            aria-label="${esc(tf('memoryControl.deleteAria', 'Forget: {text}', { text: item.title }))}">${ICONS.trash}</button>
        </div>
      </li>`;
  }

  private onKeydown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).dataset.role !== 'belief-edit') return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.editingId = null;
      this.rerender();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void this.save();
    }
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action^="belief-"]');
    if (!button || !this.host.contains(button)) return;
    const id = button.closest<HTMLElement>('[data-belief-id]')?.dataset.beliefId;
    switch (button.dataset.action) {
      case 'belief-edit':
        if (!id) return;
        this.editingId = id;
        this.rerender();
        this.host.querySelector<HTMLElement>('[data-role="belief-edit"]')?.focus();
        break;
      case 'belief-cancel':
        this.editingId = null;
        this.rerender();
        break;
      case 'belief-save':
        await this.save();
        break;
      case 'belief-delete':
        if (id) await this.remove(id);
        break;
    }
  }

  private async save(): Promise<void> {
    const id = this.editingId;
    const current = this.items?.find((i) => i.id === id);
    if (!id || !current || !this.items || this.saving) return;
    const text =
      this.host.querySelector<HTMLTextAreaElement>('[data-role="belief-edit"]')?.value.trim() ?? '';
    if (text.length < 2) {
      toast.warning(t('memoryControl.emptyEdit', 'Add a few words first'));
      return;
    }
    this.saving = true;
    this.rerender();
    const result = await editBelief(id, { title: text });
    this.saving = false;
    if (!result.ok) {
      this.rerender();
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    this.items = this.items.map((i) => (i.id === id ? result.value : i));
    this.editingId = null;
    this.rerender();
    toast.success(t('memoryControl.saved', "Got it. I'll remember it that way."));
  }

  private async remove(id: string): Promise<void> {
    const item = this.items?.find((i) => i.id === id);
    if (!item || !this.items) return;
    const confirmed = await confirmAction({
      title: t('memoryControl.forgetFactTitle', 'Forget this?'),
      message: tf(
        'lifeStory.forgetBody',
        'I\'ll stop remembering "{text}" and won\'t learn it again from past conversations.',
        { text: item.title }
      ),
      confirmLabel: t('memoryControl.forget', 'Forget'),
    });
    if (!confirmed) return;
    const before = this.items;
    this.items = before.filter((i) => i.id !== id);
    this.rerender();
    const result = await deleteBelief(id);
    if (!result.ok) {
      this.items = before;
      this.rerender();
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }
}
