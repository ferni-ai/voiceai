/**
 * Practice Briefing Toast UI
 *
 * Shows a friendly toast notification before scheduled practices.
 * Includes encouragement, streak info, and prep tips.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Respects prefers-reduced-motion
 * - Humanized, encouraging copy
 */

import { DURATION } from '../config/animation-constants.js';
import { ICONS } from './engagement-components.js';
import type { PracticeBriefing } from '../services/practice-briefings.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PracticeBriefingToast');

// ============================================================================
// VOICE PROMPT SYSTEM
// ============================================================================

/**
 * Voice prompt settings
 */
interface VoicePromptOptions {
  /** Enable voice prompt (default: true if TTS available) */
  enabled?: boolean;
  /** Speak immediately on show (default: true) */
  speakOnShow?: boolean;
  /** Voice pitch (0.5 - 2, default: 1) */
  pitch?: number;
  /** Voice rate (0.5 - 2, default: 0.95) */
  rate?: number;
}

/**
 * Check if Web Speech API is available
 */
function isSpeechSynthesisAvailable(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Get a warm, friendly voice for Ferni
 */
function getPreferredVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisAvailable()) return null;
  
  const voices = speechSynthesis.getVoices();
  
  // Prefer warm/natural sounding voices
  const preferredVoiceNames = [
    'Samantha', // macOS - natural
    'Karen',    // macOS - Australian
    'Google US English', // Chrome
    'Microsoft Zira', // Windows
    'Alex',     // macOS
  ];
  
  for (const name of preferredVoiceNames) {
    const voice = voices.find(v => v.name.includes(name));
    if (voice) return voice;
  }
  
  // Fallback to first English voice
  return voices.find(v => v.lang.startsWith('en')) ?? voices[0] ?? null;
}

/**
 * Speak text using Web Speech API
 */
function speakText(
  text: string, 
  options?: { pitch?: number; rate?: number; onEnd?: () => void }
): SpeechSynthesisUtterance | null {
  if (!isSpeechSynthesisAvailable()) {
    log.debug('Speech synthesis not available');
    return null;
  }

  // Cancel any ongoing speech
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = getPreferredVoice();
  utterance.pitch = options?.pitch ?? 1;
  utterance.rate = options?.rate ?? 0.95; // Slightly slower for warmth
  utterance.volume = 1;

  if (options?.onEnd) {
    utterance.onend = options.onEnd;
  }

  utterance.onerror = (event) => {
    log.warn('Speech synthesis error:', event.error);
  };

  speechSynthesis.speak(utterance);
  log.debug('Speaking briefing:', text.substring(0, 50) + '...');
  
  return utterance;
}

/**
 * Stop any ongoing speech
 */
function stopSpeaking(): void {
  if (isSpeechSynthesisAvailable()) {
    speechSynthesis.cancel();
  }
}

/**
 * Generate voice prompt text from briefing
 */
function generateVoicePromptText(briefing: PracticeBriefing): string {
  const parts: string[] = [];
  
  // Greeting (e.g., "It's time for Morning Meditation")
  parts.push(briefing.greeting);
  
  // Time context
  if (briefing.minutesUntil <= 1) {
    parts.push("Starting now.");
  } else if (briefing.minutesUntil <= 5) {
    parts.push(`In just ${briefing.minutesUntil} minutes.`);
  }
  
  // Streak encouragement
  if (briefing.streak > 0) {
    if (briefing.streak === 1) {
      parts.push("Great start yesterday!");
    } else if (briefing.streak < 7) {
      parts.push(`You're on a ${briefing.streak} day streak. Keep it going!`);
    } else {
      parts.push(`Amazing! ${briefing.streak} days in a row.`);
    }
  }
  
  // Main encouragement
  parts.push(briefing.encouragement);
  
  // One prep tip (keep it concise)
  if (briefing.prepTips?.length) {
    parts.push(`Quick tip: ${briefing.prepTips[0]}`);
  }
  
  return parts.join(' ');
}

