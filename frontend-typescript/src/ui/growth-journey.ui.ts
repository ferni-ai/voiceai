/**
 * Growth Journey UI Component
 *
 * Celebrates the user's journey with Ferni over time.
 * Not about "earning" or "leveling up" - just about marking
 * the beautiful moments we've shared.
 *
 * Design principles:
 * - Warm, personal, celebratory
 * - Focus on the relationship, not metrics
 * - Gifts feel like surprises, not grinding rewards
 * - "As we grow together, I want to celebrate with you"
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import {
  celebrateMilestone,
  getAllMilestonesWithStatus,
  getCompanionPrice,
  getCurrentSeason,
  getDaysRemaining,
  getProgress,
  isCompanion,
  isSeasonActive,
  onProgressChange,
  type JourneyMilestone,
  type JourneyProgress,
  type Season,
} from '../services/growth-journey.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('GrowthJourneyUI');

// ============================================================================
// STATE
// ============================================================================

let isOpen = false;
let container: HTMLElement | null = null;
let progressUnsubscribe: (() => void) | null = null;

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.journey-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
}

.journey-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.journey-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.4);
  backdrop-filter: blur(20px);
}

.journey-card {
  position: relative;
  background: var(--color-background-elevated, #FFFDFB);
  border-radius: var(--radius-2xl, 24px);
  width: calc(100% - 32px);
  max-width: 560px;
  max-height: 90vh;
  box-shadow: var(--shadow-2xl);
  transform: scale(0.95);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.journey-overlay.open .journey-card {
  transform: scale(1);
}

/* Header */
.journey-header {
  padding: var(--space-6, 24px);
  text-align: center;
  border-bottom: 1px solid var(--color-border);
  position: relative;
}

.journey-close {
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
}

.journey-close:hover {
  background: rgba(0, 0, 0, 0.05);
}

.journey-eyebrow {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-2, 8px);
}

.journey-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.journey-subtitle {
  font-size: 0.95rem;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Stats - warm, not metric-y */
.journey-stats {
  display: flex;
  justify-content: center;
  gap: var(--space-6, 24px);
  margin-top: var(--space-5, 20px);
  padding-top: var(--space-4, 16px);
  border-top: 1px solid var(--color-border);
}

.journey-stat {
  text-align: center;
}

.journey-stat-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--persona-primary, #4a6741);
}

.journey-stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: 2px;
}

/* Content */
.journey-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5, 20px);
}

.journey-section {
  margin-bottom: var(--space-6, 24px);
}

.journey-section:last-child {
  margin-bottom: 0;
}

.journey-section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-3, 12px) 0;
}

