/**
 * Value Capture Celebration UI
 *
 * When Ferni detects that a user achieved something meaningful (raise, savings,
 * habit milestone, career win, etc.), this modal celebrates their success and
 * offers the opportunity to share a portion of that value.
 *
 * Design principles:
 * - Celebrate FIRST, ask second (or not at all)
 * - Never guilt-inducing - pure joy for their achievement
 * - If they contribute, celebrate THEIR generosity
 * - Beautiful confetti and animations
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { contributeValue, formatAmount, loadStripe } from '../services/monetization.service.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { toast } from './toast.ui.js';

const log = createLogger('ValueCaptureUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface ValueEvent {
  id: string;
  type: string;
  description?: string;
  estimatedValueCents?: number;
  suggestedContributionCents?: number;
}

type ValueType =
  | 'financial_gain'
  | 'financial_save'
  | 'habit_milestone'
  | 'career_win'
  | 'relationship_improvement'
  | 'health_improvement'
  | 'productivity_gain'
  | 'clarity_moment'
  | 'emotional_breakthrough';

// ============================================================================
// CONSTANTS
// ============================================================================

// Brand-compliant celebration icons (Lucide SVG)
const CELEBRATION_ICONS: Record<ValueType, string> = {
  financial_gain: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>`,
  financial_save: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/></svg>`,
  habit_milestone: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  career_win: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  relationship_improvement: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  health_improvement: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  productivity_gain: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  clarity_moment: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  emotional_breakthrough: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>`,
};

const VALUE_CELEBRATIONS: Record<ValueType, { title: string; message: string }> = {
  financial_gain: {
    title: 'You Did It!',
    message: "That's real money in your pocket. You earned every cent.",
  },
  financial_save: {
    title: 'Smart Move!',
    message: "That's money staying where it belongs - with you.",
  },
  habit_milestone: {
    title: "That's Discipline!",
    message: "This isn't luck. This is who you're becoming.",
  },
  career_win: {
    title: 'Congratulations!',
    message: "All that work paid off. You showed them what you're made of.",
  },
  relationship_improvement: {
    title: 'Beautiful',
    message: 'Real connection. Real growth. That matters.',
  },
  health_improvement: {
    title: 'Look at You!',
    message: "Your body is thanking you. That's quality of life.",
  },
  productivity_gain: {
    title: 'Crushing It!',
    message: 'Time well spent. Look what you accomplished.',
  },
  clarity_moment: {
    title: 'Breakthrough!',
    message: 'Sometimes the right question changes everything.',
  },
  emotional_breakthrough: {
    title: 'So Proud of You',
    message: 'That took courage. Real courage.',
  },
};

// ============================================================================
// STATE
// ============================================================================

let isOpen = false;
let container: HTMLElement | null = null;
let currentUserId: string | null = null;
let currentEvent: ValueEvent | null = null;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.value-capture-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-tooltip);
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
}

.value-capture-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.value-capture-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
}

.value-capture-card {
  position: relative;
  background: var(--color-bg-elevated, #FFFDFB);
  border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
  border-radius: var(--radius-xl, 20px);
  padding: var(--space-8, 32px);
  max-width: clamp(294px, 90vw, 420px);
  width: calc(100% - 32px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  transform: scale(0.9);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
  overflow: hidden;
}

.value-capture-overlay.open .value-capture-card {
  transform: scale(1);
}

.value-capture-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  color: var(--color-text-muted);
  transition: background ${DURATION.FAST}ms;
  z-index: var(--z-docked);
}

.value-capture-close:hover {
  background: rgba(0, 0, 0, 0.05);
}

/* Confetti Background */
.value-capture-confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.confetti-piece {
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--persona-primary, #4a6741);
  opacity: 0;
  animation: confetti-fall 3s ease-out forwards;
}

@keyframes confetti-fall {
  0% {
    opacity: 1;
    transform: translateY(-100px) rotate(0deg);
  }
  100% {
    opacity: 0;
    transform: translateY(400px) rotate(720deg);
  }
}

