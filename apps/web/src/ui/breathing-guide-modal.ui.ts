/**
 * Centered breathing-guide modal opened from voice `breathing_exercise` messages.
 *
 * @module ui/breathing-guide-modal
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import {
  createBreathingGuide,
  type BreathingGuide,
  type BreathingPattern,
} from './breathing-guide.ui.js';

const log = createLogger('BreathingGuideModal');

const LUCIDE_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

export interface BreathingExercisePayload {
  readonly technique?: string;
  readonly purpose?: string;
  readonly pattern?: string;
}

const TECHNIQUE_TO_PATTERN: Record<string, BreathingPattern> = {
  simple: 'relaxing',
  box: 'box',
  '4-7-8': 'sleep',
  coherent: 'focus',
};

const PURPOSE_TO_PATTERN: Record<string, BreathingPattern> = {
  calm: 'relaxing',
  energize: 'energizing',
  presence: 'box',
  sleep: 'sleep',
};

let overlay: HTMLElement | null = null;
let guide: BreathingGuide | null = null;

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.ferni-breathing-modal').forEach((el) => el.remove());
}

export function mapBreathingPayloadToPattern(payload: BreathingExercisePayload): BreathingPattern {
  const technique = payload.technique?.toLowerCase();
  if (technique && TECHNIQUE_TO_PATTERN[technique]) {
    return TECHNIQUE_TO_PATTERN[technique];
  }
  const purpose = payload.purpose?.toLowerCase();
  if (purpose && PURPOSE_TO_PATTERN[purpose]) {
    return PURPOSE_TO_PATTERN[purpose];
  }
  const pattern = payload.pattern;
  if (
    pattern === 'box' ||
    pattern === 'relaxing' ||
    pattern === 'energizing' ||
    pattern === 'sleep' ||
    pattern === 'focus'
  ) {
    return pattern;
  }
  return 'relaxing';
}

export function closeBreathingGuideModal(): void {
  if (!overlay) {
    cleanupOrphanedElements();
    return;
  }
  guide?.stop();
  guide = null;
  overlay.classList.remove('ferni-breathing-modal--visible');
  const closing = overlay;
  overlay = null;
  window.setTimeout(() => closing.remove(), DURATION.NORMAL);
}

export function openBreathingGuideModal(payload: BreathingExercisePayload = {}): void {
  cleanupOrphanedElements();
  const pattern = mapBreathingPayloadToPattern(payload);

  overlay = document.createElement('div');
  overlay.className = 'ferni-breathing-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'ferni-breathing-modal-title');

  const backdrop = document.createElement('div');
  backdrop.className = 'ferni-breathing-modal__backdrop';
  backdrop.addEventListener('click', closeBreathingGuideModal);

  const card = document.createElement('div');
  card.className = 'ferni-breathing-modal__card';

  const header = document.createElement('header');
  header.className = 'ferni-breathing-modal__header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = t('breathing.eyebrow', 'BREATHE');

  const title = document.createElement('h2');
  title.id = 'ferni-breathing-modal-title';
  title.className = 'title';
  title.textContent = t('breathing.title', 'Breathe with me');

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ferni-breathing-modal__close';
  closeBtn.setAttribute('aria-label', t('common.close', 'Close'));
  closeBtn.innerHTML = LUCIDE_CLOSE;
  closeBtn.addEventListener('click', closeBreathingGuideModal);

  header.append(eyebrow, title, closeBtn);

  const body = document.createElement('div');
  body.className = 'ferni-breathing-modal__body';

  card.append(header, body);
  overlay.append(backdrop, card);
  injectModalStyles();
  document.body.appendChild(overlay);

  guide = createBreathingGuide(body, {
    pattern,
    color: 'var(--persona-primary)',
    showInstructions: true,
    showTimer: true,
  });
  guide.start();

  requestAnimationFrame(() => overlay?.classList.add('ferni-breathing-modal--visible'));
  log.info('Opened breathing guide', { pattern, technique: payload.technique });
}

function injectModalStyles(): void {
  if (document.getElementById('ferni-breathing-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'ferni-breathing-modal-styles';
  style.textContent = `
    .ferni-breathing-modal {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-modal, 1000);
      opacity: 0;
      transition: opacity var(--duration-normal, ${DURATION.NORMAL}ms) ${EASING.STANDARD};
    }
    .ferni-breathing-modal--visible { opacity: 1; }
    .ferni-breathing-modal__backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-overlay, var(--color-overlay));
      backdrop-filter: blur(var(--glass-blur-heavy));
    }
    .ferni-breathing-modal__card {
      position: relative;
      background: var(--color-background-elevated);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-2xl);
      padding: var(--space-8);
      max-width: min(28rem, calc(100vw - var(--space-8)));
      width: 100%;
      transform: scale(0.94);
      transition: transform var(--duration-normal, ${DURATION.NORMAL}ms) ${EASING.SPRING};
    }
    .ferni-breathing-modal--visible .ferni-breathing-modal__card { transform: scale(1); }
    .ferni-breathing-modal__header { position: relative; text-align: center; margin-bottom: var(--space-6); }
    .ferni-breathing-modal__header .eyebrow {
      margin: 0;
      font-size: var(--text-xs);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .ferni-breathing-modal__header .title {
      margin: var(--space-2) 0 0;
      font-family: var(--font-display);
      color: var(--color-text-primary);
    }
    .ferni-breathing-modal__close {
      position: absolute;
      top: 0;
      right: 0;
      background: transparent;
      border: none;
      color: var(--color-text-secondary);
      cursor: pointer;
      padding: var(--space-2);
    }
    .ferni-breathing-modal__body { display: flex; justify-content: center; }
    @media (prefers-reduced-motion: reduce) {
      .ferni-breathing-modal, .ferni-breathing-modal__card { transition: none; }
    }
  `;
  document.head.appendChild(style);
}