/* Milestones */
.journey-milestones {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.journey-milestone {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  background: white;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
}

.journey-milestone.ready {
  border-color: var(--persona-primary, #4a6741);
  cursor: pointer;
  background: linear-gradient(135deg, rgba(74, 103, 65, 0.03), transparent);
}

.journey-milestone.ready:hover {
  transform: translateX(4px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.journey-milestone.celebrated {
  opacity: 0.6;
}

.journey-milestone.upcoming {
  opacity: 0.5;
}

.journey-milestone-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.journey-milestone.ready .journey-milestone-icon {
  background: var(--persona-primary, #4a6741);
  color: white;
}

.journey-milestone.celebrated .journey-milestone-icon {
  background: var(--color-text-muted);
  color: white;
}

.journey-milestone-content {
  flex: 1;
  min-width: 0;
}

.journey-milestone-title {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0 0 4px 0;
}

.journey-milestone-message {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin: 0;
  line-height: 1.4;
}

.journey-milestone-status {
  font-size: 0.75rem;
  color: var(--persona-primary, #4a6741);
  margin-top: var(--space-2, 8px);
  font-weight: 500;
}

.journey-milestone.celebrated .journey-milestone-status {
  color: var(--color-text-muted);
}

/* No Active Season */
.journey-inactive {
  text-align: center;
  padding: var(--space-8, 32px);
}

.journey-inactive-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
}

.journey-inactive-message {
  color: var(--color-text-muted);
  margin: 0;
}

/* Supporter Banner */
.journey-supporter-banner {
  padding: var(--space-4, 16px) var(--space-5, 20px);
  background: linear-gradient(135deg, rgba(74, 103, 65, 0.08), transparent);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.journey-supporter-text {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.journey-supporter-text strong {
  color: var(--persona-primary, #4a6741);
}

.journey-supporter-btn {
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--persona-primary, #4a6741);
  color: white;
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all ${DURATION.FAST}ms;
}

.journey-supporter-btn:hover {
  background: var(--persona-secondary, #3d5a35);
}

.journey-supporter-active {
  font-size: 0.85rem;
  color: var(--persona-primary, #4a6741);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Responsive */
@media (max-width: 480px) {
  .journey-stats {
    gap: var(--space-4, 16px);
  }
  
  .journey-stat-value {
    font-size: 1.25rem;
  }
}
`;

// ============================================================================
// ICONS
// ============================================================================

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

const GIFT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>`;

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

const HEART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

// ============================================================================
// COMPONENT
// ============================================================================

function initStyles(): void {
  if (document.getElementById('journey-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'journey-styles';
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

function getMilestoneIcon(type: string): string {
  const icons: Record<string, string> = {
    theme: '◐',
    soundscape: '♪',
    'avatar-style': '◯',
    badge: '★',
    title: '❧',
  };
  return icons[type] || '•';
}

function createModal(): HTMLElement {
  initStyles();

  document.querySelectorAll('.journey-overlay').forEach((el) => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'journey-overlay';

  if (!isSeasonActive()) {
    overlay.innerHTML = `
      <div class="journey-backdrop"></div>
      <div class="journey-card">
        <div class="journey-header">
          <button class="journey-close">${CLOSE_ICON}</button>
          <p class="journey-eyebrow">Your Journey</p>
          <h2 class="journey-title">Between Seasons</h2>
        </div>
        <div class="journey-inactive">
          <p class="journey-inactive-message">
            The next season is coming soon. In the meantime, I'm still here whenever you need me.
          </p>
        </div>
      </div>
    `;

    overlay.querySelector('.journey-backdrop')?.addEventListener('click', close);
    overlay.querySelector('.journey-close')?.addEventListener('click', close);
    document.body.appendChild(overlay);
    return overlay;
  }

  const season = getCurrentSeason();
  const progress = getProgress();

  overlay.innerHTML = `
    <div class="journey-backdrop"></div>
    <div class="journey-card">
      ${renderHeader(season, progress)}
      <div class="journey-content">
        ${renderMilestones()}
      </div>
      ${renderSupporterBanner()}
    </div>
  `;

  overlay.querySelector('.journey-backdrop')?.addEventListener('click', close);
  overlay.querySelector('.journey-close')?.addEventListener('click', close);

  setupEventListeners(overlay);

  document.body.appendChild(overlay);
  return overlay;
}

function renderHeader(season: Season, progress: JourneyProgress): string {
  const daysLeft = getDaysRemaining();

  return `
    <div class="journey-header">
      <button class="journey-close">${CLOSE_ICON}</button>
      <p class="journey-eyebrow">${season.name}</p>
      <h2 class="journey-title">Your Journey</h2>
      <p class="journey-subtitle">${season.description}</p>
      
      <div class="journey-stats">
        <div class="journey-stat">
          <div class="journey-stat-value">${progress.conversationCount}</div>
          <div class="journey-stat-label">Conversations</div>
        </div>
        <div class="journey-stat">
          <div class="journey-stat-value">${progress.weeksTogetherCount}</div>
          <div class="journey-stat-label">Weeks Together</div>
        </div>
        <div class="journey-stat">
          <div class="journey-stat-value">${daysLeft}</div>
          <div class="journey-stat-label">Days Left</div>
        </div>
      </div>
    </div>
  `;
}

function renderMilestones(): string {
  const milestones = getAllMilestonesWithStatus();

  // Group by status
  const ready = milestones.filter((m) => m.status === 'ready');
  const upcoming = milestones.filter((m) => m.status === 'upcoming');
  const celebrated = milestones.filter((m) => m.status === 'celebrated');

  let html = '';

  if (ready.length > 0) {
    html += `
      <div class="journey-section">
        <h3 class="journey-section-title">Ready to Celebrate</h3>
        <div class="journey-milestones">
          ${ready.map((m) => renderMilestoneCard(m, 'ready')).join('')}
        </div>
      </div>
    `;
  }

  if (upcoming.length > 0) {
    html += `
      <div class="journey-section">
        <h3 class="journey-section-title">Coming Up</h3>
        <div class="journey-milestones">
          ${upcoming
            .slice(0, 5)
            .map((m) => renderMilestoneCard(m, 'upcoming'))
            .join('')}
        </div>
      </div>
    `;
  }

  if (celebrated.length > 0) {
    html += `
      <div class="journey-section">
        <h3 class="journey-section-title">Celebrated</h3>
        <div class="journey-milestones">
          ${celebrated.map((m) => renderMilestoneCard(m, 'celebrated')).join('')}
        </div>
      </div>
    `;
  }

  if (html === '') {
    html = `
      <div class="journey-section">
        <p style="text-align: center; color: var(--color-text-muted);">
          Keep talking. Good things are coming.
        </p>
      </div>
    `;
  }

  return html;
}

function renderMilestoneCard(
  milestone: JourneyMilestone,
  status: 'ready' | 'upcoming' | 'celebrated'
): string {
  const statusText =
    status === 'ready'
      ? 'Tap to receive your gift'
      : status === 'celebrated'
        ? 'Received'
        : getRequirementText(milestone);

  return `
    <div class="journey-milestone ${status}" data-milestone-id="${milestone.id}">
      <div class="journey-milestone-icon">
        ${status === 'celebrated' ? CHECK_ICON : getMilestoneIcon(milestone.type)}
      </div>
      <div class="journey-milestone-content">
        <h4 class="journey-milestone-title">${milestone.title}</h4>
        <p class="journey-milestone-message">${milestone.message}</p>
        <p class="journey-milestone-status">${statusText}</p>
      </div>
    </div>
  `;
}

function getRequirementText(milestone: JourneyMilestone): string {
  const { type, value } = milestone.requirement;
  switch (type) {
    case 'conversations':
      return `After ${value} conversation${value === 1 ? '' : 's'}`;
    case 'weeks-together':
      return `After ${value} week${value === 1 ? '' : 's'} together`;
    case 'goals-achieved':
      return `After ${value} goal${value === 1 ? '' : 's'} achieved`;
    default:
      return '';
  }
}

function renderSupporterBanner(): string {
  if (isCompanion()) {
    return `
      <div class="journey-supporter-banner">
        <span class="journey-supporter-active">
          ${HEART_ICON} Supporting Ferni
        </span>
      </div>
    `;
  }

  const price = getCompanionPrice();
  if (price === 0) return '';

  return `
    <div class="journey-supporter-banner">
      <span class="journey-supporter-text">
        <strong>Want to support Ferni?</strong> It means the world.
      </span>
      <button class="journey-supporter-btn" id="become-companion-btn">
        Support ($${(price / 100).toFixed(2)})
      </button>
    </div>
  `;
}

function setupEventListeners(overlay: HTMLElement): void {
  // Ready milestones - click to celebrate
  overlay.querySelectorAll('.journey-milestone.ready').forEach((el) => {
    el.addEventListener('click', () => {
      const milestoneId = el.getAttribute('data-milestone-id');
      if (milestoneId) {
        const result = celebrateMilestone(milestoneId);
        if (result.success && result.milestone) {
          showCelebration(result.milestone);
          refreshUI();
        }
      }
    });
  });

  // Companion button
  overlay.querySelector('#become-companion-btn')?.addEventListener('click', async () => {
    // In production, this would go through payment flow
    showToast('Thank you for your support!', 'success');
    refreshUI();
  });

  // Subscribe to progress updates
  progressUnsubscribe = onProgressChange(() => {
    refreshUI();
  });
}

function showCelebration(milestone: JourneyMilestone): void {
  // Create a brief celebration overlay
  const celebration = document.createElement('div');
  celebration.innerHTML = `
    <div style="
      position: fixed;
      inset: 0;
      z-index: 10002;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.95);
      animation: celebrationFadeIn 0.3s ease-out;
    ">
      <div style="text-align: center; padding: 32px;">
        <div style="font-size: 48px; margin-bottom: 16px;">${GIFT_ICON}</div>
        <h2 style="margin: 0 0 8px; font-size: 1.5rem; color: var(--color-text-primary);">
          ${milestone.title}
        </h2>
        <p style="margin: 0; color: var(--color-text-secondary);">
          ${milestone.message}
        </p>
      </div>
    </div>
  `;

  // Add fade animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes celebrationFadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(celebration);

  // Auto-close after 2 seconds
  setTimeout(() => {
    celebration.remove();
    style.remove();
  }, 2000);
}

function refreshUI(): void {
  if (!container) return;

  const content = container.querySelector('.journey-content');
  if (content) {
    content.innerHTML = renderMilestones();

    // Re-attach event listeners
    container.querySelectorAll('.journey-milestone.ready').forEach((el) => {
      el.addEventListener('click', () => {
        const milestoneId = el.getAttribute('data-milestone-id');
        if (milestoneId) {
          const result = celebrateMilestone(milestoneId);
          if (result.success && result.milestone) {
            showCelebration(result.milestone);
            refreshUI();
          }
        }
      });
    });
  }
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#e74c3c' : 'var(--persona-primary, #4a6741)'};
    color: white;
    padding: 12px 24px;
    border-radius: 999px;
    z-index: 10003;
    font-size: 0.9rem;
    font-weight: 500;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Open the Growth Journey modal
 */
export function open(): void {
  if (isOpen) return;

  container = createModal();

  requestAnimationFrame(() => {
    container?.classList.add('open');
    isOpen = true;
  });

  log.debug('Growth Journey opened');
}

/**
 * Close the modal
 */
export function close(): void {
  if (!isOpen || !container) return;

  container.classList.remove('open');
  isOpen = false;

  if (progressUnsubscribe) {
    progressUnsubscribe();
    progressUnsubscribe = null;
  }

  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.MODERATE);

  log.debug('Growth Journey closed');
}

/**
 * Check if modal is open
 */
export function isModalOpen(): boolean {
  return isOpen;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const growthJourneyUI = {
  open,
  close,
  isOpen: isModalOpen,
};

export default growthJourneyUI;