/* Header */
.value-capture-header {
  text-align: center;
  margin-bottom: var(--space-6, 24px);
  position: relative;
}

.value-capture-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-3, 12px);
  color: var(--persona-primary, #4a6741);
  animation: value-bounce 0.8s ${EASING.SPRING};
}

@keyframes value-bounce {
  0% { transform: scale(0) rotate(-10deg); }
  50% { transform: scale(1.2) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); }
}

.value-capture-title {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
  animation: value-slide-up 0.5s ${EASING.SPRING} 0.2s backwards;
}

@keyframes value-slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.value-capture-message {
  font-size: 1rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.5;
  animation: value-slide-up 0.5s ${EASING.SPRING} 0.3s backwards;
}

/* Value Display */
.value-capture-value-display {
  text-align: center;
  padding: var(--space-5, 20px);
  background: linear-gradient(135deg, rgba(74, 103, 65, 0.1), rgba(74, 103, 65, 0.05));
  border-radius: var(--radius-xl, 16px);
  margin-bottom: var(--space-5, 20px);
  animation: value-slide-up 0.5s ${EASING.SPRING} 0.4s backwards;
}

.value-capture-value-amount {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--persona-primary, #4a6741);
  font-family: var(--font-display);
}

.value-capture-value-label {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin-top: 4px;
}

/* Contribution Section */
.value-capture-contribution {
  animation: value-slide-up 0.5s ${EASING.SPRING} 0.5s backwards;
}

.value-capture-contribution-intro {
  text-align: center;
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-4, 16px);
  line-height: 1.5;
}

.value-capture-amounts {
  display: flex;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-4, 16px);
}

