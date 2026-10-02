/**
 * "Work & places" tab: what Ferni remembers about the user's work and career
 * (jobs with their history, projects, wins, stresses, goals, interviews) and
 * their places (home, places lived, trips, favourite spots, places that
 * matter, bucket list). Add, correct and forget, against
 * `/api/memory/me/work` and `/api/memory/me/places`.
 *
 * @module ui/memory-control/work-places-tab
 */

import { t } from '../../i18n/index.js';
import {
  addLifeItem,
  deleteLifeItem,
  editLifeItem,
  listLifeArea,
  type Colleague,
  type LifeArea,
  type LifeItem,
  type LifeKind,
  type LifeStatus,
} from '../../services/work-places.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import { esc, sourcesLabel } from './format.js';
import { ICONS, renderError, renderLoading } from './states.js';
import {
  ADD_KINDS,
  dateRange,
  PLACE_GROUPS,
  STATUS_CHOICES,
  statusLabel,
  tf,
  WORK_GROUPS,
  type Group,
} from './work-places-config.js';

export { formatLifeDate } from './work-places-config.js';

export class WorkPlacesTab {
  private work: { items: LifeItem[]; colleagues: Colleague[] } | null = null;
  private places: LifeItem[] | null = null;
  private editingId: string | null = null;
  private addingArea: LifeArea | null = null;
  private busy = false;
  private loadFailed = false;

