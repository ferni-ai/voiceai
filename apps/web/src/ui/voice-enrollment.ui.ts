/**
 * Voice Enrollment UI - Beautiful, Human-Centered Voice Registration
 *
 * Philosophy: Voice enrollment should feel like a friend learning to recognize you,
 * not a security checkpoint. Warm, encouraging, and celebratory.
 *
 * DESIGN PRINCIPLES:
 * - Centered floating modal (per brand guidelines)
 * - Warm, human language (not technical)
 * - Visual audio feedback during recording
 * - Celebration on completion
 * - Graceful error handling
 *
 * @module VoiceEnrollmentUI
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { toast } from './toast.ui.js';
import {
  getVoiceAuthService,
  type EnrollmentProgress,
  type VoiceProfile,
} from '../services/voice-auth.service.js';

const log = createLogger('VoiceEnrollmentUI');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceEnrollmentOptions {
  onComplete?: (profile: VoiceProfile) => void;
  onCancel?: () => void;
}

type EnrollmentState =
  | 'idle'
  | 'checking'
  | 'not_available'
  | 'already_enrolled'
  | 'ready'
  | 'recording'
  | 'processing'
  | 'complete'
  | 'error';

// ============================================================================
// ICONS (Lucide-style, brand compliant)
// ============================================================================

const ICONS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
  speaker:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M2 12h2"/><path d="M20 12h2"/></svg>',
  sparkles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
};

// ============================================================================
// STATE
// ============================================================================

let modal: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let currentState: EnrollmentState = 'idle';
let progress: EnrollmentProgress | null = null;
let audioLevel = 0;
let animationFrame: number | null = null;
let options: VoiceEnrollmentOptions = {};

/**
 * Get current enrollment UI state (for dev tools)
 */
export function getEnrollmentDebugState(): {
  currentState: EnrollmentState;
  audioLevel: number;
  progress: EnrollmentProgress | null;
} {
  return { currentState, audioLevel, progress };
}

// ============================================================================
// ENROLLMENT PROMPTS - Different phrases for each sample
// ============================================================================

