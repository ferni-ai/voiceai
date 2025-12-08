/**
 * Dev Panel UI - Testing & Validation Tools
 *
 * A hidden developer panel for testing subscription, team unlocks,
 * and all persona interactions. Activated via keyboard shortcut or clicking DEV badge.
 *
 * KEYBOARD SHORTCUTS:
 *   Cmd/Ctrl + Shift + D → Toggle dev panel
 *   Cmd/Ctrl + Shift + U → Quick unlock all team members
 *   Cmd/Ctrl + Shift + 0 → Reset to free tier
 *
 * FEATURES:
 *   - Subscription tier switcher (instant)
 *   - Relationship stage override
 *   - Team member unlock state viewer
 *   - Celebration triggers for testing
 *   - Usage reset
 *   - Agent handoff tester
 */

import type { VoiceEmotion } from '@design-system/tokens';
import { DURATION, EASING } from '../config/animation-constants.js';
import {
  relationshipStageService,
  STAGE_NAMES,
  type RelationshipStage,
} from '../services/relationship-stage.service.js';
import { rosterPreferences } from '../services/roster-preferences.service.js';
import {
  TEAM_MEMBERS,
  teamUnlockService,
  type TeamMemberId,
} from '../services/team-unlock.service.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import { avatarFeedback } from './avatar-feedback.ui.js';
// Disabled: Eye animations removed - keeping just zen blink
// import { ferniEye } from './ferni-eye.ui.js';
import { presenceUI } from './presence.ui.js';
import { teamUnlockCelebration } from './team-unlock-celebration.ui.js';

// Soul system imports
import {
  celebrationBurst,
  empathyPulse,
  makeAvatarLookAround,
  pauseAllEyeTracking,
  revealAvatarEye,
  showFirstLaunchExperience,
} from './soul.ui.js';

// Pixar emotions system
import {
  initPixarEmotions,
  pixarEmotions,
  type AdvancedReaction,
  type EmotionalExpression,
} from './pixar-emotions.ui.js';

// Weather effects
import {
  getCurrentSeason,
  getCurrentWeather,
  playSeasonalMoment,
  startWeather,
  stopWeather,
  type WeatherType,
} from './weather-effects.ui.js';

// Ferni Moments - Pixar-style character expressions
import { ferniMoments, type MomentType } from './ferni-moments.ui.js';

// Narrative System - Story beats and arcs
import {
  getJourney,
  getSessionStats,
  triggerTestArc,
  triggerTestBeat,
  type StoryBeat,
} from '../narrative/index.js';

const log = createLogger('DevPanel');

// ============================================================================
// CONFIG
// ============================================================================

// Check if we're in dev mode
const isDevEnvironment = (): boolean => {
  try {
    // Vite sets these environment variables
    const env = (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env;
    return env?.DEV === true || env?.MODE === 'development';
  } catch {
    return false;
  }
};

// Admin key for production dev panel access
// Configure via environment variables:
//   VITE_DEV_PANEL_KEY  - The secret key required for access (default: 'ferni2024')
//   VITE_DEV_PANEL_AUTO - Set to 'true' to auto-enable dev panel (for admin deployments)
const getEnvConfig = () => {
  try {
    const env = (
      import.meta as {
        env?: {
          VITE_DEV_PANEL_KEY?: string;
          VITE_DEV_PANEL_AUTO?: string;
        };
      }
    ).env;
    return {
      adminKey: env?.VITE_DEV_PANEL_KEY || 'ferni2024',
      autoEnable: env?.VITE_DEV_PANEL_AUTO === 'true',
    };
  } catch {
    return { adminKey: 'ferni2024', autoEnable: false };
  }
};

const ENV_CONFIG = getEnvConfig();

const checkAdminAccess = (): boolean => {
  // Auto-enable if VITE_DEV_PANEL_AUTO=true is set in .env
  // Useful for admin/staging deployments where you always want dev tools
  if (ENV_CONFIG.autoEnable) {
    return true;
  }

  // Check URL parameter with key
  const urlParams = new URLSearchParams(window.location.search);
  const urlKey = urlParams.get('dev');
  if (urlKey && urlKey === ENV_CONFIG.adminKey) {
    // Store it so they don't need to pass it every time
    localStorage.setItem('ferni_admin_key', urlKey);
    return true;
  }

  // Check stored admin key
  const storedKey = localStorage.getItem('ferni_admin_key');
  if (storedKey === ENV_CONFIG.adminKey) {
    return true;
  }

  // Legacy check for simple dev mode flag (still works in dev environment)
  if (isDevEnvironment()) {
    return localStorage.getItem('ferni_dev_mode') === 'true' || urlParams.has('dev');
  }

  return false;
};

const DEV_MODE_ENABLED = isDevEnvironment() || checkAdminAccess();

// ============================================================================
// ICONS (Lucide-style)
// ============================================================================

const ICONS = {
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  unlock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  sparkles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  drama:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  music:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  gamepad:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  messageCircle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  palmtree:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35z"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/></svg>',
  headphones:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>',
  barChart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
};

// ============================================================================
// STATE
// ============================================================================

let panel: HTMLElement | null = null;
let isVisible = false;
let styleElement: HTMLStyleElement | null = null;

// Override state for testing
let tierOverride: 'free' | 'friend' | 'partner' | null = null;
let stageOverride: RelationshipStage | null = null;
let conversationsOverride: number | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initDevPanel(): void {
  if (!DEV_MODE_ENABLED) {
    log.debug('Dev mode not enabled');
    return;
  }

  cleanupOrphanedElements();
  injectStyles();
  setupKeyboardShortcuts();

  // Show dev indicator
  showDevIndicator();

  log.info('Dev panel initialized (Cmd/Ctrl+Shift+D to open)');
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.dev-panel').forEach((el) => el.remove());
  document.querySelectorAll('.dev-indicator').forEach((el) => el.remove());
  document.querySelectorAll('#dev-panel-styles').forEach((el) => el.remove());
}

function showDevIndicator(): void {
  const indicator = document.createElement('button');
  indicator.className = 'dev-indicator';
  indicator.type = 'button';
  indicator.innerHTML = `${ICONS.code} DEV`;
  indicator.title = 'Click to open dev panel (or Cmd/Ctrl+Shift+D)';
  indicator.setAttribute('aria-label', 'Open dev panel');
  indicator.addEventListener('click', togglePanel);
  document.body.appendChild(indicator);
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    // Only handle if Cmd/Ctrl + Shift is pressed
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;

    // Use e.code for reliable key detection (ignores shift state)
    const code = e.code;

    // Cmd/Ctrl + Shift + D → Toggle panel
    if (code === 'KeyD') {
      e.preventDefault();
      e.stopPropagation();
      togglePanel();
      return;
    }

    // Cmd/Ctrl + Shift + U → Quick unlock all
    if (code === 'KeyU') {
      e.preventDefault();
      e.stopPropagation();
      quickUnlockAll();
      return;
    }

    // Cmd/Ctrl + Shift + R → Reset to free (avoid browser refresh conflict)
    // Changed to Cmd/Ctrl + Shift + 0 for safety
    if (code === 'Digit0') {
      e.preventDefault();
      e.stopPropagation();
      resetToFree();
      return;
    }
  });
}

// ============================================================================
// PANEL MANAGEMENT
// ============================================================================

export function togglePanel(): void {
  if (isVisible) {
    hidePanel();
  } else {
    showPanel();
  }
}

export function showPanel(): void {
  if (!DEV_MODE_ENABLED) return;

  if (panel) panel.remove();

  panel = createPanel();
  document.body.appendChild(panel);

  requestAnimationFrame(() => {
    panel?.classList.add('dev-panel--visible');
  });

  isVisible = true;
}

export function hidePanel(): void {
  if (!panel) return;

  panel.classList.remove('dev-panel--visible');
  setTimeout(() => {
    panel?.remove();
    panel = null;
  }, DURATION.SLOW);

  isVisible = false;
}

// ============================================================================
// PANEL CREATION
// ============================================================================

