/**
 * Onboarding Progress UI
 *
 * Shows the user's progress through the 14-day onboarding journey.
 * Subtle, encouraging, and celebrates milestones along the way.
 *
 * DESIGN PRINCIPLES:
 * - Gentle presence (doesn't dominate the UI)
 * - Warm celebration of progress (not gamification)
 * - Disappears gracefully after Day 14
 * - Feels like a friend tracking your journey
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { toast } from './whisper.ui.js';
import { t } from '../i18n/index.js';

const log = createLogger('OnboardingProgressUI');

// ============================================================================
// TYPES
// ============================================================================

export interface OnboardingProgress {
  daysSinceSignup: number;
  milestonesReached: number;
  checkInsSent: number;
  engagementLevel: 'high' | 'medium' | 'low' | 'silent';
  arcComplete: boolean;
}

interface MilestoneInfo {
  day: number;
  title: string;
  description: string;
}

// ============================================================================
// MILESTONES
// ============================================================================

const MILESTONES: MilestoneInfo[] = [
  {
    day: 1,
    title: 'First Steps',
    description: "You're here! That takes courage.",
  },
  {
    day: 3,
    title: 'Getting Started',
    description: 'Three days of showing up for yourself.',
  },
  {
    day: 7,
    title: 'One Week',
    description: "A full week together. You're building something real.",
  },
  {
    day: 14,
    title: 'Two Weeks',
    description: "Two weeks of growth. I'm proud of you.",
  },
];

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.onboarding-progress-widget {
  position: fixed;
  bottom: var(--space-lg, 26px);
  left: var(--space-md, 16px);
  z-index: var(--z-floating, 20);
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-sm, 8px) var(--space-md, 16px);
  background: var(--color-bg-elevated, #FFFDFB);
  border-radius: var(--radius-full, 9999px);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING},
              box-shadow ${DURATION.NORMAL}ms ${EASING.STANDARD};
  opacity: 0;
  transform: translateY(20px);
}

.onboarding-progress-widget.visible {
  opacity: 1;
  transform: translateY(0);
}

.onboarding-progress-widget:hover {
  transform: scale(1.02);
  box-shadow: var(--shadow-lg);
}

.onboarding-progress-widget:focus-visible {
  outline: 2px solid var(--color-accent-primary, #3D5A45);
  outline-offset: 2px;
}

.onboarding-progress-ring {
  position: relative;
  width: 36px;
  height: 36px;
}

.onboarding-progress-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.onboarding-progress-ring-bg {
  fill: none;
  stroke: var(--color-border-subtle, #E8E2DD);
  stroke-width: 3;
}

.onboarding-progress-ring-fg {
  fill: none;
  stroke: var(--color-ferni, #4a6741);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset ${DURATION.SLOW}ms ${EASING.SPRING};
}

.onboarding-progress-day {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
}

.onboarding-progress-label {
  font-size: 13px;
  color: var(--color-text-secondary, #6B6560);
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.onboarding-progress-label strong {
  color: var(--color-text-primary, #2C2520);
  font-weight: 600;
}

/* Expanded view (modal) */
.onboarding-progress-modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 2100);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md, 16px);
  opacity: 0;
  pointer-events: none;
  transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
}

.onboarding-progress-modal.open {
  opacity: 1;
  pointer-events: auto;
}

.onboarding-progress-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
}

.onboarding-progress-card {
  position: relative;
  background: var(--color-bg-elevated, #FFFDFB);
  border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
  border-radius: var(--radius-xl, 20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  width: 100%;
  max-width: 380px;
  padding: var(--space-xl, 42px) var(--space-lg, 26px);
  transform: scale(0.95);
  transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
}

.onboarding-progress-modal.open .onboarding-progress-card {
  transform: scale(1);
}

.onboarding-progress-header {
  text-align: center;
  margin-bottom: var(--space-lg, 26px);
}

.onboarding-progress-header h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-xs, 4px) 0;
}

.onboarding-progress-header p {
  font-size: 14px;
  color: var(--color-text-secondary, #6B6560);
  margin: 0;
}

.onboarding-progress-ring-large {
  width: 120px;
  height: 120px;
  margin: 0 auto var(--space-lg, 26px);
}

.onboarding-progress-ring-large svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.onboarding-progress-ring-large .onboarding-progress-ring-bg {
  stroke-width: 6;
}

.onboarding-progress-ring-large .onboarding-progress-ring-fg {
  stroke-width: 6;
}

.onboarding-progress-ring-large .onboarding-progress-day {
  font-size: 28px;
  font-weight: 700;
}

.onboarding-milestones {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm, 8px);
}

