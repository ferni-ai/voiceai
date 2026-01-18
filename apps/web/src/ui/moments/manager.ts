/**
 * Moments Manager
 *
 * Central orchestrator for the unified feedback system.
 * All feedback flows through this singleton.
 *
 * API:
 * - moments.whisper(message, options) - transient feedback
 * - moments.notice(message, options) - events with actions
 * - moments.celebrate(type, data) - milestone moments
 * - moments.milestone(type, data) - full modal experiences
 *
 * @module ui/moments/manager
 */

import { DURATION, prefersReducedMotion } from '../../config/animation-constants.js';
import { getHapticsService } from '../../services/haptics.service.js';
import { createLogger } from '../../utils/logger.js';
import { createTimeoutTracker } from '../../utils/tracked-timeout.js';
import {
  MOMENT_DURATIONS,
  HAPTIC_MAP,
  WHISPER_ANIMATION,
  NOTICE_ANIMATION,
  MILESTONE_ANIMATION,
  REDUCED_MOTION_DURATIONS,
} from './constants.js';
import { injectMomentStyles, removeMomentStyles } from './styles.js';
import { MOMENT_ICONS, getIcon } from './icons.js';
import type {
  MomentLevel,
  MomentState,
  WhisperConfig,
  WhisperType,
  NoticeConfig,
  NoticeType,
  CelebrationConfig,
  CelebrationType,
  MilestoneConfig,
  MilestoneType,
  MomentEvents,
  MomentEventListener,
  HapticPattern,
} from './types.js';

const log = createLogger('MomentsManager');

// ============================================================================
// TIMEOUT TRACKING
// ============================================================================

const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// MOMENTS MANAGER CLASS
// ============================================================================