function createPanel(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'dev-panel';

  const state = appState.getState();
  const metrics = relationshipStageService.getMetrics();
  const stage = stageOverride ?? relationshipStageService.getStage();
  const tier = tierOverride ?? 'free';

  container.innerHTML = `
    <div class="dev-panel__header">
      <div class="dev-panel__title">
        ${ICONS.code}
        <span>Ferni Dev Tools</span>
      </div>
      <button class="dev-panel__close" aria-label="Close">${ICONS.close}</button>
    </div>
    
    <div class="dev-panel__content">
      <!-- Current State -->
      <section class="dev-section">
        <h3 class="dev-section__title">Current State</h3>
        <div class="dev-info-grid">
          <div class="dev-info">
            <span class="dev-info__label">Device ID</span>
            <span class="dev-info__value">${state.deviceId?.slice(0, 12)}...</span>
          </div>
          <div class="dev-info">
            <span class="dev-info__label">Conversations</span>
            <span class="dev-info__value">${conversationsOverride ?? metrics.totalConversations}</span>
          </div>
          <div class="dev-info">
            <span class="dev-info__label">Days</span>
            <span class="dev-info__value">${metrics.daysSinceFirstMeeting}</span>
          </div>
          <div class="dev-info">
            <span class="dev-info__label">Streak</span>
            <span class="dev-info__value">${metrics.currentStreak}</span>
          </div>
        </div>
      </section>
      
      <!-- Subscription Tier -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.zap} Subscription Tier</h3>
        <div class="dev-tier-buttons">
          <button class="dev-tier-btn ${tier === 'free' ? 'dev-tier-btn--active' : ''}" data-tier="free">
            Free
          </button>
          <button class="dev-tier-btn ${tier === 'friend' ? 'dev-tier-btn--active' : ''}" data-tier="friend">
            Friend ($9.99)
          </button>
          <button class="dev-tier-btn ${tier === 'partner' ? 'dev-tier-btn--active' : ''}" data-tier="partner">
            Partner ($19.99)
          </button>
        </div>
      </section>
      
      <!-- Relationship Stage -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.heart} Relationship Stage</h3>
        <div class="dev-stage-buttons">
          ${(
            [
              'first-meeting',
              'getting-started',
              'building-trust',
              'established',
              'deep-partnership',
            ] as RelationshipStage[]
          )
            .map(
              (s) => `
              <button class="dev-stage-btn ${stage === s ? 'dev-stage-btn--active' : ''}" data-stage="${s}">
                ${STAGE_NAMES[s]}
              </button>
            `
            )
            .join('')}
        </div>
      </section>
      
      <!-- Team Members -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.users} Team Members</h3>
        <div class="dev-team-grid">
          ${TEAM_MEMBERS.map((member) => {
            const status = teamUnlockService.getMemberStatus(member.id);
            return `
              <div class="dev-team-member ${status.unlocked ? 'dev-team-member--unlocked' : ''}">
                <div class="dev-team-member__info">
                  <span class="dev-team-member__name">${member.displayName}</span>
                  <span class="dev-team-member__role">${member.role}</span>
                </div>
                <div class="dev-team-member__status">
                  ${status.unlocked ? ICONS.unlock : ICONS.lock}
                </div>
                <button class="dev-team-member__celebrate" data-member="${member.id}" title="Test celebration">
                  ${ICONS.sparkles}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </section>
      
      <!-- Roster Preferences -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.users} Roster View</h3>
        <p class="dev-section__desc">Control which team members appear in roster</p>
        <div class="dev-roster-controls">
          <button class="dev-roster-btn ${rosterPreferences.getPreferences().showAllMembers ? 'dev-roster-btn--active' : ''}" data-roster="show-all">
            ${ICONS.users} Show All Members
          </button>
          <button class="dev-roster-btn" data-roster="show-minimal">
            ${ICONS.user} Minimal (Ferni Only)
          </button>
          <button class="dev-roster-btn" data-roster="reset">
            ${ICONS.refresh} Reset Preferences
          </button>
        </div>
      </section>
      
      <!-- Quick Actions -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.zap} Quick Actions</h3>
        <div class="dev-actions">
          <button class="dev-action-btn" data-action="unlock-all">
            ${ICONS.unlock} Unlock All Members
          </button>
          <button class="dev-action-btn" data-action="reset">
            ${ICONS.refresh} Reset Everything
          </button>
          <button class="dev-action-btn" data-action="add-conversations">
            + Add 5 Conversations
          </button>
          <button class="dev-action-btn" data-action="trigger-limit">
            Test Limit Modal
          </button>
          <button class="dev-action-btn" data-action="trigger-upgrade">
            Test Upgrade Modal
          </button>
        </div>
      </section>
      
      <!-- 🎮 Music Games -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.gamepad} Music Games</h3>
        <p class="dev-section__desc">Test music games and dashboard</p>
        <div class="dev-actions">
          <button class="dev-action-btn dev-action-btn--primary" data-game="dashboard">
            ${ICONS.barChart} Musical You Dashboard
          </button>
          <button class="dev-action-btn" data-game="name-that-tune">
            ${ICONS.music} Name That Tune
          </button>
          <button class="dev-action-btn" data-game="one-word-song">
            ${ICONS.messageCircle} One Word Song
          </button>
          <button class="dev-action-btn" data-game="desert-island">
            ${ICONS.palmtree} Desert Island Discs
          </button>
          <button class="dev-action-btn" data-game="this-or-that">
            ${ICONS.zap} This or That
          </button>
          <button class="dev-action-btn" data-game="mood-dj">
            ${ICONS.headphones} Mood DJ Challenge
          </button>
        </div>
      </section>
      
      <!-- 🌟 Soul & Delight -->
      <section class="dev-section dev-section--soul">
        <h3 class="dev-section__title">${ICONS.eye} Soul & Delight</h3>
        <p class="dev-section__desc">Delightful surprises that make Ferni feel alive</p>
        
        <!-- Core Soul Features -->
        <div class="dev-subsection">
          <span class="dev-label">✨ Core Magic</span>
          <div class="dev-soul-buttons">
            <button class="dev-soul-btn dev-soul-btn--primary" data-soul="eye-reveal" title="Avatar transforms into an eye">
              👁️ Eye Reveal
            </button>
            <button class="dev-soul-btn" data-soul="awakening" title="First launch experience">
              🌅 Awakening
            </button>
            <button class="dev-soul-btn" data-soul="look-around" title="Avatar looks around curiously">
              👀 Look Around
            </button>
          </div>
        </div>
        
        <!-- Reactions -->
        <div class="dev-subsection">
          <span class="dev-label">💫 Reactions</span>
          <div class="dev-soul-buttons">
            <button class="dev-soul-btn" data-soul="celebrate" title="Celebration burst">
              🎉 Celebrate
            </button>
            <button class="dev-soul-btn" data-soul="empathy" title="Empathy pulse">
              💙 Empathy
            </button>
            <button class="dev-soul-btn" data-soul="wink" title="Quick wink">
              😉 Wink
            </button>
            <button class="dev-soul-btn" data-soul="curious-tilt" title="Interested tilt">
              🤔 Curious Tilt
            </button>
          </div>
        </div>
        
        <!-- Ambient -->
        <div class="dev-subsection">
          <span class="dev-label">🌙 Ambient</span>
          <div class="dev-soul-buttons">
            <button class="dev-soul-btn" data-soul="pause-tracking" title="Pause eye tracking 3s">
              ⏸️ Pause Tracking
            </button>
            <button class="dev-soul-btn" data-soul="secret-smile" title="Avatar smiles secretly">
              😊 Secret Smile
            </button>
            <button class="dev-soul-btn" data-soul="sleepy" title="Late night yawn">
              😴 Sleepy
            </button>
          </div>
        </div>
        
        <!-- Ideas for Future -->
        <div class="dev-subsection">
          <span class="dev-label">💡 Ideas (Coming Soon)</span>
          <div class="dev-soul-ideas">
            <span>Connection Spark</span>
            <span>Heartbeat Glow</span>
            <span>Confetti Burst</span>
            <span>Attentive Lean</span>
          </div>
        </div>
      </section>
      
      <!-- Agent Tester -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.users} Handoff Tester</h3>
        <div class="dev-handoff-buttons">
          ${TEAM_MEMBERS.filter((m) => m.id !== 'ferni')
            .map(
              (member) => `
            <button class="dev-handoff-btn" data-persona="${member.id}">
              → ${member.displayName}
            </button>
          `
            )
            .join('')}
        </div>
      </section>
      
      <!-- Avatar Expression Tester -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.drama} Avatar Expressions</h3>
        <p class="dev-section__desc">Test Ferni's emotional animations</p>
        <div class="dev-expression-buttons">
          <button class="dev-expression-btn" data-expression="chuckle" title="For humor/jokes">
            😊 Chuckle
          </button>
          <button class="dev-expression-btn" data-expression="empathy" title="For sad moments">
            💙 Empathy
          </button>
          <button class="dev-expression-btn" data-expression="delight" title="For excitement">
            🎉 Delight
          </button>
          <button class="dev-expression-btn" data-expression="contemplate" title="For deep moments">
            🤔 Contemplate
          </button>
          <button class="dev-expression-btn" data-expression="encourage" title="For motivation">
            💪 Encourage
          </button>
          <button class="dev-expression-btn" data-expression="surprise" title="For revelations">
            😮 Surprise
          </button>
          <button class="dev-expression-btn" data-expression="settle" title="For calming">
            😌 Settle
          </button>
          <button class="dev-expression-btn" data-expression="blink" title="Zen blink">
            👁️ Blink
          </button>
        </div>
        <div class="dev-expression-buttons" style="margin-top: 8px;">
          <button class="dev-expression-btn dev-expression-btn--feedback" data-expression="success" title="Success feedback">
            ✓ Success
          </button>
          <button class="dev-expression-btn dev-expression-btn--feedback" data-expression="error" title="Error feedback">
            ✕ Error
          </button>
          <button class="dev-expression-btn dev-expression-btn--feedback" data-expression="warning" title="Warning feedback">
            ⚠ Warning
          </button>
          <button class="dev-expression-btn dev-expression-btn--feedback" data-expression="info" title="Info feedback">
            ℹ Info
          </button>
        </div>
        
        <!-- 🎉 NEW: Fun Micro-Reactions -->
        <p class="dev-section__desc" style="margin-top: 12px;">Fun Reactions (delightful avatar movements)</p>
        <div class="dev-expression-buttons">
          <button class="dev-expression-btn dev-expression-btn--reaction" data-reaction="happy" title="Bounce for good news">
            🥳 Happy
          </button>
          <button class="dev-expression-btn dev-expression-btn--reaction" data-reaction="curious" title="Tilt for 'tell me more'">
            🤨 Curious
          </button>
          <button class="dev-expression-btn dev-expression-btn--reaction" data-reaction="empathy" title="Nod for understanding">
            🫂 Empathy
          </button>
          <button class="dev-expression-btn dev-expression-btn--reaction" data-reaction="laugh" title="Wobble for humor">
            😂 Laugh
          </button>
          <button class="dev-expression-btn dev-expression-btn--reaction" data-reaction="surprise" title="Pop for wow moments">
            😲 Surprise
          </button>
        </div>
      </section>
      
      <!-- 🎬 NEW: Pixar Emotions - Advanced Eye Lid Expressions -->
      <section class="dev-section">
        <h3 class="dev-section__title">🎬 Pixar Emotions</h3>
        <p class="dev-section__desc">Eye lid expressions & advanced reactions</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Eye Lid Expressions</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="happy" title="Squinted, warm">😊 Happy</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="delighted" title="Happy + sparkle">✨ Delighted</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="surprised" title="Wide eyes">😲 Surprised</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="curious" title="Head tilt">🤔 Curious</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="skeptical" title="One brow up">🤨 Skeptical</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="worried" title="Angled brows">😟 Worried</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="sad" title="Droopy lids">😢 Sad</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="sleepy" title="Heavy lids">😴 Sleepy</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="thinking" title="Looking away">💭 Thinking</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="empathetic" title="Soft understanding">🫂 Empathetic</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="excited" title="Wide + sparkle">🎉 Excited</button>
            <button class="dev-expression-btn dev-expression-btn--pixar" data-pixar-expr="neutral" title="Reset to neutral">😐 Neutral</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Advanced Reactions</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--pixar-react" data-pixar-react="doubleTake" title="Look away → snap back">👀 Double-Take</button>
            <button class="dev-expression-btn dev-expression-btn--pixar-react" data-pixar-react="heldPose" title="Hold at peak emotion">⏸️ Held Pose</button>
            <button class="dev-expression-btn dev-expression-btn--pixar-react" data-pixar-react="lookAway" title="Thinking look away">🔄 Look Away</button>
            <button class="dev-expression-btn dev-expression-btn--pixar-react" data-pixar-react="nervousEnergy" title="Fidget trembles">😰 Nervous</button>
            <button class="dev-expression-btn dev-expression-btn--pixar-react" data-pixar-react="delightSparkle" title="Eye sparkle effect">💫 Sparkle</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Text-to-Icon Morph</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--pixar-morph" data-morph="lightbulb" title="Morph to idea icon">💡 Idea Morph</button>
            <button class="dev-expression-btn dev-expression-btn--pixar-morph" data-morph="heart" title="Morph to heart">❤️ Heart Morph</button>
            <button class="dev-expression-btn dev-expression-btn--pixar-morph" data-morph="sparkles" title="Morph to sparkles">✨ Sparkle Morph</button>
          </div>
        </div>
      </section>
      
      <!-- Ferni Moments - Character Expressions -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.heart} Ferni Moments</h3>
        <p class="dev-section__desc">Pixar-style character expressions (Lucide icons)</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Emotional</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn" data-moment="celebration" title="Celebration">Celebrate</button>
            <button class="dev-expression-btn" data-moment="warmGlow" title="Warm glow">Glow</button>
            <button class="dev-expression-btn" data-moment="lightbulb" title="Aha moment">Idea</button>
            <button class="dev-expression-btn" data-moment="hearts" title="Hearts">Hearts</button>
            <button class="dev-expression-btn" data-moment="thinking" title="Thinking">Think</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Time of Day</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn" data-moment="coffee" title="Morning coffee">Coffee</button>
            <button class="dev-expression-btn" data-moment="sunshine" title="Sunshine">Sun</button>
            <button class="dev-expression-btn" data-moment="cozy" title="Cozy evening">Cozy</button>
            <button class="dev-expression-btn" data-moment="moonlight" title="Moonlight">Moon</button>
            <button class="dev-expression-btn" data-moment="sleepy" title="Sleepy">Sleepy</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Contextual</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn" data-moment="musicNotes" title="Music">Music</button>
            <button class="dev-expression-btn" data-moment="sparkle" title="Sparkle">Sparkle</button>
            <button class="dev-expression-btn" data-moment="books" title="Books/learning">Books</button>
            <button class="dev-expression-btn" data-moment="growing" title="Growth">Grow</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Connection</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn" data-moment="wave" title="Wave hello">Wave</button>
            <button class="dev-expression-btn" data-moment="nod" title="Nod">Nod</button>
            <button class="dev-expression-btn" data-moment="headTilt" title="Curious tilt">Tilt</button>
            <button class="dev-expression-btn" data-moment="highFive" title="High five">Hi-Five</button>
            <button class="dev-expression-btn" data-moment="fistBump" title="Fist bump">Bump</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Milestones</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn" data-moment="birthday" title="Birthday">Birthday</button>
            <button class="dev-expression-btn" data-moment="streakFire" title="Streak fire">Streak</button>
            <button class="dev-expression-btn" data-moment="trophy" title="Trophy">Trophy</button>
            <button class="dev-expression-btn" data-moment="levelUp" title="Level up">Level Up</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Human Touches</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn" data-moment="yawn" title="Yawn">Yawn</button>
            <button class="dev-expression-btn" data-moment="stretch" title="Stretch">Stretch</button>
            <button class="dev-expression-btn" data-moment="breathe" title="Deep breath">Breathe</button>
            <button class="dev-expression-btn" data-moment="shiver" title="Cold/shiver">Shiver</button>
            <button class="dev-expression-btn" data-moment="fan" title="Hot/fan">Hot</button>
          </div>
        </div>
      </section>
      
      <!-- Music Animation Tester -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.music} Music Animations</h3>
        <p class="dev-section__desc">Test bass-reactive music visualization</p>
        <div class="dev-music-buttons">
          <button class="dev-music-btn" data-action="start-music" title="Start simulated music">
            ▶ Start Music
          </button>
          <button class="dev-music-btn" data-action="stop-music" title="Stop with fun outro">
            ◼ Stop Music
          </button>
          <button class="dev-music-btn" data-action="duck-music" title="Simulate agent talking over music">
            🔉 Duck
          </button>
          <button class="dev-music-btn" data-action="unduck-music" title="Restore full volume">
            🔊 Unduck
          </button>
        </div>
      </section>
      
      <!-- Advanced Behaviors -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Advanced Behaviors</h3>
        <p class="dev-section__desc">Test listening, speaking rhythm, greetings & celebrations</p>
        
        <!-- Listening/Speaking Modes -->
        <div class="dev-subsection">
          <span class="dev-label">Voice Modes</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--mode" data-mode="start-listening" title="Simulate user speaking">
              👂 Start Listening
            </button>
            <button class="dev-expression-btn dev-expression-btn--mode" data-mode="stop-listening" title="Stop listening mode">
              🔇 Stop Listening
            </button>
            <button class="dev-expression-btn dev-expression-btn--mode" data-mode="start-speaking" title="Simulate agent speaking">
              🗣️ Start Speaking
            </button>
            <button class="dev-expression-btn dev-expression-btn--mode" data-mode="stop-speaking" title="Stop speaking mode">
              🤫 Stop Speaking
            </button>
          </div>
        </div>
        
        <!-- Greetings -->
        <div class="dev-subsection">
          <span class="dev-label">Greetings</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--greeting" data-greeting="morning" title="Morning energy">
              🌅 Morning
            </button>
            <button class="dev-expression-btn dev-expression-btn--greeting" data-greeting="evening" title="Evening calm">
              🌙 Evening
            </button>
            <button class="dev-expression-btn dev-expression-btn--greeting" data-greeting="latenight" title="Late night gentle">
              🌃 Late Night
            </button>
            <button class="dev-expression-btn dev-expression-btn--greeting" data-greeting="welcomeback" title="Returning user">
              👋 Welcome Back
            </button>
          </div>
        </div>
        
        <!-- Milestones -->
        <div class="dev-subsection">
          <span class="dev-label">Celebrations</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="streak-5" title="5-day streak">
              🔥 5-Day Streak
            </button>
            <button class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="streak-30" title="30-day streak (max)">
              🔥 30-Day Streak
            </button>
            <button class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="goal" title="Goal completed">
              🎯 Goal Complete
            </button>
            <button class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="team" title="Meet new team member">
              🤝 New Team Member
            </button>
          </div>
        </div>
        
        <!-- Deep Thinking -->
        <div class="dev-subsection">
          <span class="dev-label">Thinking</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--thinking" data-thinking="start" title="Deep contemplation">
              🧠 Start Deep Thinking
            </button>
            <button class="dev-expression-btn dev-expression-btn--thinking" data-thinking="stop" title="Insight achieved">
              💡 Stop (with insight)
            </button>
          </div>
        </div>
        
        <!-- 🌅 Conversation Flow -->
        <div class="dev-subsection">
          <span class="dev-label">Conversation Flow</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--wrap-up" data-wrap-up="warm" title="Warm goodbye">
              👋 Warm Goodbye
            </button>
            <button class="dev-expression-btn dev-expression-btn--wrap-up" data-wrap-up="encouraging" title="Encouraging farewell">
              💪 Encouraging
            </button>
            <button class="dev-expression-btn dev-expression-btn--wrap-up" data-wrap-up="thoughtful" title="Thoughtful goodbye">
              🤔 Thoughtful
            </button>
            <button class="dev-expression-btn dev-expression-btn--wrap-up" data-wrap-up="caring" title="Caring goodbye">
              💙 Caring
            </button>
            <button class="dev-expression-btn dev-expression-btn--wrap-up dev-expression-btn--reset" data-wrap-up="reset" title="Reset wrap-up state">
              ↺ Reset
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🆕 Ferni Emotion System -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.heart} Ferni Emotion System</h3>
        <p class="dev-section__desc">Test the emotion state machine - affects breathing, glow, quirks</p>
        
        <!-- Core Emotions -->
        <div class="dev-subsection">
          <span class="dev-label">Core Emotions</span>
          <div class="dev-emotion-buttons">
            <button class="dev-emotion-btn" data-emotion="neutral" title="Default calm state">
              😐 Neutral
            </button>
            <button class="dev-emotion-btn" data-emotion="happy" title="Positive, smiling waveform">
              😊 Happy
            </button>
            <button class="dev-emotion-btn" data-emotion="excited" title="High energy, fast breathing">
              🎉 Excited
            </button>
            <button class="dev-emotion-btn" data-emotion="curious" title="Attentive, interested">
              🤔 Curious
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">More Emotions</span>
          <div class="dev-emotion-buttons">
            <button class="dev-emotion-btn" data-emotion="thinking" title="Slow, contemplative">
              🧠 Thinking
            </button>
            <button class="dev-emotion-btn" data-emotion="calm" title="Peaceful, slow breathing">
              😌 Calm
            </button>
            <button class="dev-emotion-btn" data-emotion="sad" title="Empathetic, sighing">
              😢 Sad
            </button>
            <button class="dev-emotion-btn" data-emotion="frustrated" title="Agitated, irregular">
              😤 Frustrated
            </button>
          </div>
        </div>
        
        <!-- Emotion Reactions -->
        <div class="dev-subsection">
          <span class="dev-label">Character Reactions</span>
          <div class="dev-emotion-buttons">
            <button class="dev-reaction-btn" data-reaction="nod" title="Agreement with follow-through">
              👍 Nod
            </button>
            <button class="dev-reaction-btn" data-reaction="shake" title="Gentle disagreement">
              👎 Shake
            </button>
            <button class="dev-reaction-btn" data-reaction="bounce" title="Excited hop with squash/stretch">
              🦘 Bounce
            </button>
            <button class="dev-reaction-btn" data-reaction="celebrate" title="Full celebration sequence">
              🎊 Celebrate
            </button>
          </div>
        </div>
        
        <!-- Flash Emotions -->
        <div class="dev-subsection">
          <span class="dev-label">Flash Emotions (2s)</span>
          <div class="dev-emotion-buttons">
            <button class="dev-flash-btn" data-flash="excited" title="Brief excitement">
              ⚡ Flash Excited
            </button>
            <button class="dev-flash-btn" data-flash="happy" title="Brief happiness">
              ⚡ Flash Happy
            </button>
            <button class="dev-flash-btn" data-flash="curious" title="Brief curiosity">
              ⚡ Flash Curious
            </button>
          </div>
        </div>
        
        <!-- Waveform Shapes -->
        <div class="dev-subsection">
          <span class="dev-label">Waveform Emotion Shapes</span>
          <div class="dev-waveform-preview">
            <div class="waveform-shape" data-shape="neutral">
              <span>Neutral</span>
              <div class="waveform-bars">
                <span style="height: 30%"></span>
                <span style="height: 50%"></span>
                <span style="height: 70%"></span>
                <span style="height: 85%"></span>
                <span style="height: 100%"></span>
                <span style="height: 85%"></span>
                <span style="height: 70%"></span>
                <span style="height: 50%"></span>
                <span style="height: 30%"></span>
              </div>
            </div>
            <div class="waveform-shape" data-shape="happy">
              <span>Happy (Smile)</span>
              <div class="waveform-bars waveform-bars--happy">
                <span style="height: 90%"></span>
                <span style="height: 70%"></span>
                <span style="height: 50%"></span>
                <span style="height: 40%"></span>
                <span style="height: 35%"></span>
                <span style="height: 40%"></span>
                <span style="height: 50%"></span>
                <span style="height: 70%"></span>
                <span style="height: 90%"></span>
              </div>
            </div>
            <div class="waveform-shape" data-shape="sad">
              <span>Sad (Frown)</span>
              <div class="waveform-bars waveform-bars--sad">
                <span style="height: 20%"></span>
                <span style="height: 35%"></span>
                <span style="height: 55%"></span>
                <span style="height: 75%"></span>
                <span style="height: 85%"></span>
                <span style="height: 75%"></span>
                <span style="height: 55%"></span>
                <span style="height: 35%"></span>
                <span style="height: 20%"></span>
              </div>
            </div>
            <div class="waveform-shape" data-shape="excited">
              <span>Excited (Bouncy)</span>
              <div class="waveform-bars waveform-bars--excited">
                <span style="height: 85%"></span>
                <span style="height: 95%"></span>
                <span style="height: 100%"></span>
                <span style="height: 90%"></span>
                <span style="height: 100%"></span>
                <span style="height: 90%"></span>
                <span style="height: 100%"></span>
                <span style="height: 95%"></span>
                <span style="height: 85%"></span>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      <!-- 🆕 Enhanced Expressiveness -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Enhanced Effects</h3>
        <p class="dev-section__desc">Dramatic avatar effects - aura, ripples, squash & stretch</p>
        
        <!-- Dramatic Animations -->
        <div class="dev-subsection">
          <span class="dev-label">Dramatic Moves</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--dramatic" data-dramatic="bounce" title="character-style bounce">
              🎭 Dramatic Bounce
            </button>
            <button class="dev-expression-btn dev-expression-btn--dramatic" data-dramatic="wobble" title="Excited wobble">
              🎪 Excited Wobble
            </button>
            <button class="dev-expression-btn dev-expression-btn--dramatic" data-dramatic="shake" title="Concerned head shake">
              😟 Head Shake
            </button>
            <button class="dev-expression-btn dev-expression-btn--dramatic" data-dramatic="perky" title="Perky attention">
              👀 Perky!
            </button>
          </div>
        </div>
        
        <!-- Ring & Aura -->
        <div class="dev-subsection">
          <span class="dev-label">Ring & Aura Effects</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--ring" data-ring="heartbeat-slow" title="Calm heartbeat">
              💓 Slow Beat
            </button>
            <button class="dev-expression-btn dev-expression-btn--ring" data-ring="heartbeat-fast" title="Excited heartbeat">
              💗 Fast Beat
            </button>
            <button class="dev-expression-btn dev-expression-btn--ring" data-ring="heartbeat-stop" title="Stop heartbeat">
              🔇 Stop Beat
            </button>
            <button class="dev-expression-btn dev-expression-btn--ring" data-ring="aura" title="Pulse emotion aura">
              🌈 Aura Pulse
            </button>
          </div>
        </div>
        
        <!-- Ripple Effects -->
        <div class="dev-subsection">
          <span class="dev-label">Ripple & Burst</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--ripple" data-ripple="single" title="Single ripple">
              🔘 Single Ripple
            </button>
            <button class="dev-expression-btn dev-expression-btn--ripple" data-ripple="multi" title="Multiple ripples">
              ⭕ Multi Ripple
            </button>
            <button class="dev-expression-btn dev-expression-btn--ripple" data-ripple="burst" title="Celebration burst">
              💥 Burst!
            </button>
            <button class="dev-expression-btn dev-expression-btn--ripple" data-ripple="big" title="BIG celebration">
              🎆 BIG Celebration
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🔌 Connection & Audio Testing -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.zap} Connection & Audio</h3>
        <p class="dev-section__desc">Test connection states and audio feedback</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Connection State</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--connection" data-connection="connecting" title="Show connecting state">
              🔄 Connecting
            </button>
            <button class="dev-expression-btn dev-expression-btn--connection" data-connection="connected" title="Show connected state">
              ✅ Connected
            </button>
            <button class="dev-expression-btn dev-expression-btn--connection" data-connection="disconnected" title="Show disconnected state">
              ❌ Disconnected
            </button>
            <button class="dev-expression-btn dev-expression-btn--connection" data-connection="error" title="Show error state">
              ⚠️ Error
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Sound Effects</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--sound" data-sound="connect" title="Play connect sound">
              🔔 Connect
            </button>
            <button class="dev-expression-btn dev-expression-btn--sound" data-sound="disconnect" title="Play disconnect sound">
              🔕 Disconnect
            </button>
            <button class="dev-expression-btn dev-expression-btn--sound" data-sound="success" title="Play success sound">
              ✨ Success
            </button>
            <button class="dev-expression-btn dev-expression-btn--sound" data-sound="error" title="Play error sound">
              🚨 Error
            </button>
            <button class="dev-expression-btn dev-expression-btn--sound" data-sound="hover" title="Play hover sound">
              👆 Hover
            </button>
            <button class="dev-expression-btn dev-expression-btn--sound" data-sound="click" title="Play click sound">
              👇 Click
            </button>
          </div>
        </div>
      </section>
      
      <!-- 💬 Messages & Transcript -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.drama} Messages & Transcript</h3>
        <p class="dev-section__desc">Inject test messages and transcript entries</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Message Type</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--message" data-message="user" title="Inject user message">
              👤 User Message
            </button>
            <button class="dev-expression-btn dev-expression-btn--message" data-message="agent" title="Inject agent message">
              🤖 Agent Message
            </button>
            <button class="dev-expression-btn dev-expression-btn--message" data-message="thinking" title="Show thinking indicator">
              💭 Thinking...
            </button>
            <button class="dev-expression-btn dev-expression-btn--message" data-message="whisper" title="Show status whisper">
              🤫 Whisper
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Toast Notifications</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--toast" data-toast="success" title="Show success toast">
              ✅ Success
            </button>
            <button class="dev-expression-btn dev-expression-btn--toast" data-toast="error" title="Show error toast">
              ❌ Error
            </button>
            <button class="dev-expression-btn dev-expression-btn--toast" data-toast="info" title="Show info toast">
              ℹ️ Info
            </button>
            <button class="dev-expression-btn dev-expression-btn--toast" data-toast="warning" title="Show warning toast">
              ⚠️ Warning
            </button>
          </div>
        </div>
      </section>
      
      <!-- 📱 Modals & Panels -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.users} Modals & Panels</h3>
        <p class="dev-section__desc">Open various app dialogs and panels</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Panels</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--modal" data-modal="analytics" title="Open analytics">
              📊 Analytics
            </button>
            <button class="dev-expression-btn dev-expression-btn--modal" data-modal="history" title="Open conversation history">
              📜 History
            </button>
            <button class="dev-expression-btn dev-expression-btn--modal" data-modal="insights" title="Open insights">
              🧠 Insights
            </button>
            <button class="dev-expression-btn dev-expression-btn--modal" data-modal="predictions" title="Open predictions">
              🔮 Predictions
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Special</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--modal" data-modal="tour" title="Restart app tour">
              🎯 Restart Tour
            </button>
            <button class="dev-expression-btn dev-expression-btn--modal" data-modal="daily" title="Open daily check-in">
              ☀️ Daily Check-in
            </button>
            <button class="dev-expression-btn dev-expression-btn--modal" data-modal="huddle" title="Open team huddle">
              🤝 Team Huddle
            </button>
            <button class="dev-expression-btn dev-expression-btn--modal" data-modal="marketplace" title="Open marketplace">
              🏪 Marketplace
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🕐 Time & Environment -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sun} Environment</h3>
        <p class="dev-section__desc">Override time of day and environment settings</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Time Override</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--time" data-time="morning" title="Set to morning (6am)">
              🌅 Morning
            </button>
            <button class="dev-expression-btn dev-expression-btn--time" data-time="afternoon" title="Set to afternoon (2pm)">
              ☀️ Afternoon
            </button>
            <button class="dev-expression-btn dev-expression-btn--time" data-time="evening" title="Set to evening (7pm)">
              🌆 Evening
            </button>
            <button class="dev-expression-btn dev-expression-btn--time" data-time="night" title="Set to night (11pm)">
              🌙 Night
            </button>
            <button class="dev-expression-btn dev-expression-btn--time" data-time="reset" title="Use real time">
              🔄 Real Time
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Accessibility</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--a11y" data-a11y="reduce-motion" title="Toggle reduced motion">
              🐢 Reduced Motion
            </button>
            <button class="dev-expression-btn dev-expression-btn--a11y" data-a11y="high-contrast" title="Toggle high contrast">
              🔲 High Contrast
            </button>
            <button class="dev-expression-btn dev-expression-btn--a11y" data-a11y="large-text" title="Toggle large text">
              🔤 Large Text
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🎲 Easter Eggs & Fun -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Easter Eggs</h3>
        <p class="dev-section__desc">Trigger hidden delights and special effects</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Special Effects</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--easter" data-easter="confetti" title="Confetti burst">
              🎊 Confetti
            </button>
            <button class="dev-expression-btn dev-expression-btn--easter" data-easter="fireworks" title="Fireworks">
              🎆 Fireworks
            </button>
            <button class="dev-expression-btn dev-expression-btn--easter" data-easter="party" title="Party mode">
              🎉 Party Mode
            </button>
            <button class="dev-expression-btn dev-expression-btn--easter" data-easter="zen" title="Zen moment">
              🧘 Zen
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🔧 App State Inspector -->
      <section class="dev-section dev-section--state">
        <h3 class="dev-section__title">${ICONS.code} State Inspector</h3>
        <p class="dev-section__desc">View and modify live app state</p>
        
        <div class="dev-state-grid" id="dev-state-grid">
          <div class="dev-state-item">
            <span class="dev-state-label">Connection</span>
            <span class="dev-state-value" id="state-connection">${state.connection}</span>
          </div>
          <div class="dev-state-item">
            <span class="dev-state-label">Active Persona</span>
            <span class="dev-state-value" id="state-persona">${state.activePersona?.id || 'ferni'}</span>
          </div>
          <div class="dev-state-item">
            <span class="dev-state-label">Muted</span>
            <span class="dev-state-value" id="state-muted">${state.isMuted ? 'Yes' : 'No'}</span>
          </div>
          <div class="dev-state-item">
            <span class="dev-state-label">User Name</span>
            <span class="dev-state-value" id="state-username">${state.userName || '(none)'}</span>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Toggle States</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--state" data-state="toggle-mute" title="Toggle muted state">
              🔇 Toggle Mute
            </button>
            <button class="dev-expression-btn dev-expression-btn--state" data-state="refresh" title="Refresh state display">
              🔄 Refresh
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🌊 Waveform Testing -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.music} Waveform States</h3>
        <p class="dev-section__desc">Test waveform visualization states</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Waveform Mode</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--waveform" data-waveform="idle" title="Idle state">
              😴 Idle
            </button>
            <button class="dev-expression-btn dev-expression-btn--waveform" data-waveform="listening" title="Listening state">
              👂 Listening
            </button>
            <button class="dev-expression-btn dev-expression-btn--waveform" data-waveform="speaking-low" title="Low intensity speaking">
              🔈 Speaking Low
            </button>
            <button class="dev-expression-btn dev-expression-btn--waveform" data-waveform="speaking-med" title="Medium intensity speaking">
              🔊 Speaking Med
            </button>
            <button class="dev-expression-btn dev-expression-btn--waveform" data-waveform="speaking-high" title="High intensity speaking">
              📢 Speaking High
            </button>
            <button class="dev-expression-btn dev-expression-btn--waveform" data-waveform="thinking" title="Thinking state">
              🤔 Thinking
            </button>
          </div>
        </div>
      </section>
      
      <!-- 💀 Loading & Skeleton States -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.refresh} Loading States</h3>
        <p class="dev-section__desc">Test skeleton loaders and loading indicators</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Loading UI</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--loading" data-loading="skeleton-avatar" title="Avatar skeleton">
              👤 Avatar Skeleton
            </button>
            <button class="dev-expression-btn dev-expression-btn--loading" data-loading="skeleton-team" title="Team skeleton">
              👥 Team Skeleton
            </button>
            <button class="dev-expression-btn dev-expression-btn--loading" data-loading="spinner" title="Show spinner">
              ⏳ Spinner
            </button>
            <button class="dev-expression-btn dev-expression-btn--loading" data-loading="clear" title="Clear loading states">
              ✓ Clear All
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🎊 Streak Celebrations -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Streak Milestones</h3>
        <p class="dev-section__desc">Test all streak celebration levels</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Streak Days</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--streak" data-streak="3" title="3-day streak">
              3️⃣ 3 Days
            </button>
            <button class="dev-expression-btn dev-expression-btn--streak" data-streak="7" title="7-day streak">
              7️⃣ 7 Days
            </button>
            <button class="dev-expression-btn dev-expression-btn--streak" data-streak="14" title="14-day streak">
              📅 14 Days
            </button>
            <button class="dev-expression-btn dev-expression-btn--streak" data-streak="30" title="30-day streak">
              🌙 30 Days
            </button>
            <button class="dev-expression-btn dev-expression-btn--streak" data-streak="60" title="60-day streak">
              ⭐ 60 Days
            </button>
            <button class="dev-expression-btn dev-expression-btn--streak" data-streak="90" title="90-day streak">
              🏆 90 Days
            </button>
            <button class="dev-expression-btn dev-expression-btn--streak" data-streak="365" title="365-day streak">
              👑 365 Days!
            </button>
          </div>
        </div>
      </section>
      
      <!-- 📶 Network Simulation -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.zap} Network Simulation</h3>
        <p class="dev-section__desc">Simulate network conditions</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Connection Quality</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--network" data-network="excellent" title="Excellent connection">
              📶 Excellent
            </button>
            <button class="dev-expression-btn dev-expression-btn--network" data-network="good" title="Good connection">
              📶 Good
            </button>
            <button class="dev-expression-btn dev-expression-btn--network" data-network="poor" title="Poor connection">
              📶 Poor
            </button>
            <button class="dev-expression-btn dev-expression-btn--network" data-network="offline" title="Offline mode">
              ❌ Offline
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Latency</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--latency" data-latency="0" title="No latency">
              ⚡ 0ms
            </button>
            <button class="dev-expression-btn dev-expression-btn--latency" data-latency="200" title="200ms latency">
              🐢 200ms
            </button>
            <button class="dev-expression-btn dev-expression-btn--latency" data-latency="500" title="500ms latency">
              🦥 500ms
            </button>
            <button class="dev-expression-btn dev-expression-btn--latency" data-latency="1000" title="1s latency">
              🐌 1000ms
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🗑️ Storage & Data -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.unlock} Storage & Data</h3>
        <p class="dev-section__desc">View and manage app storage</p>
        
        <div class="dev-storage-info" id="dev-storage-info">
          <div class="dev-storage-item">
            <span class="dev-storage-key">localStorage items:</span>
            <span class="dev-storage-value" id="storage-count">${Object.keys(localStorage).filter((k) => k.startsWith('ferni')).length}</span>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Actions</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--storage" data-storage="view" title="View all storage">
              👁️ View Storage
            </button>
            <button class="dev-expression-btn dev-expression-btn--storage" data-storage="clear-cache" title="Clear cache">
              🧹 Clear Cache
            </button>
            <button class="dev-expression-btn dev-expression-btn--storage" data-storage="clear-all" title="Clear ALL data (careful!)">
              ⚠️ Clear ALL
            </button>
            <button class="dev-expression-btn dev-expression-btn--storage" data-storage="export" title="Export storage to console">
              📤 Export
            </button>
          </div>
        </div>
      </section>
      
      <!-- 🎭 Ambient & Particles -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Ambient Effects</h3>
        <p class="dev-section__desc">Toggle ambient backgrounds and particles</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Effects</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--ambient" data-ambient="particles" title="Toggle particles">
              ✨ Particles
            </button>
            <button class="dev-expression-btn dev-expression-btn--ambient" data-ambient="glow" title="Toggle ambient glow">
              🌟 Ambient Glow
            </button>
            <button class="dev-expression-btn dev-expression-btn--ambient" data-ambient="aurora" title="Toggle aurora">
              🌌 Aurora
            </button>
            <button class="dev-expression-btn dev-expression-btn--ambient" data-ambient="off" title="Turn off all effects">
              🚫 All Off
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Avatar Weather (${getCurrentSeason()})</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--weather dev-expression-btn--primary" data-weather="moment" title="Play brief seasonal moment">
              ✨ Seasonal Moment
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'snow' ? 'active' : ''}" data-weather="snow" title="Snow around avatar">
              ❄️
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'rain' ? 'active' : ''}" data-weather="rain" title="Rain">
              🌧️
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'leaves' ? 'active' : ''}" data-weather="leaves" title="Falling leaves">
              🍂
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'petals' ? 'active' : ''}" data-weather="petals" title="Cherry blossoms">
              🌸
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'fireflies' ? 'active' : ''}" data-weather="fireflies" title="Fireflies">
              🪲
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather" data-weather="none" title="Stop">
              ✕
            </button>
          </div>
        </div>
      </section>
      
      <!-- 📤 Proactive Outreach Testing -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.send} Proactive Outreach</h3>
        <p class="dev-section__desc">Test proactive outreach channels and triggers</p>
        
        <div class="dev-outreach-status" id="dev-outreach-status">
          <div class="dev-outreach-status-row">
            <span>Status:</span>
            <span id="outreach-status-value">Ready</span>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Test Channels</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="test-sms" title="Send test SMS">
              📱 Test SMS
            </button>
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="test-email" title="Send test email">
              📧 Test Email
            </button>
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="test-call" title="Make test call">
              📞 Test Call
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Trigger Types</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="trigger-commitment" title="Commitment check-in">
              📋 Commitment
            </button>
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="trigger-emotional" title="Emotional support">
              💙 Emotional
            </button>
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="trigger-celebration" title="Celebration">
              🎉 Celebration
            </button>
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="trigger-thinking" title="Thinking of you">
              💭 Thinking of You
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">View Data</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="view-pending" title="View pending outreach">
              📋 Pending
            </button>
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="view-history" title="View outreach history">
              📜 History
            </button>
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="view-context" title="View user context">
              🧠 Context
            </button>
            <button class="dev-expression-btn dev-expression-btn--outreach" data-outreach="view-timing" title="View timing patterns">
              ⏰ Timing
            </button>
          </div>
        </div>
      </section>
      
      <!-- 📊 Dashboards & Tools -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.target} Dashboards & Tools</h3>
        <p class="dev-section__desc">Quick access to all monitoring dashboards</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Core Dashboards</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/analytics-dashboard.html" target="_blank" title="Analytics Dashboard">
              📈 Analytics
            </a>
            <a class="dev-dashboard-link" href="/metrics-dashboard.html" target="_blank" title="Metrics Dashboard">
              📊 Metrics
            </a>
            <a class="dev-dashboard-link" href="/ux-dashboard.html" target="_blank" title="UX Dashboard">
              🎨 UX
            </a>
            <a class="dev-dashboard-link" href="/error-dashboard.html" target="_blank" title="Error Dashboard">
              ⚠️ Errors
            </a>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">AI & Voice</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/llm-dashboard.html" target="_blank" title="LLM Dashboard">
              🤖 LLM
            </a>
            <a class="dev-dashboard-link" href="/voice-presence-dashboard.html" target="_blank" title="Voice Presence Dashboard">
              🎙️ Voice
            </a>
            <a class="dev-dashboard-link" href="/persona-dashboard.html" target="_blank" title="Persona Dashboard">
              🎭 Personas
            </a>
            <a class="dev-dashboard-link" href="/cognitive-dashboard.html" target="_blank" title="Cognitive Dashboard">
              🧠 Cognitive
            </a>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Infrastructure</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/connection-dashboard.html" target="_blank" title="Connection Dashboard">
              📶 Connection
            </a>
            <a class="dev-dashboard-link" href="/memory-dashboard.html" target="_blank" title="Memory Dashboard">
              💾 Memory
            </a>
            <a class="dev-dashboard-link" href="/cost-dashboard.html" target="_blank" title="Cost Dashboard">
              💰 Costs
            </a>
            <a class="dev-dashboard-link" href="/dora-dashboard.html" target="_blank" title="DORA Metrics">
              🚀 DORA
            </a>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Features & Tools</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/handoff-dashboard.html" target="_blank" title="Handoff Dashboard">
              🤝 Handoffs
            </a>
            <a class="dev-dashboard-link" href="/outreach-dashboard.html" target="_blank" title="Outreach Dashboard">
              📤 Outreach
            </a>
            <a class="dev-dashboard-link" href="/tools-dashboard.html" target="_blank" title="Tools Dashboard">
              🔧 Tools
            </a>
            <a class="dev-dashboard-link" href="/experiments-dashboard.html" target="_blank" title="Experiments">
              🧪 Experiments
            </a>
            <a class="dev-dashboard-link" href="/feature-flags.html" target="_blank" title="Feature Flags">
              🚩 Feature Flags
            </a>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Admin & Utilities</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/admin.html" target="_blank" title="Admin Panel">
              ⚙️ Admin
            </a>
            <a class="dev-dashboard-link" href="/observability-hub.html" target="_blank" title="Observability Hub">
              👁️ Observability
            </a>
            <a class="dev-dashboard-link" href="/animation-playground.html" target="_blank" title="Animation Playground">
              🎬 Animations
            </a>
          </div>
        </div>
      </section>
      
      <!-- 🎬 Narrative System -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.heart} Narrative System</h3>
        <p class="dev-section__desc">Test story beats, arcs, and emotional journeys</p>
        
        <div class="dev-narrative-stats" id="dev-narrative-stats">
          <div class="dev-info-grid">
            <div class="dev-info">
              <span class="dev-info__label">Sessions</span>
              <span class="dev-info__value" id="narrative-sessions">0</span>
            </div>
            <div class="dev-info">
              <span class="dev-info__label">Streak</span>
              <span class="dev-info__value" id="narrative-streak">0</span>
            </div>
            <div class="dev-info">
              <span class="dev-info__label">Turn Count</span>
              <span class="dev-info__value" id="narrative-turns">0</span>
            </div>
            <div class="dev-info">
              <span class="dev-info__label">Speaking</span>
              <span class="dev-info__value" id="narrative-speaking">-</span>
            </div>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Journey Beats</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="first_launch" title="First launch">
              🌟 First Launch
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="welcome_back" title="Welcome back">
              👋 Welcome Back
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="streak_continues" title="Streak">
              🔥 Streak
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="connected" title="Connected">
              ✨ Connected
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Conversation Flow</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="user_starts_speaking" title="User speaking">
              🗣️ User Speaks
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="thinking" title="Thinking">
              🤔 Thinking
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="ferni_starts_speaking" title="Ferni speaking">
              💬 Ferni Speaks
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="long_pause" title="Long pause">
              ⏸️ Long Pause
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Emotional Moments</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="empathy_moment" title="Empathy">
              💙 Empathy
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="user_vulnerable" title="Vulnerable">
              🫂 Vulnerable
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="user_frustrated" title="Frustrated">
              😤 Frustrated
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="user_sad" title="Sad">
              😢 Sad
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Achievements</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="small_win" title="Small win">
              ⭐ Small Win
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="big_win" title="Big win">
              🏆 Big Win
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="breakthrough" title="Breakthrough">
              💡 Breakthrough
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="milestone_reached" title="Milestone">
              🎯 Milestone
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Team & Special</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="persona_introduced" title="Persona intro">
              🎭 Persona Intro
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="team_unlock" title="Team unlock">
              🔓 Team Unlock
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="birthday" title="Birthday">
              🎂 Birthday
            </button>
            <button class="dev-expression-btn dev-expression-btn--narrative" data-beat="morning_greeting" title="Morning">
              ☀️ Morning
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Story Arcs</span>
          <div class="dev-expression-buttons">
            <button class="dev-expression-btn dev-expression-btn--arc" data-arc="breakthrough" title="Breakthrough arc">
              💡 Breakthrough Arc
            </button>
            <button class="dev-expression-btn dev-expression-btn--arc" data-arc="deep_conversation" title="Deep conversation">
              🫂 Deep Convo Arc
            </button>
            <button class="dev-expression-btn dev-expression-btn--arc" data-arc="goal_completion" title="Goal completion">
              🎯 Goal Complete Arc
            </button>
            <button class="dev-expression-btn dev-expression-btn--arc" data-arc="frustration_support" title="Frustration support">
              💙 Support Arc
            </button>
          </div>
        </div>
      </section>
    </div>
    
    <div class="dev-panel__footer">
      <span>Press Cmd/Ctrl+Shift+D to close</span>
    </div>
  `;

  // Event listeners
  container.querySelector('.dev-panel__close')?.addEventListener('click', hidePanel);

  // Tier buttons
  container.querySelectorAll('.dev-tier-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = (btn as HTMLElement).dataset.tier as 'free' | 'friend' | 'partner';
      setTierOverride(tier);
    });
  });

  // Stage buttons
  container.querySelectorAll('.dev-stage-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stage = (btn as HTMLElement).dataset.stage as RelationshipStage;
      setStageOverride(stage);
    });
  });

  // Celebrate buttons
  container.querySelectorAll('.dev-team-member__celebrate').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = (btn as HTMLElement).dataset.member as TeamMemberId;
      const member = TEAM_MEMBERS.find((m) => m.id === memberId);
      if (member) {
        teamUnlockCelebration.show(member);
      }
    });
  });

  // Action buttons
  container.querySelectorAll('.dev-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      handleAction(action!);
    });
  });

  // Soul buttons
  container.querySelectorAll('.dev-soul-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const soul = (btn as HTMLElement).dataset.soul;
      triggerSoulAction(soul!);
    });
  });

  // Handoff buttons
  container.querySelectorAll('.dev-handoff-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const persona = (btn as HTMLElement).dataset.persona;
      triggerHandoff(persona!);
    });
  });

  // Expression buttons
  container.querySelectorAll('.dev-expression-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expression = (btn as HTMLElement).dataset.expression;
      if (expression) {
        triggerExpression(expression);
      }
    });
  });

  // 🎉 Fun reaction buttons
  container.querySelectorAll('[data-reaction]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reaction = (btn as HTMLElement).dataset.reaction;
      if (reaction) {
        triggerReaction(reaction as 'happy' | 'curious' | 'empathy' | 'laugh' | 'surprise');
      }
    });
  });

  // 🎬 Pixar Emotions - Eye Lid Expressions
  container.querySelectorAll('[data-pixar-expr]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expr = (btn as HTMLElement).dataset.pixarExpr as EmotionalExpression;
      if (expr) {
        triggerPixarExpression(expr);
      }
    });
  });

  // 🎬 Pixar Emotions - Advanced Reactions
  container.querySelectorAll('[data-pixar-react]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const react = (btn as HTMLElement).dataset.pixarReact as AdvancedReaction;
      if (react) {
        triggerPixarReaction(react);
      }
    });
  });

  // 🎬 Pixar Emotions - Text-to-Icon Morph
  container.querySelectorAll('[data-morph]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const morph = (btn as HTMLElement).dataset.morph;
      if (morph) {
        triggerPixarMorph(morph);
      }
    });
  });

  // 👁️ Ferni Eye - DISABLED (keeping just zen blink)
  // Eye peek-through animations removed for simpler, calmer UX

  // 🎬 Narrative story beat buttons
  container.querySelectorAll('[data-beat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const beat = (btn as HTMLElement).dataset.beat as StoryBeat;
      if (beat) {
        log.info('Triggering narrative beat:', beat);
        triggerTestBeat(beat);
        updateNarrativeStats();
      }
    });
  });

  // 🎬 Narrative story arc buttons
  container.querySelectorAll('[data-arc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const arc = (btn as HTMLElement).dataset.arc;
      if (arc) {
        log.info('Triggering narrative arc:', arc);
        triggerTestArc(arc);
        updateNarrativeStats();
      }
    });
  });

  // 🎭 Ferni Moments buttons
  container.querySelectorAll('[data-moment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const moment = (btn as HTMLElement).dataset.moment as MomentType;
      if (moment) {
        ferniMoments.play(moment);
        log.info({ moment }, '🎭 Ferni moment triggered');
      }
    });
  });

  // Roster buttons
  container.querySelectorAll('.dev-roster-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.roster;
      handleRosterAction(action!);
    });
  });

  // 🎮 Game buttons
  container.querySelectorAll('[data-game]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const game = (btn as HTMLElement).dataset.game;
      void handleGameAction(game!);
    });
  });

  // Music buttons
  container.querySelectorAll('.dev-music-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      triggerMusicAction(action!);
    });
  });

  // Voice mode buttons (listening/speaking)
  container.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode;
      triggerVoiceMode(mode!);
    });
  });

  // Greeting buttons
  container.querySelectorAll('[data-greeting]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const greeting = (btn as HTMLElement).dataset.greeting;
      triggerGreeting(greeting!);
    });
  });

  // Celebration buttons
  container.querySelectorAll('[data-celebration]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const celebration = (btn as HTMLElement).dataset.celebration;
      triggerCelebration(celebration!);
    });
  });

  // Thinking buttons
  container.querySelectorAll('[data-thinking]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const thinking = (btn as HTMLElement).dataset.thinking;
      triggerThinking(thinking!);
    });
  });

  // 🌅 Wrap-up buttons (conversation ending)
  container.querySelectorAll('[data-wrap-up]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const wrapUp = (btn as HTMLElement).dataset.wrapUp;
      triggerWrapUp(wrapUp!);
    });
  });

  // 🆕 Dramatic animation buttons
  container.querySelectorAll('[data-dramatic]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dramatic = (btn as HTMLElement).dataset.dramatic;
      triggerDramatic(dramatic!);
    });
  });

  // 🆕 Ring/Aura buttons
  container.querySelectorAll('[data-ring]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ring = (btn as HTMLElement).dataset.ring;
      triggerRingEffect(ring!);
    });
  });

  // 🆕 Ripple buttons
  container.querySelectorAll('[data-ripple]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ripple = (btn as HTMLElement).dataset.ripple;
      triggerRippleEffect(ripple!);
    });
  });

  // 🔌 Connection state buttons
  container.querySelectorAll('[data-connection]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const state = (btn as HTMLElement).dataset.connection;
      triggerConnectionState(state!);
    });
  });

  // 🔊 Sound effect buttons
  container.querySelectorAll('[data-sound]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sound = (btn as HTMLElement).dataset.sound;
      triggerSound(sound!);
    });
  });

  // 💬 Message buttons
  container.querySelectorAll('[data-message]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const message = (btn as HTMLElement).dataset.message;
      triggerMessage(message!);
    });
  });

  // 🔔 Toast buttons
  container.querySelectorAll('[data-toast]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const toast = (btn as HTMLElement).dataset.toast;
      triggerToast(toast!);
    });
  });

  // 📱 Modal buttons
  container.querySelectorAll('[data-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = (btn as HTMLElement).dataset.modal;
      openModal(modal!);
    });
  });

  // 🕐 Time buttons
  container.querySelectorAll('[data-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const time = (btn as HTMLElement).dataset.time;
      setTimeOverride(time!);
    });
  });

  // ♿ Accessibility buttons
  container.querySelectorAll('[data-a11y]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a11y = (btn as HTMLElement).dataset.a11y;
      toggleA11ySetting(a11y!);
    });
  });

  // 🎲 Easter egg buttons
  container.querySelectorAll('[data-easter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const easter = (btn as HTMLElement).dataset.easter;
      triggerEasterEgg(easter!);
    });
  });

  // 🔧 State buttons
  container.querySelectorAll('[data-state]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stateAction = (btn as HTMLElement).dataset.state;
      handleStateAction(stateAction!);
    });
  });

  // 🌊 Waveform buttons
  container.querySelectorAll('[data-waveform]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const waveform = (btn as HTMLElement).dataset.waveform;
      triggerWaveformState(waveform!);
    });
  });

  // 💀 Loading buttons
  container.querySelectorAll('[data-loading]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const loading = (btn as HTMLElement).dataset.loading;
      triggerLoadingState(loading!);
    });
  });

  // 🎊 Streak buttons
  container.querySelectorAll('[data-streak]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const streak = parseInt((btn as HTMLElement).dataset.streak!, 10);
      triggerStreakCelebration(streak);
    });
  });

  // 📶 Network buttons
  container.querySelectorAll('[data-network]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const network = (btn as HTMLElement).dataset.network;
      setNetworkSimulation(network!);
    });
  });

  // ⏱️ Latency buttons
  container.querySelectorAll('[data-latency]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const latency = parseInt((btn as HTMLElement).dataset.latency!, 10);
      setLatencySimulation(latency);
    });
  });

  // 🗑️ Storage buttons
  container.querySelectorAll('[data-storage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const storage = (btn as HTMLElement).dataset.storage;
      handleStorageAction(storage!);
    });
  });

  // 🎭 Ambient buttons
  container.querySelectorAll('[data-ambient]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ambient = (btn as HTMLElement).dataset.ambient;
      toggleAmbientEffect(ambient!);
    });
  });

  // 🌦️ Weather buttons
  container.querySelectorAll('[data-weather]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const weather = (btn as HTMLElement).dataset.weather as WeatherType | 'moment';
      toggleWeatherEffect(weather);
      // Update active states (skip 'moment' button)
      container.querySelectorAll('[data-weather]').forEach((b) => {
        const w = (b as HTMLElement).dataset.weather;
        if (w !== 'moment') {
          b.classList.toggle('active', w === getCurrentWeather());
        }
      });
    });
  });

  // 🆕 Emotion buttons
  container.querySelectorAll('[data-emotion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emotion = (btn as HTMLElement).dataset.emotion as VoiceEmotion;
      triggerEmotion(emotion);
    });
  });

  // 🆕 Reaction buttons
  container.querySelectorAll('[data-reaction]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reaction = (btn as HTMLElement).dataset.reaction;
      triggerReaction(reaction!);
    });
  });

  // 🆕 Flash emotion buttons
  container.querySelectorAll('[data-flash]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emotion = (btn as HTMLElement).dataset.flash as VoiceEmotion;
      triggerFlashEmotion(emotion);
    });
  });

  // 📤 Outreach buttons
  container.querySelectorAll('[data-outreach]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const outreach = (btn as HTMLElement).dataset.outreach;
      handleOutreachAction(outreach!);
    });
  });

  return container;
}

// ============================================================================
// ACTIONS
// ============================================================================

function setTierOverride(tier: 'free' | 'friend' | 'partner'): void {
  tierOverride = tier;
  teamUnlockService.setTier(tier);

  // Also update token server
  void updateServerSubscription(tier);

  log.info({ tier }, 'Tier override set');
  refreshPanel();
}

function setStageOverride(stage: RelationshipStage): void {
  stageOverride = stage;

  // Simulate conversations to reach stage
  const stageConversations: Record<RelationshipStage, number> = {
    'first-meeting': 0,
    'getting-started': 2,
    'building-trust': 7,
    established: 20,
    'deep-partnership': 50,
  };

  conversationsOverride = stageConversations[stage];

  // Update relationship service (hack for testing)
  for (
    let i = 0;
    i < conversationsOverride - relationshipStageService.getMetrics().totalConversations;
    i++
  ) {
    relationshipStageService.recordConversation();
  }

  void teamUnlockService.update();

  log.info({ stage, conversations: conversationsOverride }, 'Stage override set');
  refreshPanel();
}

async function updateServerSubscription(tier: 'free' | 'friend' | 'partner'): Promise<void> {
  const deviceId = appState.getState().deviceId;
  if (!deviceId) return;

  try {
    await fetch('/subscription/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        tier,
        admin_key: 'dev-mode', // Special dev key
      }),
    });
  } catch (e) {
    log.warn('Could not update server subscription:', e);
  }
}

function handleAction(action: string): void {
  switch (action) {
    case 'unlock-all':
      quickUnlockAll();
      break;
    case 'reset':
      resetToFree();
      break;
    case 'add-conversations':
      addConversations(5);
      break;
    case 'trigger-limit':
      triggerLimitModal();
      break;
    case 'trigger-upgrade':
      triggerUpgradeModal();
      break;
  }
}

function handleRosterAction(action: string): void {
  switch (action) {
    case 'show-all':
      rosterPreferences.setShowAll(true);
      log.info('Showing all team members in roster');
      break;
    case 'show-minimal':
      rosterPreferences.setShowAll(false);
      // Clear added members to go back to minimal
      const prefs = rosterPreferences.getPreferences();
      prefs.addedMembers.forEach((m) => rosterPreferences.removeMember(m));
      log.info('Showing minimal roster (Ferni only)');
      break;
    case 'reset':
      rosterPreferences.reset();
      log.info('Reset roster preferences');
      break;
  }
  refreshPanel();
}

/**
 * 🎮 Handle game button actions
 */
async function handleGameAction(action: string): Promise<void> {
  switch (action) {
    case 'dashboard':
      // Open Musical You dashboard
      try {
        const { showMusicDashboard } = await import('./music-dashboard.ui.js');
        showMusicDashboard();
        log.info('📊 Opened Musical You dashboard');
      } catch (e) {
        log.error('Failed to open music dashboard:', e);
      }
      break;

    case 'name-that-tune':
    case 'one-word-song':
    case 'desert-island':
    case 'this-or-that':
    case 'mood-dj':
      // Request game start via voice agent
      await requestGameStart(action);
      break;
  }
}

/**
 * Request game start via data channel to voice agent
 */
async function requestGameStart(gameType: string): Promise<void> {
  // Map UI action to game type
  const gameTypeMap: Record<string, string> = {
    'name-that-tune': 'name-that-tune',
    'one-word-song': 'one-word-song',
    'desert-island': 'desert-island-discs',
    'this-or-that': 'this-or-that',
    'mood-dj': 'mood-dj-challenge',
  };

  const mappedType = gameTypeMap[gameType] || gameType;

  try {
    const { connectionService } = await import('../services/connection.service.js');
    const room = connectionService.getRoom();

    if (!room?.localParticipant) {
      showToast('Not connected to voice session', 'error');
      return;
    }

    // Send game start request via data channel
    const message = JSON.stringify({
      type: 'game_start_request',
      gameType: mappedType,
      timestamp: Date.now(),
    });

    await room.localParticipant.publishData(new TextEncoder().encode(message), { reliable: true });

    log.info({ gameType: mappedType }, '🎮 Sent game start request');
    showToast(`Starting ${gameType.replace(/-/g, ' ')}...`, 'info');
  } catch (error) {
    log.error({ error, gameType }, '🎮 Failed to send game start request');
    showToast('Failed to start game - try voice command', 'error');
  }
}

/**
 * Simple toast notification - uses centralized toast system
 */
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  // Import dynamically to avoid circular deps
  import('./toast.ui.js')
    .then(({ toast }) => {
      if (type === 'success') {
        toast.success(message);
      } else if (type === 'error') {
        toast.error(message);
      } else {
        toast.info(message);
      }
    })
    .catch(() => {
      // Fallback if import fails
      log.warn('Toast import failed, using fallback');
    });
}

function quickUnlockAll(): void {
  setTierOverride('partner');
  setStageOverride('deep-partnership');
  log.info('All team members unlocked');
}

function resetToFree(): void {
  tierOverride = 'free';
  stageOverride = 'first-meeting';
  conversationsOverride = 0;
  teamUnlockService.setTier('free');
  relationshipStageService.reset();
  void teamUnlockService.update();
  void updateServerSubscription('free');
  log.info('Reset to free tier');
  refreshPanel();
}

function addConversations(count: number): void {
  for (let i = 0; i < count; i++) {
    relationshipStageService.recordConversation();
  }
  void teamUnlockService.update();
  conversationsOverride = (conversationsOverride ?? 0) + count;
  log.info({ count }, 'Added conversations');
  refreshPanel();
}

function triggerLimitModal(): void {
  import('./subscription.ui.js').then(({ showLimitReachedModal }) => {
    showLimitReachedModal(
      "We've used up our time this month. I'd love to keep talking...",
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );
  });
}

function triggerUpgradeModal(): void {
  import('./subscription.ui.js').then(({ showUpgradeModal }) => {
    showUpgradeModal("Let's go deeper together.");
  });
}

function triggerHandoff(personaId: string): void {
  window.dispatchEvent(
    new CustomEvent('ferni:switch-persona', {
      detail: { personaId },
    })
  );
  log.info({ personaId }, 'Triggered handoff');
}

// ============================================================================
// OUTREACH TESTING ACTIONS
// ============================================================================

async function handleOutreachAction(action: string): Promise<void> {
  const statusEl = document.getElementById('outreach-status-value');
  const setStatus = (text: string, isError = false) => {
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.color = isError ? 'var(--color-error)' : 'var(--color-success)';
    }
  };

  // Get userId from app state (or use dev default)
  const userId = appState.getState().deviceId || 'dev-user';

  log.info({ action }, 'Outreach action triggered');
  setStatus('Processing...');

  try {
    switch (action) {
      // Test channels
      case 'test-sms':
        setStatus('📱 Sending test SMS...');
        const smsRes = await fetch('/api/outreach/test/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            channel: 'sms',
            message: 'Hey! This is a test message from Ferni dev panel 🌱',
          }),
        });
        setStatus(smsRes.ok ? '✓ SMS sent!' : '✕ SMS failed', !smsRes.ok);
        break;

      case 'test-email':
        setStatus('📧 Sending test email...');
        const emailRes = await fetch('/api/outreach/test/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            channel: 'email',
            subject: 'Test from Ferni 🌱',
            message:
              'Hey! This is a test email from the Ferni dev panel. Just making sure everything is connected!',
          }),
        });
        setStatus(emailRes.ok ? '✓ Email sent!' : '✕ Email failed', !emailRes.ok);
        break;

      case 'test-call':
        setStatus('📞 Making test call...');
        const callRes = await fetch('/api/outreach/test/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            channel: 'call',
            message:
              'Hey! This is Ferni calling from the dev panel. Just a quick test to make sure calls are working!',
          }),
        });
        setStatus(callRes.ok ? '✓ Call initiated!' : '✕ Call failed', !callRes.ok);
        break;

      // Trigger types
      case 'trigger-commitment':
        const commitRes = await fetch('/api/outreach/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'commitment_check',
            priority: 'medium',
            reason: 'Dev panel test - commitment check',
            commitment: 'your morning workout',
          }),
        });
        setStatus(commitRes.ok ? '✓ Commitment trigger created!' : '✕ Failed', !commitRes.ok);
        break;

      case 'trigger-emotional':
        const emotionRes = await fetch('/api/outreach/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'emotional_support',
            priority: 'high',
            reason: 'Dev panel test - emotional support',
          }),
        });
        setStatus(emotionRes.ok ? '✓ Emotional trigger created!' : '✕ Failed', !emotionRes.ok);
        break;

      case 'trigger-celebration':
        const celebRes = await fetch('/api/outreach/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            type: 'celebration',
            priority: 'medium',
            reason: 'Dev panel test - celebration',
            milestone: 'completing an amazing day',
          }),
        });
        setStatus(celebRes.ok ? '✓ Celebration trigger created!' : '✕ Failed', !celebRes.ok);
        break;

      case 'trigger-thinking':
        const toyRes = await fetch('/api/outreach/thinking-of-you', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            trigger: 'random_kindness',
            reason: 'Dev panel test',
          }),
        });
        setStatus(toyRes.ok ? '✓ Thinking-of-you triggered!' : '✕ Failed', !toyRes.ok);
        break;

      // View data
      case 'view-pending':
        const pendingRes = await fetch(`/api/outreach/pending?userId=${userId}`);
        const pendingData = await pendingRes.json();
        log.info({ pending: pendingData }, '📋 Pending outreach');
        // eslint-disable-next-line no-console
        console.log('📋 Pending Outreach:', pendingData);
        setStatus(`${pendingData.count || 0} pending (see console)`);
        break;

      case 'view-history':
        const historyRes = await fetch(`/api/outreach/history?userId=${userId}&limit=10`);
        const historyData = await historyRes.json();
        log.info({ history: historyData }, '📜 Outreach history');
        // eslint-disable-next-line no-console
        console.log('📜 Outreach History:', historyData);
        setStatus(`${historyData.count || 0} in history (see console)`);
        break;

      case 'view-context':
        const contextRes = await fetch(`/api/outreach/context?userId=${userId}`);
        const contextData = await contextRes.json();
        log.info({ context: contextData }, '🧠 User context');
        // eslint-disable-next-line no-console
        console.log('🧠 User Context:', contextData);
        setStatus('Context loaded (see console)');
        break;

      case 'view-timing':
        const timingRes = await fetch(`/api/outreach/timing?userId=${userId}`);
        const timingData = await timingRes.json();
        log.info({ timing: timingData }, '⏰ Timing patterns');
        // eslint-disable-next-line no-console
        console.log('⏰ Timing Patterns:', timingData);
        setStatus('Timing loaded (see console)');
        break;

      default:
        log.warn({ action }, 'Unknown outreach action');
        setStatus('Unknown action', true);
    }
  } catch (error) {
    log.error({ error, action }, 'Outreach action failed');
    setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown'}`, true);
  }
}