.onboarding-milestone {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-sm, 8px);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-secondary, #FAF8F5);
  opacity: 0.5;
  transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
              background ${DURATION.NORMAL}ms ${EASING.STANDARD};
}

.onboarding-milestone.reached {
  opacity: 1;
  background: var(--persona-tint-ferni, rgba(74, 103, 65, 0.08));
}

.onboarding-milestone.current {
  opacity: 1;
  background: var(--persona-tint-ferni, rgba(74, 103, 65, 0.12));
  box-shadow: 0 0 0 1px var(--color-ferni, #4a6741);
}

.onboarding-milestone-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-bg-elevated, #FFFDFB);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.onboarding-milestone-icon svg {
  width: 16px;
  height: 16px;
  color: var(--color-text-muted, #9B9590);
}

.onboarding-milestone.reached .onboarding-milestone-icon svg,
.onboarding-milestone.current .onboarding-milestone-icon svg {
  color: var(--color-ferni, #4a6741);
}

.onboarding-milestone-info {
  flex: 1;
  min-width: 0;
}

.onboarding-milestone-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0;
}

.onboarding-milestone-desc {
  font-size: 11px;
  color: var(--color-text-secondary, #6B6560);
  margin: 0;
}

.onboarding-milestone-day {
  font-size: 11px;
  color: var(--color-text-muted, #9B9590);
  flex-shrink: 0;
}

.onboarding-progress-close {
  position: absolute;
  top: var(--space-sm, 8px);
  right: var(--space-sm, 8px);
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #9B9590);
  transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
}

.onboarding-progress-close:hover {
  background: var(--color-bg-secondary, #FAF8F5);
}

.onboarding-progress-close:focus-visible {
  outline: 2px solid var(--color-accent-primary, #3D5A45);
  outline-offset: 2px;
}

.onboarding-progress-close svg {
  width: 16px;
  height: 16px;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .onboarding-progress-widget,
  .onboarding-progress-modal,
  .onboarding-progress-card,
  .onboarding-progress-ring-fg,
  .onboarding-milestone {
    transition: none;
  }
}

/* Mobile adjustments */
@media (max-width: 480px) {
  .onboarding-progress-widget {
    bottom: calc(var(--space-lg, 26px) + 60px);
    left: 50%;
    transform: translateX(-50%) translateY(20px);
  }

  .onboarding-progress-widget.visible {
    transform: translateX(-50%) translateY(0);
  }

  .onboarding-progress-widget:hover {
    transform: translateX(-50%) scale(1.02);
  }
}
`;

// ============================================================================
// STATE
// ============================================================================

let widget: HTMLElement | null = null;
let modal: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let currentProgress: OnboardingProgress | null = null;
const celebratedDays = new Set<number>();

// ============================================================================
// SVG ICON CREATORS (Safe DOM methods)
// ============================================================================

function createStarIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
  );
  svg.appendChild(path);

  return svg;
}

function createFlameIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'
  );
  svg.appendChild(path);

  return svg;
}

function createClockIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  svg.appendChild(circle);

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', '12 6 12 12 16 14');
  svg.appendChild(polyline);

  return svg;
}

function createHeartIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'
  );
  svg.appendChild(path);

  return svg;
}

function createCloseIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');

  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M18 6L6 18');
  svg.appendChild(path1);

  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M6 6l12 12');
  svg.appendChild(path2);

  return svg;
}

function getMilestoneIcon(day: number): SVGSVGElement {
  switch (day) {
    case 1:
      return createStarIcon();
    case 3:
      return createFlameIcon();
    case 7:
      return createClockIcon();
    case 14:
      return createHeartIcon();
    default:
      return createStarIcon();
  }
}

// ============================================================================
// PROGRESS RING (Safe DOM methods)
// ============================================================================

function createProgressRingElement(day: number, size: 'small' | 'large' = 'small'): HTMLElement {
  const container = document.createElement('div');
  container.className =
    size === 'large' ? 'onboarding-progress-ring onboarding-progress-ring-large' : 'onboarding-progress-ring';

  const progress = Math.min(day / 14, 1);
  const radius = size === 'small' ? 15 : 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const viewBoxSize = size === 'small' ? 36 : 120;
  const center = size === 'small' ? 18 : 60;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewBoxSize} ${viewBoxSize}`);

  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('class', 'onboarding-progress-ring-bg');
  bgCircle.setAttribute('cx', String(center));
  bgCircle.setAttribute('cy', String(center));
  bgCircle.setAttribute('r', String(radius));
  svg.appendChild(bgCircle);

  const fgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fgCircle.setAttribute('class', 'onboarding-progress-ring-fg');
  fgCircle.setAttribute('cx', String(center));
  fgCircle.setAttribute('cy', String(center));
  fgCircle.setAttribute('r', String(radius));
  fgCircle.setAttribute('stroke-dasharray', String(circumference));
  fgCircle.setAttribute('stroke-dashoffset', String(offset));
  svg.appendChild(fgCircle);

  container.appendChild(svg);

  const daySpan = document.createElement('span');
  daySpan.className = 'onboarding-progress-day';
  daySpan.textContent = String(day);
  container.appendChild(daySpan);

  return container;
}

// ============================================================================
// HELPERS
// ============================================================================

function getProgressLabelContent(progress: OnboardingProgress): { bold: string; normal: string } {
  if (progress.arcComplete) {
    return { bold: 'Journey complete!', normal: '' };
  }
  if (progress.daysSinceSignup === 0) {
    return { bold: 'Day 1', normal: ' begins' };
  }
  if (progress.daysSinceSignup === 7) {
    return { bold: 'One week', normal: ' together' };
  }
  if (progress.daysSinceSignup === 14) {
    return { bold: 'Two weeks', normal: ' of growth' };
  }
  return { bold: `Day ${progress.daysSinceSignup}`, normal: ' of 14' };
}

function getCurrentMilestone(day: number): MilestoneInfo | undefined {
  return MILESTONES.find((m) => m.day === day);
}

// ============================================================================
// WIDGET
// ============================================================================

function createWidget(progress: OnboardingProgress): HTMLElement {
  const el = document.createElement('div');
  el.className = 'onboarding-progress-widget';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `Onboarding progress: Day ${progress.daysSinceSignup} of 14`);

  const ring = createProgressRingElement(progress.daysSinceSignup + 1, 'small');
  el.appendChild(ring);

  const label = document.createElement('span');
  label.className = 'onboarding-progress-label';
  const labelContent = getProgressLabelContent(progress);
  const strong = document.createElement('strong');
  strong.textContent = labelContent.bold;
  label.appendChild(strong);
  label.appendChild(document.createTextNode(labelContent.normal));
  el.appendChild(label);

  el.addEventListener('click', () => openModal());
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal();
    }
  });

  return el;
}