class MomentsManager {
  private container: HTMLElement | null = null;
  private active: MomentState | null = null;
  private queue: Array<{ id: string; config: WhisperConfig | NoticeConfig }> = [];
  private idCounter = 0;
  private haptics = getHapticsService();
  private listeners: Map<string, Set<Function>> = new Map();
  private initialized = false;

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  private initialize(): void {
    if (this.initialized) return;

    // Clean up orphaned elements from HMR
    document.querySelectorAll('.moments-container').forEach((el) => el.remove());

    injectMomentStyles();
    this.createContainer();
    this.initialized = true;
    log.debug('MomentsManager initialized');
  }

  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.className = 'moments-container';
    this.container.setAttribute('role', 'status');
    this.container.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.container);
  }

  // ==========================================================================
  // PUBLIC API: WHISPER (Level 1)
  // ==========================================================================

  /**
   * Show a whisper - transient feedback that appears below the avatar.
   */
  whisper(
    message: string,
    options?: {
      type?: WhisperType;
      duration?: number;
      icon?: string;
    }
  ): string {
    this.initialize();

    const id = this.generateId();
    const config: WhisperConfig = {
      id,
      message,
      type: options?.type ?? 'info',
      duration: options?.duration ?? MOMENT_DURATIONS.whisper.default,
      icon: options?.icon,
    };

    // If there's an active moment, queue this one
    if (this.active) {
      this.queue.push({ id, config });
      log.debug({ id }, 'Whisper queued');
      return id;
    }

    this.displayWhisper(id, config);
    return id;
  }

  private displayWhisper(id: string, config: WhisperConfig): void {
    if (!this.container) return;

    const type = config.type ?? 'info';

    // Create element
    const element = document.createElement('div');
    element.className = `moment-whisper moment-whisper--${type}`;
    element.setAttribute('role', 'alert');
    element.textContent = config.message;

    this.container.appendChild(element);

    // Play haptic
    const hapticKey = `whisper:${type}` as keyof typeof HAPTIC_MAP;
    this.playHaptic(HAPTIC_MAP[hapticKey] ?? 'softTap');

    // Animate in
    requestAnimationFrame(() => {
      element.classList.add('moment-whisper--entering');
    });

    // Set up auto-dismiss
    const duration = this.getAccessibleDuration(
      config.duration ?? MOMENT_DURATIONS.whisper.default,
      'whisper'
    );
    const timeout = trackedTimeout(() => this.dismissWhisper(id), duration);

    // Track state
    this.active = {
      id,
      level: 'whisper',
      element,
      timeout,
      status: 'visible',
      config,
    };

    // Emit event
    this.emit('whisper:shown', { id, type });

    log.debug({ id, type, message: config.message }, 'Whisper shown');
  }

  private dismissWhisper(id: string): void {
    if (!this.active || this.active.id !== id) return;

    const { element, timeout } = this.active;

    if (timeout) clearTimeout(timeout);

    // Animate out
    element.classList.remove('moment-whisper--entering');
    element.classList.add('moment-whisper--exiting');

    trackedTimeout(() => {
      element.remove();
      this.active = null;
      this.emit('whisper:dismissed', { id });
      this.processQueue();
    }, prefersReducedMotion() ? 1 : DURATION.NORMAL);

    log.debug({ id }, 'Whisper dismissed');
  }

  // ==========================================================================
  // PUBLIC API: NOTICE (Level 2)
  // ==========================================================================

  /**
   * Show a notice - event notification with optional action.
   */
  notice(
    message: string,
    options?: {
      type?: NoticeType;
      amount?: number;
      icon?: string;
      action?: { label: string; callback: () => void };
      duration?: number;
    }
  ): string {
    this.initialize();

    const id = this.generateId();
    const type = options?.type ?? 'info';
    const config: NoticeConfig = {
      id,
      message,
      type,
      amount: options?.amount,
      icon: options?.icon,
      action: options?.action,
      duration:
        options?.duration ??
        (options?.action
          ? MOMENT_DURATIONS.notice.withAction
          : MOMENT_DURATIONS.notice.default),
    };

    // If there's an active moment, queue this one
    if (this.active) {
      this.queue.push({ id, config });
      log.debug({ id }, 'Notice queued');
      return id;
    }

    this.displayNotice(id, config);
    return id;
  }

  private displayNotice(id: string, config: NoticeConfig): void {
    if (!this.container) return;

    const type = config.type ?? 'info';

    // Create element
    const element = document.createElement('div');
    element.className = `moment-notice moment-notice--${type}`;
    element.setAttribute('role', 'alert');

    // Build content based on type
    if (type === 'seeds' && config.amount !== undefined) {
      element.innerHTML = `
        <span class="moment-notice__amount">+${config.amount}</span>
        <span class="moment-notice__reason">${config.message}</span>
      `;
    } else {
      element.textContent = config.message;
    }

    // Add action button if provided
    if (config.action) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'moment-notice__action';
      actionBtn.textContent = config.action.label;
      actionBtn.addEventListener('click', () => {
        config.action?.callback();
        this.emit('notice:action', { id });
        this.dismiss(id);
      });
      element.appendChild(actionBtn);
    }

    this.container.appendChild(element);

    // Trigger avatar pulse (via event)
    this.triggerAvatarPulse();

    // Play haptic
    const hapticKey = `notice:${type}` as keyof typeof HAPTIC_MAP;
    this.playHaptic(HAPTIC_MAP[hapticKey] ?? 'notification');

    // Animate in
    requestAnimationFrame(() => {
      element.classList.add('moment-notice--entering');
    });

    // Set up auto-dismiss
    const duration = this.getAccessibleDuration(
      config.duration ?? MOMENT_DURATIONS.notice.default,
      'notice'
    );
    const timeout = trackedTimeout(() => this.dismissNotice(id), duration);

    // Track state
    this.active = {
      id,
      level: 'notice',
      element,
      timeout,
      status: 'visible',
      config,
    };

    // Emit event
    this.emit('notice:shown', { id, type });

    log.debug({ id, type, message: config.message }, 'Notice shown');
  }

  private dismissNotice(id: string): void {
    if (!this.active || this.active.id !== id) return;

    const { element, timeout } = this.active;

    if (timeout) clearTimeout(timeout);

    // Animate out
    element.classList.remove('moment-notice--entering');
    element.classList.add('moment-notice--exiting');

    trackedTimeout(() => {
      element.remove();
      this.active = null;
      this.emit('notice:dismissed', { id });
      this.processQueue();
    }, prefersReducedMotion() ? 1 : DURATION.NORMAL);

    log.debug({ id }, 'Notice dismissed');
  }

  // ==========================================================================
  // PUBLIC API: CELEBRATE (Level 3)
  // ==========================================================================

  /**
   * Show a celebration - milestone moment with visual flourish.
   */
  async celebrate(
    type: CelebrationType,
    data?: {
      title?: string;
      subtitle?: string;
      badge?: string;
      count?: number;
      personaId?: string;
      personaName?: string;
    }
  ): Promise<void> {
    this.initialize();

    // Dismiss any active moment
    if (this.active) {
      this.dismiss();
      await this.wait(DURATION.NORMAL);
    }

    const config: CelebrationConfig = { type, ...data };

    log.info({ type, title: data?.title }, 'Celebration started');
    this.emit('celebration:started', { type });

    // Play celebration sequence
    await this.playCelebrationSequence(config);

    this.emit('celebration:completed', { type });
  }

  private async playCelebrationSequence(config: CelebrationConfig): Promise<void> {
    // Create celebration element
    const element = document.createElement('div');
    element.className = 'moment-celebration';

    // Build content - using SVG icons (not emoji per brand guidelines)
    let iconName: keyof typeof MOMENT_ICONS = 'sparkle';
    if (config.type === 'streak') iconName = 'flame';
    if (config.type === 'badge') iconName = 'trophy';
    if (config.type === 'team_unlock') iconName = 'users';
    if (config.type === 'secret') iconName = 'star';

    const title =
      config.title ??
      (config.type === 'streak'
        ? `${config.count} day streak`
        : config.type === 'team_unlock'
          ? `Meet ${config.personaName}`
          : 'Nice work');

    const subtitle =
      config.subtitle ??
      (config.type === 'streak'
        ? "You're showing up. That matters."
        : config.type === 'team_unlock'
          ? 'A new friend has joined your team'
          : undefined);

    element.innerHTML = `
      <div class="moment-celebration__icon">${getIcon(iconName, 48)}</div>
      <h2 class="moment-celebration__title">${this.escapeHtml(title)}</h2>
      ${subtitle ? `<p class="moment-celebration__subtitle">${this.escapeHtml(subtitle)}</p>` : ''}
    `;

    document.body.appendChild(element);

    // Play haptic
    this.playHaptic('success');

    // Trigger avatar celebration (via event)
    this.triggerAvatarCelebration();

    // Animate in
    await this.wait(50);
    element.classList.add('moment-celebration--entering');

    // Add sparkles
    this.createSparkles(element, 12);

    // Wait for display duration
    await this.wait(MOMENT_DURATIONS.celebration.display);

    // Animate out
    element.classList.remove('moment-celebration--entering');
    element.classList.add('moment-celebration--exiting');

    await this.wait(DURATION.SLOW);
    element.remove();
  }

  // ==========================================================================
  // PUBLIC API: MILESTONE (Level 4)
  // ==========================================================================

  /**
   * Show a milestone - full modal experience for major moments.
   */
  async milestone(
    type: MilestoneType,
    data: {
      title: string;
      message: string;
      eyebrow?: string;
      stats?: Record<string, string | number>;
      action?: { label: string; callback: () => void };
      secondaryAction?: { label: string; callback: () => void };
      personaId?: string;
      personaName?: string;
      personaRole?: string;
    }
  ): Promise<void> {
    this.initialize();

    // Dismiss any active moment
    if (this.active) {
      this.dismiss();
      await this.wait(DURATION.NORMAL);
    }

    const config: MilestoneConfig = { type, ...data };

    log.info({ type, title: data.title }, 'Milestone opened');
    this.emit('milestone:opened', { type });

    return new Promise((resolve) => {
      this.displayMilestone(config, () => {
        this.emit('milestone:closed', { type });
        resolve();
      });
    });
  }

  private displayMilestone(config: MilestoneConfig, onClose: () => void): void {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'moment-milestone';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'milestone-title');

    // Build stats HTML
    let statsHtml = '';
    if (config.stats) {
      const statEntries = Object.entries(config.stats);
      statsHtml = `
        <div class="moment-milestone__stats">
          ${statEntries
            .map(
              ([label, value]) => `
            <div class="moment-milestone__stat">
              <div class="moment-milestone__stat-value">${value}</div>
              <div class="moment-milestone__stat-label">${this.escapeHtml(label)}</div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    // Build actions HTML
    let actionsHtml = '';
    if (config.action || config.secondaryAction) {
      actionsHtml = `
        <div class="moment-milestone__actions">
          ${
            config.action
              ? `
            <button class="moment-milestone__button moment-milestone__button--primary" data-action="primary">
              ${getIcon('heart', 18)}
              <span>${this.escapeHtml(config.action.label)}</span>
            </button>
          `
              : ''
          }
          ${
            config.secondaryAction
              ? `
            <button class="moment-milestone__button moment-milestone__button--secondary" data-action="secondary">
              ${this.escapeHtml(config.secondaryAction.label)}
            </button>
          `
              : ''
          }
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="moment-milestone__backdrop"></div>
      <div class="moment-milestone__card">
        <button class="moment-milestone__close" aria-label="Close">
          ${getIcon('close', 18)}
        </button>
        ${config.eyebrow ? `<span class="moment-milestone__eyebrow">${this.escapeHtml(config.eyebrow)}</span>` : ''}
        <h2 id="milestone-title" class="moment-milestone__title">${this.escapeHtml(config.title)}</h2>
        <p class="moment-milestone__message">${this.escapeHtml(config.message)}</p>
        ${statsHtml}
        ${actionsHtml}
      </div>
    `;

    document.body.appendChild(modal);

    // Play haptic
    this.playHaptic('warmWelcome');

    // Event handlers
    const closeHandler = () => {
      this.closeMilestone(modal, onClose);
    };

    modal.querySelector('.moment-milestone__backdrop')?.addEventListener('click', closeHandler);
    modal.querySelector('.moment-milestone__close')?.addEventListener('click', closeHandler);

    if (config.action) {
      modal.querySelector('[data-action="primary"]')?.addEventListener('click', () => {
        config.action?.callback();
        this.emit('milestone:action', { type: config.type });
        closeHandler();
      });
    }

    if (config.secondaryAction) {
      modal.querySelector('[data-action="secondary"]')?.addEventListener('click', () => {
        config.secondaryAction?.callback();
        closeHandler();
      });
    }

    // Keyboard handler
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeHandler();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('moment-milestone--visible', 'moment-milestone--entering');
    });
  }

  private closeMilestone(modal: HTMLElement, onClose: () => void): void {
    modal.classList.remove('moment-milestone--entering');
    modal.classList.add('moment-milestone--exiting');

    trackedTimeout(() => {
      modal.remove();
      onClose();
    }, DURATION.SLOW);
  }

  // ==========================================================================
  // PUBLIC API: DISMISS
  // ==========================================================================

  /**
   * Dismiss the active moment.
   */
  dismiss(id?: string): void {
    if (!this.active) return;
    if (id && this.active.id !== id) return;

    const { level, id: activeId } = this.active;

    if (level === 'whisper') {
      this.dismissWhisper(activeId);
    } else if (level === 'notice') {
      this.dismissNotice(activeId);
    }
  }

  /**
   * Dismiss all moments and clear queue.
   */
  dismissAll(): void {
    this.queue = [];
    if (this.active) {
      this.dismiss(this.active.id);
    }
  }

  // ==========================================================================
  // EVENT SYSTEM
  // ==========================================================================

  /**
   * Subscribe to moment events.
   */
  on<K extends keyof MomentEvents>(
    event: K,
    listener: MomentEventListener<K>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  private emit<K extends keyof MomentEvents>(event: K, payload: MomentEvents[K]): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          (listener as MomentEventListener<K>)(payload);
        } catch (error) {
          log.warn({ event, error: String(error) }, 'Event listener error');
        }
      });
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private generateId(): string {
    return `moment-${++this.idCounter}`;
  }

  private processQueue(): void {
    if (this.queue.length === 0) return;

    const next = this.queue.shift()!;
    const { id, config } = next;

    if ('type' in config && ['info', 'success', 'warning', 'error'].includes(config.type ?? '')) {
      this.displayWhisper(id, config as WhisperConfig);
    } else {
      this.displayNotice(id, config as NoticeConfig);
    }
  }

  private playHaptic(pattern: HapticPattern | string): void {
    try {
      this.haptics.play(pattern);
    } catch (error) {
      log.debug({ pattern, error: String(error) }, 'Haptic play failed');
    }
  }

  private triggerAvatarPulse(): void {
    window.dispatchEvent(new CustomEvent('ferni:avatar-pulse'));
  }

  private triggerAvatarCelebration(): void {
    window.dispatchEvent(new CustomEvent('ferni:avatar-celebrate'));
  }

  private createSparkles(container: HTMLElement, count: number): void {
    if (prefersReducedMotion()) return;

    for (let i = 0; i < count; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'moment-sparkle';

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const distance = 30 + Math.random() * 30;
      sparkle.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
      sparkle.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
      sparkle.style.left = '50%';
      sparkle.style.top = '50%';
      sparkle.style.animationDelay = `${i * 50}ms`;
      sparkle.style.animation = `sparkle-burst 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards`;

      container.appendChild(sparkle);
    }
  }

  private getAccessibleDuration(duration: number, level: MomentLevel): number {
    if (prefersReducedMotion()) {
      return REDUCED_MOTION_DURATIONS[level] ?? duration;
    }
    return duration;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => trackedTimeout(resolve, ms));
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  /**
   * Clean up all resources.
   */
  destroy(): void {
    clearAllTimeouts();
    this.dismissAll();
    this.container?.remove();
    this.container = null;
    removeMomentStyles();
    this.listeners.clear();
    this.initialized = false;
    log.debug('MomentsManager destroyed');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: MomentsManager | null = null;

export function getMomentsManager(): MomentsManager {
  if (!instance) {
    instance = new MomentsManager();
  }
  return instance;
}

export function resetMomentsManager(): void {
  instance?.destroy();
  instance = null;
}

export { MomentsManager };