// ============================================================================
// NARRATIVE SYSTEM STATS
// ============================================================================

function updateNarrativeStats(): void {
  try {
    const stats = getSessionStats();
    const journey = getJourney();

    const sessionsEl = document.getElementById('narrative-sessions');
    const streakEl = document.getElementById('narrative-streak');
    const turnsEl = document.getElementById('narrative-turns');
    const speakingEl = document.getElementById('narrative-speaking');

    if (sessionsEl) sessionsEl.textContent = journey.totalSessions.toString();
    if (streakEl) streakEl.textContent = journey.currentStreak.toString();
    if (turnsEl) turnsEl.textContent = stats.turns.toString();
    if (speakingEl) {
      if (stats.isFerniSpeaking) {
        speakingEl.textContent = '🗣️ Ferni';
      } else if (stats.isUserSpeaking) {
        speakingEl.textContent = '👤 User';
      } else {
        speakingEl.textContent = '—';
      }
    }
  } catch (error) {
    log.debug('Could not update narrative stats:', error);
  }
}

// ============================================================================
// SOUL & DELIGHT ACTIONS
// ============================================================================

function triggerSoulAction(action: string): void {
  switch (action) {
    case 'eye-reveal':
      void revealAvatarEye(2500);
      log.info('Triggered eye reveal');
      break;

    case 'awakening':
      void showFirstLaunchExperience();
      log.info('Triggered awakening experience');
      break;

    case 'look-around':
      void makeAvatarLookAround();
      log.info('Triggered look around');
      break;

    case 'celebrate':
      void celebrationBurst();
      log.info('Triggered celebration');
      break;

    case 'empathy':
      void empathyPulse();
      log.info('Triggered empathy pulse');
      break;

    case 'pause-tracking':
      pauseAllEyeTracking(3000);
      log.info('Paused eye tracking for 3s');
      break;

    case 'wink':
      triggerWink();
      break;

    case 'curious-tilt':
      triggerCuriousTilt();
      break;

    case 'secret-smile':
      triggerSecretSmile();
      break;

    case 'sleepy':
      triggerSleepy();
      break;

    default:
      log.warn({ action }, 'Unknown soul action');
  }
}

