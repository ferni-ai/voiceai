/**
 * "Sensitive" tab: the consent switches for health, money and beliefs (one
 * upfront yes/no plus a switch each), the allergy safety exception, health
 * notes (correct / forget) and the mood timeline (forget per conversation).
 *
 * Switching a category off stops Ferni remembering it at once; if anything is
 * stored, the user is offered (never forced) deleting it.
 *
 * @module ui/memory-control/sensitive-tab
 */

import { t } from '../../i18n/index.js';
import {
  answerConsent,
  deleteCategoryData,
  deleteHealthItem,
  deleteMoodEntry,
  editHealthItem,
  getConsent,
  getHealth,
  getMood,
  keepConsentChoices,
  setCategory,
  type ConsentView,
  type HealthSnapshot,
  type MoodSnapshot,
  type SensitiveCategory,
} from '../../services/sensitive-memory.service.js';
import { toast } from '../whisper.ui.js';
import { confirmAction } from './confirm-dialog.js';
import {
  categoryLabelFor,
  renderConsentCard,
  renderHealth,
  renderMood,
} from './sensitive-render.js';
import { injectSensitiveStyles } from './sensitive.styles.js';
import { renderError, renderLoading } from './states.js';

export class SensitiveTab {
  private consent: ConsentView | null = null;
  private health: HealthSnapshot | null = null;
  private mood: MoodSnapshot | null = null;
  private editingId: string | null = null;
  private saving = false;
  private busy = false;
  private loadFailed = false;

  constructor(private readonly host: HTMLElement) {
    injectSensitiveStyles();
    host.addEventListener('click', (e) => void this.onClick(e));
    host.addEventListener('keydown', (e) => this.onKeydown(e));
  }

  async load(): Promise<void> {
    this.loadFailed = false;
    this.host.innerHTML = renderLoading(t('memoryControl.sensitive.loading', 'One moment...'));
    const [consent, health, mood] = await Promise.all([getConsent(), getHealth(), getMood()]);
    if (!consent.ok) {
      this.loadFailed = true;
      this.host.innerHTML = renderError(
        t('memoryControl.sensitive.loadError', "I couldn't load these settings just now.")
      );
      return;
    }
    this.consent = consent.value;
    this.health = health.ok ? health.value : null;
    this.mood = mood.ok ? mood.value : null;
    this.render();
  }

  private render(): void {
    if (!this.consent) return;
    this.host.innerHTML = [
      renderConsentCard(this.consent, this.health),
      this.health ? renderHealth(this.health, this.editingId, this.saving) : '',
      this.mood ? renderMood(this.mood) : '',
    ].join('');
  }

  private focus(selector: string): void {
    this.host.querySelector<HTMLElement>(selector)?.focus();
  }