  constructor(private readonly host: HTMLElement) {
    host.addEventListener('click', (e) => void this.onClick(e));
    host.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  async load(): Promise<void> {
    this.loadFailed = false;
    this.host.innerHTML = renderLoading(
      t('lifeMemory.loading', 'Gathering your work and places...')
    );
    const [work, places] = await Promise.all([listLifeArea('work'), listLifeArea('places')]);
    if (!work.ok || !places.ok) {
      this.loadFailed = true;
      this.host.innerHTML = renderError(
        t('lifeMemory.loadError', "I couldn't reach that just now.")
      );
      return;
    }
    this.work = { items: work.value.items, colleagues: work.value.colleagues };
    this.places = places.value.items;
    this.render();
  }

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------

  private render(): void {
    if (!this.work || !this.places) return;
    this.host.innerHTML = `
      ${this.renderArea(
        'work',
        t('lifeMemory.workTitle', 'Work & career'),
        this.work.items,
        WORK_GROUPS,
        t('lifeMemory.workEmpty', "Tell me about your work and I'll keep track of the story.")
      )}
      ${this.renderColleagues(this.work.colleagues)}
      ${this.renderArea(
        'places',
        t('lifeMemory.placesTitle', 'Travel & places'),
        this.places,
        PLACE_GROUPS,
        t(
          'lifeMemory.placesEmpty',
          "Where you live, where you've been, where you dream of going. It'll show up here."
        )
      )}`;
  }

  private renderArea(
    area: LifeArea,
    title: string,
    items: LifeItem[],
    groups: readonly Group[],
    empty: string
  ): string {
    const sections = groups
      .map((g) => ({ g, list: items.filter(g.match) }))
      .filter(({ list }) => list.length > 0)
      .map(
        ({ g, list }) => `
        <section class="memory-group" aria-label="${esc(g.label())}">
          <h4 class="memory-group__title">${esc(g.label())}</h4>
          <ul class="memory-list">${list.map((i) => this.renderItem(i)).join('')}</ul>
        </section>`
      )
      .join('');
    return `
      <section class="memory-area" data-area="${area}" aria-labelledby="memory-area-${area}">
        <div class="memory-area__head">
          <h3 class="memory-area__title" id="memory-area-${area}">${esc(title)}</h3>
          ${this.addingArea === area ? '' : `<button type="button" class="memory-btn memory-btn--quiet" data-action="start-add" data-area="${area}">${esc(t('lifeMemory.add', 'Add'))}</button>`}
        </div>
        ${this.addingArea === area ? this.renderAddForm(area) : ''}
        ${sections || `<p class="memory-muted">${esc(empty)}</p>`}
      </section>`;
  }

  private renderColleagues(colleagues: Colleague[]): string {
    if (colleagues.length === 0) return '';
    const names = colleagues.map((c) =>
      c.relationship ? `${c.name} (${c.relationship})` : c.name
    );
    return `
      <section class="memory-group memory-area__people" aria-label="${esc(t('lifeMemory.colleagues', 'People you work with'))}">
        <h4 class="memory-group__title">${esc(t('lifeMemory.colleagues', 'People you work with'))}</h4>
        <p class="memory-item__detail">${esc(names.join(' · '))}</p>
        <p class="memory-muted">${esc(t('lifeMemory.colleaguesHint', 'You can correct or forget people under Memories.'))}</p>
      </section>`;
  }

  private renderItem(item: LifeItem): string {
    if (this.editingId === item.id) return this.renderEditor(item);
    const detail = [
      item.kind === 'job' && item.team ? item.team : '',
      item.kind === 'job' && item.previousRoles?.length
        ? tf('lifeMemory.before', 'before: {roles}', { roles: item.previousRoles.join(', ') })
        : '',
      item.meaning,
      dateRange(item),
      item.withPeople?.length
        ? tf('lifeMemory.with', 'with {people}', {
            people: item.withPeople.map((p) => p.name).join(', '),
          })
        : '',
      item.notes,
    ]
      .filter(Boolean)
      .join(' · ');
    const meta = [
      esc(sourcesLabel(item.sourceConversationIds.length)),
      item.source === 'user'
        ? `<span class="memory-badge">${esc(item.userEdited && item.sourceConversationIds.length ? t('memoryControl.youCorrected', 'You corrected this') : t('lifeMemory.youAdded', 'You added this'))}</span>`
        : item.userEdited
          ? `<span class="memory-badge">${esc(t('memoryControl.youCorrected', 'You corrected this'))}</span>`
          : '',
    ].filter(Boolean);
    return `
      <li class="memory-item" data-item-id="${esc(item.id)}" data-area="${item.area}">
        <div class="memory-item__body">
          <p class="memory-item__text">${esc(item.title)}</p>
          ${detail ? `<p class="memory-item__detail">${esc(detail)}</p>` : ''}
          ${meta.length ? `<p class="memory-item__meta">${meta.map((m) => `<span>${m}</span>`).join('')}</p>` : ''}
        </div>
        <div class="memory-item__actions">
          <button type="button" class="memory-icon-btn" data-action="edit-item"
            aria-label="${esc(tf('memoryControl.editAria', 'Correct: {text}', { text: item.title }))}">${ICONS.edit}</button>
          <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="delete-item"
            aria-label="${esc(tf('memoryControl.deleteAria', 'Forget: {text}', { text: item.title }))}">${ICONS.trash}</button>
        </div>
      </li>`;
  }

  private renderEditor(item: LifeItem): string {
    const id = esc(item.id);
    const statuses = STATUS_CHOICES[item.kind];
    const statusField = statuses
      ? `<label class="memory-field"><span>${esc(t('lifeMemory.status', 'Status'))}</span>
          <select class="memory-input memory-select" data-role="edit-status">
            ${statuses.map((s) => `<option value="${s}" ${s === item.status ? 'selected' : ''}>${esc(statusLabel(s, item.kind))}</option>`).join('')}
          </select></label>`
      : '';
    return `
      <li class="memory-item memory-item--editing" data-item-id="${id}" data-area="${item.area}">
        <label class="memory-field"><span>${esc(t('lifeMemory.title', 'What I remember'))}</span>
          <input class="memory-input" data-role="edit-title" value="${esc(item.title)}" maxlength="120" ${this.busy ? 'disabled' : ''} /></label>
        ${statusField}
        <label class="memory-field"><span>${esc(t('lifeMemory.notes', 'Notes'))}</span>
          <textarea class="memory-input memory-textarea" rows="2" data-role="edit-notes" maxlength="300" ${this.busy ? 'disabled' : ''}>${esc(item.notes ?? '')}</textarea></label>
        <div class="memory-item__actions">
          <button type="button" class="memory-btn memory-btn--quiet" data-action="cancel-edit">${esc(t('memoryControl.cancel', 'Cancel'))}</button>
          <button type="button" class="memory-btn memory-btn--primary" data-action="save-edit" ${this.busy ? 'disabled aria-busy="true"' : ''}>${esc(this.busy ? t('memoryControl.saving', 'Saving...') : t('memoryControl.save', 'Save'))}</button>
        </div>
      </li>`;
  }

  private renderAddForm(area: LifeArea): string {
    const kinds = ADD_KINDS[area]
      .map(([k, label]) => `<option value="${k}">${esc(label())}</option>`)
      .join('');
    return `
      <div class="memory-card memory-add" data-role="add-form" data-area="${area}">
        <label class="memory-field"><span>${esc(t('lifeMemory.addWhat', 'What is it?'))}</span>
          <select class="memory-input memory-select" data-role="add-kind">${kinds}</select></label>
        <label class="memory-field"><span>${esc(area === 'work' ? t('lifeMemory.addWorkTitle', 'In a few words') : t('lifeMemory.addPlaceTitle', 'Which place?'))}</span>
          <input class="memory-input" data-role="add-title" maxlength="120" /></label>
        <label class="memory-field"><span>${esc(t('lifeMemory.addDate', 'When (optional)'))}</span>
          <input class="memory-input" type="date" data-role="add-date" /></label>
        <div class="memory-item__actions">
          <button type="button" class="memory-btn memory-btn--quiet" data-action="cancel-add">${esc(t('memoryControl.cancel', 'Cancel'))}</button>
          <button type="button" class="memory-btn memory-btn--primary" data-action="save-add" ${this.busy ? 'disabled aria-busy="true"' : ''}>${esc(t('lifeMemory.addSave', 'Add'))}</button>
        </div>
      </div>`;
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  private onKeydown(e: KeyboardEvent): void {
    const role = (e.target as HTMLElement).dataset.role ?? '';
    if (!role.startsWith('edit-') && !role.startsWith('add-')) return;
    if (e.key === 'Escape') {
      e.stopPropagation(); // leave the form, not the panel
      this.editingId = null;
      this.addingArea = null;
      this.render();
    } else if (e.key === 'Enter' && role !== 'edit-notes') {
      e.preventDefault();
      void (role.startsWith('add-') ? this.saveAdd() : this.saveEdit());
    }
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !this.host.contains(button)) return;
    const row = button.closest<HTMLElement>('[data-item-id]');
    switch (button.dataset.action) {
      case 'retry':
        if (this.loadFailed) await this.load();
        break;
      case 'start-add':
        this.addingArea = button.dataset.area as LifeArea;
        this.editingId = null;
        this.render();
        this.host.querySelector<HTMLElement>('[data-role="add-title"]')?.focus();
        break;
      case 'cancel-add':
        this.addingArea = null;
        this.render();
        break;
      case 'save-add':
        await this.saveAdd();
        break;
      case 'edit-item':
        if (row) {
          this.editingId = row.dataset.itemId ?? null;
          this.addingArea = null;
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
      case 'delete-item':
        if (row?.dataset.itemId)
          await this.remove(row.dataset.area as LifeArea, row.dataset.itemId);
        break;
    }
  }

  private list(area: LifeArea): LifeItem[] {
    return (area === 'work' ? this.work?.items : this.places) ?? [];
  }

  private setList(area: LifeArea, items: LifeItem[]): void {
    if (area === 'work' && this.work) this.work.items = items;
    else if (area === 'places') this.places = items;
  }

  private async saveAdd(): Promise<void> {
    const area = this.addingArea;
    if (!area || this.busy) return;
    const kind = this.host.querySelector<HTMLSelectElement>('[data-role="add-kind"]')
      ?.value as LifeKind;
    const title =
      this.host.querySelector<HTMLInputElement>('[data-role="add-title"]')?.value.trim() ?? '';
    const date = this.host.querySelector<HTMLInputElement>('[data-role="add-date"]')?.value ?? '';
    if (title.length < 2) {
      toast.warning(t('lifeMemory.addEmpty', 'Add a few words first'));
      this.host.querySelector<HTMLElement>('[data-role="add-title"]')?.focus();
      return;
    }
    this.busy = true;
    const result = await addLifeItem(area, {
      kind,
      title,
      ...(kind === 'job' ? { employer: title } : {}),
      ...(area === 'places' ? { place: title } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { startDate: date } : {}),
    });
    this.busy = false;
    if (!result.ok) {
      toast.error(t('lifeMemory.addError', "Couldn't add that. Try again?"));
      return;
    }
    this.setList(area, [result.value, ...this.list(area).filter((i) => i.id !== result.value.id)]);
    this.addingArea = null;
    this.render();
    toast.success(t('lifeMemory.added', "Added! I'll remember it."));
  }

  private async saveEdit(): Promise<void> {
    const id = this.editingId;
    const row = id
      ? ([...this.host.querySelectorAll<HTMLElement>('[data-item-id]')].find(
          (el) => el.dataset.itemId === id
        ) ?? null)
      : null;
    if (!id || !row || this.busy) return;
    const area = row.dataset.area as LifeArea;
    const current = this.list(area).find((i) => i.id === id);
    if (!current) return;
    const title =
      row.querySelector<HTMLInputElement>('[data-role="edit-title"]')?.value.trim() ?? '';
    const notes =
      row.querySelector<HTMLTextAreaElement>('[data-role="edit-notes"]')?.value.trim() ?? '';
    const status = row.querySelector<HTMLSelectElement>('[data-role="edit-status"]')?.value as
      | LifeStatus
      | undefined;
    if (!title) {
      toast.warning(t('memoryControl.emptyEdit', 'Add a few words first'));
      return;
    }
    this.busy = true;
    const result = await editLifeItem(area, id, {
      title,
      notes: notes || null,
      ...(status && status !== current.status ? { status } : {}),
    });
    this.busy = false;
    if (!result.ok) {
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    this.setList(
      area,
      this.list(area).map((i) => (i.id === id ? result.value : i))
    );
    this.editingId = null;
    this.render();
    toast.success(t('memoryControl.saved', "Got it. I'll remember it that way."));
  }

  private async remove(area: LifeArea, id: string): Promise<void> {
    const item = this.list(area).find((i) => i.id === id);
    if (!item) return;
    const confirmed = await confirmAction({
      title: t('memoryControl.forgetFactTitle', 'Forget this?'),
      message: tf(
        'lifeMemory.forgetBody',
        'I\'ll stop remembering "{text}" and won\'t learn it again from past conversations.',
        { text: item.title }
      ),
      confirmLabel: t('memoryControl.forget', 'Forget'),
    });
    if (!confirmed) return;
    const before = this.list(area);
    this.setList(
      area,
      before.filter((i) => i.id !== id)
    );
    this.render();
    const result = await deleteLifeItem(area, id);
    if (!result.ok) {
      this.setList(area, before);
      this.render();
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }
}
