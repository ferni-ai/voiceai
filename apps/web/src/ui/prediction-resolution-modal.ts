/**
 * The "how did it go?" modal for a weekly prediction.
 *
 * Asks for the actual value of each metric the user predicted (by the name
 * the server stored it under, with its unit), records them, then shows how
 * each guess compared, using the score the server sent back. Styles come
 * from predictions.ui.ts (`.prediction-resolution-modal*`).
 *
 * @module ui/prediction-resolution-modal
 */

import { DURATION, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import type { PredictionData, ResolutionScore } from '../services/prediction-data.js';
import { createLogger } from '../utils/logger.js';
import { ICONS, escapeHtml } from './engagement-components.js';
import {
  comparisonLine,
  metricQuestion,
  metricUnit,
  overallLine,
} from './prediction-resolution-copy.js';

const log = createLogger('PredictionResolution');

const CLASS = 'prediction-resolution-modal';

export interface ResolutionModalOptions {
  prediction: PredictionData;
  /** Records the actuals (keyed by metric name); resolves to the server's score. */
  submit: (actuals: Record<string, number>) => Promise<ResolutionScore>;
  /** Called once the server has scored the prediction. */
  onScored?: (score: ResolutionScore) => void;
}

function renderInputs(prediction: PredictionData): string {
  return (prediction.metrics ?? [])
    .map(
      (metric, index) => `
      <div class="${CLASS}__input-group">
        <label for="prediction-actual-${index}">${escapeHtml(metricQuestion(metric.key))}</label>
        <p class="${CLASS}__prediction">${escapeHtml(
          t('predictionResolution.youGuessed', { value: metric.predicted })
        )}</p>
        <input
          type="number"
          inputmode="decimal"
          step="any"
          min="0"
          id="prediction-actual-${index}"
          class="${CLASS}__input"
          data-metric-key="${escapeHtml(metric.key)}"
          placeholder="${escapeHtml(metricUnit(metric.key))}"
        />
      </div>`
    )
    .join('');
}

function renderResult(score: ResolutionScore): string {
  const lines = score.metrics.map((metric) => {
    const { text, tone } = comparisonLine(metric);
    return `
      <p class="${CLASS}__question">${escapeHtml(metricQuestion(metric.key))}</p>
      <p class="${CLASS}__prediction" data-tone="${tone}">${escapeHtml(text)}</p>`;
  });
  const overall = overallLine(score);
  if (overall) lines.push(`<p class="${CLASS}__prediction">${escapeHtml(overall)}</p>`);
  return `<div role="status">${lines.join('')}</div>`;
}

/**
 * Read the inputs. Returns null (and marks the bad fields) unless at least one
 * value is given and every given value is a number.
 */
function readActuals(inputs: HTMLInputElement[]): Record<string, number> | null {
  const actuals: Record<string, number> = {};
  let valid = true;
  for (const input of inputs) {
    input.classList.remove(`${CLASS}__input--error`);
    const raw = input.value.trim();
    if (!raw) continue;
    const value = Number(raw);
    const key = input.dataset.metricKey;
    if (!Number.isFinite(value) || value < 0 || !key) {
      input.classList.add(`${CLASS}__input--error`);
      valid = false;
      continue;
    }
    actuals[key] = value;
  }
  if (valid && Object.keys(actuals).length === 0) {
    inputs.forEach((input) => input.classList.add(`${CLASS}__input--error`));
    return null;
  }
  return valid ? actuals : null;
}

/** Open the modal. Returns its element, or null if there is nothing to ask. */
export function openResolutionModal(options: ResolutionModalOptions): HTMLElement | null {
  const { prediction } = options;
  if (!prediction.metrics || prediction.metrics.length === 0) return null;

  const modal = document.createElement('div');
  modal.className = CLASS;
  modal.innerHTML = `
    <div class="${CLASS}__backdrop"></div>
    <div class="${CLASS}__card" role="dialog" aria-modal="true" aria-labelledby="prediction-resolution-title">
      <header class="${CLASS}__header">
        <h3 id="prediction-resolution-title">${escapeHtml(t('predictionResolution.title'))}</h3>
        <button class="engagement-close-btn" aria-label="${escapeHtml(t('common.close'))}">
          ${ICONS.close}
        </button>
      </header>
      <div class="${CLASS}__content">${renderInputs(prediction)}</div>
      <p class="${CLASS}__prediction" role="alert" hidden></p>
      <footer class="${CLASS}__footer">
        <button class="${CLASS}__cancel">${escapeHtml(t('common.cancel'))}</button>
        <button class="${CLASS}__submit engagement-btn-primary">${escapeHtml(
          t('predictionResolution.save')
        )}</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add(`${CLASS}--visible`));

  const close = (): void => {
    modal.classList.remove(`${CLASS}--visible`);
    window.setTimeout(() => modal.remove(), prefersReducedMotion() ? 0 : DURATION.NORMAL);
  };
  modal.querySelector(`.${CLASS}__backdrop`)?.addEventListener('click', close);
  modal.querySelector('.engagement-close-btn')?.addEventListener('click', close);
  modal.querySelector(`.${CLASS}__cancel`)?.addEventListener('click', close);

  const content = modal.querySelector<HTMLElement>(`.${CLASS}__content`);
  const alert = modal.querySelector<HTMLElement>('[role="alert"]');
  const submitBtn = modal.querySelector<HTMLButtonElement>(`.${CLASS}__submit`);
  const inputs = Array.from(modal.querySelectorAll<HTMLInputElement>(`.${CLASS}__input`));

  const onSubmit = async (): Promise<void> => {
    if (!submitBtn || !content) return;
    const actuals = readActuals(inputs);
    if (!actuals) return;
    submitBtn.disabled = true;
    submitBtn.textContent = t('common.saving');
    if (alert) alert.hidden = true;
    try {
      const score = await options.submit(actuals);
      content.innerHTML = renderResult(score);
      modal.querySelector(`.${CLASS}__cancel`)?.remove();
      submitBtn.textContent = t('common.done');
      submitBtn.disabled = false;
      submitBtn.removeEventListener('click', handleSubmit);
      submitBtn.addEventListener('click', close);
      options.onScored?.(score);
    } catch (error) {
      log.warn('Prediction result not saved', error);
      submitBtn.textContent = t('predictionResolution.save');
      submitBtn.disabled = false;
      if (alert) {
        alert.textContent = t('predictionResolution.saveFailed');
        alert.hidden = false;
      }
    }
  };
  const handleSubmit = (): void => void onSubmit();
  submitBtn?.addEventListener('click', handleSubmit);

  inputs[0]?.focus();
  return modal;
}
