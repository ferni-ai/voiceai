/**
 * Memories tab: the facts Ferni has learned (grouped by category) and the
 * people in the user's life. Search, filter, correct and forget.
 *
 * @module ui/memory-control/memories-tab
 */

import { t } from '../../i18n/index.js';
import {
  deleteFact,
  deletePerson,
  editFact,
  listMemories,
  type MemoryFact,
  type MemoryPerson,
  type MemorySnapshot,
} from '../../services/memory-control.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import { categoryLabel, esc, learnedLabel, sourcesLabel } from './format.js';
import { ICONS, renderEmpty, renderError, renderLoading } from './states.js';

const PEOPLE_FILTER = '__people';
const ALL_FILTER = '';

export class MemoriesTab {
  private snapshot: MemorySnapshot | null = null;
  private query = '';
  private filter = ALL_FILTER;
  private editingId: string | null = null;
  private savingId: string | null = null;
  private loadFailed = false;

  constructor(private readonly host: HTMLElement) {
    host.addEventListener('click', (e) => void this.onClick(e));
    host.addEventListener('input', (e) => this.onInput(e));
    host.addEventListener('change', (e) => this.onInput(e));
    host.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  async load(): Promise<void> {
    this.loadFailed = false;
    this.host.innerHTML = renderLoading(
      t('memoryControl.loadingMemories', 'Gathering what I remember...')
    );
    const result = await listMemories();
    if (!result.ok) {
      this.loadFailed = true;
      this.host.innerHTML = renderError(
        t('memoryControl.loadMemoriesError', "I couldn't reach my memories just now.")
      );
      return;
    }
    this.snapshot = result.value;
    this.render();
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  private render(): void {
    const snap = this.snapshot;
    if (!snap) return;
    if (snap.facts.length === 0 && snap.people.length === 0) {
      this.host.innerHTML = renderEmpty(
        t('memoryControl.emptyMemoriesTitle', "We're just getting to know each other"),
        t(
          'memoryControl.emptyMemoriesBody',
          "As we talk, the things you share will show up here. You'll always be able to see, correct or remove them."
        )
      );
      return;
    }
    const focused = document.activeElement;
    const keepSearchFocus = focused instanceof HTMLElement && focused.dataset.role === 'search';
    this.host.innerHTML = `${this.renderToolbar(snap)}<div class="memory-results" aria-live="polite">${this.renderResults(snap)}</div>`;
    if (keepSearchFocus) {
      const search = this.host.querySelector<HTMLInputElement>('[data-role="search"]');
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
    }
  }

  private renderToolbar(snap: MemorySnapshot): string {
    const categories = [...new Set(snap.facts.map((f) => f.category || 'other'))].sort();
    const option = (value: string, label: string): string =>
      `<option value="${esc(value)}" ${this.filter === value ? 'selected' : ''}>${esc(label)}</option>`;
    return `
      <div class="memory-toolbar">
        <label class="memory-visually-hidden" for="memory-search">${esc(
          t('memoryControl.searchLabel', 'Search memories')
        )}</label>
        <input id="memory-search" class="memory-input" type="search" data-role="search"
          value="${esc(this.query)}" placeholder="${esc(t('memoryControl.searchPlaceholder', 'Search what I remember'))}" />
        <label class="memory-visually-hidden" for="memory-filter">${esc(
          t('memoryControl.filterLabel', 'Show')
        )}</label>
        <select id="memory-filter" class="memory-input memory-select" data-role="filter">
          ${option(ALL_FILTER, t('memoryControl.filterAll', 'Everything'))}
          ${snap.people.length ? option(PEOPLE_FILTER, t('memoryControl.people', 'People')) : ''}
          ${categories.map((c) => option(c, categoryLabel(c))).join('')}
        </select>
      </div>`;
  }

  private matches(text: string): boolean {
    return !this.query || text.toLowerCase().includes(this.query.toLowerCase());
  }

  private renderResults(snap: MemorySnapshot): string {
    const people =
      this.filter === ALL_FILTER || this.filter === PEOPLE_FILTER
        ? snap.people.filter((p) =>
            this.matches(`${p.name} ${p.relationship ?? ''} ${p.notes ?? ''}`)
          )
        : [];
    const facts =
      this.filter === PEOPLE_FILTER
        ? []
        : snap.facts.filter(
            (f) =>
              (this.filter === ALL_FILTER || (f.category || 'other') === this.filter) &&
              this.matches(f.text)
          );

    if (people.length === 0 && facts.length === 0) {
      return `<p class="memory-muted memory-no-results">${esc(
        t('memoryControl.noMatches', 'Nothing matches that. Try a different word?')
      )}</p>`;
    }

    const groups = new Map<string, MemoryFact[]>();
    for (const fact of facts) {
      const key = fact.category || 'other';
      groups.set(key, [...(groups.get(key) ?? []), fact]);
    }
    const factSections = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([category, items]) => `
        <section class="memory-group" aria-label="${esc(categoryLabel(category))}">
          <h3 class="memory-group__title">${esc(categoryLabel(category))}</h3>
          <ul class="memory-list">${items.map((f) => this.renderFact(f)).join('')}</ul>
        </section>`
      )
      .join('');

    const peopleSection = people.length
      ? `<section class="memory-group" aria-label="${esc(t('memoryControl.people', 'People'))}">
          <h3 class="memory-group__title">${esc(t('memoryControl.people', 'People'))}</h3>
          <ul class="memory-list">${people.map((p) => this.renderPerson(p)).join('')}</ul>
        </section>`
      : '';

    return peopleSection + factSections;
  }

  private renderMeta(parts: string[]): string {
    const visible = parts.filter(Boolean);
    return visible.length
      ? `<p class="memory-item__meta">${visible.map((p) => `<span>${p}</span>`).join('')}</p>`
      : '';
  }

  private renderFact(fact: MemoryFact): string {
    const sources = Array.isArray(fact.sourceConversationIds)
      ? fact.sourceConversationIds.length
      : 0;
    const meta = this.renderMeta([
      esc(learnedLabel(fact.updatedAt)),
      esc(sourcesLabel(sources)),
      fact.userEdited
        ? `<span class="memory-badge">${esc(t('memoryControl.youCorrected', 'You corrected this'))}</span>`
        : '',
    ]);

    if (this.editingId === fact.id) {
      const saving = this.savingId === fact.id;
      return `
        <li class="memory-item memory-item--editing" data-fact-id="${esc(fact.id)}">
          <label class="memory-visually-hidden" for="memory-edit-${esc(fact.id)}">${esc(
            t('memoryControl.editLabel', 'Correct this memory')
          )}</label>
          <textarea id="memory-edit-${esc(fact.id)}" class="memory-input memory-textarea" rows="2"
            data-role="edit-text" ${saving ? 'disabled' : ''}>${esc(fact.text)}</textarea>
          <div class="memory-item__actions">
            <button type="button" class="memory-btn memory-btn--quiet" data-action="cancel-edit" ${
              saving ? 'disabled' : ''
            }>${esc(t('memoryControl.cancel', 'Cancel'))}</button>
            <button type="button" class="memory-btn memory-btn--primary" data-action="save-edit" ${
              saving ? 'disabled aria-busy="true"' : ''
            }>${esc(saving ? t('memoryControl.saving', 'Saving...') : t('memoryControl.save', 'Save'))}</button>
          </div>
        </li>`;
    }

    return `
      <li class="memory-item" data-fact-id="${esc(fact.id)}">
        <div class="memory-item__body">
          <p class="memory-item__text">${esc(fact.text)}</p>
          ${meta}
        </div>
        <div class="memory-item__actions">
          <button type="button" class="memory-icon-btn" data-action="edit-fact"
            aria-label="${esc(t('memoryControl.editAria', 'Correct: {text}', { text: fact.text }))}">${ICONS.edit}</button>
          <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="delete-fact"
            aria-label="${esc(t('memoryControl.deleteAria', 'Forget: {text}', { text: fact.text }))}">${ICONS.trash}</button>
        </div>
      </li>`;
  }

  private renderPerson(person: MemoryPerson): string {
    const detail = [person.relationship, person.notes].filter(Boolean).join(' · ');
    return `
      <li class="memory-item" data-person-id="${esc(person.id)}">
        <div class="memory-item__body">
          <p class="memory-item__text"><strong>${esc(person.name)}</strong></p>
          ${detail ? `<p class="memory-item__detail">${esc(detail)}</p>` : ''}
          ${this.renderMeta([esc(learnedLabel(person.updatedAt))])}
        </div>
        <div class="memory-item__actions">
          <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="delete-person"
            aria-label="${esc(t('memoryControl.deleteAria', 'Forget: {text}', { text: person.name }))}">${ICONS.trash}</button>
        </div>
      </li>`;
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  private onInput(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.dataset.role === 'search' && e.type === 'input') {
      this.query = (target as HTMLInputElement).value.trim();
      this.renderResultsOnly();
    } else if (target.dataset.role === 'filter' && e.type === 'change') {
      this.filter = (target as HTMLSelectElement).value;
      this.renderResultsOnly();
    }
  }

  private renderResultsOnly(): void {
    const results = this.host.querySelector<HTMLElement>('.memory-results');
    if (results && this.snapshot) results.innerHTML = this.renderResults(this.snapshot);
  }

  private onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.dataset.role !== 'edit-text') return;
    if (e.key === 'Escape') {
      // Leave edit mode instead of closing the panel
      e.stopPropagation();
      this.cancelEdit();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void this.saveEdit();
    }
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !this.host.contains(button)) return;
    const factId = button.closest<HTMLElement>('[data-fact-id]')?.dataset.factId;
    const personId = button.closest<HTMLElement>('[data-person-id]')?.dataset.personId;

    switch (button.dataset.action) {
      case 'retry':
        if (this.loadFailed) await this.load();
        break;
      case 'edit-fact':
        if (factId) this.startEdit(factId);
        break;
      case 'cancel-edit':
        this.cancelEdit();
        break;
      case 'save-edit':
        await this.saveEdit();
        break;
      case 'delete-fact':
        if (factId) await this.removeFact(factId);
        break;
      case 'delete-person':
        if (personId) await this.removePerson(personId);
        break;
    }
  }

  private focusItem(selector: string, fallbackToSearch = true): void {
    const el = this.host.querySelector<HTMLElement>(selector);
    if (el) el.focus();
    else if (fallbackToSearch)
      this.host.querySelector<HTMLElement>('[data-role="search"]')?.focus();
  }

  private startEdit(id: string): void {
    this.editingId = id;
    this.render();
    const textarea = this.host.querySelector<HTMLTextAreaElement>('[data-role="edit-text"]');
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  private cancelEdit(): void {
    const id = this.editingId;
    this.editingId = null;
    this.render();
    if (id) this.focusItem(`[data-fact-id="${CSS.escape(id)}"] [data-action="edit-fact"]`);
  }

  private async saveEdit(): Promise<void> {
    const id = this.editingId;
    const snap = this.snapshot;
    if (!id || !snap || this.savingId) return;
    const textarea = this.host.querySelector<HTMLTextAreaElement>('[data-role="edit-text"]');
    const text = textarea?.value.trim() ?? '';
    const current = snap.facts.find((f) => f.id === id);
    if (!current) return;
    if (!text) {
      toast.warning(t('memoryControl.emptyEdit', 'Add a few words first'));
      textarea?.focus();
      return;
    }
    if (text === current.text) {
      this.cancelEdit();
      return;
    }

    // Wait for the server: an edit that silently fails would mislead.
    this.savingId = id;
    this.render();
    const result = await editFact(id, { text, category: current.category });
    this.savingId = null;
    if (!result.ok) {
      this.render();
      const retryField = this.host.querySelector<HTMLTextAreaElement>('[data-role="edit-text"]');
      if (retryField) {
        retryField.value = text;
        retryField.focus();
      }
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    const updated: MemoryFact = { ...current, ...result.value, userEdited: true };
    snap.facts = snap.facts.map((f) => (f.id === id ? updated : f));
    this.editingId = null;
    this.render();
    this.focusItem(`[data-fact-id="${CSS.escape(id)}"] [data-action="edit-fact"]`);
    toast.success(t('memoryControl.saved', "Got it. I'll remember it that way."));
  }

  private async removeFact(id: string): Promise<void> {
    const snap = this.snapshot;
    const fact = snap?.facts.find((f) => f.id === id);
    if (!snap || !fact) return;
    const confirmed = await confirmAction({
      title: t('memoryControl.forgetFactTitle', 'Forget this?'),
      message: t(
        'memoryControl.forgetFactBody',
        'I\'ll stop remembering "{text}" and won\'t learn it again from past conversations.',
        { text: fact.text }
      ),
      confirmLabel: t('memoryControl.forget', 'Forget'),
    });
    if (!confirmed) return;

    // Safe to remove optimistically: we put it back if the server says no.
    const index = snap.facts.indexOf(fact);
    snap.facts = snap.facts.filter((f) => f.id !== id);
    this.render();
    this.focusItem('[data-action="edit-fact"]');
    const result = await deleteFact(id);
    if (!result.ok) {
      snap.facts.splice(index, 0, fact);
      this.render();
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }

  private async removePerson(id: string): Promise<void> {
    const snap = this.snapshot;
    const person = snap?.people.find((p) => p.id === id);
    if (!snap || !person) return;
    const confirmed = await confirmAction({
      title: t('memoryControl.forgetPersonTitle', 'Forget {name}?', { name: person.name }),
      message: t(
        'memoryControl.forgetPersonBody',
        "I'll stop remembering what you've told me about {name}.",
        { name: person.name }
      ),
      confirmLabel: t('memoryControl.forget', 'Forget'),
    });
    if (!confirmed) return;

    const index = snap.people.indexOf(person);
    snap.people = snap.people.filter((p) => p.id !== id);
    this.render();
    this.focusItem('[data-action="delete-person"], [data-action="edit-fact"]');
    const result = await deletePerson(id);
    if (!result.ok) {
      snap.people.splice(index, 0, person);
      this.render();
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }
}