// Quick wink animation
function triggerWink(): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  if (!avatar) return;

  avatar.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(0.95) scaleX(0.9)', offset: 0.2 },
      { transform: 'scale(1.02)', offset: 0.5 },
      { transform: 'scale(1)' },
    ],
    {
      duration: 400,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    }
  );
  log.info('Triggered wink');
}

// Curious head tilt
function triggerCuriousTilt(): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  if (!avatar) return;

  avatar.animate(
    [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-8deg) translateY(-2px)', offset: 0.3 },
      { transform: 'rotate(-8deg) translateY(-2px)', offset: 0.7 },
      { transform: 'rotate(0deg)' },
    ],
    {
      duration: 800,
      easing: 'ease-in-out',
    }
  );
  log.info('Triggered curious tilt');
}

// Secret smile - avatar text briefly curves
function triggerSecretSmile(): void {
  const avatarText = document.querySelector('#avatarText') as HTMLElement;
  if (!avatarText) return;

  avatarText.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.05) translateY(-2px)', offset: 0.3 },
      { transform: 'scale(1.05) translateY(-2px)', offset: 0.7 },
      { transform: 'scale(1)' },
    ],
    {
      duration: 1000,
      easing: 'ease-in-out',
    }
  );
  log.info('Triggered secret smile');
}