const ENROLLMENT_PROMPTS = [
  "Say anything that comes to mind - maybe what you had for breakfast?",
  "Tell me about your favorite place to relax.",
  "Describe something that made you smile recently.",
  "What's a hobby you enjoy or want to try?",
  "Share a fun fact about yourself.",
];

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initVoiceEnrollmentUI(): void {
  cleanupOrphanedElements();
  injectStyles();
  log.debug('VoiceEnrollmentUI initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.voice-enrollment-modal').forEach((el) => el.remove());
  document.querySelectorAll('#voice-enrollment-styles').forEach((el) => el.remove());
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('voice-enrollment-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'voice-enrollment-styles';
  styleElement.textContent = `
    .voice-enrollment-modal {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--z-tooltip);
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
                  visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .voice-enrollment-modal--visible {
      opacity: 1;
      visibility: visible;
    }
    
    .voice-enrollment-backdrop {
      position: absolute;
      inset: 0;
      background: var(--glass-backdrop-bg, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
    }

    .voice-enrollment-card {
      position: relative;
      /* Glass modal styling */
      background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      border-radius: var(--radius-xl, 20px);
      box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
      max-width: clamp(336px, 90vw, 480px);
      width: calc(100% - 48px);
      max-height: calc(100vh - 48px);
      overflow: hidden;
      transform: scale(0.9) translateY(20px);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }

    @supports not (backdrop-filter: blur(1px)) {
      .voice-enrollment-card {
        background: var(--color-background-elevated, #FFFDFB);
      }
    }
    
    .voice-enrollment-modal--visible .voice-enrollment-card {
      transform: scale(1) translateY(0);
    }
    
    .voice-enrollment-header {
      padding: 24px 24px 16px;
      border-bottom: 1px solid var(--color-border-subtle, rgba(0,0,0,0.08));
      position: relative;
    }
    
    .voice-enrollment-eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
      margin-bottom: 4px;
    }
    
    .voice-enrollment-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
      font-size: 22px;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0;
    }
    
    .voice-enrollment-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 32px;
      height: 32px;
      border: none;
      background: var(--color-background-subtle, rgba(0,0,0,0.05));
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary, #5a5a5a);
      transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                  color ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .voice-enrollment-close:hover {
      background: var(--color-background-hover, rgba(0,0,0,0.1));
      color: var(--color-text-primary, #2C2520);
    }
    
    .voice-enrollment-close svg {
      width: 18px;
      height: 18px;
    }
    
    .voice-enrollment-content {
      padding: 24px;
    }
    
    .voice-enrollment-description {
      font-size: 15px;
      line-height: 1.6;
      color: var(--color-text-secondary, #5a5a5a);
      margin: 0 0 24px;
    }
    
    /* Recording visualizer */
    .voice-enrollment-visualizer {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 160px;
      margin-bottom: 24px;
    }
    
    .voice-enrollment-mic-container {
      position: relative;
      width: min(100px, 100%);
      height: 100px;
    }
    
    .voice-enrollment-mic-pulse {
      position: absolute;
      inset: -20px;
      border-radius: 50%;
      background: var(--persona-primary, #4a6741);
      opacity: 0;
      transform: scale(0.8);
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .voice-enrollment-mic-pulse--active {
      opacity: 0.15;
      animation: mic-pulse 1.5s infinite;
    }
    
    @keyframes mic-pulse {
      0%, 100% { transform: scale(0.9); opacity: 0.15; }
      50% { transform: scale(1.1); opacity: 0.25; }
    }
    
    .voice-enrollment-mic-circle {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: var(--persona-primary, #4a6741);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: transform ${DURATION.FAST}ms ${EASING.SPRING},
                  box-shadow ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .voice-enrollment-mic-circle--recording {
      box-shadow: 0 0 0 8px var(--color-utility-focus-ring-subtle);
    }
    
    .voice-enrollment-mic-circle svg {
      width: 40px;
      height: 40px;
    }
    
    /* Audio level indicator */
    .voice-enrollment-level {
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      border: 3px solid var(--persona-primary, #4a6741);
      opacity: 0;
      transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .voice-enrollment-level--active {
      opacity: 1;
    }
    
    /* Progress indicator */
    .voice-enrollment-progress {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 24px;
    }
    
    .voice-enrollment-progress-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--color-background-subtle, rgba(0,0,0,0.1));
      transition: background ${DURATION.NORMAL}ms ${EASING.STANDARD},
                  transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .voice-enrollment-progress-dot--complete {
      background: var(--persona-primary, #4a6741);
      transform: scale(1.1);
    }
    
    .voice-enrollment-progress-dot--current {
      background: var(--persona-primary, #4a6741);
      animation: dot-pulse 1s infinite;
    }
    
    @keyframes dot-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.3); }
    }
    
    /* Prompt text */
    .voice-enrollment-prompt {
      text-align: center;
      font-size: 14px;
      color: var(--color-text-secondary, #5a5a5a);
      min-height: 40px;
      margin-bottom: 16px;
    }
    
    .voice-enrollment-prompt em {
      font-style: italic;
      color: var(--color-text-muted, #8a8a8a);
    }
    
    /* Timer */
    .voice-enrollment-timer {
      text-align: center;
      font-size: 32px;
      font-weight: 300;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      color: var(--color-text-secondary);
      margin-bottom: 24px;
      opacity: 0;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .voice-enrollment-timer--visible {
      opacity: 1;
    }
    
    /* Quality indicator */
    .voice-enrollment-quality {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
      font-size: 13px;
      color: var(--color-text-muted, #8a8a8a);
      margin-bottom: 16px;
    }
    
    .voice-enrollment-quality-bar {
      width: min(100px, 100%);
      height: 4px;
      background: var(--color-background-subtle, rgba(0,0,0,0.1));
      border-radius: 2px;
      overflow: hidden;
    }
    
    .voice-enrollment-quality-fill {
      height: 100%;
      background: var(--persona-primary, #4a6741);
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    /* Buttons */
    .voice-enrollment-actions {
      display: flex;
      gap: 12px;
    }
    
    .voice-enrollment-btn {
      flex: 1;
      padding: 14px 20px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      border: none;
    }
    
    .voice-enrollment-btn--primary {
      background: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .voice-enrollment-btn--primary:hover:not(:disabled) {
      background: var(--persona-secondary, #3d5a35);
      transform: translateY(-1px);
    }
    
    .voice-enrollment-btn--primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .voice-enrollment-btn--secondary {
      background: var(--color-background-subtle, rgba(0,0,0,0.05));
      color: var(--color-text-secondary, #5a5a5a);
    }
    
    .voice-enrollment-btn--secondary:hover {
      background: var(--color-background-hover, rgba(0,0,0,0.1));
    }
    
    .voice-enrollment-btn--danger {
      background: transparent;
      color: var(--color-destructive, #a65a52);
    }
    
    .voice-enrollment-btn--danger:hover {
      background: rgba(166, 90, 82, 0.1);
    }
    
    /* Status messages */
    .voice-enrollment-status {
      text-align: center;
      padding: 40px 20px;
    }
    
    .voice-enrollment-status-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 16px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .voice-enrollment-status-icon--success {
      background: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .voice-enrollment-status-icon--error {
      background: var(--color-destructive, #a65a52);
      color: white;
    }
    
    .voice-enrollment-status-icon--info {
      background: var(--color-warning, #b8956a);
      color: white;
    }
    
    .voice-enrollment-status-icon svg {
      width: 32px;
      height: 32px;
    }
    
    .voice-enrollment-status-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 8px;
    }
    
    .voice-enrollment-status-message {
      font-size: 14px;
      color: var(--color-text-secondary, #5a5a5a);
      margin: 0 0 24px;
    }
    
    /* Already enrolled view */
    .voice-enrollment-enrolled {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
    }
    
    .voice-enrollment-enrolled-stats {
      display: flex;
      gap: 24px;
      margin-bottom: 24px;
    }
    
    .voice-enrollment-stat {
      text-align: center;
    }
    
    .voice-enrollment-stat-value {
      font-size: 24px;
      font-weight: 600;
      color: var(--color-text-secondary);
    }
    
    .voice-enrollment-stat-label {
      font-size: 12px;
      color: var(--color-text-muted, #8a8a8a);
    }
  `;
  document.head.appendChild(styleElement);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the voice enrollment modal.
 */
export async function showVoiceEnrollmentModal(opts: VoiceEnrollmentOptions = {}): Promise<void> {
  options = opts;
  cleanupOrphanedElements();

  currentState = 'checking';
  modal = createModal();
  document.body.appendChild(modal);

  // Animate in
  requestAnimationFrame(() => {
    modal?.classList.add('voice-enrollment-modal--visible');
  });

  // Check system status and profile
  await checkStatusAndProfile();
}

/**
 * Hide the enrollment modal.
 */
export function hideVoiceEnrollmentModal(): void {
  if (!modal) return;

  // Cancel any in-progress enrollment
  void getVoiceAuthService().cancelEnrollment();

  // Stop animation frame
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  modal.classList.remove('voice-enrollment-modal--visible');

  trackedTimeout(() => {
    modal?.remove();
    modal = null;
    currentState = 'idle';
    progress = null;
  }, DURATION.SLOW);
}

/**
 * Quick check if user is already enrolled.
 */
export async function isEnrolled(): Promise<boolean> {
  const profile = await getVoiceAuthService().getProfile();
  return profile.enrolled;
}

// ============================================================================
// MODAL CREATION
// ============================================================================

function createModal(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'voice-enrollment-modal';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'voice-enrollment-title');

  container.innerHTML = `
    <div class="voice-enrollment-backdrop"></div>
    <div class="voice-enrollment-card">
      <div class="voice-enrollment-header">
        <p class="voice-enrollment-eyebrow">VOICE RECOGNITION</p>
        <h2 class="voice-enrollment-title" id="voice-enrollment-title">Let me learn your voice</h2>
        <button class="voice-enrollment-close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </div>
      <div class="voice-enrollment-content" id="voice-enrollment-content">
        ${renderCheckingState()}
      </div>
    </div>
  `;

  // Event listeners
  const backdrop = container.querySelector('.voice-enrollment-backdrop');
  const closeBtn = container.querySelector('.voice-enrollment-close');

  backdrop?.addEventListener('click', handleCancel);
  closeBtn?.addEventListener('click', handleCancel);

  return container;
}

// ============================================================================
// STATE RENDERERS
// ============================================================================

function renderCheckingState(): string {
  return `
    <div class="voice-enrollment-status">
      <div class="voice-enrollment-status-icon voice-enrollment-status-icon--info">
        ${ICONS.speaker}
      </div>
      <h3 class="voice-enrollment-status-title">Checking voice system...</h3>
      <p class="voice-enrollment-status-message">One moment while we set things up.</p>
    </div>
  `;
}

function renderNotAvailableState(): string {
  return `
    <div class="voice-enrollment-status">
      <div class="voice-enrollment-status-icon voice-enrollment-status-icon--error">
        ${ICONS.alert}
      </div>
      <h3 class="voice-enrollment-status-title">Voice recognition unavailable</h3>
      <p class="voice-enrollment-status-message">
        Voice authentication isn't available right now. 
        This may be a temporary issue—please try again later.
      </p>
      <div class="voice-enrollment-actions" role="button" tabindex="0">
        <button aria-label="Got it" class="voice-enrollment-btn voice-enrollment-btn--secondary" id="btn-close">
          Got it
        </button>
      </div>
    </div>
  `;
}

function renderAlreadyEnrolledState(profile: VoiceProfile): string {
  const enrolledDate = profile.enrolledAt
    ? new Date(profile.enrolledAt).toLocaleDateString()
    : 'Unknown';
  const quality = Math.round((profile.qualityScore ?? 0) * 100);

  return `
    <div class="voice-enrollment-enrolled">
      <div class="voice-enrollment-status-icon voice-enrollment-status-icon--success">
        ${ICONS.check}
      </div>
      <h3 class="voice-enrollment-status-title">I already know your voice!</h3>
      <p class="voice-enrollment-status-message">
        You enrolled on ${enrolledDate}. Your voiceprint is ${quality}% quality.
      </p>
      
      <div class="voice-enrollment-enrolled-stats">
        <div class="voice-enrollment-stat">
          <div class="voice-enrollment-stat-value">${profile.sampleCount ?? 0}</div>
          <div class="voice-enrollment-stat-label">Samples</div>
        </div>
        <div class="voice-enrollment-stat">
          <div class="voice-enrollment-stat-value">${profile.verificationCount ?? 0}</div>
          <div class="voice-enrollment-stat-label">Verifications</div>
        </div>
      </div>
      
      <div class="voice-enrollment-actions" role="button" tabindex="0">
        <button aria-label="Delete" class="voice-enrollment-btn voice-enrollment-btn--danger" id="btn-delete">
          ${ICONS.trash} Delete voiceprint
        </button>
        <button aria-label="Done" class="voice-enrollment-btn voice-enrollment-btn--secondary" id="btn-close">
          Done
        </button>
      </div>
    </div>
  `;
}

function renderReadyState(): string {
  return `
    <p class="voice-enrollment-description">
      I'll learn to recognize your voice so I can greet you personally and 
      remember our conversations better. Just speak naturally for a few seconds 
      when prompted.
    </p>
    
    <div class="voice-enrollment-visualizer">
      <div class="voice-enrollment-mic-container">
        <div class="voice-enrollment-mic-pulse"></div>
        <div class="voice-enrollment-mic-circle">
          ${ICONS.mic}
        </div>
        <div class="voice-enrollment-level"></div>
      </div>
    </div>
    
    <div class="voice-enrollment-progress" id="progress-dots">
      ${renderProgressDots(0, 5)}
    </div>
    
    <div class="voice-enrollment-actions" role="button" tabindex="0">
      <button aria-label="Maybe later" class="voice-enrollment-btn voice-enrollment-btn--secondary" id="btn-cancel">
        Maybe later
      </button>
      <button aria-label="Start enrollment" class="voice-enrollment-btn voice-enrollment-btn--primary" id="btn-start">
        Start enrollment
      </button>
    </div>
  `;
}

function renderRecordingState(sampleIndex: number, total: number): string {
  const prompt = ENROLLMENT_PROMPTS[sampleIndex % ENROLLMENT_PROMPTS.length];

  return `
    <div class="voice-enrollment-prompt">
      <em>${prompt}</em>
    </div>
    
    <div class="voice-enrollment-visualizer">
      <div class="voice-enrollment-mic-container">
        <div class="voice-enrollment-mic-pulse voice-enrollment-mic-pulse--active"></div>
        <div class="voice-enrollment-mic-circle voice-enrollment-mic-circle--recording">
          ${ICONS.mic}
        </div>
        <div class="voice-enrollment-level voice-enrollment-level--active" id="audio-level"></div>
      </div>
    </div>
    
    <div class="voice-enrollment-timer voice-enrollment-timer--visible" id="timer">
      3.0s
    </div>
    
    <div class="voice-enrollment-progress" id="progress-dots">
      ${renderProgressDots(sampleIndex, total)}
    </div>
    
    <div class="voice-enrollment-quality">
      <span>Quality:</span>
      <div class="voice-enrollment-quality-bar">
        <div class="voice-enrollment-quality-fill" id="quality-fill" style="width: ${(progress?.quality ?? 0) * 100}%"></div>
      </div>
    </div>
    
    <p class="voice-enrollment-description" style="text-align: center; margin-top: 16px;">
      Recording sample ${sampleIndex + 1} of ${total}...
    </p>
  `;
}

function renderProcessingState(): string {
  return `
    <div class="voice-enrollment-status">
      <div class="voice-enrollment-status-icon voice-enrollment-status-icon--info">
        ${ICONS.speaker}
      </div>
      <h3 class="voice-enrollment-status-title">Creating your voiceprint...</h3>
      <p class="voice-enrollment-status-message">
        Just a moment while I learn to recognize you.
      </p>
    </div>
  `;
}

function renderCompleteState(): string {
  return `
    <div class="voice-enrollment-status">
      <div class="voice-enrollment-status-icon voice-enrollment-status-icon--success">
        ${ICONS.sparkles}
      </div>
      <h3 class="voice-enrollment-status-title">I'll remember your voice!</h3>
      <p class="voice-enrollment-status-message">
        Now I can recognize you and remember our conversations better. 
        It's like you've become a familiar friend.
      </p>
      <div class="voice-enrollment-actions" role="button" tabindex="0">
        <button aria-label="Let's talk!" class="voice-enrollment-btn voice-enrollment-btn--primary" id="btn-done">
          Let's talk!
        </button>
      </div>
    </div>
  `;
}

function renderErrorState(message: string): string {
  return `
    <div class="voice-enrollment-status">
      <div class="voice-enrollment-status-icon voice-enrollment-status-icon--error">
        ${ICONS.alert}
      </div>
      <h3 class="voice-enrollment-status-title">Something went wrong</h3>
      <p class="voice-enrollment-status-message">${message}</p>
      <div class="voice-enrollment-actions" role="button" tabindex="0">
        <button aria-label="Try again" class="voice-enrollment-btn voice-enrollment-btn--secondary" id="btn-retry">
          Try again
        </button>
        <button aria-label="Close" class="voice-enrollment-btn voice-enrollment-btn--secondary" id="btn-close">
          Close
        </button>
      </div>
    </div>
  `;
}

function renderProgressDots(current: number, total: number): string {
  let html = '';
  for (let i = 0; i < total; i++) {
    let className = 'voice-enrollment-progress-dot';
    if (i < current) {
      className += ' voice-enrollment-progress-dot--complete';
    } else if (i === current) {
      className += ' voice-enrollment-progress-dot--current';
    }
    html += `<div class="${className}"></div>`;
  }
  return html;
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

async function checkStatusAndProfile(): Promise<void> {
  const voiceAuth = getVoiceAuthService();

  try {
    // Check system status
    const status = await voiceAuth.getStatus();
    if (!status.available || !status.features.enrollment) {
      setState('not_available');
      return;
    }

    // Check if already enrolled
    const profile = await voiceAuth.getProfile();
    if (profile.enrolled) {
      setState('already_enrolled', profile);
      return;
    }

    // Ready to enroll
    setState('ready');
  } catch (error) {
    log.error('Failed to check status:', error);
    setState('error', "Couldn't connect to voice system. Try again?");
  }
}

function setState(state: EnrollmentState, data?: unknown): void {
  currentState = state;
  const content = modal?.querySelector('#voice-enrollment-content');
  if (!content) return;

  switch (state) {
    case 'checking':
      content.innerHTML = renderCheckingState();
      break;
    case 'not_available':
      content.innerHTML = renderNotAvailableState();
      attachButtonListeners();
      break;
    case 'already_enrolled':
      content.innerHTML = renderAlreadyEnrolledState(data as VoiceProfile);
      attachButtonListeners();
      break;
    case 'ready':
      content.innerHTML = renderReadyState();
      attachButtonListeners();
      break;
    case 'recording': {
      const { sampleIndex, total } = data as { sampleIndex: number; total: number };
      content.innerHTML = renderRecordingState(sampleIndex, total);
      break;
    }
    case 'processing':
      content.innerHTML = renderProcessingState();
      break;
    case 'complete':
      content.innerHTML = renderCompleteState();
      attachButtonListeners();
      break;
    case 'error':
      content.innerHTML = renderErrorState(data as string);
      attachButtonListeners();
      break;
  }
}

function attachButtonListeners(): void {
  const btnStart = modal?.querySelector('#btn-start');
  const btnCancel = modal?.querySelector('#btn-cancel');
  const btnClose = modal?.querySelector('#btn-close');
  const btnDone = modal?.querySelector('#btn-done');
  const btnRetry = modal?.querySelector('#btn-retry');
  const btnDelete = modal?.querySelector('#btn-delete');

  btnStart?.addEventListener('click', () => { void handleStartEnrollment(); });
  btnCancel?.addEventListener('click', handleCancel);
  btnClose?.addEventListener('click', handleCancel);
  btnDone?.addEventListener('click', handleComplete);
  btnRetry?.addEventListener('click', () => { void handleRetry(); });
  btnDelete?.addEventListener('click', () => { void handleDeleteProfile(); });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleCancel(): void {
  options.onCancel?.();
  hideVoiceEnrollmentModal();
}

async function handleStartEnrollment(): Promise<void> {
  const voiceAuth = getVoiceAuthService();

  try {
    // Start enrollment session
    const result = await voiceAuth.startEnrollment(5);
    if (!result.success) {
      setState('error', result.error || 'Failed to start enrollment');
      return;
    }

    const requiredSamples = result.requiredSamples ?? 5;
    progress = { collected: 0, required: requiredSamples, quality: 0, status: 'collecting' };

    // Record samples one by one
    for (let i = 0; i < requiredSamples; i++) {
      setState('recording', { sampleIndex: i, total: requiredSamples });

      // Record with progress callback
      const sampleResult = await voiceAuth.recordEnrollmentSample(3, (elapsed, level) => {
        updateRecordingUI(elapsed, level, 3);
      });

      if (!sampleResult.success) {
        // Show error but allow retry
        toast.warning(sampleResult.message || "Didn't catch that. One more time?");
        i--; // Retry this sample
        continue;
      }

      progress = sampleResult.progress ?? progress;

      // Update progress dots
      const dotsContainer = modal?.querySelector('#progress-dots');
      if (dotsContainer) {
        dotsContainer.innerHTML = renderProgressDots(progress.collected, progress.required);
      }

      // Small delay between samples
      if (i < requiredSamples - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
    }

    // Complete enrollment
    setState('processing');
    const completeResult = await voiceAuth.completeEnrollment();

    if (!completeResult.success) {
      setState('error', completeResult.error || 'Failed to complete enrollment');
      return;
    }

    // Success!
    setState('complete');
    toast.success("Got it! I'll know your voice now.");

    // Notify callback
    if (completeResult.profile) {
      options.onComplete?.({
        enrolled: true,
        qualityScore: completeResult.profile.qualityScore,
        sampleCount: completeResult.profile.sampleCount,
      });
    }
  } catch (error) {
    log.error('Enrollment failed:', error);
    setState('error', "Something went wrong. Try again?");
  }
}

function updateRecordingUI(elapsed: number, level: number, duration: number): void {
  audioLevel = level;

  // Update timer
  const timer = modal?.querySelector('#timer');
  if (timer) {
    const remaining = Math.max(0, duration - elapsed);
    timer.textContent = `${remaining.toFixed(1)}s`;
  }

  // Update audio level indicator
  const levelIndicator = modal?.querySelector('#audio-level') as HTMLElement;
  if (levelIndicator) {
    const scale = 1 + level * 0.3;
    levelIndicator.style.transform = `scale(${scale})`;
    levelIndicator.style.opacity = String(0.3 + level * 0.7);
  }

  // Update mic circle scale
  const micCircle = modal?.querySelector('.voice-enrollment-mic-circle') as HTMLElement;
  if (micCircle) {
    const scale = 1 + level * 0.1;
    micCircle.style.transform = `scale(${scale})`;
  }
}

async function handleDeleteProfile(): Promise<void> {
  const voiceAuth = getVoiceAuthService();

  // Confirm deletion
  if (!confirm('Are you sure you want to delete your voiceprint? You can re-enroll anytime.')) {
    return;
  }

  const success = await voiceAuth.deleteProfile();
  if (success) {
    toast.success('Voice profile cleared');
    setState('ready');
  } else {
    toast.error("Couldn't delete that. Try again?");
  }
}

function handleComplete(): void {
  hideVoiceEnrollmentModal();
}

async function handleRetry(): Promise<void> {
  await checkStatusAndProfile();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const voiceEnrollment = {
  show: showVoiceEnrollmentModal,
  hide: hideVoiceEnrollmentModal,
  isEnrolled,
  init: initVoiceEnrollmentUI,
};

// Expose on window for debugging
if (typeof window !== 'undefined') {
  (window as unknown as { ferniVoiceEnrollment: typeof voiceEnrollment }).ferniVoiceEnrollment =
    voiceEnrollment;
}

