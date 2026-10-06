/**
 * Voice Re-enrollment Card
 *
 * Voice prints made before the neural speaker model can't verify anyone any
 * more (the server refuses them). When the server says a fresh enrollment
 * would fix that (`needsReenrollment` on GET /api/voice/profile), this card
 * offers it once, warmly: no security language, no claim the old print ever
 * worked. "Sure" runs the existing enrollment flow; "Not now" or the close
 * button is remembered on this device, so the card does not come back.
 *
 * @module VoiceReenrollCard
 */

import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import type { VoiceProfile } from '../services/voice-auth.service.js';
import { appState } from '../state/app.state.js';

const log = createLogger('VoiceReenrollCard');

/** localStorage key remembering that the offer was answered on this device. */
export const VOICE_REENROLL_ANSWERED_KEY = 'ferni_voice_reenroll_answered';

const CARD_CLASS = 'voice-reenroll-card';
const STYLE_ID = 'voice-reenroll-card-styles';

function wasAnswered(): boolean {
  try {
    return localStorage.getItem(VOICE_REENROLL_ANSWERED_KEY) !== null;
  } catch (error) {
    log.warn('Could not read the re-enrollment answer:', error);
    return false;
  }
}

function rememberAnswer(answer: 'accepted' | 'dismissed'): void {
  try {
    localStorage.setItem(VOICE_REENROLL_ANSWERED_KEY, answer);
  } catch (error) {
    log.warn('Could not remember the re-enrollment answer:', error);
  }
}

/** True when the server asked for re-enrollment and this device hasn't answered yet. */
export function shouldOfferVoiceReenroll(profile: VoiceProfile): boolean {
  return profile.enrolled && profile.needsReenrollment === true && !wasAnswered();
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${CARD_CLASS} {
      position: fixed;
      bottom: var(--ma-silence);
      left: 50%;
      transform: translateX(-50%);
      z-index: var(--z-notification);
      width: calc(100% - var(--ma-silence) * 2);
      max-width: min(380px, 100%);
      padding: var(--ma-rest);
      background: var(--color-background-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-2xl);
      font-family: var(--font-body);
    }
    .${CARD_CLASS}__close {
      position: absolute;
      top: var(--ma-pause);
      right: var(--ma-pause);
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: var(--text-base);
    }
    .${CARD_CLASS}__title {
      margin: 0 0 var(--ma-breath);
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }
    .${CARD_CLASS}__body {
      margin: 0 0 var(--ma-pause);
      font-size: var(--text-sm);
      line-height: var(--leading-relaxed);
      color: var(--color-text-secondary);
    }
    .${CARD_CLASS}__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ma-pause);
    }
    .${CARD_CLASS}__btn {
      padding: var(--ma-breath) var(--ma-pause);
      border-radius: var(--radius-full);
      border: 1px solid var(--color-border-subtle);
      background: var(--color-background-secondary);
      color: var(--color-text-primary);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
    }
    .${CARD_CLASS}__btn:focus-visible,
    .${CARD_CLASS}__close:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }
    .${CARD_CLASS}__btn--primary {
      background: var(--color-accent-primary);
      border-color: var(--color-accent-primary);
      color: var(--color-text-inverse);
    }
  `;
  document.head.appendChild(style);
}

export function hideVoiceReenrollCard(): void {
  document.querySelectorAll(`.${CARD_CLASS}`).forEach((el) => el.remove());
}

/**
 * Show the card. `startEnrollment` runs the existing enrollment flow when the
 * person says yes. Returns the card element.
 */
export function showVoiceReenrollCard(startEnrollment: () => void): HTMLElement {
  hideVoiceReenrollCard();
  injectStyles();

  const card = document.createElement('div');
  card.className = CARD_CLASS;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'voice-reenroll-title');
  card.innerHTML = `
    <button type="button" class="${CARD_CLASS}__close" data-action="dismiss" aria-label="${t('common.close')}">&times;</button>
    <h3 class="${CARD_CLASS}__title" id="voice-reenroll-title">${t('voiceId.reenrollTitle')}</h3>
    <p class="${CARD_CLASS}__body">${t('voiceId.reenrollBody')}</p>
    <div class="${CARD_CLASS}__actions">
      <button type="button" class="${CARD_CLASS}__btn" data-action="dismiss">${t('voiceId.reenrollLater')}</button>
      <button type="button" class="${CARD_CLASS}__btn ${CARD_CLASS}__btn--primary" data-action="accept">${t('voiceId.reenrollAccept')}</button>
    </div>
  `;

  card.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset
      .action;
    if (action === 'accept') {
      rememberAnswer('accepted');
      hideVoiceReenrollCard();
      startEnrollment();
    } else if (action === 'dismiss') {
      rememberAnswer('dismissed');
      hideVoiceReenrollCard();
    }
  });

  document.body.appendChild(card);
  return card;
}

/**
 * Offer re-enrollment for this profile if it's due and no call is under way
 * (never interrupt a conversation). Returns true when the card was shown.
 */
export function offerVoiceReenroll(profile: VoiceProfile, startEnrollment: () => void): boolean {
  if (!shouldOfferVoiceReenroll(profile)) return false;
  if (appState.get('connection') !== 'disconnected') return false;
  showVoiceReenrollCard(startEnrollment);
  return true;
}