// Sleepy yawn for late night
function triggerSleepy(): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  const avatarText = document.querySelector('#avatarText') as HTMLElement;
  if (!avatar) return;

  // Avatar droops slightly
  avatar.animate(
    [
      { transform: 'scale(1) translateY(0)' },
      { transform: 'scale(0.98) translateY(3px)', offset: 0.3 },
      { transform: 'scale(1.02) translateY(-2px)', offset: 0.5 }, // slight stretch up (yawn)
      { transform: 'scale(0.98) translateY(2px)', offset: 0.7 },
      { transform: 'scale(1) translateY(0)' },
    ],
    {
      duration: 1500,
      easing: 'ease-in-out',
    }
  );

  // Text shrinks (closing eyes)
  if (avatarText) {
    avatarText.animate(
      [
        { transform: 'scaleY(1)' },
        { transform: 'scaleY(0.7)', offset: 0.3 },
        { transform: 'scaleY(1.1)', offset: 0.5 },
        { transform: 'scaleY(0.8)', offset: 0.7 },
        { transform: 'scaleY(1)' },
      ],
      {
        duration: 1500,
        easing: 'ease-in-out',
      }
    );
  }
  log.info('Triggered sleepy');
}

// ============================================================================
// AVATAR EXPRESSION TESTING
// ============================================================================

function triggerExpression(expression: string): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;

  switch (expression) {
    case 'chuckle':
      // Quick bouncy shake - like a giggle
      presenceUI.flashEmotion('happy', 1500);
      avatar?.animate(
        [
          { transform: 'translateX(0) rotate(0deg)' },
          { transform: 'translateX(-2px) rotate(-1deg)', offset: 0.1 },
          { transform: 'translateX(2px) rotate(1deg)', offset: 0.2 },
          { transform: 'translateX(-2px) rotate(-1deg)', offset: 0.3 },
          { transform: 'translateX(2px) rotate(1deg)', offset: 0.4 },
          { transform: 'translateX(0) rotate(0deg)' },
        ],
        { duration: 500, easing: 'ease-in-out' }
      );
      break;

    case 'empathy':
      // Slow nod with empathetic emotion
      presenceUI.setVoiceEmotion('empathetic');
      presenceUI.nod();
      setTimeout(() => presenceUI.setVoiceEmotion('neutral'), 2000);
      break;

    case 'delight':
      // Excited bounce with happy emotion
      presenceUI.flashEmotion('excited', 2000);
      presenceUI.bounce();
      break;

    case 'contemplate':
      // Slow tilt with thoughtful emotion
      presenceUI.setVoiceEmotion('thoughtful');
      presenceUI.curiousTilt();
      setTimeout(() => presenceUI.setVoiceEmotion('neutral'), 3000);
      break;

    case 'encourage':
      // Nod with happy emotion
      presenceUI.flashEmotion('happy', 1500);
      presenceUI.nod();
      break;

    case 'surprise':
      // Quick scale up then settle
      presenceUI.flashEmotion('excited', 1500);
      avatar?.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.15)', offset: 0.2 },
          { transform: 'scale(0.95)', offset: 0.5 },
          { transform: 'scale(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      break;

    case 'settle':
      // Gentle sigh and settle
      presenceUI.setVoiceEmotion('calm');
      avatar?.animate(
        [
          { transform: 'scale(1) translateY(0)' },
          { transform: 'scale(0.97) translateY(2px)', offset: 0.5 },
          { transform: 'scale(1) translateY(0)' },
        ],
        { duration: 1200, easing: 'ease-in-out' }
      );
      break;

    case 'blink':
      // Zen blink - whole avatar squashes flat then springs back
      presenceUI.blink();
      break;

    case 'success':
      avatarFeedback.success('Great job!');
      break;
    case 'error':
      avatarFeedback.error('Something went wrong');
      break;
    case 'warning':
      avatarFeedback.warning('Please check this');
      break;
    case 'info':
      avatarFeedback.info('Just so you know...');
      break;
  }
  log.info({ expression }, 'Triggered avatar expression');
}

// Disabled: Eye animations removed - keeping just zen blink
// function triggerFerniEye() { ... }

// ============================================================================
// 🎬 PIXAR EMOTIONS - Eye Lid Expressions & Advanced Reactions
// ============================================================================

/**
 * Trigger a Pixar eye lid expression.
 */
function triggerPixarExpression(expression: EmotionalExpression): void {
  // Initialize if not already done
  initPixarEmotions();

  // Set the expression with hold for demo purposes
  const holdDuration = expression === 'neutral' ? 0 : DURATION.CELEBRATION;
  pixarEmotions.setExpression(expression, DURATION.SLOW, holdDuration);

  log.info({ expression }, 'Triggered Pixar expression');
}

/**
 * Trigger a Pixar advanced reaction.
 */
function triggerPixarReaction(reaction: AdvancedReaction): void {
  // Initialize if not already done
  initPixarEmotions();

  switch (reaction) {
    case 'doubleTake':
      pixarEmotions.doubleTake();
      break;
    case 'heldPose':
      pixarEmotions.heldPose('happy', DURATION.SLOW);
      break;
    case 'lookAway':
      pixarEmotions.lookAwayThinking(2000);
      break;
    case 'nervousEnergy':
      pixarEmotions.nervousEnergy(1500);
      break;
    case 'delightSparkle':
      pixarEmotions.delightSparkle();
      break;
    default:
      log.warn({ reaction }, 'Unknown Pixar reaction');
  }

  log.info({ reaction }, 'Triggered Pixar reaction');
}

/**
 * Trigger a Pixar text-to-icon morph.
 */
async function triggerPixarMorph(iconType: string): Promise<void> {
  // Initialize if not already done
  initPixarEmotions();

  // Define icon SVGs (using Lucide-style icons)
  const icons: Record<string, string> = {
    lightbulb:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
    heart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    sparkles:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  };

  const iconSvg = icons[iconType];
  if (!iconSvg) {
    log.warn({ iconType }, 'Unknown icon type for morph');
    return;
  }

  // Morph text → icon
  const iconElement = await pixarEmotions.morphTextToIcon(iconSvg, DURATION.MODERATE);

  // Hold the icon visible
  await new Promise((resolve) => setTimeout(resolve, DURATION.CELEBRATION));

  // Morph icon → text
  await pixarEmotions.morphIconToText(iconElement);

  log.info({ iconType }, 'Completed Pixar morph');
}

function triggerMusicAction(action: string): void {
  switch (action) {
    case 'start-music':
      // Start dancing - audio level callback not yet implemented
      avatarFeedback.dancing();
      log.info('Started music visualization (dancing mode)');
      break;

    case 'stop-music':
      // Stop dancing
      avatarFeedback.stopDancing();
      log.info('Stopped music');
      break;

    case 'duck-music':
      avatarFeedback.ducking();
      log.info('Music ducking (simulating agent speech)');
      break;

    case 'unduck-music':
      avatarFeedback.unduck();
      log.info('Music unduck');
      break;
  }
}

// ============================================================================
// VOICE MODE TESTING - Listening/Speaking states
// ============================================================================

function triggerVoiceMode(mode: string): void {
  switch (mode) {
    case 'start-listening':
      presenceUI.setListening(true);
      presenceUI.setVoiceEmotion('thoughtful');
      presenceUI.attentiveLean();
      log.info('Started listening mode');
      break;

    case 'stop-listening':
      presenceUI.setListening(false);
      presenceUI.setVoiceEmotion('neutral');
      log.info('Stopped listening mode');
      break;

    case 'start-speaking':
      presenceUI.setSpeaking(true);
      presenceUI.setSpeakingIntensity('emphasis');
      log.info('Started speaking mode');
      break;

    case 'stop-speaking':
      presenceUI.setSpeaking(false);
      presenceUI.setSpeakingIntensity('whisper');
      log.info('Stopped speaking mode');
      break;

    default:
      log.warn({ mode }, 'Unknown voice mode');
  }
}

// ============================================================================
// GREETING ANIMATIONS - Time-of-day specific
// ============================================================================

function triggerGreeting(greeting: string): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;

  switch (greeting) {
    case 'morning':
      // Energetic morning greeting - bright and bouncy
      presenceUI.flashEmotion('excited', 2000);
      presenceUI.bounce();
      avatar?.animate(
        [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(1.08) rotate(-3deg)', offset: 0.3 },
          { transform: 'scale(1.05) rotate(3deg)', offset: 0.6 },
          { transform: 'scale(1) rotate(0deg)' },
        ],
        { duration: 800, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      log.info('Morning greeting triggered');
      break;

    case 'evening':
      // Calm evening greeting - gentle and warm
      presenceUI.flashEmotion('calm', 2500);
      avatar?.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.03)', offset: 0.5 },
          { transform: 'scale(1)' },
        ],
        { duration: 1500, easing: 'ease-in-out' }
      );
      presenceUI.nod();
      log.info('Evening greeting triggered');
      break;

    case 'latenight':
      // Sleepy late night - very gentle
      presenceUI.setVoiceEmotion('calm');
      triggerSleepy();
      setTimeout(() => presenceUI.setVoiceEmotion('neutral'), 2000);
      log.info('Late night greeting triggered');
      break;

    case 'welcomeback':
      // Happy to see you again!
      presenceUI.flashEmotion('happy', 2000);
      presenceUI.joy();
      setTimeout(() => presenceUI.bounce(), 300);
      log.info('Welcome back greeting triggered');
      break;

    default:
      log.warn({ greeting }, 'Unknown greeting type');
  }
}

// ============================================================================
// CELEBRATION ANIMATIONS - Milestone-specific
// ============================================================================

function triggerCelebration(celebration: string): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;

  switch (celebration) {
    case 'streak-5':
      // 5-day streak - excited bounce
      presenceUI.flashEmotion('excited', 2000);
      presenceUI.bounce();
      void celebrationBurst();
      log.info('5-day streak celebration triggered');
      break;

    case 'streak-30':
      // 30-day streak - MEGA celebration!
      presenceUI.flashEmotion('excited', 3000);
      void celebrationBurst();
      avatar?.animate(
        [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(1.15) rotate(-5deg)', offset: 0.2 },
          { transform: 'scale(1.1) rotate(5deg)', offset: 0.4 },
          { transform: 'scale(1.15) rotate(-3deg)', offset: 0.6 },
          { transform: 'scale(1.1) rotate(3deg)', offset: 0.8 },
          { transform: 'scale(1) rotate(0deg)' },
        ],
        { duration: 1200, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      // Double burst!
      setTimeout(() => void celebrationBurst(), 400);
      log.info('30-day streak celebration triggered');
      break;

    case 'goal':
      // Goal completed - satisfied nod + celebration
      presenceUI.flashEmotion('happy', 2000);
      presenceUI.nod();
      void celebrationBurst();
      avatarFeedback.success('Goal achieved!');
      log.info('Goal celebration triggered');
      break;

    case 'team':
      // New team member - thoughtful + excited
      presenceUI.flashEmotion('thoughtful', 1000);
      setTimeout(() => {
        presenceUI.flashEmotion('excited', 2000);
        presenceUI.joy();
      }, 500);
      log.info('Team member celebration triggered');
      break;

    default:
      avatarFeedback.success(`Celebration: ${celebration}`);
      log.info({ celebration }, 'Generic celebration triggered');
  }
}

function triggerThinking(thinking: string): void {
  if (thinking === 'start') {
    avatarFeedback.thinking();
    presenceUI.setVoiceEmotion('thoughtful');
    presenceUI.curiousTilt();
    log.info('Started thinking mode');
  } else {
    avatarFeedback.stopThinking();
    presenceUI.flashEmotion('happy', 1000); // "Aha!" moment
    presenceUI.setVoiceEmotion('neutral');
    log.info('Stopped thinking mode (with insight)');
  }
}

// ============================================================================
// 🌅 WRAP-UP - Test conversation ending flow
// ============================================================================

function triggerWrapUp(sentiment: string): void {
  // Import dynamically to avoid circular deps
  import('../state/app.state.js').then(({ setWrappingUp }) => {
    import('../app/data-message-handlers.js').then(({ handleWrapUp }) => {
      if (sentiment === 'reset') {
        // Reset wrap-up state
        setWrappingUp(false);
        presenceUI.setVoiceEmotion('neutral');
        log.info('Reset wrap-up state');
        return;
      }

      // Simulate receiving a wrap_up message from the agent
      const wrapUpEvent = {
        type: 'wrap_up' as const,
        sentiment: sentiment as 'warm' | 'encouraging' | 'thoughtful' | 'caring',
        timestamp: Date.now(),
      };

      handleWrapUp(wrapUpEvent);
      log.info(`Triggered wrap-up: ${sentiment}`);
    });
  });
}

// ============================================================================
// DRAMATIC ANIMATIONS - Pixar-style character moves
// ============================================================================

function triggerDramatic(dramatic: string): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  if (!avatar) return;

  switch (dramatic) {
    case 'bounce':
      // Pixar-style bounce with squash and stretch
      avatar.animate(
        [
          { transform: 'scale(1, 1) translateY(0)' },
          { transform: 'scale(0.9, 1.1) translateY(-15px)', offset: 0.3 },
          { transform: 'scale(1.1, 0.9) translateY(5px)', offset: 0.5 },
          { transform: 'scale(0.95, 1.05) translateY(-5px)', offset: 0.7 },
          { transform: 'scale(1, 1) translateY(0)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      log.info('Dramatic bounce triggered');
      break;

    case 'wobble':
      // Excited side-to-side wobble
      presenceUI.flashEmotion('excited', 1500);
      avatar.animate(
        [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-8deg)', offset: 0.1 },
          { transform: 'rotate(8deg)', offset: 0.2 },
          { transform: 'rotate(-8deg)', offset: 0.3 },
          { transform: 'rotate(8deg)', offset: 0.4 },
          { transform: 'rotate(-5deg)', offset: 0.5 },
          { transform: 'rotate(5deg)', offset: 0.6 },
          { transform: 'rotate(-3deg)', offset: 0.7 },
          { transform: 'rotate(3deg)', offset: 0.8 },
          { transform: 'rotate(0deg)' },
        ],
        { duration: 800, easing: 'ease-out' }
      );
      log.info('Excited wobble triggered');
      break;

    case 'shake':
      // Concerned head shake
      presenceUI.shake();
      presenceUI.flashEmotion('empathetic', 1500);
      log.info('Head shake triggered');
      break;

    case 'perky':
      // Perky attention - quick scale up and tilt
      presenceUI.flashEmotion('excited', 1500);
      avatar.animate(
        [
          { transform: 'scale(1) rotate(0deg) translateY(0)' },
          { transform: 'scale(1.1) rotate(-5deg) translateY(-8px)', offset: 0.3 },
          { transform: 'scale(1.05) rotate(-3deg) translateY(-4px)', offset: 0.6 },
          { transform: 'scale(1) rotate(0deg) translateY(0)' },
        ],
        { duration: 500, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      presenceUI.attentiveLean();
      log.info('Perky attention triggered');
      break;

    default:
      log.warn({ dramatic }, 'Unknown dramatic animation');
  }
}

// ============================================================================
// RING & AURA EFFECTS - Heartbeat and glow
// ============================================================================

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function triggerRingEffect(ring: string): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  const avatarRing = document.querySelector('.avatar-ring, .coach-ring') as HTMLElement;

  switch (ring) {
    case 'heartbeat-slow':
      // Slow heartbeat - 60 BPM
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        avatar?.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.03)', offset: 0.15 },
            { transform: 'scale(1)', offset: 0.3 },
            { transform: 'scale(1.02)', offset: 0.45 },
            { transform: 'scale(1)' },
          ],
          { duration: 1000, easing: 'ease-out' }
        );
      }, 1000);
      presenceUI.setVoiceEmotion('calm');
      log.info('Slow heartbeat started');
      break;

    case 'heartbeat-fast':
      // Fast heartbeat - 120 BPM
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        avatar?.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.05)', offset: 0.2 },
            { transform: 'scale(1)', offset: 0.4 },
            { transform: 'scale(1.03)', offset: 0.6 },
            { transform: 'scale(1)' },
          ],
          { duration: 500, easing: 'ease-out' }
        );
      }, 500);
      presenceUI.setVoiceEmotion('excited');
      log.info('Fast heartbeat started');
      break;

    case 'heartbeat-stop':
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      presenceUI.setVoiceEmotion('neutral');
      log.info('Heartbeat stopped');
      break;

    case 'aura':
      // Pulse the aura/ring
      if (avatarRing) {
        avatarRing.animate(
          [
            { boxShadow: '0 0 0 0 var(--persona-glow, rgba(74, 103, 65, 0.4))' },
            { boxShadow: '0 0 30px 15px var(--persona-glow, rgba(74, 103, 65, 0.6))', offset: 0.5 },
            { boxShadow: '0 0 0 0 var(--persona-glow, rgba(74, 103, 65, 0.4))' },
          ],
          { duration: 1500, easing: 'ease-in-out' }
        );
      }
      // Also pulse the avatar itself
      avatar?.animate(
        [
          { filter: 'brightness(1) drop-shadow(0 0 0 transparent)' },
          {
            filter: 'brightness(1.1) drop-shadow(0 0 20px var(--persona-primary, #4a6741))',
            offset: 0.5,
          },
          { filter: 'brightness(1) drop-shadow(0 0 0 transparent)' },
        ],
        { duration: 1500, easing: 'ease-in-out' }
      );
      log.info('Aura pulse triggered');
      break;

    default:
      log.warn({ ring }, 'Unknown ring effect');
  }
}

