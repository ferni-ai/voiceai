/**
 * Team Unlock Celebration UI
 *
 * Beautiful, on-brand celebration when a new team member is unlocked.
 * This is a relationship milestone, not a gamified achievement.
 *
 * DESIGN PRINCIPLES:
 *   - Feels like Ferni introducing a friend, not "unlocking content"
 *   - Warm, centered modal with backdrop blur
 *   - Subtle animations that feel human
 *   - Typography hierarchy: eyebrow → title → message
 *   - No emoji, Lucide SVG icons only
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, STAGGER } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import {
  teamUnlockService,
  type TeamMemberConfig,
} from '../services/team-unlock.service.js';

const log = createLogger('TeamUnlockCelebration');

// ============================================================================
// ICONS (Lucide-style, brand compliant)
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

// ============================================================================
// PERSONA AVATARS (Simple, elegant initials)
// ============================================================================

const PERSONA_COLORS: Record<string, { bg: string; text: string }> = {
  'ferni': { bg: 'var(--persona-ferni-primary, #4a6741)', text: 'white' },
  'maya-santos': { bg: 'var(--persona-maya-primary, #a67a6a)', text: 'white' },
  'peter-john': { bg: 'var(--persona-peter-primary, #3a6b73)', text: 'white' },
  'alex-chen': { bg: 'var(--persona-alex-primary, #5a6b8a)', text: 'white' },
  'jordan-taylor': { bg: 'var(--persona-jordan-primary, #c4856a)', text: 'white' },
  'nayan-patel': { bg: 'var(--persona-nayan-primary, #9a7b5a)', text: 'white' },
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ============================================================================
// STATE
// ============================================================================

let celebrationModal: HTMLElement | null = null;
let styleElement: HTMLStyleElement | null = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the team unlock celebration system.
 * Subscribes to unlock events and shows celebrations.
 */
export function initTeamUnlockCelebration(): void {
  if (isInitialized) return;
  
  cleanupOrphanedElements();
  injectStyles();
  
  // Subscribe to unlock events
  teamUnlockService.onUnlock((member) => {
    log.info({ memberId: member.id }, 'Showing unlock celebration');
    showCelebration(member);
  });
  
  isInitialized = true;
  log.debug('Team unlock celebration initialized');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.team-unlock-celebration').forEach(el => el.remove());
  document.querySelectorAll('#team-unlock-celebration-styles').forEach(el => el.remove());
}

// ============================================================================
// CELEBRATION DISPLAY
// ============================================================================

/**
 * Show celebration for a newly unlocked team member.
 */
export function showCelebration(member: TeamMemberConfig): void {
  if (celebrationModal) {
    celebrationModal.remove();
  }
  
  celebrationModal = createCelebrationModal(member);
  document.body.appendChild(celebrationModal);
  
  // Animate in
  requestAnimationFrame(() => {
    celebrationModal?.classList.add('team-unlock-celebration--visible');
    animateCelebrationIn();
  });
  
  // Play subtle sound if available
  playUnlockSound();
}

/**
 * Hide the celebration modal.
 */
export function hideCelebration(): void {
  if (!celebrationModal) return;
  
  celebrationModal.classList.remove('team-unlock-celebration--visible');
  
  setTimeout(() => {
    celebrationModal?.remove();
    celebrationModal = null;
  }, DURATION.SLOW);
}

// ============================================================================
// MODAL CREATION
// ============================================================================

function createCelebrationModal(member: TeamMemberConfig): HTMLElement {
  const container = document.createElement('div');
  container.className = 'team-unlock-celebration';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'unlock-title');
  
  const colors = PERSONA_COLORS[member.id] ?? { bg: 'var(--persona-primary)', text: 'white' };
  const initials = getInitials(member.displayName);
  const isPremium = member.premium;
  
  container.innerHTML = `
    <div class="unlock-backdrop"></div>
    <div class="unlock-card">
      <button class="unlock-close" aria-label="${t('common.close')}">
        ${ICONS.close}
      </button>
      
      <!-- Floating sparkles background -->
      <div class="unlock-sparkles" aria-hidden="true">
        <span class="sparkle sparkle--1">${ICONS.sparkles}</span>
        <span class="sparkle sparkle--2">${ICONS.star}</span>
        <span class="sparkle sparkle--3">${ICONS.sparkles}</span>
      </div>
      
      <!-- Avatar with glow -->
      <div class="unlock-avatar-container">
        <div class="unlock-avatar-glow" style="background: ${colors.bg}"></div>
        <div class="unlock-avatar" style="background: ${colors.bg}; color: ${colors.text}">
          ${initials}
        </div>
        ${isPremium ? `<div class="unlock-badge">${ICONS.star}</div>` : ''}
      </div>
      
      <!-- Content -->
      <div class="unlock-content">
        <span class="unlock-eyebrow">
          ${isPremium ? 'A SPECIAL INTRODUCTION' : 'SOMEONE NEW'}
        </span>
        <h2 id="unlock-title" class="unlock-title">
          Meet ${member.displayName}
        </h2>
        <p class="unlock-role">${member.role}</p>
        <p class="unlock-message">
          ${member.introductionMessage}
        </p>
      </div>
      
      <!-- Action -->
      <div class="unlock-actions">
        <button class="unlock-button unlock-button--primary" data-action="meet">
          ${ICONS.heart}
          <span>Say Hello</span>
        </button>
        <button class="unlock-button unlock-button--secondary" data-action="later">
          Maybe Later
        </button>
      </div>
      
      <p class="unlock-footer">
        ${member.displayName} is now part of your team.
      </p>
    </div>
  `;
  
  // Event listeners
  const backdrop = container.querySelector('.unlock-backdrop');
  backdrop?.addEventListener('click', hideCelebration);
  
  const closeBtn = container.querySelector('.unlock-close');
  closeBtn?.addEventListener('click', hideCelebration);
  
  const meetBtn = container.querySelector('[data-action="meet"]');
  meetBtn?.addEventListener('click', () => {
    hideCelebration();
    // Trigger handoff to this persona
    window.dispatchEvent(new CustomEvent('ferni:switch-persona', { 
      detail: { personaId: member.id } 
    }));
  });
  
  const laterBtn = container.querySelector('[data-action="later"]');
  laterBtn?.addEventListener('click', hideCelebration);
  
  return container;
}

