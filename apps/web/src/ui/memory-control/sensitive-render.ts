/**
 * HTML for the "Sensitive" tab: the consent card (health, money, beliefs),
 * the allergy safety note, health notes and the mood timeline.
 *
 * @module ui/memory-control/sensitive-render
 */

import { t } from '../../i18n/index.js';
import type {
  ConsentView,
  HealthItem,
  HealthSnapshot,
  MoodConversation,
  MoodSnapshot,
  SensitiveCategory,
} from '../../services/sensitive-memory.service.js';
import { SENSITIVE_CATEGORIES } from '../../services/sensitive-memory.service.js';
import { esc, formatDate, personaName } from './format.js';
import { ICONS } from './states.js';

const CATEGORY_COPY: Record<SensitiveCategory, { label: () => string; desc: () => string }> = {
  health: {
    label: () => t('memoryControl.sensitive.health', 'Health & mood'),
    desc: () =>
      t(
        'memoryControl.sensitive.healthDesc',
        "Conditions, medications, appointments, sleep, energy, and how you've seemed across our talks."
      ),
  },
  finances: {
    label: () => t('memoryControl.sensitive.finances', 'Money'),
    desc: () =>
      t('memoryControl.sensitive.financesDesc', 'Income, debts, savings, and money worries.'),
  },
  beliefs: {
    label: () => t('memoryControl.sensitive.beliefs', 'Faith & beliefs'),
    desc: () =>
      t('memoryControl.sensitive.beliefsDesc', 'Religion, spirituality, and what guides you.'),
  },
};

export function categoryLabelFor(category: SensitiveCategory): string {
  return CATEGORY_COPY[category].label();
}

const INLINE_FALLBACK: Record<SensitiveCategory, string> = {
  health: 'your health & mood',
  finances: 'your money',
  beliefs: 'your faith & beliefs',
};

/** The category as it reads mid-sentence; per locale, since casing and articles differ. */
export function categoryInlineLabelFor(category: SensitiveCategory): string {
  return t(`memoryControl.sensitive.inline.${category}`, INLINE_FALLBACK[category]);
}

function storedLine(view: ConsentView, category: SensitiveCategory): string {
  const n = view.stored[category] ?? 0;
  if (view.consent.categories[category].enabled || n <= 0) return '';
  return `<p class="memory-switch-row__stored">
      <span>${esc(t('memoryControl.sensitive.stillStored', 'I still have {count} from before.', { count: n }))}</span>
      <button type="button" class="memory-btn memory-btn--danger-quiet" data-action="delete-category"
        data-category="${category}">${esc(t('memoryControl.sensitive.deleteThem', 'Delete them'))}</button>
    </p>`;
}

export function renderConsentCard(view: ConsentView, health: HealthSnapshot | null): string {
  const unanswered = view.consent.answeredAt === null;
  const rows = SENSITIVE_CATEGORIES.map((category) => {
    const on = view.consent.categories[category].enabled;
    const id = `memory-switch-${category}`;
    return `
      <li class="memory-switch-row" data-category-row="${category}">
        <div>
          <p class="memory-switch-row__label" id="${id}-label">${esc(categoryLabelFor(category))}</p>
          <p class="memory-switch-row__desc" id="${id}-desc">${esc(CATEGORY_COPY[category].desc())}</p>
          ${storedLine(view, category)}
        </div>
        <button type="button" role="switch" class="memory-switch" id="${id}" data-action="toggle-category"
          data-category="${category}" aria-checked="${on}" aria-labelledby="${id}-label" aria-describedby="${id}-desc"></button>
      </li>`;
  }).join('');

  const allergies = health?.safety.allergies ?? [];
  const intolerances = health?.safety.intolerances ?? [];
  const kept = [
    ...allergies.map((a) => (a.severity ? `${a.item} (${a.severity})` : a.item)),
    ...intolerances.map((i) => i.item),
  ];
  const safety = `
    <p class="memory-safety" data-role="safety-note">${esc(
      t(
        'memoryControl.sensitive.safety',
        'I always keep your allergies and food intolerances, even with Health off, so I never suggest something unsafe.'
      )
    )}${
      kept.length
        ? ` <strong>${esc(t('memoryControl.sensitive.keptNow', 'Kept now: {items}', { items: kept.join(', ') }))}</strong>`
        : ''
    }</p>`;

  return `
    <section class="memory-consent" aria-labelledby="memory-consent-title">
      <h3 class="memory-group__title" id="memory-consent-title">${esc(
        t('memoryControl.sensitive.title', 'Sensitive things')
      )}</h3>
      <p class="memory-consent__intro">${esc(
        t(
          'memoryControl.sensitive.intro',
          'Some things are more personal: your health, your money, and what you believe. I only remember those if you say yes, and you can switch each one off anytime.'
        )
      )}</p>
      ${
        unanswered
          ? `<div class="memory-consent__ask">
          <button type="button" class="memory-btn memory-btn--primary" data-action="agree-all">${esc(
            t('memoryControl.sensitive.agree', 'Yes, remember these')
          )}</button>
          <button type="button" class="memory-btn memory-btn--quiet" data-action="decline-all">${esc(
            t('memoryControl.sensitive.decline', 'Not now')
          )}</button>
        </div>`
          : ''
      }
      <ul class="memory-consent__list">${rows}</ul>
      ${safety}
    </section>`;
}