// ============================================================================
// FERNI EMOTION SYSTEM TESTING
// ============================================================================

// Map UI button values to valid VoiceEmotion types
const EMOTION_MAP: Record<string, VoiceEmotion> = {
  neutral: 'neutral',
  happy: 'happy',
  excited: 'excited',
  calm: 'calm',
  thinking: 'thoughtful', // Map thinking → thoughtful
  thoughtful: 'thoughtful',
  curious: 'thoughtful', // Map curious → thoughtful (closest)
  sad: 'empathetic', // Map sad → empathetic
  empathetic: 'empathetic',
  frustrated: 'serious', // Map frustrated → serious
  serious: 'serious',
  anxious: 'anxious',
  encouraging: 'encouraging',
};

function triggerEmotion(emotion: string): void {
  const mappedEmotion = EMOTION_MAP[emotion] || 'neutral';
  presenceUI.setVoiceEmotion(mappedEmotion);
  log.info({ emotion, mapped: mappedEmotion }, 'Set Ferni emotion');
}

function triggerReaction(reaction: string): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;

  switch (reaction) {
    case 'nod':
      presenceUI.nod();
      log.info('Nod triggered');
      break;

    case 'shake':
      presenceUI.shake();
      log.info('Shake triggered');
      break;

    case 'bounce':
      presenceUI.bounce();
      log.info('Bounce triggered');
      break;

    case 'pulse':
      presenceUI.pulse();
      log.info('Pulse triggered');
      break;

    case 'celebrate':
      // Full celebration sequence
      presenceUI.flashEmotion('excited', 2000);
      presenceUI.bounce();
      void celebrationBurst();
      avatar?.animate(
        [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(1.1) rotate(-5deg)', offset: 0.25 },
          { transform: 'scale(1.1) rotate(5deg)', offset: 0.5 },
          { transform: 'scale(1.05) rotate(-3deg)', offset: 0.75 },
          { transform: 'scale(1) rotate(0deg)' },
        ],
        { duration: 800, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      log.info('Celebrate triggered');
      break;

    // 🎉 NEW: Fun micro-reactions using CSS-based animations
    case 'happy':
    case 'curious':
    case 'empathy':
    case 'laugh':
    case 'surprise':
      avatarFeedback.react(reaction as 'happy' | 'curious' | 'empathy' | 'laugh' | 'surprise');
      log.info({ reaction }, '🎉 Fun reaction triggered');
      break;

    default:
      log.warn({ reaction }, 'Unknown reaction');
  }
}

function triggerFlashEmotion(emotion: string): void {
  const mappedEmotion = EMOTION_MAP[emotion] || 'neutral';
  presenceUI.flashEmotion(mappedEmotion, 2000);
  log.info({ emotion, mapped: mappedEmotion }, 'Flashed Ferni emotion (2s)');
}

// ============================================================================
// RIPPLE & BURST EFFECTS - Visual feedback particles
// ============================================================================

function triggerRippleEffect(ripple: string): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  if (!avatar) return;

  const rect = avatar.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  switch (ripple) {
    case 'single':
      createRipple(centerX, centerY, 1);
      log.info('Single ripple triggered');
      break;

    case 'multi':
      createRipple(centerX, centerY, 3, 150);
      log.info('Multi ripple triggered');
      break;

    case 'burst':
      void celebrationBurst();
      presenceUI.flashEmotion('excited', 1500);
      log.info('Burst triggered');
      break;

    case 'big':
      // BIG celebration - multiple effects
      void celebrationBurst();
      presenceUI.flashEmotion('excited', 2500);
      createRipple(centerX, centerY, 5, 100);
      avatar.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.15)', offset: 0.3 },
          { transform: 'scale(1)' },
        ],
        { duration: 600, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      setTimeout(() => void celebrationBurst(), 300);
      log.info('BIG celebration triggered');
      break;

    default:
      log.warn({ ripple }, 'Unknown ripple effect');
  }
}

/**
 * Create expanding ripple circles from a point
 */
function createRipple(x: number, y: number, count = 1, delay = 0): void {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const ripple = document.createElement('div');
      ripple.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        border: 2px solid var(--persona-primary, #4a6741);
        background: transparent;
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 9998;
      `;
      document.body.appendChild(ripple);

      ripple.animate(
        [
          {
            width: '10px',
            height: '10px',
            opacity: 0.8,
            borderWidth: '2px',
          },
          {
            width: '200px',
            height: '200px',
            opacity: 0,
            borderWidth: '1px',
          },
        ],
        {
          duration: 800,
          easing: 'ease-out',
          fill: 'forwards',
        }
      );

      setTimeout(() => ripple.remove(), 850);
    }, i * delay);
  }
}

// ============================================================================
// CONNECTION & AUDIO HANDLERS
// ============================================================================

function triggerConnectionState(state: string): void {
  switch (state) {
    case 'connecting':
      avatarFeedback.connecting();
      presenceUI.setConnected(false);
      log.info('Showing connecting state');
      break;
    case 'connected':
      avatarFeedback.stopConnecting();
      presenceUI.setConnected(true);
      avatarFeedback.success('Connected!');
      log.info('Showing connected state');
      break;
    case 'disconnected':
      avatarFeedback.stopConnecting();
      avatarFeedback.disconnected();
      presenceUI.setConnected(false);
      log.info('Showing disconnected state');
      break;
    case 'error':
      avatarFeedback.error('Connection failed');
      log.info('Showing error state');
      break;
    default:
      log.warn({ state }, 'Unknown connection state');
  }
}

function triggerSound(sound: string): void {
  // Import sound UI dynamically to avoid circular deps
  import('./sound.ui.js')
    .then(({ soundUI }) => {
      switch (sound) {
        case 'connect':
          soundUI.playConnect();
          break;
        case 'disconnect':
          soundUI.playDisconnect();
          break;
        case 'success':
          soundUI.playSuccess();
          break;
        case 'error':
          // No dedicated error sound - use disconnect as fallback
          soundUI.playDisconnect();
          break;
        case 'hover':
          // Use click for hover feedback
          soundUI.playClick();
          break;
        case 'click':
          soundUI.playClick();
          break;
        default:
          log.warn({ sound }, 'Unknown sound');
      }
      log.info({ sound }, 'Played sound');
    })
    .catch(() => {
      log.warn('Sound UI not available');
    });
}

// ============================================================================
// MESSAGE & TOAST HANDLERS
// ============================================================================

function triggerMessage(message: string): void {
  switch (message) {
    case 'user':
      // Dispatch a test user transcript
      window.dispatchEvent(
        new CustomEvent('ferni:transcript', {
          detail: {
            type: 'user',
            text: 'This is a test user message from the dev panel!',
          },
        })
      );
      log.info('Injected user message');
      break;
    case 'agent':
      // Dispatch a test agent transcript
      window.dispatchEvent(
        new CustomEvent('ferni:transcript', {
          detail: {
            type: 'agent',
            text: 'Hi there! This is Ferni responding from the dev panel test.',
            isFinal: true,
          },
        })
      );
      log.info('Injected agent message');
      break;
    case 'thinking':
      avatarFeedback.thinking();
      setTimeout(() => avatarFeedback.stopThinking(), 3000);
      log.info('Triggered thinking state for 3s');
      break;
    case 'whisper':
      avatarFeedback.whisper('Testing the whisper feature...');
      setTimeout(() => avatarFeedback.hideWhisper(), 3000);
      log.info('Triggered whisper');
      break;
    default:
      log.warn({ message }, 'Unknown message type');
  }
}

function triggerToast(toastType: string): void {
  // Use the cute white whisper toast near the avatar
  import('./message.ui.js')
    .then(({ showMessage }) => {
      switch (toastType) {
        case 'success':
          showMessage('Great job!', 'success', 2500);
          break;
        case 'error':
          showMessage('Something went wrong.', 'error', 3500);
          break;
        case 'info':
          showMessage("Here's some info.", 'info', 2500);
          break;
        case 'warning':
          showMessage('Please check your input.', 'warning', 3000);
          break;
        default:
          log.warn({ toastType }, 'Unknown toast type');
      }
      log.info({ toastType }, 'Triggered whisper toast');
    })
    .catch(() => {
      log.warn('Message UI not available');
    });
}

// ============================================================================
// MODAL HANDLERS
// ============================================================================

function openModal(modal: string): void {
  switch (modal) {
    case 'analytics':
      window.dispatchEvent(new CustomEvent('ferni:open-analytics'));
      log.info('Opening analytics');
      break;
    case 'history':
      window.dispatchEvent(new CustomEvent('ferni:open-history'));
      log.info('Opening conversation history');
      break;
    case 'insights':
      window.dispatchEvent(new CustomEvent('ferni:open-insights'));
      log.info('Opening insights');
      break;
    case 'predictions':
      window.dispatchEvent(new CustomEvent('ferni:open-predictions'));
      log.info('Opening predictions');
      break;
    case 'tour':
      window.dispatchEvent(new CustomEvent('ferni:start-tour'));
      log.info('Starting app tour');
      break;
    case 'daily':
      window.dispatchEvent(new CustomEvent('ferni:open-daily-practice'));
      log.info('Opening daily check-in');
      break;
    case 'huddle':
      window.dispatchEvent(new CustomEvent('ferni:open-team-huddle'));
      log.info('Opening team huddle');
      break;
    case 'marketplace':
      window.dispatchEvent(new CustomEvent('ferni:open-marketplace'));
      log.info('Opening marketplace');
      break;
    default:
      log.warn({ modal }, 'Unknown modal');
  }
}

// ============================================================================
// TIME & ENVIRONMENT HANDLERS
// ============================================================================

let timeOverride: number | null = null;

function setTimeOverride(time: string): void {
  switch (time) {
    case 'morning':
      timeOverride = 6; // 6 AM
      document.documentElement.setAttribute('data-time', 'morning');
      log.info('Time set to morning (6 AM)');
      break;
    case 'afternoon':
      timeOverride = 14; // 2 PM
      document.documentElement.setAttribute('data-time', 'afternoon');
      log.info('Time set to afternoon (2 PM)');
      break;
    case 'evening':
      timeOverride = 19; // 7 PM
      document.documentElement.setAttribute('data-time', 'evening');
      log.info('Time set to evening (7 PM)');
      break;
    case 'night':
      timeOverride = 23; // 11 PM
      document.documentElement.setAttribute('data-time', 'night');
      log.info('Time set to night (11 PM)');
      break;
    case 'reset':
      timeOverride = null;
      document.documentElement.removeAttribute('data-time');
      log.info('Time reset to real time');
      break;
    default:
      log.warn({ time }, 'Unknown time setting');
  }

  // Dispatch event so other components can react
  window.dispatchEvent(
    new CustomEvent('ferni:time-override', {
      detail: { hour: timeOverride },
    })
  );
}

function toggleA11ySetting(a11y: string): void {
  const root = document.documentElement;

  switch (a11y) {
    case 'reduce-motion':
      const hasReducedMotion = root.classList.toggle('reduce-motion');
      log.info({ enabled: hasReducedMotion }, 'Toggled reduced motion');
      break;
    case 'high-contrast':
      const hasHighContrast = root.classList.toggle('high-contrast');
      log.info({ enabled: hasHighContrast }, 'Toggled high contrast');
      break;
    case 'large-text':
      const hasLargeText = root.classList.toggle('large-text');
      log.info({ enabled: hasLargeText }, 'Toggled large text');
      break;
    default:
      log.warn({ a11y }, 'Unknown accessibility setting');
  }
}

// ============================================================================
// EASTER EGG HANDLERS
// ============================================================================

function triggerEasterEgg(easter: string): void {
  switch (easter) {
    case 'confetti':
      // Create confetti burst
      createConfetti(50);
      presenceUI.flashEmotion('excited', 2000);
      log.info('Triggered confetti');
      break;
    case 'fireworks':
      // Multiple confetti bursts
      createConfetti(30);
      setTimeout(() => createConfetti(30), 200);
      setTimeout(() => createConfetti(30), 400);
      presenceUI.flashEmotion('excited', 3000);
      log.info('Triggered fireworks');
      break;
    case 'party':
      // Party mode - dance + confetti + celebration
      createConfetti(100);
      void celebrationBurst();
      presenceUI.flashEmotion('excited', 5000);
      const avatar = document.querySelector('#coachAvatar') as HTMLElement;
      if (avatar) {
        avatar.animate(
          [
            { transform: 'rotate(0deg) scale(1)' },
            { transform: 'rotate(-10deg) scale(1.1)', offset: 0.1 },
            { transform: 'rotate(10deg) scale(1.1)', offset: 0.2 },
            { transform: 'rotate(-10deg) scale(1.1)', offset: 0.3 },
            { transform: 'rotate(10deg) scale(1.1)', offset: 0.4 },
            { transform: 'rotate(-5deg) scale(1.05)', offset: 0.5 },
            { transform: 'rotate(5deg) scale(1.05)', offset: 0.6 },
            { transform: 'rotate(-5deg) scale(1.05)', offset: 0.7 },
            { transform: 'rotate(5deg) scale(1.05)', offset: 0.8 },
            { transform: 'rotate(0deg) scale(1)' },
          ],
          { duration: 2000, easing: 'ease-in-out' }
        );
      }
      log.info('PARTY MODE ACTIVATED! 🎉');
      break;
    case 'zen':
      // Calm zen moment
      presenceUI.setVoiceEmotion('calm');
      const avatarZen = document.querySelector('#coachAvatar') as HTMLElement;
      if (avatarZen) {
        avatarZen.animate(
          [
            { transform: 'scale(1)', filter: 'brightness(1)' },
            { transform: 'scale(1.02)', filter: 'brightness(1.05)', offset: 0.5 },
            { transform: 'scale(1)', filter: 'brightness(1)' },
          ],
          { duration: 4000, easing: 'ease-in-out', iterations: 3 }
        );
      }
      setTimeout(() => presenceUI.setVoiceEmotion('neutral'), 12000);
      log.info('Zen moment triggered');
      break;
    default:
      log.warn({ easter }, 'Unknown easter egg');
  }
}

/**
 * Create confetti particles
 */
function createConfetti(count: number): void {
  const colors = ['#4a6741', '#7cb571', '#c4a265', '#e8e2da', '#9dd690'];

  for (let i = 0; i < count; i++) {
    const confetti = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const startX = Math.random() * window.innerWidth;
    const startY = -20;
    const endX = startX + (Math.random() - 0.5) * 400;
    const endY = window.innerHeight + 20;
    const rotation = Math.random() * 720 - 360;
    const size = Math.random() * 8 + 4;

    confetti.style.cssText = `
      position: fixed;
      left: ${startX}px;
      top: ${startY}px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      pointer-events: none;
      z-index: 99999;
    `;
    document.body.appendChild(confetti);

    confetti.animate(
      [
        {
          transform: 'translate(0, 0) rotate(0deg)',
          opacity: 1,
        },
        {
          transform: `translate(${endX - startX}px, ${endY}px) rotate(${rotation}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: Math.random() * 2000 + 1500,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill: 'forwards',
      }
    );

    setTimeout(() => confetti.remove(), 4000);
  }
}