// ============================================================================
// ANIMATIONS
// ============================================================================

function animateCelebrationIn(): void {
  if (!celebrationModal) return;
  
  const card = celebrationModal.querySelector('.unlock-card');
  const avatar = celebrationModal.querySelector('.unlock-avatar-container');
  const content = celebrationModal.querySelector('.unlock-content');
  const actions = celebrationModal.querySelector('.unlock-actions');
  const sparkles = celebrationModal.querySelectorAll('.sparkle');
  
  // Card entrance
  if (card instanceof HTMLElement) {
    card.animate([
      { transform: 'scale(0.8) translateY(40px)', opacity: '0' },
      { transform: 'scale(1) translateY(0)', opacity: '1' },
    ], {
      duration: DURATION.DRAMATIC,
      easing: EASING.SPRING,
      fill: 'forwards',
    });
  }
  
  // Avatar with bounce
  if (avatar instanceof HTMLElement) {
    avatar.animate([
      { transform: 'scale(0)', opacity: '0' },
      { transform: 'scale(1.1)', opacity: '1' },
      { transform: 'scale(1)', opacity: '1' },
    ], {
      duration: DURATION.CELEBRATION,
      easing: EASING.SPRING,
      delay: DURATION.NORMAL,
      fill: 'forwards',
    });
  }
  
  // Content fade up
  if (content instanceof HTMLElement) {
    content.animate([
      { transform: 'translateY(20px)', opacity: '0' },
      { transform: 'translateY(0)', opacity: '1' },
    ], {
      duration: DURATION.DELIBERATE,
      easing: EASING.EXPO_OUT,
      delay: DURATION.SLOW,
      fill: 'forwards',
    });
  }
  
  // Actions fade in
  if (actions instanceof HTMLElement) {
    actions.animate([
      { opacity: '0' },
      { opacity: '1' },
    ], {
      duration: DURATION.SLOW,
      easing: EASING.GENTLE,
      delay: DURATION.DELIBERATE,
      fill: 'forwards',
    });
  }
  
  // Sparkles float
  sparkles.forEach((sparkle, i) => {
    if (sparkle instanceof HTMLElement) {
      sparkle.animate([
        { transform: 'translateY(0) rotate(0deg)', opacity: '0' },
        { transform: 'translateY(-20px) rotate(180deg)', opacity: '0.6' },
        { transform: 'translateY(-40px) rotate(360deg)', opacity: '0' },
      ], {
        duration: DURATION.GLACIAL,
        easing: EASING.GENTLE,
        delay: DURATION.NORMAL + (i * STAGGER.RELAXED),
        iterations: Infinity,
      });
    }
  });
}

// ============================================================================
// SOUND
// ============================================================================