function updateWidget(progress: OnboardingProgress): void {
  if (!widget) return;

  const oldRing = widget.querySelector('.onboarding-progress-ring');
  if (oldRing) {
    const newRing = createProgressRingElement(progress.daysSinceSignup + 1, 'small');
    oldRing.replaceWith(newRing);
  }

  const label = widget.querySelector('.onboarding-progress-label');
  if (label) {
    label.textContent = '';
    const labelContent = getProgressLabelContent(progress);
    const strong = document.createElement('strong');
    strong.textContent = labelContent.bold;
    label.appendChild(strong);
    label.appendChild(document.createTextNode(labelContent.normal));
  }

  widget.setAttribute('aria-label', `Onboarding progress: Day ${progress.daysSinceSignup} of 14`);
}

// ============================================================================
// MODAL
// ============================================================================

function createModal(progress: OnboardingProgress): HTMLElement {
  const el = document.createElement('div');
  el.className = 'onboarding-progress-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'onboarding-progress-title');
  el.setAttribute('aria-modal', 'true');

  const day = progress.daysSinceSignup + 1;

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'onboarding-progress-backdrop';
  backdrop.addEventListener('click', closeModal);
  el.appendChild(backdrop);

  // Card
  const card = document.createElement('div');
  card.className = 'onboarding-progress-card';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'onboarding-progress-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(createCloseIcon());
  closeBtn.addEventListener('click', closeModal);
  card.appendChild(closeBtn);

  // Header
  const header = document.createElement('div');
  header.className = 'onboarding-progress-header';

  const title = document.createElement('h2');
  title.id = 'onboarding-progress-title';
  title.textContent = t('onboarding.yourJourney');
  header.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.textContent = progress.arcComplete
    ? 'Two weeks of growth!'
    : `Day ${day} of your 14-day journey`;
  header.appendChild(subtitle);

  card.appendChild(header);

  // Large progress ring
  const largeRing = createProgressRingElement(day, 'large');
  card.appendChild(largeRing);

  // Milestones list
  const milestonesList = document.createElement('div');
  milestonesList.className = 'onboarding-milestones';

  for (const milestone of MILESTONES) {
    const reached = day > milestone.day;
    const current = day === milestone.day;

    const milestoneEl = document.createElement('div');
    milestoneEl.className = 'onboarding-milestone';
    if (reached) milestoneEl.classList.add('reached');
    if (current) milestoneEl.classList.add('current');

    const iconContainer = document.createElement('div');
    iconContainer.className = 'onboarding-milestone-icon';
    iconContainer.appendChild(getMilestoneIcon(milestone.day));
    milestoneEl.appendChild(iconContainer);

    const info = document.createElement('div');
    info.className = 'onboarding-milestone-info';

    const titleEl = document.createElement('p');
    titleEl.className = 'onboarding-milestone-title';
    titleEl.textContent = milestone.title;
    info.appendChild(titleEl);

    const descEl = document.createElement('p');
    descEl.className = 'onboarding-milestone-desc';
    descEl.textContent = milestone.description;
    info.appendChild(descEl);

    milestoneEl.appendChild(info);

    const dayLabel = document.createElement('span');
    dayLabel.className = 'onboarding-milestone-day';
    dayLabel.textContent = `Day ${milestone.day}`;
    milestoneEl.appendChild(dayLabel);

    milestonesList.appendChild(milestoneEl);
  }

  card.appendChild(milestonesList);
  el.appendChild(card);

  // Keyboard handling
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });

  return el;
}