// Export time override getter for other modules
export function getTimeOverride(): number | null {
  return timeOverride;
}

// ============================================================================
// STATE INSPECTOR HANDLERS
// ============================================================================

function handleStateAction(action: string): void {
  switch (action) {
    case 'toggle-mute':
      const currentMuted = appState.getState().isMuted;
      appState.set('isMuted', !currentMuted);
      updateStateDisplay();
      log.info({ muted: !currentMuted }, 'Toggled mute state');
      break;
    case 'refresh':
      updateStateDisplay();
      log.info('Refreshed state display');
      break;
    default:
      log.warn({ action }, 'Unknown state action');
  }
}

function updateStateDisplay(): void {
  const state = appState.getState();
  const connectionEl = document.getElementById('state-connection');
  const personaEl = document.getElementById('state-persona');
  const mutedEl = document.getElementById('state-muted');
  const usernameEl = document.getElementById('state-username');

  if (connectionEl) connectionEl.textContent = state.connection;
  if (personaEl) personaEl.textContent = state.activePersona?.id || 'ferni';
  if (mutedEl) mutedEl.textContent = state.isMuted ? 'Yes' : 'No';
  if (usernameEl) usernameEl.textContent = state.userName || '(none)';
}

// ============================================================================
// WAVEFORM STATE HANDLERS
// ============================================================================

function triggerWaveformState(waveform: string): void {
  switch (waveform) {
    case 'idle':
      presenceUI.setSpeaking(false);
      presenceUI.setListening(false);
      presenceUI.setSpeakingIntensity('whisper');
      log.info('Waveform: idle');
      break;
    case 'listening':
      presenceUI.setSpeaking(false);
      presenceUI.setListening(true);
      log.info('Waveform: listening');
      break;
    case 'speaking-low':
      presenceUI.setSpeaking(true);
      presenceUI.setListening(false);
      presenceUI.setSpeakingIntensity('whisper');
      log.info('Waveform: speaking low');
      break;
    case 'speaking-med':
      presenceUI.setSpeaking(true);
      presenceUI.setListening(false);
      presenceUI.setSpeakingIntensity('normal');
      log.info('Waveform: speaking medium');
      break;
    case 'speaking-high':
      presenceUI.setSpeaking(true);
      presenceUI.setListening(false);
      presenceUI.setSpeakingIntensity('exclamation');
      log.info('Waveform: speaking high');
      break;
    case 'thinking':
      presenceUI.setSpeaking(false);
      presenceUI.setListening(false);
      avatarFeedback.thinking();
      setTimeout(() => avatarFeedback.stopThinking(), 5000);
      log.info('Waveform: thinking (5s)');
      break;
    default:
      log.warn({ waveform }, 'Unknown waveform state');
  }
}

// ============================================================================
// LOADING STATE HANDLERS
// ============================================================================

let skeletonElements: HTMLElement[] = [];

function triggerLoadingState(loading: string): void {
  switch (loading) {
    case 'skeleton-avatar':
      showAvatarSkeleton();
      log.info('Showing avatar skeleton');
      break;
    case 'skeleton-team':
      showTeamSkeleton();
      log.info('Showing team skeleton');
      break;
    case 'spinner':
      showSpinner();
      log.info('Showing spinner');
      break;
    case 'clear':
      clearLoadingStates();
      log.info('Cleared all loading states');
      break;
    default:
      log.warn({ loading }, 'Unknown loading state');
  }
}

function showAvatarSkeleton(): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  if (!avatar) return;

  avatar.classList.add('skeleton-loading');
  avatar.style.setProperty('--skeleton-opacity', '0.7');

  setTimeout(() => {
    avatar.classList.remove('skeleton-loading');
    avatar.style.removeProperty('--skeleton-opacity');
  }, 3000);
}

function showTeamSkeleton(): void {
  const teamContainer = document.querySelector('.team-roster, .roster-container') as HTMLElement;
  if (!teamContainer) return;

  teamContainer.classList.add('skeleton-loading');
  setTimeout(() => teamContainer.classList.remove('skeleton-loading'), 3000);
}

function showSpinner(): void {
  const spinner = document.createElement('div');
  spinner.className = 'dev-spinner-overlay';
  spinner.innerHTML = `
    <div class="dev-spinner">
      <div class="dev-spinner-ring"></div>
      <span>Loading...</span>
    </div>
  `;
  document.body.appendChild(spinner);
  skeletonElements.push(spinner);

  setTimeout(() => {
    spinner.remove();
    skeletonElements = skeletonElements.filter((el) => el !== spinner);
  }, 3000);
}

function clearLoadingStates(): void {
  document.querySelectorAll('.skeleton-loading').forEach((el) => {
    el.classList.remove('skeleton-loading');
  });
  skeletonElements.forEach((el) => el.remove());
  skeletonElements = [];
}

// ============================================================================
// STREAK CELEBRATION HANDLERS
// ============================================================================