const KIND_LABELS: Record<HealthItem['kind'], () => string> = {
  condition: () => t('memoryControl.sensitive.kind.condition', 'Conditions'),
  medication: () => t('memoryControl.sensitive.kind.medication', 'Medications'),
  injury: () => t('memoryControl.sensitive.kind.injury', 'Injuries'),
  appointment: () => t('memoryControl.sensitive.kind.appointment', 'Appointments'),
  symptom: () => t('memoryControl.sensitive.kind.symptom', 'Symptoms'),
  sleep: () => t('memoryControl.sensitive.kind.sleep', 'Sleep'),
  exercise: () => t('memoryControl.sensitive.kind.exercise', 'Movement'),
  energy: () => t('memoryControl.sensitive.kind.energy', 'Energy'),
};

function renderHealthItem(item: HealthItem, editingId: string | null, saving: boolean): string {
  if (editingId === item.id) {
    return `
      <li class="memory-item memory-item--editing" data-health-id="${esc(item.id)}">
        <label class="memory-visually-hidden" for="memory-health-edit">${esc(
          t('memoryControl.editLabel', 'Correct this memory')
        )}</label>
        <textarea id="memory-health-edit" class="memory-input memory-textarea" rows="2"
          data-role="health-edit" ${saving ? 'disabled' : ''}>${esc(item.text)}</textarea>
        <div class="memory-item__actions">
          <button type="button" class="memory-btn memory-btn--quiet" data-action="cancel-health-edit" ${saving ? 'disabled' : ''}>${esc(
            t('memoryControl.cancel', 'Cancel')
          )}</button>
          <button type="button" class="memory-btn memory-btn--primary" data-action="save-health-edit" ${
            saving ? 'disabled aria-busy="true"' : ''
          }>${esc(saving ? t('memoryControl.saving', 'Saving...') : t('memoryControl.save', 'Save'))}</button>
        </div>
      </li>`;
  }
  const date = formatDate(item.day ?? item.lastMentionedAt);
  const meta = [
    date ? esc(t('memoryControl.sensitive.mentioned', 'Mentioned {date}', { date })) : '',
    item.status === 'past' ? esc(t('memoryControl.sensitive.past', 'In the past')) : '',
    item.userEdited
      ? `<span class="memory-badge">${esc(t('memoryControl.youCorrected', 'You corrected this'))}</span>`
      : '',
  ].filter(Boolean);
  return `
    <li class="memory-item" data-health-id="${esc(item.id)}">
      <div class="memory-item__body">
        <p class="memory-item__text">${esc(item.text)}</p>
        ${meta.length ? `<p class="memory-item__meta">${meta.map((m) => `<span>${m}</span>`).join('')}</p>` : ''}
      </div>
      <div class="memory-item__actions">
        <button type="button" class="memory-icon-btn" data-action="edit-health"
          aria-label="${esc(t('memoryControl.editAria', 'Correct: {text}', { text: item.text }))}">${ICONS.edit}</button>
        <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="delete-health"
          aria-label="${esc(t('memoryControl.deleteAria', 'Forget: {text}', { text: item.text }))}">${ICONS.trash}</button>
      </div>
    </li>`;
}