function openModal(): void {
  if (!currentProgress || modal?.classList.contains('open')) return;

  if (!modal) {
    modal = createModal(currentProgress);
    document.body.appendChild(modal);
  }

  // Force reflow for animation
  void modal.offsetHeight;

  modal.classList.add('open');
  modal.querySelector<HTMLButtonElement>('.onboarding-progress-close')?.focus();

  log.debug('Opened onboarding progress modal');
}

function closeModal(): void {
  if (!modal) return;

  modal.classList.remove('open');

  log.debug('Closed onboarding progress modal');
}

// ============================================================================
// CELEBRATION
// ============================================================================

function celebrateMilestoneReached(milestone: MilestoneInfo): void {
  if (celebratedDays.has(milestone.day)) return;
  celebratedDays.add(milestone.day);

  toast.success(milestone.description);

  log.info({ day: milestone.day, title: milestone.title }, 'Celebrated milestone');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize the onboarding progress widget
 */
export function initOnboardingProgress(): void {
  if (styleElement) return;

  // Inject styles
  styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);

  log.debug('Onboarding progress UI initialized');
}

/**
 * Show the onboarding progress widget with the given progress
 */
export function showOnboardingProgress(progress: OnboardingProgress): void {
  currentProgress = progress;

  // Don't show if arc is complete (let it fade away gracefully)
  if (progress.arcComplete) {
    hideOnboardingProgress();
    return;
  }

  // Create widget if needed
  if (!widget) {
    widget = createWidget(progress);
    document.body.appendChild(widget);

    // Animate in
    requestAnimationFrame(() => {
      widget?.classList.add('visible');
    });
  } else {
    updateWidget(progress);
  }

  // Check for milestone celebrations
  const day = progress.daysSinceSignup + 1;
  const milestone = getCurrentMilestone(day);
  if (milestone) {
    celebrateMilestoneReached(milestone);
  }

  log.debug({ day, engagementLevel: progress.engagementLevel }, 'Updated onboarding progress');
}

/**
 * Hide the onboarding progress widget
 */
export function hideOnboardingProgress(): void {
  if (widget) {
    widget.classList.remove('visible');

    // Remove after animation
    setTimeout(() => {
      widget?.remove();
      widget = null;
    }, DURATION.MODERATE);
  }

  closeModal();
}

/**
 * Cleanup
 */
export function cleanupOnboardingProgress(): void {
  hideOnboardingProgress();

  if (modal) {
    modal.remove();
    modal = null;
  }

  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }

  currentProgress = null;
  celebratedDays.clear();

  log.debug('Onboarding progress UI cleaned up');
}

/**
 * Fetch progress from the API and update the widget
 */
export async function fetchAndUpdateOnboardingProgress(userId: string): Promise<void> {
  try {
    const response = await fetch(`/api/onboarding/progress?userId=${encodeURIComponent(userId)}`);

    if (!response.ok) {
      if (response.status === 404) {
        // User not in onboarding period
        hideOnboardingProgress();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const progress = (await response.json()) as OnboardingProgress;
    showOnboardingProgress(progress);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to fetch onboarding progress');
  }
}

// Export for use in app initialization
export const onboardingProgress = {
  init: initOnboardingProgress,
  show: showOnboardingProgress,
  hide: hideOnboardingProgress,
  cleanup: cleanupOnboardingProgress,
  fetch: fetchAndUpdateOnboardingProgress,
};

export default onboardingProgress;