function playUnlockSound(): void {
  try {
    // Create a subtle, warm unlock sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    
    // Create oscillators for a warm chord
    const notes = [261.63, 329.63, 392.00]; // C4, E4, G4 - C major chord
    
    notes.forEach((freq, i) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = freq;
      
      // Gentle attack and release
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1 + (i * 0.05));
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.8 + (i * 0.1));
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start(audioContext.currentTime + (i * 0.05));
      oscillator.stop(audioContext.currentTime + 1);
    });
  } catch {
    // Audio not available, silent fail
  }
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('team-unlock-celebration-styles')) return;
  
  styleElement = document.createElement('style');
  styleElement.id = 'team-unlock-celebration-styles';
  styleElement.textContent = `
    /* Team Unlock Celebration Modal */
    .team-unlock-celebration {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4, 16px);
      opacity: 0;
      pointer-events: none;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .team-unlock-celebration--visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    .unlock-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.7);
      backdrop-filter: blur(var(--glass-blur-strong));
      -webkit-backdrop-filter: blur(var(--glass-blur-strong));
    }
    
    .unlock-card {
      position: relative;
      background: var(--color-background-elevated, #FFFDFB);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: 
        0 25px 50px -12px rgba(0, 0, 0, 0.25),
        0 0 0 1px rgba(255, 255, 255, 0.1);
      max-width: 420px;
      width: 100%;
      padding: var(--space-8, 32px);
      text-align: center;
      overflow: hidden;
    }
    
    .unlock-close {
      position: absolute;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 36px;
      height: 36px;
      border: none;
      background: var(--color-background-secondary, #f5f3f0);
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-muted, #7a6f63);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      z-index: 10;
    }
    
    .unlock-close:hover {
      background: var(--color-background-tertiary, #ebe8e3);
      color: var(--color-text-primary, #2C2520);
    }
    
    .unlock-close svg {
      width: 18px;
      height: 18px;
    }
    
    /* Sparkles */
    .unlock-sparkles {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    
    .sparkle {
      position: absolute;
      color: var(--color-accent-text);
      opacity: 0;
    }
    
    .sparkle svg {
      width: 24px;
      height: 24px;
    }
    
    .sparkle--1 {
      top: 20%;
      left: 15%;
    }
    
    .sparkle--2 {
      top: 30%;
      right: 12%;
    }
    
    .sparkle--3 {
      bottom: 25%;
      left: 20%;
    }
    
    /* Avatar */
    .unlock-avatar-container {
      position: relative;
      width: 100px;
      height: 100px;
      margin: 0 auto var(--space-6, 24px);
      opacity: 0;
    }
    
    .unlock-avatar-glow {
      position: absolute;
      inset: -8px;
      border-radius: var(--radius-full, 9999px);
      opacity: 0.3;
      filter: blur(16px);
      animation: pulse-glow 2s ease-in-out infinite;
    }
    
    @keyframes pulse-glow {
      0%, 100% { transform: scale(1); opacity: 0.3; }
      50% { transform: scale(1.1); opacity: 0.5; }
    }
    
    .unlock-avatar {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    
    .unlock-badge {
      position: absolute;
      bottom: -4px;
      right: -4px;
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #f4d03f, #e6b800);
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 2px 8px rgba(230, 184, 0, 0.4);
    }
    
    .unlock-badge svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    
    /* Content */
    .unlock-content {
      opacity: 0;
      margin-bottom: var(--space-6, 24px);
    }
    
    .unlock-eyebrow {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--color-accent-text);
      margin-bottom: var(--space-2, 8px);
    }
    
    .unlock-title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
      line-height: 1.2;
    }
    
    .unlock-role {
      font-size: 1rem;
      font-weight: 500;
      color: var(--color-accent-text);
      margin: 0 0 var(--space-4, 16px);
    }
    
    .unlock-message {
      font-size: 0.95rem;
      line-height: 1.6;
      color: var(--color-text-secondary, #5a5048);
      margin: 0;
    }
    
    /* Actions */
    .unlock-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-4, 16px);
      opacity: 0;
    }
    
    .unlock-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2, 8px);
      padding: var(--space-3, 12px) var(--space-4, 16px);
      border-radius: var(--radius-lg, 12px);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .unlock-button svg {
      width: 18px;
      height: 18px;
    }
    
    .unlock-button--primary {
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
    }
    
    .unlock-button--primary:hover {
      background: var(--persona-secondary, #3d5a35);
      transform: translateY(-1px);
    }
    
    .unlock-button--primary:active {
      transform: translateY(0);
    }
    
    .unlock-button--secondary {
      background: transparent;
      color: var(--color-text-secondary, #5a5048);
      border: 2px solid var(--color-border, #d4d0c8);
    }
    
    .unlock-button--secondary:hover {
      background: var(--color-background-secondary, #faf8f5);
      border-color: var(--color-border-hover, #c4c0b8);
    }
    
    .unlock-footer {
      font-size: 0.8rem;
      color: var(--color-text-muted, #7a6f63);
      margin: 0;
    }
    
    /* Dark theme */
    @media (prefers-color-scheme: dark) {
      .unlock-backdrop {
        background: rgba(28, 24, 20, 0.85);
      }
      
      .unlock-card {
        background: var(--color-background-elevated, #3a3330);
      }
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .unlock-avatar-glow {
        animation: none;
      }
      
      .sparkle {
        display: none;
      }
    }
    
    /* Mobile */
    @media (max-width: 480px) {
      .unlock-card {
        padding: var(--space-6, 24px);
      }
      
      .unlock-avatar-container {
        width: 80px;
        height: 80px;
      }
      
      .unlock-avatar {
        font-size: 2rem;
      }
      
      .unlock-title {
        font-size: 1.5rem;
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const teamUnlockCelebration = {
  init: initTeamUnlockCelebration,
  show: showCelebration,
  hide: hideCelebration,
};