.value-capture-amount-btn {
  flex: 1;
  padding: var(--space-3, 12px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.value-capture-amount-btn:hover {
  border-color: var(--persona-primary, #4a6741);
  background: rgba(74, 103, 65, 0.05);
}

.value-capture-amount-btn.selected {
  border-color: var(--persona-primary, #4a6741);
  background: var(--persona-primary, #4a6741);
  color: white;
}

.value-capture-amount-btn.suggested {
  border-color: var(--persona-primary, #4a6741);
  position: relative;
}

.value-capture-amount-btn.suggested::after {
  content: 'suggested';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--persona-primary, #4a6741);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
}

.value-capture-custom-input {
  width: 100%;
  padding: var(--space-3, 12px);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  font-size: 1rem;
  text-align: center;
  margin-bottom: var(--space-4, 16px);
}

.value-capture-custom-input:focus {
  outline: none;
  border-color: var(--persona-primary, #4a6741);
}

.value-capture-submit-btn {
  width: 100%;
  padding: var(--space-4, 16px);
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
  border-radius: var(--radius-lg, 12px);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.value-capture-submit-btn:hover:not(:disabled) {
  background: var(--persona-secondary, #3d5a35);
  transform: translateY(-1px);
}

.value-capture-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.value-capture-skip-btn {
  display: block;
  width: 100%;
  text-align: center;
  padding: var(--space-3, 12px);
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  cursor: pointer;
  margin-top: var(--space-2, 8px);
}

.value-capture-skip-btn:hover {
  color: var(--color-text-secondary);
  text-decoration: underline;
}

.value-capture-footer {
  text-align: center;
  margin-top: var(--space-4, 16px);
  font-size: 0.8rem;
  color: var(--color-text-muted);
  line-height: 1.4;
}

/* Thank You State */
.value-capture-thank-you {
  text-align: center;
  padding: var(--space-6, 24px) 0;
}

.value-capture-thank-you-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto var(--space-4, 16px);
  color: var(--persona-primary, #4a6741);
  animation: value-bounce 0.8s ${EASING.SPRING};
}

.value-capture-thank-you-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 12px 0;
}

.value-capture-thank-you-message {
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* Loading State */
.value-capture-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-8, 32px) 0;
}

.value-capture-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--color-border);
  border-top-color: var(--persona-primary, #4a6741);
  border-radius: 50%;
  animation: value-spin 1s linear infinite;
  margin-bottom: var(--space-4, 16px);
}

@keyframes value-spin {
  to { transform: rotate(360deg); }
}
`;

// ============================================================================
// ICONS
// ============================================================================

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

// ============================================================================
// COMPONENT
// ============================================================================

function initStyles(): void {
  if (document.getElementById('value-capture-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'value-capture-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

function createConfetti(): string {
  const colors = ['#4a6741', '#3d5a35', '#6b8e23', '#87ae73', '#c4856a', '#f4a460'];
  const pieces: string[] = [];

  for (let i = 0; i < 50; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.5;
    const size = 5 + Math.random() * 10;
    const rotation = Math.random() * 360;

    pieces.push(`
      <div class="confetti-piece" style="
        left: ${left}%;
        background: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        animation-delay: ${delay}s;
        transform: rotate(${rotation}deg);
      "></div>
    `);
  }

  return pieces.join('');
}

function createModal(event: ValueEvent): HTMLElement {
  initStyles();

  // Clean up any existing modals
  document.querySelectorAll('.value-capture-overlay').forEach((el) => el.remove());

  const celebration =
    VALUE_CELEBRATIONS[event.type as ValueType] || VALUE_CELEBRATIONS.clarity_moment;

  const overlay = document.createElement('div');
  overlay.className = 'value-capture-overlay';
  overlay.innerHTML = `
    <div class="value-capture-backdrop"></div>
    <div class="value-capture-card" role="dialog" aria-labelledby="value-capture-title">
      <div class="value-capture-confetti">${createConfetti()}</div>
      <button class="value-capture-close" aria-label="${t('common.close')}">${CLOSE_ICON}</button>
      <div class="value-capture-content">
        ${renderCelebration(event, celebration)}
      </div>
    </div>
  `;

  // Event listeners
  overlay.querySelector('.value-capture-backdrop')?.addEventListener('click', close);
  overlay.querySelector('.value-capture-close')?.addEventListener('click', close);
  overlay
    .querySelector('.value-capture-card')
    ?.addEventListener('click', (e) => e.stopPropagation());

  document.body.appendChild(overlay);

  return overlay;
}

function renderCelebration(
  event: ValueEvent,
  celebration: { title: string; message: string }
): string {
  const hasValue = event.estimatedValueCents && event.estimatedValueCents > 0;
  const suggested = event.suggestedContributionCents || 0;
  const icon = CELEBRATION_ICONS[event.type as ValueType] || CELEBRATION_ICONS.clarity_moment;

  // Calculate suggested amounts
  const amounts = hasValue
    ? [
        Math.max(100, Math.round(suggested * 0.5)),
        suggested || 500,
        Math.round((suggested || 500) * 2),
      ]
    : [300, 500, 1000];

  return `
    <div class="value-capture-header">
      <div class="value-capture-icon">${icon}</div>
      <h2 class="value-capture-title" id="value-capture-title">${celebration.title}</h2>
      <p class="value-capture-message">${celebration.message}</p>
    </div>

    ${
      hasValue
        ? `
      <div class="value-capture-value-display">
        <div class="value-capture-value-amount">${formatAmount(event.estimatedValueCents!)}</div>
        <div class="value-capture-value-label">Your achievement</div>
      </div>
    `
        : ''
    }

    <div class="value-capture-contribution">
      <p class="value-capture-contribution-intro">
        If I played any part in this, you can share what it's worth.
        <br>No pressure at all.
      </p>

      <div class="value-capture-amounts">
        ${amounts
          .map(
            (amount, i) => `
          <button 
            class="value-capture-amount-btn ${i === 1 && suggested ? 'suggested' : ''}" 
            data-amount="${amount}"
          >
            ${formatAmount(amount)}
          </button>
        `
          )
          .join('')}
      </div>

      <input
        type="text"
        class="value-capture-custom-input"
        placeholder="${t('placeholders.customAmount')}"
        inputmode="decimal"
      />

      <button aria-label="${t('accessibility.share')}" class="value-capture-submit-btn" disabled>
        Share the Win
      </button>

      <button aria-label="${t('accessibility.justCelebrateThisMoment')}" class="value-capture-skip-btn">
        Just celebrate this moment
      </button>

      <p class="value-capture-footer">
        Your contribution helps keep Ferni free for everyone.
        The real reward is watching you grow.
      </p>
    </div>
  `;
}

function renderLoading(): string {
  return `
    <div class="value-capture-loading">
      <div class="value-capture-spinner"></div>
      <p>Processing your contribution...</p>
    </div>
  `;
}

// Lucide heart-handshake icon for thank you
const THANK_YOU_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 6c0-1.5-1-2-1-2s-1 .5-1 2c0 1.5 1 2 1 2s1-.5 1-2Z"/><path d="M7 6c0-1.5-1-2-1-2s-1 .5-1 2c0 1.5 1 2 1 2s1-.5 1-2Z"/><path d="m19.5 8-1.8-1.8a6.3 6.3 0 0 0-8.9 0L7 8"/><path d="M12 20v-4l-2-2-6 6h16l-6-6-2 2"/><path d="M6 14l4 4"/><path d="m14 14 4 4"/></svg>`;

function renderThankYou(message?: string): string {
  return `
    <div class="value-capture-thank-you">
      <div class="value-capture-confetti">${createConfetti()}</div>
      <div class="value-capture-thank-you-icon">${THANK_YOU_ICON}</div>
      <h2 class="value-capture-thank-you-title">You're Incredible</h2>
      <p class="value-capture-thank-you-message">
        ${message || "You're sharing your win with me. That's incredibly generous. Thank you - and congratulations again. Your success creates more success."}
      </p>
    </div>
  `;
}

function setupFormListeners(): void {
  if (!container) return;

  const buttons = container.querySelectorAll('.value-capture-amount-btn');
  const customInput = container.querySelector('.value-capture-custom-input') as HTMLInputElement;
  const submitBtn = container.querySelector('.value-capture-submit-btn') as HTMLButtonElement;
  const skipBtn = container.querySelector('.value-capture-skip-btn');

  let selectedAmount = 0;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedAmount = parseInt(btn.getAttribute('data-amount') || '0', 10);
      customInput.value = '';
      submitBtn.disabled = false;
    });
  });

  customInput.addEventListener('input', () => {
    buttons.forEach((b) => b.classList.remove('selected'));
    const value = customInput.value.replace(/[^0-9.]/g, '');
    const cents = Math.round(parseFloat(value) * 100) || 0;
    selectedAmount = cents;
    submitBtn.disabled = cents < 100;
  });

  submitBtn.addEventListener('click', async () => {
    if (selectedAmount < 100 || !currentUserId || !currentEvent) return;
    await processContribution(selectedAmount);
  });

  skipBtn?.addEventListener('click', () => {
    // Just close - they're celebrating without contributing
    showCelebrationOnly();
  });
}

// Lucide party-popper icon for celebration
const CELEBRATION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>`;

function showCelebrationOnly(): void {
  if (!container) return;

  const content = container.querySelector('.value-capture-content');
  if (content) {
    content.innerHTML = `
      <div class="value-capture-thank-you">
        <div class="value-capture-thank-you-icon">${CELEBRATION_ICON}</div>
        <h2 class="value-capture-thank-you-title">Keep Crushing It</h2>
        <p class="value-capture-thank-you-message">
          This is your moment. Enjoy it fully.
          I'm so proud of you.
        </p>
      </div>
    `;
  }

  // Auto-close after 4 seconds
  trackedTimeout(close, 4000);
}

async function processContribution(amountCents: number): Promise<void> {
  if (!container || !currentUserId || !currentEvent) return;

  const content = container.querySelector('.value-capture-content');
  if (content) {
    content.innerHTML = renderLoading();
  }

  try {
    const result = await contributeValue({
      userId: currentUserId,
      eventId: currentEvent.id,
      amountCents,
    });

    // Load Stripe and process payment
    const stripe = await loadStripe();
    if (!stripe) {
      throw new Error('Stripe not available');
    }

    // @ts-expect-error - Stripe types
    const { error } = await stripe.confirmPayment({
      clientSecret: result.clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/value/complete`,
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Value contribution failed');

    // Show error and allow retry
    if (content && currentEvent) {
      const celebration =
        VALUE_CELEBRATIONS[currentEvent.type as ValueType] || VALUE_CELEBRATIONS.clarity_moment;
      content.innerHTML = renderCelebration(currentEvent, celebration);
      setupFormListeners();
    }

    toast.error("Payment didn't go through. Try again?");
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the value capture celebration modal
 */
export function open(userId: string, event: ValueEvent): void {
  if (isOpen) return;

  currentUserId = userId;
  currentEvent = event;
  container = createModal(event);

  // Trigger open animation
  requestAnimationFrame(() => {
    container?.classList.add('open');
    isOpen = true;
    setupFormListeners();
  });

  log.debug({ userId, eventType: event.type }, 'Value capture opened');
}

/**
 * Close the modal
 */
export function close(): void {
  if (!isOpen || !container) return;

  container.classList.remove('open');
  isOpen = false;

  trackedTimeout(() => {
    container?.remove();
    container = null;
    currentEvent = null;
  }, DURATION.MODERATE);

  log.debug('Value capture closed');
}

/**
 * Show thank you after successful contribution
 */
export function showThankYou(message?: string): void {
  if (!container) return;

  const content = container.querySelector('.value-capture-content');
  if (content) {
    content.innerHTML = renderThankYou(message);
  }

  // Auto-close after 5 seconds
  trackedTimeout(close, 5000);
}

/**
 * Check if modal is open
 */
export function isModalOpen(): boolean {
  return isOpen;
}

/**
 * Celebrate without asking for contribution
 * Use this for emotional breakthroughs where asking feels wrong
 */
export function celebrateOnly(userId: string, event: ValueEvent): void {
  if (isOpen) return;

  currentUserId = userId;
  currentEvent = event;

  const celebration =
    VALUE_CELEBRATIONS[event.type as ValueType] || VALUE_CELEBRATIONS.clarity_moment;
  const icon = CELEBRATION_ICONS[event.type as ValueType] || CELEBRATION_ICONS.clarity_moment;

  initStyles();
  document.querySelectorAll('.value-capture-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'value-capture-overlay';
  overlay.innerHTML = `
    <div class="value-capture-backdrop"></div>
    <div class="value-capture-card" role="dialog">
      <div class="value-capture-confetti">${createConfetti()}</div>
      <button class="value-capture-close" aria-label="${t('common.close')}">${CLOSE_ICON}</button>
      <div class="value-capture-content">
        <div class="value-capture-header">
          <div class="value-capture-icon">${icon}</div>
          <h2 class="value-capture-title">${celebration.title}</h2>
          <p class="value-capture-message">${celebration.message}</p>
        </div>
        <p style="text-align: center; color: var(--color-text-secondary); margin-top: var(--space-4, 16px);">
          I'm so proud of you.
        </p>
      </div>
    </div>
  `;

  overlay.querySelector('.value-capture-backdrop')?.addEventListener('click', close);
  overlay.querySelector('.value-capture-close')?.addEventListener('click', close);

  document.body.appendChild(overlay);
  container = overlay;

  requestAnimationFrame(() => {
    container?.classList.add('open');
    isOpen = true;
  });

  // Auto-close after 5 seconds
  trackedTimeout(close, 5000);

  log.debug({ userId, eventType: event.type }, 'Celebration only shown');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const valueCaptureUI = {
  open,
  close,
  isOpen: isModalOpen,
  showThankYou,
  celebrateOnly,
};

export default valueCaptureUI;