  private onKeydown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target.dataset.role !== 'health-edit') return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.editingId = null;
      this.render();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void this.saveEdit();
    }
  }

  private async onClick(e: Event): Promise<void> {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button || !this.host.contains(button)) return;
    const category = button.dataset.category as SensitiveCategory | undefined;
    const healthId = button.closest<HTMLElement>('[data-health-id]')?.dataset.healthId;
    const moodId = button.closest<HTMLElement>('[data-mood-id]')?.dataset.moodId;

    switch (button.dataset.action) {
      case 'retry':
        if (this.loadFailed) await this.load();
        break;
      case 'agree-all':
        await this.answer(true);
        break;
      case 'decline-all':
        await this.answer(false);
        break;
      case 'keep-choices':
        await this.keepChoices();
        break;
      case 'toggle-category':
        if (category) await this.toggle(category);
        break;
      case 'delete-category':
        if (category) await this.offerDelete(category, true);
        break;
      case 'edit-health':
        if (healthId) this.startEdit(healthId);
        break;
      case 'cancel-health-edit':
        this.editingId = null;
        this.render();
        break;
      case 'save-health-edit':
        await this.saveEdit();
        break;
      case 'delete-health':
        if (healthId) await this.removeHealth(healthId);
        break;
      case 'delete-mood':
        if (moodId) await this.removeMood(moodId);
        break;
    }
  }

  private async answer(agree: boolean): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const result = await answerConsent(agree);
    this.busy = false;
    if (!result.ok) {
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    this.consent = result.value;
    await this.refreshLists();
    toast.success(
      agree
        ? t('memoryControl.sensitive.agreed', 'Thank you. I’ll keep these close.')
        : t('memoryControl.sensitive.declined', "Okay. I won't remember those.")
    );
    this.focus('[data-action="toggle-category"]');
  }

  private async keepChoices(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const result = await keepConsentChoices();
    this.busy = false;
    if (!result.ok) {
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    this.consent = result.value;
    this.render();
    toast.success(t('memoryControl.sensitive.kept', 'Got it. Nothing changed.'));
    this.focus('[data-action="toggle-category"]');
  }

  private async toggle(category: SensitiveCategory): Promise<void> {
    if (this.busy || !this.consent) return;
    const next = !this.consent.consent.categories[category].enabled;
    this.busy = true;
    const result = await setCategory(category, next);
    this.busy = false;
    if (!result.ok) {
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    this.consent = result.value;
    await this.refreshLists();
    this.focus(`#memory-switch-${category}`);
    if (next) {
      toast.success(t('memoryControl.sensitive.on', "Got it. I'll remember that now."));
      return;
    }
    toast.success(t('memoryControl.sensitive.off', "Okay, I've stopped remembering that."));
    await this.offerDelete(category, false);
  }

  /** Offer (never force) deleting what's stored for a category. */
  private async offerDelete(category: SensitiveCategory, asked: boolean): Promise<void> {
    const count = this.consent?.stored[category] ?? 0;
    if (count <= 0) return;
    const label = categoryLabelFor(category);
    const confirmed = await confirmAction({
      title: t('memoryControl.sensitive.deleteTitle', 'Delete what I have?'),
      message:
        t(
          'memoryControl.sensitive.deleteBody',
          'I still have {count} things about {label}. Delete them too?',
          {
            count,
            label: label.toLowerCase(),
          }
        ) +
        (category === 'health'
          ? ` ${t('memoryControl.sensitive.deleteKeepsAllergies', 'Your allergies stay, so I never suggest something unsafe.')}`
          : ''),
      confirmLabel: t('memoryControl.sensitive.deleteConfirm', 'Delete'),
    });
    if (!confirmed) {
      if (asked) this.focus(`#memory-switch-${category}`);
      return;
    }
    const result = await deleteCategoryData(category);
    if (!result.ok) {
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    const refreshed = await getConsent();
    if (refreshed.ok) this.consent = refreshed.value;
    await this.refreshLists();
    this.focus(`#memory-switch-${category}`);
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }

  private async refreshLists(): Promise<void> {
    const [health, mood] = await Promise.all([getHealth(), getMood()]);
    if (health.ok) this.health = health.value;
    if (mood.ok) this.mood = mood.value;
    this.render();
  }

  private startEdit(id: string): void {
    this.editingId = id;
    this.render();
    const field = this.host.querySelector<HTMLTextAreaElement>('[data-role="health-edit"]');
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }

  private async saveEdit(): Promise<void> {
    const id = this.editingId;
    const current = this.health?.items.find((i) => i.id === id);
    if (!id || !current || !this.health || this.saving) return;
    const field = this.host.querySelector<HTMLTextAreaElement>('[data-role="health-edit"]');
    const text = field?.value.trim() ?? '';
    if (!text) {
      toast.warning(t('memoryControl.emptyEdit', 'Add a few words first'));
      field?.focus();
      return;
    }
    if (text === current.text) {
      this.editingId = null;
      this.render();
      return;
    }
    this.saving = true;
    this.render();
    const result = await editHealthItem(id, { text });
    this.saving = false;
    if (!result.ok) {
      this.render();
      toast.error(t('memoryControl.saveError', "Couldn't save that. Try again?"));
      return;
    }
    this.health.items = this.health.items.map((i) => (i.id === id ? { ...i, ...result.value } : i));
    this.editingId = null;
    this.render();
    // Health ids are `health_<hex>`: safe in a selector without escaping.
    this.focus(`[data-health-id="${id}"] [data-action="edit-health"]`);
    toast.success(t('memoryControl.saved', "Got it. I'll remember it that way."));
  }

  private async removeHealth(id: string): Promise<void> {
    const item = this.health?.items.find((i) => i.id === id);
    if (!item || !this.health) return;
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
    const before = this.health.items;
    this.health.items = before.filter((i) => i.id !== id);
    this.render();
    const result = await deleteHealthItem(id);
    if (!result.ok) {
      this.health.items = before;
      this.render();
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }

  private async removeMood(id: string): Promise<void> {
    if (!this.mood) return;
    const confirmed = await confirmAction({
      title: t('memoryControl.forgetFactTitle', 'Forget this?'),
      message: t(
        'memoryControl.sensitive.forgetMoodBody',
        "I'll forget how you seemed in that conversation."
      ),
      confirmLabel: t('memoryControl.forget', 'Forget'),
    });
    if (!confirmed) return;
    const before = this.mood.timeline;
    this.mood.timeline = before.filter((c) => c.id !== id);
    this.render();
    const result = await deleteMoodEntry(id);
    if (!result.ok) {
      this.mood.timeline = before;
      this.render();
      toast.error(t('memoryControl.forgetError', "Couldn't forget that. Try again?"));
      return;
    }
    toast.success(t('memoryControl.forgotten', 'Forgotten.'));
  }
}