// ============================================================================
// STYLES
// ============================================================================

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;

  const style = document.createElement('style');
  style.id = 'practice-briefing-toast-styles';
  style.textContent = `
    .practice-briefing-toast {
      position: fixed;
      bottom: var(--ma-silence);
      left: 50%;
      transform: translateX(-50%) translateY(100%);
      z-index: var(--z-notification, 3000);
      width: calc(100% - var(--ma-silence) * 2);
      max-width: min(400px, 100%);
      padding: var(--ma-rest);
      background: var(--color-background-elevated);
      border: 1px solid var(--color-border-subtle);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-2xl);
      opacity: 0;
      pointer-events: none;
      transition: 
        transform var(--duration-moderate) var(--ease-spring),
        opacity var(--duration-moderate) var(--ease-gentle);
    }

    .practice-briefing-toast--visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    .practice-briefing-toast__header {
      display: flex;
      align-items: flex-start;
      gap: var(--ma-pause);
      margin-bottom: var(--ma-pause);
    }

    .practice-briefing-toast__icon {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-lg);
      background: var(--persona-tint, rgba(74, 103, 65, 0.1));
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--persona-primary, var(--color-accent-primary));
      flex-shrink: 0;
    }

    .practice-briefing-toast__icon svg {
      width: 20px;
      height: 20px;
    }

    .practice-briefing-toast__content {
      flex: 1;
      min-width: 0;
    }

    .practice-briefing-toast__greeting {
      font-family: var(--font-display);
      font-size: var(--text-base);
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-text-primary);
      margin: 0 0 4px 0;
    }

    .practice-briefing-toast__time {
      font-family: var(--font-body);
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }

    .practice-briefing-toast__close {
      position: absolute;
      top: var(--ma-pause);
      right: var(--ma-pause);
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: 
        background var(--duration-fast) var(--ease-gentle),
        color var(--duration-fast) var(--ease-gentle);
    }

    .practice-briefing-toast__close:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .practice-briefing-toast__close svg {
      width: 16px;
      height: 16px;
    }

    .practice-briefing-toast__streak {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--text-xs);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-semantic-success, #4caf50);
      background: rgba(76, 175, 80, 0.1);
      padding: 4px 8px;
      border-radius: var(--radius-full);
      margin-bottom: var(--ma-pause);
    }

    .practice-briefing-toast__encouragement {
      font-family: var(--font-body);
      font-size: var(--text-sm);
      color: var(--color-text-secondary);
      line-height: var(--leading-relaxed);
      margin: 0 0 var(--ma-pause) 0;
    }

    .practice-briefing-toast__tips {
      padding: var(--ma-breath);
      background: var(--color-background-secondary);
      border-radius: var(--radius-md);
      margin-bottom: var(--ma-pause);
    }

    .practice-briefing-toast__tips-title {
      font-family: var(--font-display);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 var(--ma-breath) 0;
    }

    .practice-briefing-toast__tips-list {
      margin: 0;
      padding: 0 0 0 var(--ma-pause);
      font-size: var(--text-xs);
      color: var(--color-text-secondary);
    }

    .practice-briefing-toast__tips-list li {
      margin-bottom: 4px;
    }

    .practice-briefing-toast__tips-list li:last-child {
      margin-bottom: 0;
    }

    .practice-briefing-toast__actions {
      display: flex;
      gap: var(--ma-pause);
    }

    .practice-briefing-toast__btn {
      flex: 1;
      padding: var(--ma-breath) var(--ma-pause);
      border-radius: var(--radius-md);
      font-family: var(--font-display);
      font-size: var(--text-sm);
      font-weight: var(--font-weight-medium, 500);
      cursor: pointer;
      transition: 
        background var(--duration-fast) var(--ease-gentle),
        transform var(--duration-fast) var(--ease-spring);
    }

    .practice-briefing-toast__btn:active {
      transform: scale(0.98);
    }

    .practice-briefing-toast__btn--secondary {
      background: var(--color-background-secondary);
      border: 1px solid var(--color-border-subtle);
      color: var(--color-text-secondary);
    }

    .practice-briefing-toast__btn--secondary:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .practice-briefing-toast__btn--primary {
      background: var(--persona-primary, var(--color-accent-primary));
      border: none;
      color: white;
    }

    .practice-briefing-toast__btn--primary:hover {
      filter: brightness(1.1);
    }

    .practice-briefing-toast__voice-btn {
      position: absolute;
      top: var(--ma-pause);
      right: calc(var(--ma-pause) + 36px);
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      border-radius: var(--radius-full);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: 
        background var(--duration-fast) var(--ease-gentle),
        color var(--duration-fast) var(--ease-gentle);
    }

    .practice-briefing-toast__voice-btn:hover {
      background: var(--color-background-tertiary);
      color: var(--color-text-primary);
    }

    .practice-briefing-toast__voice-btn--speaking {
      color: var(--persona-primary, var(--color-accent-primary));
      animation: voice-pulse 1.5s ease-in-out infinite;
    }

    .practice-briefing-toast__voice-btn svg {
      width: 16px;
      height: 16px;
    }

    @keyframes voice-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* Dark theme */
    [data-theme="midnight"] .practice-briefing-toast {
      background: var(--color-background-elevated);
      border-color: var(--color-border-medium);
    }

    [data-theme="midnight"] .practice-briefing-toast__tips {
      background: var(--color-background-tertiary);
    }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .practice-briefing-toast {
        transition: opacity var(--duration-fast) linear;
      }

      .practice-briefing-toast--visible {
        transform: translateX(-50%) translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

// ============================================================================
// TOAST CLASS
// ============================================================================

class PracticeBriefingToast {
  private container: HTMLElement | null = null;
  private isVisible = false;
  private autoDismissTimeout: ReturnType<typeof setTimeout> | null = null;
  private onStartCallback: ((practiceId: string) => void) | null = null;
  private currentBriefing: PracticeBriefing | null = null;
  private isSpeaking = false;
  private voiceOptions: VoicePromptOptions = {};

  /**
   * Show a practice briefing toast with optional voice prompt
   */
  show(
    briefing: PracticeBriefing,
    options?: { 
      onStart?: (practiceId: string) => void; 
      autoDismissMs?: number;
      voice?: VoicePromptOptions;
    }
  ): void {
    injectStyles();
    this.cleanupOrphanedElements();

    this.currentBriefing = briefing;
    this.onStartCallback = options?.onStart ?? null;
    this.voiceOptions = options?.voice ?? {};

    this.createContainer(briefing);

    // Animate in
    requestAnimationFrame(() => {
      this.container?.classList.add('practice-briefing-toast--visible');
      
      // Speak briefing if voice is enabled (default: enabled)
      const voiceEnabled = this.voiceOptions.enabled !== false && isSpeechSynthesisAvailable();
      const speakOnShow = this.voiceOptions.speakOnShow !== false;
      
      if (voiceEnabled && speakOnShow) {
        // Slight delay for better UX
        setTimeout(() => this.speakBriefing(), 300);
      }
    });

    this.isVisible = true;

    // Auto-dismiss after specified time (default 60 seconds)
    if (options?.autoDismissMs !== 0) {
      this.autoDismissTimeout = setTimeout(() => {
        this.hide();
      }, options?.autoDismissMs ?? 60000);
    }
  }

  /**
   * Speak the current briefing using TTS
   */
  speakBriefing(): void {
    if (!this.currentBriefing || this.isSpeaking) return;

    const text = generateVoicePromptText(this.currentBriefing);
    this.isSpeaking = true;
    this.updateVoiceButtonState(true);

    speakText(text, {
      pitch: this.voiceOptions.pitch,
      rate: this.voiceOptions.rate,
      onEnd: () => {
        this.isSpeaking = false;
        this.updateVoiceButtonState(false);
      }
    });
  }

  /**
   * Stop speaking
   */
  stopSpeaking(): void {
    stopSpeaking();
    this.isSpeaking = false;
    this.updateVoiceButtonState(false);
  }

  /**
   * Toggle voice prompt
   */
  toggleVoice(): void {
    if (this.isSpeaking) {
      this.stopSpeaking();
    } else {
      this.speakBriefing();
    }
  }

  /**
   * Update voice button visual state
   */
  private updateVoiceButtonState(speaking: boolean): void {
    const voiceBtn = this.container?.querySelector('.practice-briefing-toast__voice-btn');
    if (voiceBtn) {
      voiceBtn.classList.toggle('practice-briefing-toast__voice-btn--speaking', speaking);
      voiceBtn.setAttribute('aria-label', speaking ? 'Stop reading' : 'Read aloud');
    }
  }

  /**
   * Hide the toast
   */
  hide(): void {
    if (!this.container || !this.isVisible) return;

    // Stop any ongoing speech
    this.stopSpeaking();

    if (this.autoDismissTimeout) {
      clearTimeout(this.autoDismissTimeout);
      this.autoDismissTimeout = null;
    }

    this.container.classList.remove('practice-briefing-toast--visible');

    // Remove after animation
    setTimeout(() => {
      this.container?.remove();
      this.container = null;
      this.isVisible = false;
      this.currentBriefing = null;
    }, DURATION.MODERATE);
  }

  /**
   * HMR protection: clean up orphaned elements
   */
  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.practice-briefing-toast').forEach((el) => el.remove());
  }

  /**
   * Create the toast container
   */
  private createContainer(briefing: PracticeBriefing): void {
    this.container = document.createElement('div');
    this.container.className = 'practice-briefing-toast';
    this.container.setAttribute('role', 'alertdialog');
    this.container.setAttribute('aria-label', `Upcoming practice: ${briefing.practiceName}`);

    const timeIcon = getTimeIcon(briefing.startsAt);
    const tipsHtml = briefing.prepTips?.length
      ? `<div class="practice-briefing-toast__tips">
          <p class="practice-briefing-toast__tips-title">Prep tips</p>
          <ul class="practice-briefing-toast__tips-list">
            ${briefing.prepTips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}
          </ul>
        </div>`
      : '';

    const streakHtml = briefing.streak > 0
      ? `<span class="practice-briefing-toast__streak">
          🔥 ${briefing.streak} day streak
        </span>`
      : '';

    // Voice button only shown if TTS is available
    const voiceButtonHtml = isSpeechSynthesisAvailable() 
      ? `<button class="practice-briefing-toast__voice-btn" aria-label="Read aloud" title="Read aloud">
          ${ICONS.volume ?? getSpeakerIcon()}
        </button>`
      : '';

    this.container.innerHTML = `
      ${voiceButtonHtml}
      <button class="practice-briefing-toast__close" aria-label="Dismiss">
        ${ICONS.close}
      </button>
      <div class="practice-briefing-toast__header">
        <div class="practice-briefing-toast__icon">
          ${timeIcon}
        </div>
        <div class="practice-briefing-toast__content">
          <h4 class="practice-briefing-toast__greeting">${escapeHtml(briefing.greeting)}</h4>
          <span class="practice-briefing-toast__time">
            ${briefing.minutesUntil <= 1 ? 'Starting now' : `In ${briefing.minutesUntil} minutes`}
          </span>
        </div>
      </div>
      ${streakHtml}
      <p class="practice-briefing-toast__encouragement">${escapeHtml(briefing.encouragement)}</p>
      ${tipsHtml}
      <div class="practice-briefing-toast__actions" role="button" tabindex="0">
        <button aria-label="Dismiss" class="practice-briefing-toast__btn practice-briefing-toast__btn--secondary" type="button">
          Dismiss
        </button>
        <button aria-label="Start Practice" class="practice-briefing-toast__btn practice-briefing-toast__btn--primary" type="button">
          Start Practice
        </button>
      </div>
    `;

    // Bind events
    this.container
      .querySelector('.practice-briefing-toast__close')
      ?.addEventListener('click', () => this.hide());

    this.container
      .querySelector('.practice-briefing-toast__voice-btn')
      ?.addEventListener('click', () => this.toggleVoice());

    this.container
      .querySelector('.practice-briefing-toast__btn--secondary')
      ?.addEventListener('click', () => this.hide());

    this.container
      .querySelector('.practice-briefing-toast__btn--primary')
      ?.addEventListener('click', () => {
        if (this.currentBriefing && this.onStartCallback) {
          this.onStartCallback(this.currentBriefing.practiceId);
        }
        this.hide();
      });

    document.body.appendChild(this.container);
  }
}

/**
 * Get speaker icon SVG (fallback if not in ICONS)
 */
function getSpeakerIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
  </svg>`;
}

// ============================================================================
// HELPERS
// ============================================================================

function getTimeIcon(isoDate: string): string {
  const hour = new Date(isoDate).getHours();
  if (hour >= 5 && hour < 12) return ICONS.sunny; // Morning
  if (hour >= 12 && hour < 18) return ICONS.clock; // Afternoon
  return ICONS.moon ?? ICONS.star ?? ICONS.heart; // Evening/night
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const practiceBriefingToast = new PracticeBriefingToast();

export function showPracticeBriefing(
  briefing: PracticeBriefing,
  options?: { 
    onStart?: (practiceId: string) => void; 
    autoDismissMs?: number;
    voice?: VoicePromptOptions;
  }
): void {
  practiceBriefingToast.show(briefing, options);
}

export function hidePracticeBriefing(): void {
  practiceBriefingToast.hide();
}

/**
 * Check if voice prompts are available on this device
 */
export function isVoicePromptAvailable(): boolean {
  return isSpeechSynthesisAvailable();
}

/**
 * Speak a custom message using the same TTS system
 */
export function speakMessage(message: string): void {
  speakText(message);
}

export default practiceBriefingToast;