function triggerStreakCelebration(days: number): void {
  // Determine celebration intensity based on streak
  const intensityMap: Record<number, 'small' | 'medium' | 'large' | 'epic'> = {
    3: 'small',
    7: 'small',
    14: 'medium',
    30: 'medium',
    60: 'large',
    90: 'large',
    365: 'epic',
  };

  const intensity = intensityMap[days] || 'small';
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;

  // Dispatch streak event
  window.dispatchEvent(
    new CustomEvent('ferni:streak-milestone', {
      detail: { days, intensity },
    })
  );

  // Visual celebration based on intensity
  switch (intensity) {
    case 'small':
      presenceUI.flashEmotion('happy', 1500);
      presenceUI.bounce();
      break;
    case 'medium':
      presenceUI.flashEmotion('excited', 2000);
      presenceUI.bounce();
      void celebrationBurst();
      break;
    case 'large':
      presenceUI.flashEmotion('excited', 3000);
      void celebrationBurst();
      createConfetti(50);
      avatar?.animate(
        [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(1.1) rotate(-5deg)', offset: 0.25 },
          { transform: 'scale(1.1) rotate(5deg)', offset: 0.5 },
          { transform: 'scale(1.05) rotate(-3deg)', offset: 0.75 },
          { transform: 'scale(1) rotate(0deg)' },
        ],
        { duration: 1000, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      break;
    case 'epic':
      // EPIC 365-day celebration!
      presenceUI.flashEmotion('excited', 5000);
      void celebrationBurst();
      createConfetti(100);
      setTimeout(() => void celebrationBurst(), 300);
      setTimeout(() => createConfetti(50), 500);
      setTimeout(() => void celebrationBurst(), 800);
      avatar?.animate(
        [
          { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
          { transform: 'scale(1.15) rotate(-10deg)', filter: 'brightness(1.2)', offset: 0.2 },
          { transform: 'scale(1.15) rotate(10deg)', filter: 'brightness(1.2)', offset: 0.4 },
          { transform: 'scale(1.2) rotate(-5deg)', filter: 'brightness(1.3)', offset: 0.6 },
          { transform: 'scale(1.2) rotate(5deg)', filter: 'brightness(1.3)', offset: 0.8 },
          { transform: 'scale(1) rotate(0deg)', filter: 'brightness(1)' },
        ],
        { duration: 2000, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
      );
      break;
  }

  log.info({ days, intensity }, 'Triggered streak celebration');
}

// ============================================================================
// NETWORK SIMULATION HANDLERS
// ============================================================================

let networkSimulation: string = 'excellent';
let latencySimulation: number = 0;

function setNetworkSimulation(network: string): void {
  networkSimulation = network;

  // Dispatch event for connection quality UI
  window.dispatchEvent(
    new CustomEvent('ferni:connection-quality', {
      detail: { quality: network },
    })
  );

  // Visual feedback
  switch (network) {
    case 'excellent':
      avatarFeedback.success('Excellent connection');
      break;
    case 'good':
      avatarFeedback.info('Good connection');
      break;
    case 'poor':
      avatarFeedback.warning('Poor connection');
      break;
    case 'offline':
      avatarFeedback.error('Offline mode');
      avatarFeedback.disconnected();
      break;
  }

  log.info({ network }, 'Set network simulation');
}

function setLatencySimulation(latency: number): void {
  latencySimulation = latency;

  // Store in window for other components to check
  (window as unknown as Record<string, number>).__devLatency = latency;

  avatarFeedback.info(`Latency: ${latency}ms`);
  log.info({ latency }, 'Set latency simulation');
}

// Export for other modules
export function getNetworkSimulation(): string {
  return networkSimulation;
}

export function getLatencySimulation(): number {
  return latencySimulation;
}

// ============================================================================
// STORAGE HANDLERS
// ============================================================================

function handleStorageAction(action: string): void {
  switch (action) {
    case 'view':
      viewStorage();
      break;
    case 'clear-cache':
      clearCache();
      break;
    case 'clear-all':
      clearAllStorage();
      break;
    case 'export':
      exportStorage();
      break;
    default:
      log.warn({ action }, 'Unknown storage action');
  }
}

function viewStorage(): void {
  const ferniKeys = Object.keys(localStorage).filter(
    (k) => k.startsWith('ferni') || k.startsWith('voiceai')
  );

  const storageData: Record<string, unknown> = {};
  ferniKeys.forEach((key) => {
    try {
      storageData[key] = JSON.parse(localStorage.getItem(key) || '');
    } catch {
      storageData[key] = localStorage.getItem(key);
    }
  });

  // NOTE: Using console.group/log intentionally here for developer debugging
  // This is a dev-only feature that displays structured data in browser console
  // eslint-disable-next-line no-console
  console.group('📦 Ferni Storage');
  ferniKeys.forEach((key) => {
    // eslint-disable-next-line no-console
    console.log(`${key}:`, storageData[key]);
  });
  // eslint-disable-next-line no-console
  console.groupEnd();

  log.info({ count: ferniKeys.length }, 'Storage data logged to browser console');
  avatarFeedback.info(`${ferniKeys.length} items logged to console`);
}

function clearCache(): void {
  // Clear only cache-related keys
  const cacheKeys = Object.keys(localStorage).filter(
    (k) => k.includes('cache') || k.includes('temp')
  );
  cacheKeys.forEach((key) => localStorage.removeItem(key));

  avatarFeedback.success(`Cleared ${cacheKeys.length} cache items`);
  updateStorageCount();
  log.info({ count: cacheKeys.length }, 'Cleared cache');
}

function clearAllStorage(): void {
  if (!confirm('⚠️ This will clear ALL Ferni data including your progress. Continue?')) {
    return;
  }

  const ferniKeys = Object.keys(localStorage).filter(
    (k) => k.startsWith('ferni') || k.startsWith('voiceai')
  );
  ferniKeys.forEach((key) => localStorage.removeItem(key));

  avatarFeedback.warning(`Cleared ${ferniKeys.length} items`);
  updateStorageCount();
  log.info({ count: ferniKeys.length }, 'Cleared all Ferni storage');
}

function exportStorage(): void {
  const ferniKeys = Object.keys(localStorage).filter(
    (k) => k.startsWith('ferni') || k.startsWith('voiceai')
  );

  const exportData: Record<string, unknown> = {};
  ferniKeys.forEach((key) => {
    try {
      exportData[key] = JSON.parse(localStorage.getItem(key) || '');
    } catch {
      exportData[key] = localStorage.getItem(key);
    }
  });

  const jsonData = JSON.stringify(exportData, null, 2);

  // NOTE: Using console.log intentionally for developer debugging/export
  // eslint-disable-next-line no-console
  console.log('📤 EXPORT DATA (copy this):');
  // eslint-disable-next-line no-console
  console.log(jsonData);

  // Also copy to clipboard if possible
  navigator.clipboard
    .writeText(jsonData)
    .then(() => avatarFeedback.success('Copied to clipboard!'))
    .catch(() => avatarFeedback.info('Data logged to console'));

  log.info({ count: ferniKeys.length }, 'Storage data exported');
}

function updateStorageCount(): void {
  const countEl = document.getElementById('storage-count');
  if (countEl) {
    const count = Object.keys(localStorage).filter(
      (k) => k.startsWith('ferni') || k.startsWith('voiceai')
    ).length;
    countEl.textContent = String(count);
  }
}

// ============================================================================
// AMBIENT EFFECT HANDLERS
// ============================================================================

const ambientStates: Record<string, boolean> = {
  particles: false,
  glow: false,
  aurora: false,
};

function toggleAmbientEffect(effect: string): void {
  switch (effect) {
    case 'particles':
      ambientStates.particles = !ambientStates.particles;
      document.body.classList.toggle('ambient-particles', ambientStates.particles);
      log.info({ particles: ambientStates.particles }, 'Toggled particles');
      break;
    case 'glow':
      ambientStates.glow = !ambientStates.glow;
      document.body.classList.toggle('ambient-glow', ambientStates.glow);
      log.info({ glow: ambientStates.glow }, 'Toggled glow');
      break;
    case 'aurora':
      ambientStates.aurora = !ambientStates.aurora;
      document.body.classList.toggle('ambient-aurora', ambientStates.aurora);
      log.info({ aurora: ambientStates.aurora }, 'Toggled aurora');
      break;
    case 'off':
      Object.keys(ambientStates).forEach((key) => {
        ambientStates[key] = false;
        document.body.classList.remove(`ambient-${key}`);
      });
      log.info('All ambient effects off');
      break;
    default:
      log.warn({ effect }, 'Unknown ambient effect');
  }
}

function toggleWeatherEffect(weather: WeatherType | 'moment'): void {
  if (weather === 'moment') {
    playSeasonalMoment();
    log.info('Playing seasonal moment');
    return;
  }

  if (weather === 'none' || getCurrentWeather() === weather) {
    stopWeather();
    log.info('Weather stopped');
  } else {
    startWeather(weather);
    log.info({ weather }, 'Weather started');
  }
}

function refreshPanel(): void {
  if (isVisible && panel) {
    const wasVisible = isVisible;
    panel.remove();
    panel = createPanel();
    document.body.appendChild(panel);
    if (wasVisible) {
      panel.classList.add('dev-panel--visible');
    }
  }
}

// ============================================================================
// EXPORTS FOR EXTERNAL USE
// ============================================================================

export function getDevOverrides(): {
  tier: 'free' | 'friend' | 'partner' | null;
  stage: RelationshipStage | null;
  conversations: number | null;
} {
  return {
    tier: tierOverride,
    stage: stageOverride,
    conversations: conversationsOverride,
  };
}

export function isDevMode(): boolean {
  return DEV_MODE_ENABLED;
}

// ============================================================================
// STYLES
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('dev-panel-styles')) return;

  styleElement = document.createElement('style');
  styleElement.id = 'dev-panel-styles';
  styleElement.textContent = `
    /* ============================================
     * DEV PANEL - Ferni Brand Colors
     * Using Ferni's sage green palette
     * ============================================ */
    :root {
      /* Dev panel theme - Ferni sage green */
      --dev-bg: #2a3a28;
      --dev-bg-elevated: #354532;
      --dev-accent: #7cb571;
      --dev-accent-bright: #9dd690;
      --dev-accent-glow: rgba(124, 181, 113, 0.3);
      --dev-accent-glow-hover: rgba(124, 181, 113, 0.5);
      --dev-accent-border: rgba(124, 181, 113, 0.4);
      --dev-success: #7cb571;
      --dev-success-bright: #9dd690;
      --dev-success-sage: #90c090;
      --dev-celebrate: #c4a265;
      --dev-celebrate-glow: rgba(196, 162, 101, 0.25);
      --dev-text: #e8e2da;
      --dev-text-muted: rgba(232, 226, 218, 0.6);
    }

    /* Dev Indicator - VISIBLE! */
    .dev-indicator {
      position: fixed;
      bottom: var(--space-4, 16px);
      left: var(--space-4, 16px);
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: 10px 16px;
      background: linear-gradient(135deg, #3d5a35 0%, #4a6741 100%);
      color: #e8f5e3;
      font-family: 'Plus Jakarta Sans', var(--font-body, system-ui), sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-radius: var(--radius-lg, 12px);
      border: 2px solid rgba(124, 181, 113, 0.5);
      cursor: pointer;
      z-index: 9999;
      box-shadow: 
        0 4px 12px rgba(74, 103, 65, 0.4),
        0 0 20px rgba(124, 181, 113, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      animation: devBadgePulse 3s ease-in-out infinite;
    }

    @keyframes devBadgePulse {
      0%, 100% { box-shadow: 0 4px 12px rgba(74, 103, 65, 0.4), 0 0 20px rgba(124, 181, 113, 0.2); }
      50% { box-shadow: 0 4px 16px rgba(74, 103, 65, 0.5), 0 0 30px rgba(124, 181, 113, 0.35); }
    }

    .dev-indicator:hover {
      transform: scale(1.08) translateY(-2px);
      background: linear-gradient(135deg, #4a6741 0%, #5a8050 100%);
      box-shadow: 
        0 8px 20px rgba(74, 103, 65, 0.5),
        0 0 40px rgba(124, 181, 113, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
      animation: none;
    }
    
    .dev-indicator svg {
      width: 16px;
      height: 16px;
    }
    
    /* Dev Panel */
    .dev-panel {
      position: fixed;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 400px;
      max-height: calc(100vh - 32px);
      background: var(--dev-bg);
      border-radius: var(--radius-xl, 16px);
      box-shadow:
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        0 0 0 1px var(--dev-accent-border),
        0 0 60px rgba(74, 103, 65, 0.15);
      z-index: 10002;
      display: flex;
      flex-direction: column;
      opacity: 0;
      transform: translateX(20px);
      pointer-events: none;
      transition: all ${DURATION.SLOW}ms ${EASING.EXPO_OUT};
      overflow: hidden;
    }
    
    .dev-panel--visible {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }
    
    .dev-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4, 16px);
      background: linear-gradient(135deg, #3d5a35 0%, #4a6741 100%);
      border-bottom: 1px solid rgba(124, 181, 113, 0.3);
    }
    
    .dev-panel__title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      color: #e8f5e3;
      font-family: 'Plus Jakarta Sans', var(--font-body, system-ui), sans-serif;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    
    .dev-panel__title svg {
      width: 20px;
      height: 20px;
      color: #9dd690;
    }
    
    .dev-panel__close {
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.7);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-panel__close:hover {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      transform: rotate(90deg);
    }
    
    .dev-panel__close svg {
      width: 16px;
      height: 16px;
    }
    
    .dev-panel__content {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-4, 16px);
    }
    
    .dev-panel__footer {
      padding: var(--space-3, 12px);
      border-top: 1px solid rgba(124, 181, 113, 0.2);
      text-align: center;
      font-size: 0.7rem;
      color: var(--dev-text-muted);
      font-family: 'Plus Jakarta Sans', var(--font-body, system-ui), sans-serif;
      background: var(--dev-bg-elevated);
    }
    
    /* Sections */
    .dev-section {
      margin-bottom: var(--space-5, 20px);
    }
    
    .dev-section__title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--dev-accent);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 var(--space-3, 12px);
      font-family: 'Plus Jakarta Sans', var(--font-body, system-ui), sans-serif;
    }
    
    .dev-section__title svg {
      width: 14px;
      height: 14px;
      opacity: 0.8;
    }
    
    /* Info Grid */
    .dev-info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2, 8px);
    }
    
    .dev-info {
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--radius-md, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
    }
    
    .dev-info__label {
      display: block;
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.4);
      margin-bottom: 2px;
    }
    
    .dev-info__value {
      display: block;
      font-family: 'JetBrains Mono', 'SF Mono', monospace;
      font-size: 0.85rem;
      color: var(--dev-accent-bright);
      font-weight: 600;
    }
    
    /* Tier Buttons */
    .dev-tier-buttons {
      display: flex;
      gap: var(--space-2, 8px);
    }
    
    .dev-tier-btn {
      flex: 1;
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-tier-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }
    
    .dev-tier-btn--active {
      background: rgba(0, 212, 255, 0.2);
      border-color: var(--dev-accent);
      color: var(--dev-accent);
    }
    
    /* Stage Buttons */
    .dev-stage-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .dev-stage-btn {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.7rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-stage-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    
    .dev-stage-btn--active {
      background: rgba(0, 255, 136, 0.15);
      border-color: var(--dev-success);
      color: var(--dev-success);
    }
    
    /* Team Grid */
    .dev-team-grid {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }
    
    .dev-team-member {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--radius-md, 8px);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .dev-team-member--unlocked {
      border-color: var(--dev-accent-glow);
    }
    
    .dev-team-member__info {
      flex: 1;
    }
    
    .dev-team-member__name {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: white;
    }
    
    .dev-team-member__role {
      display: block;
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.4);
    }
    
    .dev-team-member__status {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .dev-team-member__status svg {
      width: 16px;
      height: 16px;
    }
    
    .dev-team-member--unlocked .dev-team-member__status {
      color: var(--dev-accent);
    }
    
    .dev-team-member:not(.dev-team-member--unlocked) .dev-team-member__status {
      color: rgba(255, 255, 255, 0.3);
    }
    
    .dev-team-member__celebrate {
      width: 28px;
      height: 28px;
      border: none;
      background: rgba(255, 255, 255, 0.05);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-team-member__celebrate:hover {
      background: var(--dev-celebrate-glow);
      color: var(--dev-celebrate);
    }
    
    .dev-team-member__celebrate svg {
      width: 14px;
      height: 14px;
    }
    
    /* Action Buttons */
    .dev-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
    }
    
    .dev-action-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }
    
    .dev-action-btn svg {
      width: 14px;
      height: 14px;
      color: var(--dev-accent);
    }
    
    /* Roster Controls */
    .dev-roster-controls {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .dev-roster-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(100, 200, 150, 0.1);
      border: 1px solid rgba(100, 200, 150, 0.2);
      border-radius: var(--radius-md, 8px);
      color: rgba(150, 220, 180, 0.9);
      font-size: 0.75rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-roster-btn:hover {
      background: rgba(100, 200, 150, 0.2);
      border-color: rgba(100, 200, 150, 0.3);
    }
    
    .dev-roster-btn--active {
      background: rgba(100, 200, 150, 0.25);
      border-color: rgba(100, 200, 150, 0.5);
      color: var(--dev-success-bright);
    }
    
    .dev-roster-btn svg {
      width: 14px;
      height: 14px;
    }
    
    /* Soul & Delight Buttons */
    .dev-section--soul {
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.1), rgba(196, 162, 101, 0.1));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-3, 12px);
      margin: 0 calc(var(--space-4, 16px) * -1);
      margin-bottom: var(--space-5, 20px);
    }
    
    .dev-soul-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .dev-soul-btn {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(74, 103, 65, 0.25);
      border: 1px solid rgba(74, 103, 65, 0.4);
      border-radius: var(--radius-md, 8px);
      color: #90c090;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-soul-btn:hover {
      background: rgba(74, 103, 65, 0.4);
      border-color: #4a6741;
      transform: scale(1.02);
      box-shadow: 0 0 12px rgba(74, 103, 65, 0.3);
    }
    
    .dev-soul-btn:active {
      transform: scale(0.98);
    }
    
    .dev-soul-btn--primary {
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.4), rgba(90, 128, 96, 0.4));
      border-color: #4a6741;
      color: #b0e0b0;
      font-weight: 600;
    }
    
    .dev-soul-btn--primary:hover {
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.6), rgba(90, 128, 96, 0.6));
      box-shadow: 0 0 20px rgba(74, 103, 65, 0.5);
    }
    
    .dev-soul-ideas {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .dev-soul-ideas span {
      padding: var(--space-1, 4px) var(--space-2, 8px);
      background: rgba(255, 255, 255, 0.05);
      border-radius: var(--radius-sm, 4px);
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.4);
      font-style: italic;
    }
    
    /* Handoff Buttons */
    .dev-handoff-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .dev-handoff-btn {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(74, 103, 65, 0.2);
      border: 1px solid rgba(74, 103, 65, 0.3);
      border-radius: var(--radius-md, 8px);
      color: var(--dev-success-sage);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-handoff-btn:hover {
      background: rgba(74, 103, 65, 0.3);
      border-color: #4a6741;
    }
    
    /* Section Description */
    .dev-section__desc {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.4);
      margin: -8px 0 12px;
    }
    
    /* Expression Buttons */
    .dev-expression-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .dev-expression-btn {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(255, 200, 100, 0.15);
      border: 1px solid rgba(255, 200, 100, 0.25);
      border-radius: var(--radius-md, 8px);
      color: #ffd080;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-expression-btn:hover {
      background: rgba(255, 200, 100, 0.25);
      border-color: rgba(255, 200, 100, 0.4);
      transform: scale(1.02);
    }
    
    .dev-expression-btn:active {
      transform: scale(0.98);
    }
    
    .dev-expression-btn--feedback {
      background: rgba(100, 180, 255, 0.15);
      border-color: rgba(100, 180, 255, 0.25);
      color: #80c0ff;
    }
    
    .dev-expression-btn--feedback:hover {
      background: rgba(100, 180, 255, 0.25);
      border-color: rgba(100, 180, 255, 0.4);
    }
    
    /* Voice Mode Buttons */
    .dev-expression-btn--mode {
      background: rgba(100, 255, 180, 0.15);
      border-color: rgba(100, 255, 180, 0.25);
      color: #80ffb0;
    }
    .dev-expression-btn--mode:hover {
      background: rgba(100, 255, 180, 0.25);
      border-color: rgba(100, 255, 180, 0.4);
    }
    
    /* Greeting Buttons */
    .dev-expression-btn--greeting {
      background: rgba(255, 180, 100, 0.15);
      border-color: rgba(255, 180, 100, 0.25);
      color: #ffb080;
    }
    .dev-expression-btn--greeting:hover {
      background: rgba(255, 180, 100, 0.25);
      border-color: rgba(255, 180, 100, 0.4);
    }
    
    /* Celebration Buttons */
    .dev-expression-btn--celebrate {
      background: rgba(255, 100, 180, 0.15);
      border-color: rgba(255, 100, 180, 0.25);
      color: #ff80b0;
    }
    .dev-expression-btn--celebrate:hover {
      background: rgba(255, 100, 180, 0.25);
      border-color: rgba(255, 100, 180, 0.4);
    }
    
    /* Thinking Buttons */
    .dev-expression-btn--thinking {
      background: rgba(180, 100, 255, 0.15);
      border-color: rgba(180, 100, 255, 0.25);
      color: #b080ff;
    }
    .dev-expression-btn--thinking:hover {
      background: rgba(180, 100, 255, 0.25);
      border-color: rgba(180, 100, 255, 0.4);
    }
    
    /* Wrap-up Buttons (warm golden) */
    .dev-expression-btn--wrap-up {
      background: rgba(184, 149, 106, 0.15);
      border-color: rgba(184, 149, 106, 0.25);
      color: #b8956a;
    }
    .dev-expression-btn--wrap-up:hover {
      background: rgba(184, 149, 106, 0.25);
      border-color: rgba(184, 149, 106, 0.4);
    }
    .dev-expression-btn--wrap-up.dev-expression-btn--reset {
      background: rgba(128, 128, 128, 0.15);
      border-color: rgba(128, 128, 128, 0.25);
      color: #a0a0a0;
    }
    .dev-expression-btn--wrap-up.dev-expression-btn--reset:hover {
      background: rgba(128, 128, 128, 0.25);
      border-color: rgba(128, 128, 128, 0.4);
    }
    
    /* Narrative Buttons (story beats - warm gold) */
    .dev-expression-btn--narrative {
      background: rgba(255, 215, 100, 0.15);
      border-color: rgba(255, 215, 100, 0.25);
      color: #ffd764;
    }
    .dev-expression-btn--narrative:hover {
      background: rgba(255, 215, 100, 0.25);
      border-color: rgba(255, 215, 100, 0.4);
    }
    
    /* Arc Buttons (story arcs - teal) */
    .dev-expression-btn--arc {
      background: rgba(100, 200, 200, 0.15);
      border-color: rgba(100, 200, 200, 0.25);
      color: #64c8c8;
    }
    .dev-expression-btn--arc:hover {
      background: rgba(100, 200, 200, 0.25);
      border-color: rgba(100, 200, 200, 0.4);
    }
    
    /* Narrative Stats Grid */
    .dev-narrative-stats {
      margin-bottom: var(--space-3, 12px);
    }
    
    /* Dashboard Links */
    .dev-dashboard-links {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
    }
    
    .dev-dashboard-link {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(74, 103, 65, 0.1);
      border: 1px solid rgba(74, 103, 65, 0.2);
      border-radius: 6px;
      color: var(--color-text-secondary, #a0a0a0);
      text-decoration: none;
      font-size: 12px;
      transition: all 0.2s ease;
    }
    
    .dev-dashboard-link:hover {
      background: rgba(74, 103, 65, 0.2);
      border-color: rgba(74, 103, 65, 0.4);
      color: var(--color-text-primary, #e0e0e0);
      transform: translateY(-1px);
    }
    
    .dev-dashboard-link:active {
      transform: translateY(0);
    }
    
    /* Dramatic Animation Buttons */
    .dev-expression-btn--dramatic {
      background: rgba(255, 100, 100, 0.15);
      border-color: rgba(255, 100, 100, 0.25);
      color: #ff8080;
    }
    .dev-expression-btn--dramatic:hover {
      background: rgba(255, 100, 100, 0.25);
      border-color: rgba(255, 100, 100, 0.4);
    }
    
    /* Ring/Aura Effect Buttons */
    .dev-expression-btn--ring {
      background: rgba(255, 100, 200, 0.15);
      border-color: rgba(255, 100, 200, 0.25);
      color: #ff80c0;
    }
    .dev-expression-btn--ring:hover {
      background: rgba(255, 100, 200, 0.25);
      border-color: rgba(255, 100, 200, 0.4);
    }
    
    /* Ripple Effect Buttons */
    .dev-expression-btn--ripple {
      background: rgba(100, 200, 255, 0.15);
      border-color: rgba(100, 200, 255, 0.25);
      color: #80c0ff;
    }
    .dev-expression-btn--ripple:hover {
      background: rgba(100, 200, 255, 0.25);
      border-color: rgba(100, 200, 255, 0.4);
    }
    
    /* Subsections in Advanced Behaviors */
    .dev-subsection {
      margin-bottom: 12px;
    }
    .dev-subsection:last-child {
      margin-bottom: 0;
    }
    .dev-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    /* Music Buttons */
    .dev-music-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .dev-music-btn {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(180, 100, 255, 0.15);
      border: 1px solid rgba(180, 100, 255, 0.25);
      border-radius: var(--radius-md, 8px);
      color: #c080ff;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-music-btn:hover {
      background: rgba(180, 100, 255, 0.25);
      border-color: rgba(180, 100, 255, 0.4);
      transform: scale(1.02);
    }
    
    .dev-music-btn:active {
      transform: scale(0.98);
    }
    
    /* 🆕 Emotion System Buttons */
    .dev-emotion-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2, 8px);
    }
    
    .dev-emotion-btn {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(74, 103, 65, 0.2);
      border: 1px solid rgba(74, 103, 65, 0.3);
      border-radius: var(--radius-md, 8px);
      color: #7cb571;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-emotion-btn:hover {
      background: rgba(74, 103, 65, 0.35);
      border-color: rgba(74, 103, 65, 0.5);
      transform: scale(1.02);
    }
    
    .dev-emotion-btn:active {
      transform: scale(0.98);
    }
    
    .dev-reaction-btn {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(196, 133, 106, 0.2);
      border: 1px solid rgba(196, 133, 106, 0.3);
      border-radius: var(--radius-md, 8px);
      color: #e0a090;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-reaction-btn:hover {
      background: rgba(196, 133, 106, 0.35);
      border-color: rgba(196, 133, 106, 0.5);
      transform: scale(1.02);
    }
    
    .dev-flash-btn {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(196, 162, 101, 0.2);
      border: 1px solid rgba(196, 162, 101, 0.3);
      border-radius: var(--radius-md, 8px);
      color: #e0c880;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-flash-btn:hover {
      background: rgba(196, 162, 101, 0.35);
      border-color: rgba(196, 162, 101, 0.5);
      transform: scale(1.02);
    }
    
    /* Waveform Shape Preview */
    .dev-waveform-preview {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-3, 12px);
      margin-top: 8px;
    }
    
    .waveform-shape {
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--radius-md, 8px);
      padding: var(--space-2, 8px);
      text-align: center;
    }
    
    .waveform-shape span {
      display: block;
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 6px;
    }
    
    .waveform-bars {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 2px;
      height: 28px;
    }
    
    .waveform-bars span {
      width: 4px;
      background: linear-gradient(to top, var(--persona-glow, rgba(74, 103, 65, 0.6)), var(--persona-primary, #4a6741));
      border-radius: 2px;
      margin: 0;
    }
    
    .waveform-bars--happy span {
      background: linear-gradient(to top, rgba(196, 162, 101, 0.6), #C4A265);
    }
    
    .waveform-bars--sad span {
      background: linear-gradient(to top, rgba(58, 107, 115, 0.4), #3a6b73);
    }
    
    .waveform-bars--excited span {
      background: linear-gradient(to top, rgba(196, 133, 106, 0.6), #c4856a);
      animation: waveformBounce 0.4s ease-in-out infinite alternate;
    }
    
    .waveform-bars--excited span:nth-child(2) { animation-delay: 0.05s; }
    .waveform-bars--excited span:nth-child(3) { animation-delay: 0.1s; }
    .waveform-bars--excited span:nth-child(4) { animation-delay: 0.15s; }
    .waveform-bars--excited span:nth-child(5) { animation-delay: 0.2s; }
    .waveform-bars--excited span:nth-child(6) { animation-delay: 0.15s; }
    .waveform-bars--excited span:nth-child(7) { animation-delay: 0.1s; }
    .waveform-bars--excited span:nth-child(8) { animation-delay: 0.05s; }
    
    @keyframes waveformBounce {
      0% { transform: scaleY(1); }
      100% { transform: scaleY(1.15); }
    }
    
    /* Scrollbar */
    .dev-panel__content::-webkit-scrollbar {
      width: 6px;
    }
    
    .dev-panel__content::-webkit-scrollbar-track {
      background: transparent;
    }
    
    .dev-panel__content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
    }
    
    .dev-panel__content::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    /* State Inspector */
    .dev-state-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
      padding: var(--space-2, 8px);
      background: rgba(0, 0, 0, 0.2);
      border-radius: var(--radius-md, 8px);
    }
    
    .dev-state-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .dev-state-label {
      font-size: 0.65rem;
      color: var(--dev-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .dev-state-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: var(--dev-accent-bright);
      font-weight: 600;
    }
    
    /* Storage Info */
    .dev-storage-info {
      display: flex;
      flex-direction: column;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-3, 12px);
      padding: var(--space-2, 8px);
      background: rgba(0, 0, 0, 0.2);
      border-radius: var(--radius-md, 8px);
    }
    
    .dev-storage-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .dev-storage-key {
      font-size: 0.75rem;
      color: var(--dev-text-muted);
    }
    
    .dev-storage-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      color: var(--dev-accent-bright);
      font-weight: 600;
    }
    
    /* Spinner Overlay */
    .dev-spinner-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
    }
    
    .dev-spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3, 12px);
      color: var(--dev-text);
      font-size: 0.9rem;
    }
    
    .dev-spinner-ring {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(124, 181, 113, 0.2);
      border-top-color: var(--dev-accent);
      border-radius: 50%;
      animation: dev-spin 1s linear infinite;
    }
    
    @keyframes dev-spin {
      to { transform: rotate(360deg); }
    }
    
    /* Skeleton Loading */
    .skeleton-loading {
      position: relative;
      overflow: hidden;
    }
    
    .skeleton-loading::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.1),
        transparent
      );
      animation: skeleton-shimmer 1.5s infinite;
    }
    
    @keyframes skeleton-shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    
    /* Ambient Classes */
    .ambient-particles {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='10' cy='10' r='1' fill='rgba(124,181,113,0.3)'/%3E%3Ccircle cx='90' cy='20' r='1.5' fill='rgba(124,181,113,0.2)'/%3E%3Ccircle cx='50' cy='80' r='1' fill='rgba(124,181,113,0.4)'/%3E%3C/svg%3E");
      background-size: 200px 200px;
      animation: ambient-float 20s linear infinite;
    }
    
    @keyframes ambient-float {
      from { background-position: 0 0; }
      to { background-position: 200px 200px; }
    }
    
    .ambient-glow::before {
      content: '';
      position: fixed;
      inset: 0;
      background: radial-gradient(
        ellipse at center,
        rgba(74, 103, 65, 0.1) 0%,
        transparent 70%
      );
      pointer-events: none;
      z-index: -1;
    }
    
    .ambient-aurora {
      background: linear-gradient(
        45deg,
        rgba(74, 103, 65, 0.05),
        rgba(124, 181, 113, 0.05),
        rgba(157, 214, 144, 0.05)
      );
      background-size: 400% 400%;
      animation: ambient-aurora 15s ease infinite;
    }
    
    @keyframes ambient-aurora {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// SINGLETON
// ============================================================================

export const devPanel = {
  init: initDevPanel,
  show: showPanel,
  hide: hidePanel,
  toggle: togglePanel,
  isDevMode,
  getOverrides: getDevOverrides,
};