export function renderHealth(
  health: HealthSnapshot,
  editingId: string | null,
  saving: boolean
): string {
  const title = esc(t('memoryControl.sensitive.healthTitle', 'Health notes'));
  if (health.items.length === 0) {
    const empty = health.enabled
      ? t(
          'memoryControl.sensitive.healthEmpty',
          "Nothing yet. When you mention your health, it'll show up here."
        )
      : t('memoryControl.sensitive.healthOff', "Health is off, so I'm not keeping health notes.");
    return `<section class="memory-group" aria-label="${title}"><h3 class="memory-group__title">${title}</h3>
      <p class="memory-muted">${esc(empty)}</p></section>`;
  }
  const groups = new Map<HealthItem['kind'], HealthItem[]>();
  for (const item of health.items) groups.set(item.kind, [...(groups.get(item.kind) ?? []), item]);
  const sections = [...groups.entries()]
    .map(
      ([kind, items]) => `
      <h4 class="memory-item__detail">${esc(KIND_LABELS[kind]?.() ?? kind)}</h4>
      <ul class="memory-list">${items.map((i) => renderHealthItem(i, editingId, saving)).join('')}</ul>`
    )
    .join('');
  return `<section class="memory-group" aria-label="${title}"><h3 class="memory-group__title">${title}</h3>${sections}</section>`;
}

function arcLabel(arc: MoodConversation['arc']): string {
  switch (arc) {
    case 'lifting':
      return t('memoryControl.sensitive.arcLifting', 'Felt lighter by the end');
    case 'heavier':
      return t('memoryControl.sensitive.arcHeavier', 'Felt heavier by the end');
    case 'mixed':
      return t('memoryControl.sensitive.arcMixed', 'Ups and downs');
    default:
      return t('memoryControl.sensitive.arcSteady', 'Steady');
  }
}

export function renderMood(mood: MoodSnapshot): string {
  const title = esc(t('memoryControl.sensitive.moodTitle', 'How you have seemed'));
  if (mood.timeline.length === 0) {
    const empty = mood.enabled
      ? t(
          'memoryControl.sensitive.moodEmpty',
          'After we talk, a gentle sense of how you seemed will show up here.'
        )
      : t(
          'memoryControl.sensitive.moodOff',
          "Health is off, so I don't keep a mood timeline. I still listen for how you're feeling while we talk."
        );
    return `<section class="memory-group" aria-label="${title}"><h3 class="memory-group__title">${title}</h3>
      <p class="memory-muted">${esc(empty)}</p></section>`;
  }
  const rows = mood.timeline
    .map((c) => {
      const label = `${formatDate(c.endedAt || c.startedAt)} · ${personaName(c.personaId)}`;
      return `
      <li class="memory-item" data-mood-id="${esc(c.id)}">
        <div class="memory-item__body">
          <p class="memory-item__text">${esc(label)}</p>
          <p class="memory-item__meta"><span>${esc(arcLabel(c.arc))}</span><span>${esc(c.dominantMood)}</span></p>
        </div>
        <div class="memory-item__actions">
          <button type="button" class="memory-icon-btn memory-icon-btn--danger" data-action="delete-mood"
            aria-label="${esc(t('memoryControl.deleteAria', 'Forget: {text}', { text: label }))}">${ICONS.trash}</button>
        </div>
      </li>`;
    })
    .join('');
  return `<section class="memory-group" aria-label="${title}"><h3 class="memory-group__title">${title}</h3>
    ${mood.insight ? `<p class="memory-mood-insight">${esc(mood.insight)}</p>` : ''}
    <ul class="memory-list">${rows}</ul></section>`;
}
