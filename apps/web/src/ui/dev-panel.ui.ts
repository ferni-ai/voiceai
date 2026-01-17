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
import { t } from '../i18n/index.js';
import { apiGet, apiPost } from '../utils/api.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
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
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { avatarFeedback } from './avatar-feedback.ui.js';
// Disabled: Eye animations removed - keeping just zen blink
// import { ferniEye } from './ferni-eye.ui.js';
import { presenceUI } from './presence.ui.js';
import { teamUnlockCelebration } from './team-unlock-celebration.ui.js';

// Soul system imports
import { celebrationBurst, empathyPulse, showFirstLaunchExperience } from './soul.ui.js';

// Ferni expressions system - character-level animations
import {
  ferniExpressions,
  initFerniExpressions,
  type EmotionalExpression,
} from './ferni-expressions.ui.js';

// Avatar Lamp - Pixar Luxo Jr. level body language
import { avatarLamp, type LampEmotion } from './avatar-lamp.ui.js';

// Ferni EQ - superhuman emotional intelligence ("Better than Human")
import { ferni } from './better-than-human.ui.js';

// Weather effects
import {
  getCurrentSeason,
  getCurrentWeather,
  playSeasonalMoment,
  startWeather,
  stopWeather,
  type WeatherType,
} from './weather-effects.ui.js';

// Winter Solstice - cinematic holiday experience
import { winterSolsticeMoment } from './winter-solstice.ui.js';

// Ambient experience managers (circadian, warmth, persona aura)
import { circadianManager, type CircadianPeriod } from '../services/circadian-manager.js';
import { warmthManager, type RelationshipStage } from '../services/warmth-manager.js';

// Ferni Moments - Character expressions
import { ferniMoments, type MomentType } from './ferni-moments.ui.js';
// Avatar Sidekicks - Expressive side icons (like "hands" holding props)
import { avatarSidekicks, type SidekickIcon } from './avatar-sidekicks.ui.js';
// Ferni Milestones - Relationship celebrations
import { ferniMilestones, type MilestoneType } from './ferni-milestones.ui.js';
// Journey UI - Milestone scrapbook view
import { journeyUI } from './journey.ui.js';
// Outreach Service - Email/SMS delivery
import { outreachService } from '../services/outreach.service.js';

// Real Ambient Effects - Canvas-based particles and aurora
import {
  addVignette,
  initAmbientEffects,
  removeVignette,
  startAurora,
  startParticles,
  stopAurora,
  stopParticles,
} from './ambient-effects.ui.js';

// Narrative System - Story beats and arcs
import {
  getJourney,
  getSessionStats,
  triggerTestArc,
  triggerTestBeat,
  type StoryBeat,
} from '../narrative/index.js';

// Dev Panel Modules (extracted for maintainability)
import { handleOutreachAction as handleOutreachActionImpl } from './dev-panel/handlers/outreach.js';
import { ICONS } from './dev-panel/icons.js';
import { toast } from './whisper.ui.js';

const log = createLogger('DevPanel');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

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

// Clean up any previously stored admin keys (security improvement)
// Dev panel now requires URL param each time, no persistent access
try {
  localStorage.removeItem('ferni_admin_key');
} catch {
  // Ignore localStorage errors
}

const checkAdminAccess = (): boolean => {
  // Auto-enable if VITE_DEV_PANEL_AUTO=true is set in .env
  // Useful for admin/staging deployments where you always want dev tools
  if (ENV_CONFIG.autoEnable) {
    return true;
  }

  const urlParams = new URLSearchParams(window.location.search);

  // Check URL parameter with key (must be present in URL - no longer stored)
  const urlKey = urlParams.get('dev');
  if (urlKey && urlKey === ENV_CONFIG.adminKey) {
    return true;
  }

  // Legacy check for simple dev mode flag (only works in dev environment)
  if (isDevEnvironment()) {
    return localStorage.getItem('ferni_dev_mode') === 'true' || urlParams.has('dev');
  }

  return false;
};

const DEV_MODE_ENABLED = isDevEnvironment() || checkAdminAccess();

// ============================================================================
// ICONS - Now imported from ./dev-panel/icons.ts
// ============================================================================
// Icons are imported at the top of the file from './dev-panel/icons.js'

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

  // Auto-unlock team when:
  // 1. VITE_DEV_PANEL_AUTO=true is set
  // 2. ?dev URL parameter is present (for testing convenience)
  const urlParams = new URLSearchParams(window.location.search);
  const hasDevParam = urlParams.has('dev');
  
  if (ENV_CONFIG.autoEnable || hasDevParam) {
    // Use setTimeout to ensure services are ready
    setTimeout(() => {
      quickUnlockAll();
      log.info(`Auto-unlocked all team members (${ENV_CONFIG.autoEnable ? 'VITE_DEV_PANEL_AUTO' : '?dev URL param'})`);
    }, 100);
  }

  // Listen for voice session connection to sync dev mode
  // This ensures the backend knows about dev mode even if it was enabled before connection
  document.addEventListener('ferni:voice-connected', () => {
    if (DEV_MODE_ENABLED && tierOverride === 'partner') {
      log.info('Voice connected - syncing dev mode to backend');
      void syncDevModeToBackend(true, tierOverride);
    }
  });

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
  trackedTimeout(() => {
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
      <button class="dev-panel__close" aria-label="${t('common.close')}">${ICONS.close}</button>
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
        <div class="dev-tier-buttons" role="button" tabindex="0">
          <button aria-label="Free" class="dev-tier-btn ${tier === 'free' ? 'dev-tier-btn--active' : ''}" data-tier="free">
            Free
          </button>
          <button aria-label="Friend ($9.99)" class="dev-tier-btn ${tier === 'friend' ? 'dev-tier-btn--active' : ''}" data-tier="friend">
            Friend ($9.99)
          </button>
          <button aria-label="Partner ($19.99)" class="dev-tier-btn ${tier === 'partner' ? 'dev-tier-btn--active' : ''}" data-tier="partner">
            Partner ($19.99)
          </button>
        </div>
      </section>
      
      <!-- Relationship Stage -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.heart} Relationship Stage</h3>
        <div class="dev-stage-buttons" role="button" tabindex="0">
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
          <button aria-label="User profile" class="dev-roster-btn ${rosterPreferences.getPreferences().showAllMembers ? 'dev-roster-btn--active' : ''}" data-roster="show-all">
            ${ICONS.users} Show All Members
          </button>
          <button aria-label="User profile" class="dev-roster-btn" data-roster="show-minimal">
            ${ICONS.user} Minimal (Ferni Only)
          </button>
          <button aria-label="Refresh" class="dev-roster-btn" data-roster="reset">
            ${ICONS.refresh} Reset Preferences
          </button>
        </div>
      </section>
      
      <!-- Quick Actions -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.zap} Quick Actions</h3>
        <div class="dev-actions" role="button" tabindex="0">
          <button aria-label="Unlock All Members" class="dev-action-btn" data-action="unlock-all">
            ${ICONS.unlock} Unlock All Members
          </button>
          <button aria-label="Refresh" class="dev-action-btn" data-action="reset">
            ${ICONS.refresh} Reset Everything
          </button>
          <button aria-label="+ Add 5 Conversations" class="dev-action-btn" data-action="add-conversations">
            + Add 5 Conversations
          </button>
          <button aria-label="Test Limit Modal" class="dev-action-btn" data-action="trigger-limit">
            Test Limit Modal
          </button>
          <button aria-label="Test Upgrade Modal" class="dev-action-btn" data-action="trigger-upgrade">
            Test Upgrade Modal
          </button>
        </div>
      </section>
      
      <!-- 🆕 First-Time User Experience -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.user} First-Time User Experience</h3>
        <p class="dev-section__desc">Test progressive feature unlocking</p>
        
        <div class="dev-ftue-status" id="dev-ftue-status">
          ${renderFTUEStatus()}
        </div>
        
        <div class="dev-actions" role="button" tabindex="0">
          <button aria-label="Refresh" class="dev-action-btn dev-action-btn--warning" data-ftue="reset">
            ${ICONS.refresh} Reset to First-Time User
          </button>
          <button aria-label="Simulate 1 Conversation" class="dev-action-btn" data-ftue="simulate-1">
            Simulate 1 Conversation
          </button>
          <button aria-label="Simulate 3 Conversations" class="dev-action-btn" data-ftue="simulate-3">
            Simulate 3 Conversations
          </button>
          <button aria-label="Simulate 5 Conversations" class="dev-action-btn" data-ftue="simulate-5">
            Simulate 5 Conversations
          </button>
          <button aria-label="Simulate 10 Conversations" class="dev-action-btn" data-ftue="simulate-10">
            Simulate 10 Conversations
          </button>
        </div>
        
        <div class="dev-ftue-legend">
          <h4>Feature Unlock Schedule</h4>
          <ul>
            <li><strong>0 convos:</strong> Just Ferni avatar</li>
            <li><strong>1+ convos:</strong> Greeting, streak badge, subscription badge</li>
            <li><strong>2+ convos:</strong> Onboarding tour, feature hints, persona intros</li>
            <li><strong>3+ convos:</strong> Stage celebrations, value capture</li>
            <li><strong>5+ convos:</strong> Trust signals</li>
          </ul>
        </div>
      </section>
      
      <!-- ${ICONS.creditCard} Subscription Controls -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.creditCard} Subscription Controls</h3>
        <p class="dev-section__desc">Admin controls for subscription gating</p>
        
        <div class="dev-toggle-row" role="button" tabindex="0">
          <label class="dev-toggle">
            <input type="checkbox" id="dev-subscription-bypass" ${getSubscriptionBypass() ? 'checked' : ''}>
            <span class="dev-toggle__slider" role="button" tabindex="0"></span>
          </label>
          <span class="dev-toggle__label" role="button" tabindex="0">Bypass All Limits (Admin Mode)</span>
        </div>
        
        <div class="dev-toggle-row" role="button" tabindex="0">
          <label class="dev-toggle">
            <input type="checkbox" id="dev-subscription-enabled" ${getSubscriptionEnabled() ? 'checked' : ''}>
            <span class="dev-toggle__slider" role="button" tabindex="0"></span>
          </label>
          <span class="dev-toggle__label" role="button" tabindex="0">Subscription Gating Enabled</span>
        </div>
        
        <div class="dev-input-row">
          <label class="dev-input__label">Whitelist User IDs (comma-separated)</label>
          <input type="text" id="dev-whitelist-ids" class="dev-input" 
            placeholder="user123, user456" 
            value="${getWhitelistIds().join(', ')}">
          <button aria-label="Confirm" class="dev-action-btn dev-action-btn--small" data-action="save-whitelist">
            ${ICONS.check} Save
          </button>
        </div>
        
        <div class="dev-actions" role="button" tabindex="0">
          <button aria-label="Add" class="dev-action-btn" data-action="add-to-whitelist">
            ${ICONS.userPlus} Whitelist Current User
          </button>
          <button aria-label="Remove" class="dev-action-btn" data-action="remove-from-whitelist">
            ${ICONS.userMinus} Remove Current User
          </button>
          <button aria-label="Delete" class="dev-action-btn" data-action="clear-whitelist">
            ${ICONS.trash} Clear Whitelist
          </button>
        </div>
        
        <div class="dev-status-row" id="dev-subscription-status">
          <span class="dev-status__label">Current Status:</span>
          <span class="dev-status__value" id="dev-sub-status-text">Loading...</span>
        </div>
      </section>
      
      <!-- ${ICONS.gamepad} Music Games -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.gamepad} Music Games</h3>
        <p class="dev-section__desc">Test music games and dashboard</p>
        <div class="dev-actions" role="button" tabindex="0">
          <button aria-label="Musical You Dashboard" class="dev-action-btn dev-action-btn--primary" data-game="dashboard">
            ${ICONS.barChart} Musical You Dashboard
          </button>
          <button aria-label="Name That Tune" class="dev-action-btn" data-game="name-that-tune">
            ${ICONS.music} Name That Tune
          </button>
          <button aria-label="One Word Song" class="dev-action-btn" data-game="one-word-song">
            ${ICONS.messageCircle} One Word Song
          </button>
          <button aria-label="Desert Island Discs" class="dev-action-btn" data-game="desert-island">
            ${ICONS.palmtree} Desert Island Discs
          </button>
          <button aria-label="This or That" class="dev-action-btn" data-game="this-or-that">
            ${ICONS.zap} This or That
          </button>
          <button aria-label="Mood DJ Challenge" class="dev-action-btn" data-game="mood-dj">
            ${ICONS.headphones} Mood DJ Challenge
          </button>
        </div>
      </section>
      
      <!-- ${ICONS.music} Music Player Status -->
      <section class="dev-section" id="dev-music-status-section">
        <h3 class="dev-section__title">${ICONS.music} Music Player Status</h3>
        <p class="dev-section__desc">Real-time music player diagnostics</p>
        <div id="dev-music-status" class="dev-music-status">
          <div class="dev-music-status__loading">Loading music status...</div>
        </div>
        <div class="dev-actions" role="button" tabindex="0" style="margin-top: 8px;">
          <button aria-label="Refresh" class="dev-action-btn" data-music-action="refresh-status">
            ${ICONS.refresh} Refresh Status
          </button>
          <button aria-label="Test iTunes API" class="dev-action-btn" data-music-action="test-itunes">
            ${ICONS.music} Test iTunes API
          </button>
          <button aria-label="Confirm" class="dev-action-btn" data-music-action="test-spotify">
            ${ICONS.headphones} Check Spotify
          </button>
        </div>
      </section>
      
      <!-- ${ICONS.star} Soul & Delight -->
      <section class="dev-section dev-section--soul">
        <h3 class="dev-section__title">${ICONS.eye} Soul & Delight</h3>
        <p class="dev-section__desc">Delightful surprises that make Ferni feel alive</p>
        
        <!-- Core Soul Features -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.sparkles} Core Magic</span>
          <div class="dev-soul-buttons" role="button" tabindex="0">
            <button aria-label="Awakening" class="dev-soul-btn dev-soul-btn--primary" data-soul="awakening" title="First launch experience">
              ${ICONS.sunrise} Awakening
            </button>
          </div>
        </div>
        
        <!-- Reactions -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.sparkle} Reactions</span>
          <div class="dev-soul-buttons" role="button" tabindex="0">
            <button aria-label="Celebrate" class="dev-soul-btn" data-soul="celebrate" title="Celebration burst">
              ${ICONS.party} Celebrate
            </button>
            <button aria-label="Empathy" class="dev-soul-btn" data-soul="empathy" title="Empathy pulse">
              ${ICONS.heart} Empathy
            </button>
            <button aria-label="Wink" class="dev-soul-btn" data-soul="wink" title="Quick wink">
              ${ICONS.wink} Wink
            </button>
            <button aria-label="Curious Tilt" class="dev-soul-btn" data-soul="curious-tilt" title="Interested tilt">
              ${ICONS.thinking} Curious Tilt
            </button>
          </div>
        </div>
        
        <!-- Ambient -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.moon} Ambient</span>
          <div class="dev-soul-buttons" role="button" tabindex="0">
            <button aria-label="Pause" class="dev-soul-btn" data-soul="pause-tracking" title="Pause eye tracking 3s">
              ${ICONS.pause} Pause Tracking
            </button>
            <button aria-label="Secret Smile" class="dev-soul-btn" data-soul="secret-smile" title="Avatar smiles secretly">
              ${ICONS.smile} Secret Smile
            </button>
            <button aria-label="Sleepy" class="dev-soul-btn" data-soul="sleepy" title="Late night yawn">
              ${ICONS.sleepy} Sleepy
            </button>
          </div>
        </div>
        
        <!-- Ideas for Future -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.lightbulb} Ideas (Coming Soon)</span>
          <div class="dev-soul-ideas">
            <span>Connection Spark</span>
            <span>Heartbeat Glow</span>
            <span>Confetti Burst</span>
            <span>Attentive Lean</span>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.movie} Avatar Lamp - Pixar Body Language -->
      <section class="dev-section dev-section--lamp">
        <h3 class="dev-section__title">${ICONS.movie} Avatar Lamp (Luxo Jr.)</h3>
        <p class="dev-section__desc">Pixar-quality body language - no face, pure emotion</p>
        
        <!-- Core Movements -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.kangaroo} Core Movements</span>
          <div class="dev-lamp-buttons" role="button" tabindex="0">
            <button aria-label="Move up" class="dev-lamp-btn dev-lamp-btn--primary" data-lamp="bounce" title="Excitement bounce">
              ${ICONS.arrowUp} Bounce
            </button>
            <button aria-label="Big Bounce" class="dev-lamp-btn" data-lamp="bounce-big" title="Big celebration bounce">
              ${ICONS.party} Big Bounce
            </button>
            <button aria-label="Move up" class="dev-lamp-btn" data-lamp="tilt-right" title="Curious tilt">
              ${ICONS.arrowUpRight} Tilt Right
            </button>
            <button aria-label="Move up" class="dev-lamp-btn" data-lamp="tilt-left" title="Confused tilt">
              ${ICONS.arrowUpLeft} Tilt Left
            </button>
            <button aria-label="Move up" class="dev-lamp-btn" data-lamp="tilt-forward" title="Listening lean">
              ${ICONS.arrowUp} Lean In
            </button>
          </div>
        </div>
        
        <!-- Reactions -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.lightbulb} Reactions</span>
          <div class="dev-lamp-buttons" role="button" tabindex="0">
            <button aria-label="Perk Up" class="dev-lamp-btn" data-lamp="perk-up" title="Aha! moment">
              ${ICONS.zap} Perk Up
            </button>
            <button aria-label="Nod" class="dev-lamp-btn" data-lamp="nod" title="Understanding nod">
              ${ICONS.thumbsUp} Nod
            </button>
            <button aria-label="Slow Nod" class="dev-lamp-btn" data-lamp="nod-slow" title="Thoughtful nod">
              ${ICONS.thinking} Slow Nod
            </button>
            <button aria-label="Shake" class="dev-lamp-btn" data-lamp="shake" title="Playful shake">
              ${ICONS.laughing} Shake
            </button>
            <button aria-label="Shrink" class="dev-lamp-btn" data-lamp="shrink" title="Empathy/sadness">
              ${ICONS.frown} Shrink
            </button>
          </div>
        </div>
        
        <!-- Emotion Presets -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.drama} Emotion Presets</span>
          <div class="dev-lamp-buttons" role="button" tabindex="0">
            <button aria-label="Happy" class="dev-lamp-btn" data-lamp-emotion="happy" title="Happy">
              ${ICONS.smile} Happy
            </button>
            <button aria-label="Excited" class="dev-lamp-btn" data-lamp-emotion="excited" title="Excited">
              ${ICONS.sparkles} Excited
            </button>
            <button aria-label="Curious" class="dev-lamp-btn" data-lamp-emotion="curious" title="Curious">
              ${ICONS.thinking} Curious
            </button>
            <button aria-label="Listening" class="dev-lamp-btn" data-lamp-emotion="listening" title="Listening">
              ${ICONS.mic} Listening
            </button>
            <button aria-label="Thinking" class="dev-lamp-btn" data-lamp-emotion="thinking" title="Thinking">
              ${ICONS.messageCircle} Thinking
            </button>
            <button aria-label="Empathetic" class="dev-lamp-btn" data-lamp-emotion="empathetic" title="Empathetic">
              ${ICONS.heart} Empathetic
            </button>
            <button aria-label="Proud" class="dev-lamp-btn" data-lamp-emotion="proud" title="Proud">
              ${ICONS.trophy} Proud
            </button>
            <button aria-label="Celebrating" class="dev-lamp-btn" data-lamp-emotion="celebrating" title="Celebrating">
              ${ICONS.confetti} Celebrating
            </button>
            <button aria-label="Neutral" class="dev-lamp-btn" data-lamp-emotion="neutral" title="Reset to neutral">
              ${ICONS.circleEmpty} Neutral
            </button>
          </div>
        </div>
        
        <!-- Breathing Control -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.activity} Breathing</span>
          <div class="dev-lamp-buttons" role="button" tabindex="0">
            <button aria-label="Play" class="dev-lamp-btn" data-lamp="breathing-start" title="Start breathing">
              ${ICONS.play} Start
            </button>
            <button aria-label="Stop" class="dev-lamp-btn" data-lamp="breathing-stop" title="Stop breathing">
              ${ICONS.stop} Stop
            </button>
          </div>
        </div>
      </section>
      
      <!-- Agent Tester -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.users} Handoff Tester</h3>
        <div class="dev-handoff-buttons" role="button" tabindex="0">
          ${TEAM_MEMBERS.filter((m) => m.id !== 'ferni')
            .map(
              (member) => `
            <button aria-label="Go forward" class="dev-handoff-btn" data-persona="${member.id}">
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
        <div class="dev-expression-buttons" role="button" tabindex="0">
          <button aria-label="Chuckle" class="dev-expression-btn" data-expression="chuckle" title="For humor/jokes">
            ${ICONS.smile} Chuckle
          </button>
          <button aria-label="Empathy" class="dev-expression-btn" data-expression="empathy" title="For sad moments">
            ${ICONS.heart} Empathy
          </button>
          <button aria-label="Delight" class="dev-expression-btn" data-expression="delight" title="For excitement">
            ${ICONS.party} Delight
          </button>
          <button aria-label="Contemplate" class="dev-expression-btn" data-expression="contemplate" title="For deep moments">
            ${ICONS.thinking} Contemplate
          </button>
          <button aria-label="Encourage" class="dev-expression-btn" data-expression="encourage" title="For motivation">
            ${ICONS.flex} Encourage
          </button>
          <button aria-label="Surprise" class="dev-expression-btn" data-expression="surprise" title="For revelations">
            ${ICONS.openMouth} Surprise
          </button>
          <button aria-label="Settle" class="dev-expression-btn" data-expression="settle" title="For calming">
            ${ICONS.smile} Settle
          </button>
          <button aria-label="Blink" class="dev-expression-btn" data-expression="blink" title="Zen blink">
            ${ICONS.eye} Blink
          </button>
        </div>
        <div class="dev-expression-buttons" role="button" tabindex="0" style="margin-top: 8px;">
          <button aria-label="Confirm" class="dev-expression-btn dev-expression-btn--feedback" data-expression="success" title="Success feedback">
            ${ICONS.check} Success
          </button>
          <button aria-label="Error" class="dev-expression-btn dev-expression-btn--feedback" data-expression="error" title="Error feedback">
            ${ICONS.x} Error
          </button>
          <button aria-label="Warning" class="dev-expression-btn dev-expression-btn--feedback" data-expression="warning" title="Warning feedback">
            ${ICONS.alertTriangle} Warning
          </button>
          <button aria-label="More information" class="dev-expression-btn dev-expression-btn--feedback" data-expression="info" title="Info feedback">
            ${ICONS.info} Info
          </button>
        </div>
        
        <!-- ${ICONS.party} NEW: Fun Micro-Reactions -->
        <p class="dev-section__desc" style="margin-top: 12px;">Fun Reactions (delightful avatar movements)</p>
        <div class="dev-expression-buttons" role="button" tabindex="0">
          <button aria-label="Happy" class="dev-expression-btn dev-expression-btn--reaction" data-reaction="happy" title="Bounce for good news">
            ${ICONS.party} Happy
          </button>
          <button aria-label="Curious" class="dev-expression-btn dev-expression-btn--reaction" data-reaction="curious" title="Tilt for 'tell me more'">
            ${ICONS.thinking} Curious
          </button>
          <button aria-label="Empathy" class="dev-expression-btn dev-expression-btn--reaction" data-reaction="empathy" title="Nod for understanding">
            ${ICONS.hugging} Empathy
          </button>
          <button aria-label="Laugh" class="dev-expression-btn dev-expression-btn--reaction" data-reaction="laugh" title="Wobble for humor">
            ${ICONS.laughing} Laugh
          </button>
          <button aria-label="Surprise" class="dev-expression-btn dev-expression-btn--reaction" data-reaction="surprise" title="Pop for wow moments">
            ${ICONS.surprised} Surprise
          </button>
        </div>
      </section>
      
      <!-- ${ICONS.movie} NEW: Ferni Expressions - Advanced Eye Lid Expressions -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.movie} Ferni Expressions</h3>
        <p class="dev-section__desc">Eye lid expressions & advanced reactions</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Eye Lid Expressions</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Happy" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="happy" title="Squinted, warm">${ICONS.smile} Happy</button>
            <button aria-label="Delighted" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="delighted" title="Happy + sparkle">${ICONS.sparkles} Delighted</button>
            <button aria-label="Surprised" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="surprised" title="Wide eyes">${ICONS.surprised} Surprised</button>
            <button aria-label="Curious" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="curious" title="Head tilt">${ICONS.thinking} Curious</button>
            <button aria-label="Skeptical" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="skeptical" title="One brow up">${ICONS.thinking} Skeptical</button>
            <button aria-label="Worried" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="worried" title="Angled brows">${ICONS.worried} Worried</button>
            <button aria-label="Sad" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="sad" title="Droopy lids">${ICONS.frown} Sad</button>
            <button aria-label="Sleepy" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="sleepy" title="Heavy lids">${ICONS.sleepy} Sleepy</button>
            <button aria-label="Thinking" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="thinking" title="Looking away">${ICONS.messageCircle} Thinking</button>
            <button aria-label="Empathetic" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="empathetic" title="Soft understanding">${ICONS.hugging} Empathetic</button>
            <button aria-label="Excited" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="excited" title="Wide + sparkle">${ICONS.party} Excited</button>
            <button aria-label="Neutral" class="dev-expression-btn dev-expression-btn--ferni" data-ferni-expr="neutral" title="Reset to neutral">${ICONS.meh} Neutral</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Advanced Reactions</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Double-Take" class="dev-expression-btn dev-expression-btn--ferni-react" data-ferni-react="doubleTake" title="Look away → snap back">${ICONS.eye} Double-Take</button>
            <button aria-label="Pause" class="dev-expression-btn dev-expression-btn--ferni-react" data-ferni-react="heldPose" title="Hold at peak emotion">${ICONS.pause} Held Pose</button>
            <button aria-label="Refresh" class="dev-expression-btn dev-expression-btn--ferni-react" data-ferni-react="lookAway" title="Thinking look away">${ICONS.refresh} Look Away</button>
            <button aria-label="Nervous" class="dev-expression-btn dev-expression-btn--ferni-react" data-ferni-react="nervousEnergy" title="Fidget trembles">${ICONS.worried} Nervous</button>
            <button aria-label="Sparkle" class="dev-expression-btn dev-expression-btn--ferni-react" data-ferni-react="delightSparkle" title="Eye sparkle effect">${ICONS.sparkle} Sparkle</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Text-to-Icon Morph</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Idea Morph" class="dev-expression-btn dev-expression-btn--ferni-morph" data-morph="lightbulb" title="Morph to idea icon">${ICONS.lightbulb} Idea Morph</button>
            <button aria-label="Heart Morph" class="dev-expression-btn dev-expression-btn--ferni-morph" data-morph="heart" title="Morph to heart">${ICONS.heart} Heart Morph</button>
            <button aria-label="Sparkle Morph" class="dev-expression-btn dev-expression-btn--ferni-morph" data-morph="sparkles" title="Morph to sparkles">${ICONS.sparkles} Sparkle Morph</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">🤲 Side Expressions (80+ Icons!)</span>
          <p style="font-size: 11px; color: var(--color-text-muted); margin: 4px 0 8px;">Icons float beside avatar like expressive "hands"</p>
          
          <!-- Time of Day -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">☀️ Time of Day</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Coffee" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="coffee" title="Morning coffee">${ICONS.coffee}</button>
            <button aria-label="Sun" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="sun" title="Sunshine">${ICONS.sun}</button>
            <button aria-label="Sunrise" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="sunrise" title="Sunrise">${ICONS.sunrise}</button>
            <button aria-label="Sunset" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="sunset" title="Sunset">${ICONS.sunset}</button>
            <button aria-label="Moon" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="moon" title="Moon">${ICONS.moon}</button>
            <button aria-label="Flame" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="flame" title="Cozy flame">${ICONS.flame}</button>
            <button aria-label="Clock" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="clock" title="Time">${ICONS.clock}</button>
            <button aria-label="Alarm" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="alarm" title="Alarm">${ICONS.alarm}</button>
          </div>
          
          <!-- Emotions -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">❤️ Emotions</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Heart" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="heart" title="Love">${ICONS.heart}</button>
            <button aria-label="Heart Pulse" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="heartPulse" title="Heart pulse">${ICONS.heartPulse}</button>
            <button aria-label="Sparkles" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="sparkles" title="Sparkles">${ICONS.sparkles}</button>
            <button aria-label="Smile" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="smile" title="Smile">${ICONS.smile}</button>
            <button aria-label="Laughing" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="laughing" title="Laughing">${ICONS.laughing}</button>
            <button aria-label="Wink" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="wink" title="Wink">${ICONS.wink}</button>
            <button aria-label="Hug" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="hug" title="Hug">${ICONS.hugging}</button>
            <button aria-label="Thumbs Up" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="thumbsUp" title="Thumbs up">${ICONS.thumbsUp}</button>
          </div>
          
          <!-- Ideas & Thinking -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">💡 Ideas & Thinking</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Lightbulb" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="lightbulb" title="Idea">${ICONS.lightbulb}</button>
            <button aria-label="Brain" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="brain" title="Thinking">${ICONS.brain}</button>
            <button aria-label="Thinking" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="thinking" title="Pondering">${ICONS.thinking}</button>
            <button aria-label="Compass" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="compass" title="Direction">${ICONS.compass}</button>
            <button aria-label="Focus" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="focus" title="Focus">${ICONS.focus}</button>
            <button aria-label="Target" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="target" title="Goal">${ICONS.target}</button>
            <button aria-label="Search" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="search" title="Search">${ICONS.search}</button>
          </div>
          
          <!-- Gestures -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">👋 Gestures</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Wave" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="hand" title="Wave">${ICONS.hand}</button>
            <button aria-label="Handshake" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="handshake" title="Handshake">${ICONS.handshake}</button>
            <button aria-label="Pointer" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="pointer" title="Pointer">${ICONS.pointer}</button>
            <button aria-label="Flex" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="flex" title="Strength">${ICONS.flex}</button>
          </div>
          
          <!-- Activities -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">🎵 Activities</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Music" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="music" title="Music">${ICONS.music}</button>
            <button aria-label="Headphones" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="headphones" title="Listening">${ICONS.headphones}</button>
            <button aria-label="Book" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="book" title="Reading">${ICONS.book}</button>
            <button aria-label="Book Open" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="bookOpen" title="Learning">${ICONS.bookOpen}</button>
            <button aria-label="Palette" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="palette" title="Art">${ICONS.palette}</button>
            <button aria-label="Brush" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="brush" title="Creative">${ICONS.brush}</button>
            <button aria-label="Gamepad" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="gamepad" title="Gaming">${ICONS.gamepad}</button>
            <button aria-label="Yoga" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="yoga" title="Wellness">${ICONS.yoga}</button>
          </div>
          
          <!-- Celebrations -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">🏆 Celebrations</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Trophy" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="trophy" title="Achievement">${ICONS.trophy}</button>
            <button aria-label="Star" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="star" title="Star">${ICONS.star}</button>
            <button aria-label="Crown" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="crown" title="Recognition">${ICONS.crown}</button>
            <button aria-label="Gift" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="gift" title="Gift">${ICONS.gift}</button>
            <button aria-label="Cake" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="cake" title="Birthday">${ICONS.cake}</button>
            <button aria-label="Party" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="party" title="Party">${ICONS.party}</button>
            <button aria-label="Confetti" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="confetti" title="Confetti">${ICONS.confetti}</button>
            <button aria-label="Rocket" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="rocket" title="Launch">${ICONS.rocket}</button>
          </div>
          
          <!-- Nature & Weather -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">🌿 Nature & Weather</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Leaf" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="leaf" title="Nature">${ICONS.leaf}</button>
            <button aria-label="Flower" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="flower" title="Flower">${ICONS.flower}</button>
            <button aria-label="Sprout" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="sprout" title="Growth">${ICONS.sparkle}</button>
            <button aria-label="Grow" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="grow" title="Growing">${ICONS.grow}</button>
            <button aria-label="Cloud" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="cloud" title="Cloud">${ICONS.cloud}</button>
            <button aria-label="Rain" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="cloudRain" title="Rain">${ICONS.cloudRain}</button>
            <button aria-label="Snowflake" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="snowflake" title="Snow">${ICONS.snowflake}</button>
            <button aria-label="Rainbow" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="rainbow" title="Rainbow">${ICONS.rainbow}</button>
            <button aria-label="Waves" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="waves" title="Waves">${ICONS.waves}</button>
          </div>
          
          <!-- Energy & Motivation -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Energy & Motivation</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Zap" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="zap" title="Energy">${ICONS.zap}</button>
            <button aria-label="Trending Up" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="trendingUp" title="Progress">${ICONS.trendingUp}</button>
            <button aria-label="Activity" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="activity" title="Activity">${ICONS.activity}</button>
            <button aria-label="Flag" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="flag" title="Milestone">${ICONS.flag}</button>
          </div>
          
          <!-- Communication -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">💬 Communication</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Chat" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="chat" title="Chat">${ICONS.chat}</button>
            <button aria-label="Message" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="messageCircle" title="Message">${ICONS.messageCircle}</button>
            <button aria-label="Bell" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="bell" title="Reminder">${ICONS.bell}</button>
            <button aria-label="Mail" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="mail" title="Email">${ICONS.mail}</button>
            <button aria-label="Mic" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="mic" title="Voice">${ICONS.mic}</button>
          </div>
          
          <!-- Misc -->
          <p style="font-size: 10px; color: var(--color-text-dimmed); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.5px;">✨ More</p>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Eye" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="eye" title="Vision">${ICONS.eye}</button>
            <button aria-label="Calendar" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="calendar" title="Schedule">${ICONS.calendar}</button>
            <button aria-label="Check" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="checkCircle" title="Done">${ICONS.checkCircle}</button>
            <button aria-label="Magic" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="magic" title="Magic">${ICONS.magic}</button>
            <button aria-label="Layers" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="layers" title="Layers">${ICONS.layers}</button>
            <button aria-label="Info" class="dev-expression-btn dev-expression-btn--sidekick" data-sidekick="info" title="Info">${ICONS.info}</button>
          </div>
        </div>
      </section>
      
      <!-- Ferni Moments - Character Expressions -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.heart} Ferni Moments</h3>
        <p class="dev-section__desc">Character expressions (Lucide icons)</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Emotional</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Celebrate" class="dev-expression-btn" data-moment="celebration" title="Celebration">Celebrate</button>
            <button aria-label="Glow" class="dev-expression-btn" data-moment="warmGlow" title="Warm glow">Glow</button>
            <button aria-label="Idea" class="dev-expression-btn" data-moment="lightbulb" title="Aha moment">Idea</button>
            <button aria-label="Hearts" class="dev-expression-btn" data-moment="hearts" title="Hearts">Hearts</button>
            <button aria-label="Think" class="dev-expression-btn" data-moment="thinking" title="Thinking">Think</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Time of Day</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Coffee" class="dev-expression-btn" data-moment="coffee" title="Morning coffee">Coffee</button>
            <button aria-label="Sun" class="dev-expression-btn" data-moment="sunshine" title="Sunshine">Sun</button>
            <button aria-label="Cozy" class="dev-expression-btn" data-moment="cozy" title="Cozy evening">Cozy</button>
            <button aria-label="Moon" class="dev-expression-btn" data-moment="moonlight" title="Moonlight">Moon</button>
            <button aria-label="Sleepy" class="dev-expression-btn" data-moment="sleepy" title="Sleepy">Sleepy</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Contextual</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Music" class="dev-expression-btn" data-moment="musicNotes" title="Music">Music</button>
            <button aria-label="Sparkle" class="dev-expression-btn" data-moment="sparkle" title="Sparkle">Sparkle</button>
            <button aria-label="Books" class="dev-expression-btn" data-moment="books" title="Books/learning">Books</button>
            <button aria-label="Grow" class="dev-expression-btn" data-moment="growing" title="Growth">Grow</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Connection</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Wave" class="dev-expression-btn" data-moment="wave" title="Wave hello">Wave</button>
            <button aria-label="Nod" class="dev-expression-btn" data-moment="nod" title="Nod">Nod</button>
            <button aria-label="Tilt" class="dev-expression-btn" data-moment="headTilt" title="Curious tilt">Tilt</button>
            <button aria-label="Hi-Five" class="dev-expression-btn" data-moment="highFive" title="High five">Hi-Five</button>
            <button aria-label="Bump" class="dev-expression-btn" data-moment="fistBump" title="Fist bump">Bump</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Milestones</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Birthday" class="dev-expression-btn" data-moment="birthday" title="Birthday">Birthday</button>
            <button aria-label="Streak" class="dev-expression-btn" data-moment="streakFire" title="Streak fire">Streak</button>
            <button aria-label="Trophy" class="dev-expression-btn" data-moment="trophy" title="Trophy">Trophy</button>
            <button aria-label="Level Up" class="dev-expression-btn" data-moment="levelUp" title="Level up">Level Up</button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Human Touches</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Yawn" class="dev-expression-btn" data-moment="yawn" title="Yawn">Yawn</button>
            <button aria-label="Stretch" class="dev-expression-btn" data-moment="stretch" title="Stretch">Stretch</button>
            <button aria-label="Breathe" class="dev-expression-btn" data-moment="breathe" title="Deep breath">Breathe</button>
            <button aria-label="Shiver" class="dev-expression-btn" data-moment="shiver" title="Cold/shiver">Shiver</button>
            <button aria-label="Hot" class="dev-expression-btn" data-moment="fan" title="Hot/fan">Hot</button>
          </div>
        </div>
      </section>

      <!-- Ferni Milestones - Relationship Celebrations -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.heart} Ferni Milestones</h3>
        <p class="dev-section__desc">Warm relationship celebrations (${ferniMilestones.getCelebratedCount()}/${ferniMilestones.getTotalMilestonesCount()} unlocked)</p>

        <div class="dev-subsection">
          <span class="dev-label">Relationship</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="First Hello" class="dev-expression-btn" data-milestone="first-hello" title="First conversation">First Hello</button>
            <button aria-label="Week" class="dev-expression-btn" data-milestone="week-together" title="7 days">Week</button>
            <button aria-label="Month" class="dev-expression-btn" data-milestone="month-of-growth" title="30 days">Month</button>
            <button aria-label="Welcome Back" class="dev-expression-btn" data-milestone="welcome-back" title="Returned after absence">Welcome Back</button>
            <button aria-label="Streak 7" class="dev-expression-btn" data-milestone="streak-7" title="7-day streak">Streak 7</button>
            <button aria-label="Streak 30" class="dev-expression-btn" data-milestone="streak-30" title="30-day streak">Streak 30</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Team Connection</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Full Circle" class="dev-expression-btn" data-milestone="full-circle" title="Met all personas">Full Circle</button>
            <button aria-label="Found Person" class="dev-expression-btn" data-milestone="found-your-person" title="Deep connection">Found Person</button>
            <button aria-label="Play" class="dev-expression-btn" data-milestone="team-player" title="Natural handoff">Team Player</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Conversation</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Deep Dive" class="dev-expression-btn" data-milestone="deep-dive" title="10+ min conversation">Deep Dive</button>
            <button aria-label="Confirm" class="dev-expression-btn" data-milestone="quick-checkin" title="Brief chat">Quick Check</button>
            <button aria-label="Night Talk" class="dev-expression-btn" data-milestone="night-talk" title="Late night">Night Talk</button>
            <button aria-label="Early Riser" class="dev-expression-btn" data-milestone="early-riser" title="Early morning">Early Riser</button>
            <button aria-label="100 Talks" class="dev-expression-btn" data-milestone="hundred-conversations" title="100 talks">100 Talks</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Discovery</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Explorer" class="dev-expression-btn" data-milestone="explorer" title="5 easter eggs">Explorer</button>
            <button aria-label="Secrets" class="dev-expression-btn" data-milestone="secret-keeper" title="All easter eggs">Secrets</button>
            <button aria-label="Themes" class="dev-expression-btn" data-milestone="theme-seeker" title="All themes">Themes</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Sweet Moments</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Gratitude" class="dev-expression-btn" data-milestone="gratitude" title="Grateful heart">Gratitude</button>
            <button aria-label="Good News" class="dev-expression-btn" data-milestone="celebration" title="Shared good news">Good News</button>
            <button aria-label="Brave" class="dev-expression-btn" data-milestone="brave" title="Talked about hard things">Brave</button>
            <button aria-label="Consistent" class="dev-expression-btn" data-milestone="consistent" title="Regular check-ins">Consistent</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Actions</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Your Journey" class="dev-expression-btn" data-action="open-journey" title="View Your Journey scrapbook">Your Journey</button>
            <button aria-label="Reset All" class="dev-expression-btn dev-expression-btn--danger" data-action="reset-milestones" title="Reset all milestone progress">Reset All</button>
          </div>
        </div>
      </section>

      <!-- ${ICONS.heart} Progressive Relationship Features -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.leaf} Progressive Features</h3>
        <p class="dev-section__desc">Test relationship-building UI features</p>

        <div class="dev-subsection">
          <span class="dev-label">Trust Signals ("Ferni Noticed...")</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Growth" class="dev-expression-btn" data-trust-signal="growth" title="Growth moment">Growth</button>
            <button aria-label="Boundary" class="dev-expression-btn" data-trust-signal="boundary" title="Boundary respected">Boundary</button>
            <button aria-label="Callback" class="dev-expression-btn" data-trust-signal="callback" title="Shared memory">Callback</button>
            <button aria-label="Small Win" class="dev-expression-btn" data-trust-signal="small_win" title="Small win">Small Win</button>
            <button aria-label="Thinking" class="dev-expression-btn" data-trust-signal="thinking_of_you" title="Thinking of you">Thinking</button>
            <button aria-label="Reading" class="dev-expression-btn" data-trust-signal="reading_lines" title="Reading between lines">Reading</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Stage Celebrations</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Getting Started" class="dev-expression-btn" data-stage-celebrate="getting-started" title="Getting Started celebration">Getting Started</button>
            <button aria-label="Building Trust" class="dev-expression-btn" data-stage-celebrate="building-trust" title="Building Trust celebration">Building Trust</button>
            <button aria-label="Established" class="dev-expression-btn" data-stage-celebrate="established" title="Established celebration">Established</button>
            <button aria-label="Deep Partner" class="dev-expression-btn" data-stage-celebrate="deep-partnership" title="Deep Partnership celebration">Deep Partner</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Persona Intros</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Maya" class="dev-expression-btn" data-persona-intro="maya" title="Maya Santos intro">Maya</button>
            <button aria-label="Peter" class="dev-expression-btn" data-persona-intro="peter" title="Peter John intro">Peter</button>
            <button aria-label="Alex" class="dev-expression-btn" data-persona-intro="alex" title="Alex Chen intro">Alex</button>
            <button aria-label="Jordan" class="dev-expression-btn" data-persona-intro="jordan" title="Jordan Taylor intro">Jordan</button>
            <button aria-label="Nayan" class="dev-expression-btn" data-persona-intro="nayan" title="Nayan Patel intro">Nayan</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Feature Hints</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Team Huddle" class="dev-expression-btn" data-feature-hint="team-huddle-intro" title="Team Huddle hint">Team Huddle</button>
            <button aria-label="Rituals" class="dev-expression-btn" data-feature-hint="custom-rituals-intro" title="Custom Rituals hint">Rituals</button>
            <button aria-label="Memory" class="dev-expression-btn" data-feature-hint="memory-timeline-intro" title="Memory Timeline hint">Memory</button>
            <button aria-label="Reset Hints" class="dev-expression-btn dev-expression-btn--danger" data-action="reset-hints" title="Reset dismissed hints">Reset Hints</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Progress Indicator</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Toggle" class="dev-expression-btn" data-action="toggle-progress" title="Toggle progress indicator visibility">Toggle</button>
            <button aria-label="Expand" class="dev-expression-btn" data-action="expand-progress" title="Force expand progress details">Expand</button>
          </div>
        </div>
      </section>

      <!-- Semantic Intelligence (Better Than Human V3.0) -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.brain} Ferni's Understanding</h3>
        <p class="dev-section__desc">What Ferni notices about your patterns and growth</p>

        <div class="dev-subsection">
          <span class="dev-label">Deep Insights</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Open Insights" class="dev-action-btn dev-action-btn--primary" data-action="open-semantic-intelligence" title="View what Ferni has learned about you">
              ${ICONS.lightbulb} What I've Noticed
            </button>
          </div>
        </div>
      </section>

      <!-- Outreach Testing (Email/SMS) -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.mail} Outreach Testing</h3>
        <p class="dev-section__desc">Test email and SMS delivery</p>

        <div class="dev-subsection">
          <span class="dev-label">Welcome Sequence</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Welcome" class="dev-expression-btn" data-outreach="welcome-day0" title="Send Day 0 welcome">Welcome</button>
            <button aria-label="Day 3" class="dev-expression-btn" data-outreach="welcome-day3" title="Send Day 3 check-in">Day 3</button>
            <button aria-label="Week" class="dev-expression-btn" data-outreach="welcome-week" title="Send 1 week email">Week</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Milestone Celebration</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Send Milestone" class="dev-expression-btn" data-outreach="milestone" title="Send test milestone email">Send Milestone</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Streak Reminder</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Streak 5" class="dev-expression-btn" data-outreach="streak-5" title="5-day streak reminder">Streak 5</button>
            <button aria-label="Streak 14" class="dev-expression-btn" data-outreach="streak-14" title="14-day streak reminder">Streak 14</button>
          </div>
        </div>

        <div class="dev-subsection">
          <span class="dev-label">Test Direct</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Test Email" class="dev-expression-btn" data-outreach="test-email" title="Test email delivery">Test Email</button>
            <button aria-label="Test SMS" class="dev-expression-btn" data-outreach="test-sms" title="Test SMS delivery">Test SMS</button>
          </div>
        </div>
      </section>
      
      <!-- Music Animation Tester -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.music} Music Animations</h3>
        <p class="dev-section__desc">Test bass-reactive music visualization</p>
        <div class="dev-music-buttons" role="button" tabindex="0">
          <button aria-label="Play" class="dev-music-btn" data-action="start-music" title="Start simulated music">
            ${ICONS.play} Start Music
          </button>
          <button aria-label="Stop" class="dev-music-btn" data-action="stop-music" title="Stop with fun outro">
            ${ICONS.stop} Stop Music
          </button>
          <button aria-label="Volume" class="dev-music-btn" data-action="duck-music" title="Simulate agent talking over music">
            ${ICONS.volumeLow} Duck
          </button>
          <button aria-label="Volume" class="dev-music-btn" data-action="unduck-music" title="Restore full volume">
            ${ICONS.volumeHigh} Unduck
          </button>
        </div>
        <div class="dev-music-buttons" role="button" tabindex="0" style="margin-top: var(--space-2);">
          <button aria-label="Our Song" class="dev-music-btn" data-action="our-song" title="Test 'Our Song' - shared musical memory">
            ${ICONS.heart} Our Song
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
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Start Listening" class="dev-expression-btn dev-expression-btn--mode" data-mode="start-listening" title="Simulate user speaking">
              ${ICONS.mic} Start Listening
            </button>
            <button aria-label="Stop" class="dev-expression-btn dev-expression-btn--mode" data-mode="stop-listening" title="Stop listening mode">
              ${ICONS.volumeOff} Stop Listening
            </button>
            <button aria-label="Volume" class="dev-expression-btn dev-expression-btn--mode" data-mode="start-speaking" title="Simulate agent speaking">
              ${ICONS.speaker} Start Speaking
            </button>
            <button aria-label="Stop" class="dev-expression-btn dev-expression-btn--mode" data-mode="stop-speaking" title="Stop speaking mode">
              ${ICONS.volumeOff} Stop Speaking
            </button>
          </div>
        </div>
        
        <!-- Greetings -->
        <div class="dev-subsection">
          <span class="dev-label">Greetings</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Morning" class="dev-expression-btn dev-expression-btn--greeting" data-greeting="morning" title="Morning energy">
              ${ICONS.sunrise} Morning
            </button>
            <button aria-label="Evening" class="dev-expression-btn dev-expression-btn--greeting" data-greeting="evening" title="Evening calm">
              ${ICONS.moon} Evening
            </button>
            <button aria-label="Late Night" class="dev-expression-btn dev-expression-btn--greeting" data-greeting="latenight" title="Late night gentle">
              ${ICONS.moon} Late Night
            </button>
            <button aria-label="Welcome Back" class="dev-expression-btn dev-expression-btn--greeting" data-greeting="welcomeback" title="Returning user">
              ${ICONS.hand} Welcome Back
            </button>
          </div>
        </div>
        
        <!-- Milestones -->
        <div class="dev-subsection">
          <span class="dev-label">Celebrations</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="5-Day Streak" class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="streak-5" title="5-day streak">
              ${ICONS.flame} 5-Day Streak
            </button>
            <button aria-label="30-Day Streak" class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="streak-30" title="30-day streak (max)">
              ${ICONS.flame} 30-Day Streak
            </button>
            <button aria-label="Goal Complete" class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="goal" title="Goal completed">
              ${ICONS.target} Goal Complete
            </button>
            <button aria-label="New Team Member" class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="team" title="Meet new team member">
              ${ICONS.handshake} New Team Member
            </button>
            <button aria-label="Winter Solstice" class="dev-expression-btn dev-expression-btn--celebrate" data-celebration="winter-solstice" title="Winter Solstice - Full cinematic experience" style="background: linear-gradient(135deg, #0d1b2a, #2c3e50); border: 1px solid #4a6741;">
              ${ICONS.sunset} Winter Solstice
            </button>
          </div>
        </div>
        
        <!-- Deep Thinking -->
        <div class="dev-subsection">
          <span class="dev-label">Thinking</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Start Deep Thinking" class="dev-expression-btn dev-expression-btn--thinking" data-thinking="start" title="Deep contemplation">
              ${ICONS.brain} Start Deep Thinking
            </button>
            <button aria-label="Stop" class="dev-expression-btn dev-expression-btn--thinking" data-thinking="stop" title="Insight achieved">
              ${ICONS.lightbulb} Stop (with insight)
            </button>
          </div>
        </div>
        
        <!-- ${ICONS.sunrise} Conversation Flow -->
        <div class="dev-subsection">
          <span class="dev-label">Conversation Flow</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Warm Goodbye" class="dev-expression-btn dev-expression-btn--wrap-up" data-wrap-up="warm" title="Warm goodbye">
              ${ICONS.hand} Warm Goodbye
            </button>
            <button aria-label="Encouraging" class="dev-expression-btn dev-expression-btn--wrap-up" data-wrap-up="encouraging" title="Encouraging farewell">
              ${ICONS.flex} Encouraging
            </button>
            <button aria-label="Thoughtful" class="dev-expression-btn dev-expression-btn--wrap-up" data-wrap-up="thoughtful" title="Thoughtful goodbye">
              ${ICONS.thinking} Thoughtful
            </button>
            <button aria-label="Caring" class="dev-expression-btn dev-expression-btn--wrap-up" data-wrap-up="caring" title="Caring goodbye">
              ${ICONS.heart} Caring
            </button>
            <button aria-label="Reset" class="dev-expression-btn dev-expression-btn--wrap-up dev-expression-btn--reset" data-wrap-up="reset" title="Reset wrap-up state">
              ${ICONS.rotateCcw} Reset
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
          <div class="dev-emotion-buttons" role="button" tabindex="0">
            <button aria-label="Neutral" class="dev-emotion-btn" data-emotion="neutral" title="Default calm state">
              ${ICONS.meh} Neutral
            </button>
            <button aria-label="Happy" class="dev-emotion-btn" data-emotion="happy" title="Positive, smiling waveform">
              ${ICONS.smile} Happy
            </button>
            <button aria-label="Excited" class="dev-emotion-btn" data-emotion="excited" title="High energy, fast breathing">
              ${ICONS.party} Excited
            </button>
            <button aria-label="Curious" class="dev-emotion-btn" data-emotion="curious" title="Attentive, interested">
              ${ICONS.thinking} Curious
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">More Emotions</span>
          <div class="dev-emotion-buttons" role="button" tabindex="0">
            <button aria-label="Thinking" class="dev-emotion-btn" data-emotion="thinking" title="Slow, contemplative">
              ${ICONS.brain} Thinking
            </button>
            <button aria-label="Calm" class="dev-emotion-btn" data-emotion="calm" title="Peaceful, slow breathing">
              ${ICONS.smile} Calm
            </button>
            <button aria-label="Sad" class="dev-emotion-btn" data-emotion="sad" title="Empathetic, sighing">
              ${ICONS.frown} Sad
            </button>
            <button aria-label="Frustrated" class="dev-emotion-btn" data-emotion="frustrated" title="Agitated, irregular">
              ${ICONS.angry} Frustrated
            </button>
          </div>
        </div>
        
        <!-- Emotion Reactions -->
        <div class="dev-subsection">
          <span class="dev-label">Character Reactions</span>
          <div class="dev-emotion-buttons" role="button" tabindex="0">
            <button aria-label="Nod" class="dev-reaction-btn" data-reaction="nod" title="Agreement with follow-through">
              ${ICONS.thumbsUp} Nod
            </button>
            <button aria-label="Shake" class="dev-reaction-btn" data-reaction="shake" title="Gentle disagreement">
              ${ICONS.thumbsDown} Shake
            </button>
            <button aria-label="Bounce" class="dev-reaction-btn" data-reaction="bounce" title="Excited hop with squash/stretch">
              ${ICONS.kangaroo} Bounce
            </button>
            <button aria-label="Celebrate" class="dev-reaction-btn" data-reaction="celebrate" title="Full celebration sequence">
              ${ICONS.confetti} Celebrate
            </button>
          </div>
        </div>
        
        <!-- Flash Emotions -->
        <div class="dev-subsection">
          <span class="dev-label">Flash Emotions (2s)</span>
          <div class="dev-emotion-buttons" role="button" tabindex="0">
            <button aria-label="Flash Excited" class="dev-flash-btn" data-flash="excited" title="Brief excitement">
              ${ICONS.zap} Flash Excited
            </button>
            <button aria-label="Flash Happy" class="dev-flash-btn" data-flash="happy" title="Brief happiness">
              ${ICONS.zap} Flash Happy
            </button>
            <button aria-label="Flash Curious" class="dev-flash-btn" data-flash="curious" title="Brief curiosity">
              ${ICONS.zap} Flash Curious
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
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Dramatic Bounce" class="dev-expression-btn dev-expression-btn--dramatic" data-dramatic="bounce" title="character-style bounce">
              ${ICONS.drama} Dramatic Bounce
            </button>
            <button aria-label="Excited Wobble" class="dev-expression-btn dev-expression-btn--dramatic" data-dramatic="wobble" title="Excited wobble">
              ${ICONS.tent} Excited Wobble
            </button>
            <button aria-label="Head Shake" class="dev-expression-btn dev-expression-btn--dramatic" data-dramatic="shake" title="Concerned head shake">
              ${ICONS.worried} Head Shake
            </button>
            <button aria-label="Perky!" class="dev-expression-btn dev-expression-btn--dramatic" data-dramatic="perky" title="Perky attention">
              ${ICONS.eye} Perky!
            </button>
          </div>
        </div>
        
        <!-- Ring & Aura -->
        <div class="dev-subsection">
          <span class="dev-label">Ring & Aura Effects</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Slow Beat" class="dev-expression-btn dev-expression-btn--ring" data-ring="heartbeat-slow" title="Calm heartbeat">
              ${ICONS.heartPulse} Slow Beat
            </button>
            <button aria-label="Fast Beat" class="dev-expression-btn dev-expression-btn--ring" data-ring="heartbeat-fast" title="Excited heartbeat">
              ${ICONS.heartPulse} Fast Beat
            </button>
            <button aria-label="Stop" class="dev-expression-btn dev-expression-btn--ring" data-ring="heartbeat-stop" title="Stop heartbeat">
              ${ICONS.volumeOff} Stop Beat
            </button>
            <button aria-label="Aura Pulse" class="dev-expression-btn dev-expression-btn--ring" data-ring="aura" title="Pulse emotion aura">
              ${ICONS.rainbow} Aura Pulse
            </button>
          </div>
        </div>
        
        <!-- Ripple Effects -->
        <div class="dev-subsection">
          <span class="dev-label">Ripple & Burst</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Single Ripple" class="dev-expression-btn dev-expression-btn--ripple" data-ripple="single" title="Single ripple">
              ${ICONS.circleDot} Single Ripple
            </button>
            <button aria-label="Multi Ripple" class="dev-expression-btn dev-expression-btn--ripple" data-ripple="multi" title="Multiple ripples">
              ${ICONS.circle} Multi Ripple
            </button>
            <button aria-label="Burst!" class="dev-expression-btn dev-expression-btn--ripple" data-ripple="burst" title="Celebration burst">
              ${ICONS.zap} Burst!
            </button>
            <button aria-label="BIG Celebration" class="dev-expression-btn dev-expression-btn--ripple" data-ripple="big" title="BIG celebration">
              ${ICONS.fireworks} BIG Celebration
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.rocket} Ferni EQ - Superhuman Emotional Intelligence -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Ferni EQ</h3>
        <p class="dev-section__desc">Better than Human - micro-expressions, breath sync, active listening</p>
        
        <!-- Micro-Expressions -->
        <div class="dev-subsection">
          <span class="dev-label">Micro-Expressions (Subliminal)</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Recognition" class="dev-expression-btn dev-expression-btn--beyond" data-micro="recognition" title="Flash of recognition (80ms)">
              ${ICONS.eye} Recognition
            </button>
            <button aria-label="Concern Flash" class="dev-expression-btn dev-expression-btn--beyond" data-micro="concern_flash" title="Brief concern flash (60ms)">
              ${ICONS.worried} Concern Flash
            </button>
            <button aria-label="Delight Flash" class="dev-expression-btn dev-expression-btn--beyond" data-micro="delight_flash" title="Micro-delight (100ms)">
              ${ICONS.sparkles} Delight Flash
            </button>
            <button aria-label="Warmth Pulse" class="dev-expression-btn dev-expression-btn--beyond" data-micro="warmth_pulse" title="Warmth pulse (120ms)">
              ${ICONS.heartPulse} Warmth Pulse
            </button>
          </div>
        </div>
        
        <!-- Active Listening -->
        <div class="dev-subsection">
          <span class="dev-label">Active Listening</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="User profile" class="dev-expression-btn dev-expression-btn--beyond" data-listen="micro-nod" title="Barely perceptible nod">
              ${ICONS.user} Micro-Nod
            </button>
            <button aria-label="User profile" class="dev-expression-btn dev-expression-btn--beyond" data-listen="subtle-nod" title="Subtle acknowledgment nod">
              ${ICONS.user} Subtle Nod
            </button>
            <button aria-label="User profile" class="dev-expression-btn dev-expression-btn--beyond" data-listen="visible-nod" title="Visible listening nod">
              ${ICONS.user} Visible Nod
            </button>
            <button aria-label="Lean In" class="dev-expression-btn dev-expression-btn--beyond" data-listen="lean" title="Lean in with interest">
              ${ICONS.layers} Lean In
            </button>
          </div>
        </div>
        
        <!-- Concern Detection -->
        <div class="dev-subsection">
          <span class="dev-label">Concern Response</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Mild Concern" class="dev-expression-btn dev-expression-btn--beyond" data-concern="mild" title="Mild concern (subtle)">
              ${ICONS.meh} Mild Concern
            </button>
            <button aria-label="Moderate" class="dev-expression-btn dev-expression-btn--beyond" data-concern="moderate" title="Moderate concern (visible)">
              ${ICONS.worried} Moderate
            </button>
            <button aria-label="Significant" class="dev-expression-btn dev-expression-btn--beyond" data-concern="significant" title="Significant concern (active)">
              ${ICONS.frown} Significant
            </button>
          </div>
        </div>
        
        <!-- Breath Sync -->
        <div class="dev-subsection">
          <span class="dev-label">Breath Sync</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Slow (10/min)" class="dev-expression-btn dev-expression-btn--beyond" data-breath="slow" title="Sync to slow breath (10/min)">
              ${ICONS.turtle} Slow (10/min)
            </button>
            <button aria-label="Normal (15/min)" class="dev-expression-btn dev-expression-btn--beyond" data-breath="normal" title="Sync to normal breath (15/min)">
              ${ICONS.smile} Normal (15/min)
            </button>
            <button aria-label="Fast (20/min)" class="dev-expression-btn dev-expression-btn--beyond" data-breath="fast" title="Sync to fast breath (20/min)">
              ${ICONS.wind} Fast (20/min)
            </button>
            <button aria-label="Off" class="dev-expression-btn dev-expression-btn--beyond" data-breath="off" title="Disable breath sync">
              ${ICONS.ban} Off
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.plug} Connection & Audio Testing -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.zap} Connection & Audio</h3>
        <p class="dev-section__desc">Test connection states and audio feedback</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Connection State</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Refresh" class="dev-expression-btn dev-expression-btn--connection" data-connection="connecting" title="Show connecting state">
              ${ICONS.refresh} Connecting
            </button>
            <button aria-label="Confirm" class="dev-expression-btn dev-expression-btn--connection" data-connection="connected" title="Show connected state">
              ${ICONS.checkCircle} Connected
            </button>
            <button aria-label="Disconnected" class="dev-expression-btn dev-expression-btn--connection" data-connection="disconnected" title="Show disconnected state">
              ${ICONS.xCircle} Disconnected
            </button>
            <button aria-label="Error" class="dev-expression-btn dev-expression-btn--connection" data-connection="error" title="Show error state">
              ${ICONS.alertTriangle} Error
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Sound Effects</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Connect" class="dev-expression-btn dev-expression-btn--sound" data-sound="connect" title="Play connect sound">
              ${ICONS.bell} Connect
            </button>
            <button aria-label="Disconnect" class="dev-expression-btn dev-expression-btn--sound" data-sound="disconnect" title="Play disconnect sound">
              ${ICONS.bellOff} Disconnect
            </button>
            <button aria-label="Success" class="dev-expression-btn dev-expression-btn--sound" data-sound="success" title="Play success sound">
              ${ICONS.sparkles} Success
            </button>
            <button aria-label="Error" class="dev-expression-btn dev-expression-btn--sound" data-sound="error" title="Play error sound">
              ${ICONS.alertCircle} Error
            </button>
            <button aria-label="Hover" class="dev-expression-btn dev-expression-btn--sound" data-sound="hover" title="Play hover sound">
              ${ICONS.pointer} Hover
            </button>
            <button aria-label="Click" class="dev-expression-btn dev-expression-btn--sound" data-sound="click" title="Play click sound">
              ${ICONS.click} Click
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.chat} Messages & Transcript -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.drama} Messages & Transcript</h3>
        <p class="dev-section__desc">Inject test messages and transcript entries</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Message Type</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="User profile" class="dev-expression-btn dev-expression-btn--message" data-message="user" title="Inject user message">
              ${ICONS.user} User Message
            </button>
            <button aria-label="Agent Message" class="dev-expression-btn dev-expression-btn--message" data-message="agent" title="Inject agent message">
              ${ICONS.robot} Agent Message
            </button>
            <button aria-label="Thinking..." class="dev-expression-btn dev-expression-btn--message" data-message="thinking" title="Show thinking indicator">
              ${ICONS.messageCircle} Thinking...
            </button>
            <button aria-label="Volume" class="dev-expression-btn dev-expression-btn--message" data-message="whisper" title="Show status whisper">
              ${ICONS.volumeOff} Whisper
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Toast Notifications</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Confirm" class="dev-expression-btn dev-expression-btn--toast" data-toast="success" title="Show success toast">
              ${ICONS.checkCircle} Success
            </button>
            <button aria-label="Error" class="dev-expression-btn dev-expression-btn--toast" data-toast="error" title="Show error toast">
              ${ICONS.xCircle} Error
            </button>
            <button aria-label="More information" class="dev-expression-btn dev-expression-btn--toast" data-toast="info" title="Show info toast">
              ${ICONS.info} Info
            </button>
            <button aria-label="Warning" class="dev-expression-btn dev-expression-btn--toast" data-toast="warning" title="Show warning toast">
              ${ICONS.alertTriangle} Warning
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.smartphone} Modals & Panels -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.users} Modals & Panels</h3>
        <p class="dev-section__desc">Open various app dialogs and panels</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Panels</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Analytics" class="dev-expression-btn dev-expression-btn--modal" data-modal="analytics" title="Open analytics">
              ${ICONS.barChart} Analytics
            </button>
            <button aria-label="History" class="dev-expression-btn dev-expression-btn--modal" data-modal="history" title="Open conversation history">
              ${ICONS.scroll} History
            </button>
            <button aria-label="Insights" class="dev-expression-btn dev-expression-btn--modal" data-modal="insights" title="Open insights">
              ${ICONS.brain} Insights
            </button>
            <button aria-label="Predictions" class="dev-expression-btn dev-expression-btn--modal" data-modal="predictions" title="Open predictions">
              ${ICONS.crystalBall} Predictions
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Special</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Restart Tour" class="dev-expression-btn dev-expression-btn--modal" data-modal="tour" title="Restart app tour">
              ${ICONS.target} Restart Tour
            </button>
            <button aria-label="Confirm" class="dev-expression-btn dev-expression-btn--modal" data-modal="daily" title="Open daily check-in">
              ${ICONS.sun} Daily Check-in
            </button>
            <button aria-label="Team Huddle" class="dev-expression-btn dev-expression-btn--modal" data-modal="huddle" title="Open team huddle">
              ${ICONS.handshake} Team Huddle
            </button>
            <button aria-label="Marketplace" class="dev-expression-btn dev-expression-btn--modal" data-modal="marketplace" title="Open marketplace">
              ${ICONS.store} Marketplace
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.clock} Time & Environment -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sun} Environment</h3>
        <p class="dev-section__desc">Override time of day and environment settings</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Time Override</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Morning" class="dev-expression-btn dev-expression-btn--time" data-time="morning" title="Set to morning (6am)">
              ${ICONS.sunrise} Morning
            </button>
            <button aria-label="Afternoon" class="dev-expression-btn dev-expression-btn--time" data-time="afternoon" title="Set to afternoon (2pm)">
              ${ICONS.sun} Afternoon
            </button>
            <button aria-label="Evening" class="dev-expression-btn dev-expression-btn--time" data-time="evening" title="Set to evening (7pm)">
              ${ICONS.sunset} Evening
            </button>
            <button aria-label="Night" class="dev-expression-btn dev-expression-btn--time" data-time="night" title="Set to night (11pm)">
              ${ICONS.moon} Night
            </button>
            <button aria-label="Refresh" class="dev-expression-btn dev-expression-btn--time" data-time="reset" title="Use real time">
              ${ICONS.refresh} Real Time
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Accessibility</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Reduced Motion" class="dev-expression-btn dev-expression-btn--a11y" data-a11y="reduce-motion" title="Toggle reduced motion">
              ${ICONS.turtle} Reduced Motion
            </button>
            <button aria-label="High Contrast" class="dev-expression-btn dev-expression-btn--a11y" data-a11y="high-contrast" title="Toggle high contrast">
              ${ICONS.layers} High Contrast
            </button>
            <button aria-label="Large Text" class="dev-expression-btn dev-expression-btn--a11y" data-a11y="large-text" title="Toggle large text">
              ${ICONS.activity} Large Text
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.dice} Easter Eggs & Fun -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Easter Eggs</h3>
        <p class="dev-section__desc">Trigger hidden delights and special effects</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Special Effects</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Confetti" class="dev-expression-btn dev-expression-btn--easter" data-easter="confetti" title="Confetti burst">
              ${ICONS.confetti} Confetti
            </button>
            <button aria-label="Fireworks" class="dev-expression-btn dev-expression-btn--easter" data-easter="fireworks" title="Fireworks">
              ${ICONS.fireworks} Fireworks
            </button>
            <button aria-label="Party Mode" class="dev-expression-btn dev-expression-btn--easter" data-easter="party" title="Party mode">
              ${ICONS.party} Party Mode
            </button>
            <button aria-label="Zen" class="dev-expression-btn dev-expression-btn--easter" data-easter="zen" title="Zen moment">
              ${ICONS.yoga} Zen
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.wrench} App State Inspector -->
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
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Volume" class="dev-expression-btn dev-expression-btn--state" data-state="toggle-mute" title="Toggle muted state">
              ${ICONS.volumeOff} Toggle Mute
            </button>
            <button aria-label="Refresh" class="dev-expression-btn dev-expression-btn--state" data-state="refresh" title="Refresh state display">
              ${ICONS.refresh} Refresh
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.waves} Waveform Testing -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.music} Waveform States</h3>
        <p class="dev-section__desc">Test waveform visualization states</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Waveform Mode</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Idle" class="dev-expression-btn dev-expression-btn--waveform" data-waveform="idle" title="Idle state">
              ${ICONS.sleepy} Idle
            </button>
            <button aria-label="Listening" class="dev-expression-btn dev-expression-btn--waveform" data-waveform="listening" title="Listening state">
              ${ICONS.mic} Listening
            </button>
            <button aria-label="Volume" class="dev-expression-btn dev-expression-btn--waveform" data-waveform="speaking-low" title="Low intensity speaking">
              ${ICONS.volumeLow} Speaking Low
            </button>
            <button aria-label="Volume" class="dev-expression-btn dev-expression-btn--waveform" data-waveform="speaking-med" title="Medium intensity speaking">
              ${ICONS.volumeHigh} Speaking Med
            </button>
            <button aria-label="Volume" class="dev-expression-btn dev-expression-btn--waveform" data-waveform="speaking-high" title="High intensity speaking">
              ${ICONS.speaker} Speaking High
            </button>
            <button aria-label="Thinking" class="dev-expression-btn dev-expression-btn--waveform" data-waveform="thinking" title="Thinking state">
              ${ICONS.thinking} Thinking
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.skull} Loading & Skeleton States -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.refresh} Loading States</h3>
        <p class="dev-section__desc">Test skeleton loaders and loading indicators</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Loading UI</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="User profile" class="dev-expression-btn dev-expression-btn--loading" data-loading="skeleton-avatar" title="Avatar skeleton">
              ${ICONS.user} Avatar Skeleton
            </button>
            <button aria-label="User profile" class="dev-expression-btn dev-expression-btn--loading" data-loading="skeleton-team" title="Team skeleton">
              ${ICONS.users} Team Skeleton
            </button>
            <button aria-label="Spinner" class="dev-expression-btn dev-expression-btn--loading" data-loading="spinner" title="Show spinner">
              ${ICONS.hourglass} Spinner
            </button>
            <button aria-label="Confirm" class="dev-expression-btn dev-expression-btn--loading" data-loading="clear" title="Clear loading states">
              ${ICONS.check} Clear All
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.confetti} Streak Celebrations -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Streak Milestones</h3>
        <p class="dev-section__desc">Test all streak celebration levels</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Streak Days</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="3 Days" class="dev-expression-btn dev-expression-btn--streak" data-streak="3" title="3-day streak">
              ${ICONS.activity} 3 Days
            </button>
            <button aria-label="7 Days" class="dev-expression-btn dev-expression-btn--streak" data-streak="7" title="7-day streak">
              ${ICONS.activity} 7 Days
            </button>
            <button aria-label="14 Days" class="dev-expression-btn dev-expression-btn--streak" data-streak="14" title="14-day streak">
              ${ICONS.calendar} 14 Days
            </button>
            <button aria-label="30 Days" class="dev-expression-btn dev-expression-btn--streak" data-streak="30" title="30-day streak">
              ${ICONS.moon} 30 Days
            </button>
            <button aria-label="60 Days" class="dev-expression-btn dev-expression-btn--streak" data-streak="60" title="60-day streak">
              ${ICONS.star} 60 Days
            </button>
            <button aria-label="90 Days" class="dev-expression-btn dev-expression-btn--streak" data-streak="90" title="90-day streak">
              ${ICONS.trophy} 90 Days
            </button>
            <button aria-label="365 Days!" class="dev-expression-btn dev-expression-btn--streak" data-streak="365" title="365-day streak">
              ${ICONS.crown} 365 Days!
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.signalStrength} Network Simulation -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.zap} Network Simulation</h3>
        <p class="dev-section__desc">Simulate network conditions</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Connection Quality</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Excellent" class="dev-expression-btn dev-expression-btn--network" data-network="excellent" title="Excellent connection">
              ${ICONS.signalStrength} Excellent
            </button>
            <button aria-label="Good" class="dev-expression-btn dev-expression-btn--network" data-network="good" title="Good connection">
              ${ICONS.signalStrength} Good
            </button>
            <button aria-label="Poor" class="dev-expression-btn dev-expression-btn--network" data-network="poor" title="Poor connection">
              ${ICONS.signalStrength} Poor
            </button>
            <button aria-label="Offline" class="dev-expression-btn dev-expression-btn--network" data-network="offline" title="Offline mode">
              ${ICONS.xCircle} Offline
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Latency</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="0ms" class="dev-expression-btn dev-expression-btn--latency" data-latency="0" title="No latency">
              ${ICONS.zap} 0ms
            </button>
            <button aria-label="200ms" class="dev-expression-btn dev-expression-btn--latency" data-latency="200" title="200ms latency">
              ${ICONS.turtle} 200ms
            </button>
            <button aria-label="500ms" class="dev-expression-btn dev-expression-btn--latency" data-latency="500" title="500ms latency">
              ${ICONS.sloth} 500ms
            </button>
            <button aria-label="1000ms" class="dev-expression-btn dev-expression-btn--latency" data-latency="1000" title="1s latency">
              ${ICONS.snail} 1000ms
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.trash} Storage & Data -->
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
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="View Storage" class="dev-expression-btn dev-expression-btn--storage" data-storage="view" title="View all storage">
              ${ICONS.eye} View Storage
            </button>
            <button aria-label="Clear Cache" class="dev-expression-btn dev-expression-btn--storage" data-storage="clear-cache" title="Clear cache">
              ${ICONS.brush} Clear Cache
            </button>
            <button aria-label="Clear Marketplace" class="dev-expression-btn dev-expression-btn--storage" data-storage="clear-marketplace" title="Clear installed marketplace agents">
              ${ICONS.store} Clear Marketplace
            </button>
            <button aria-label="Clear ALL" class="dev-expression-btn dev-expression-btn--storage" data-storage="clear-all" title="Clear ALL data (careful!)">
              ${ICONS.alertTriangle} Clear ALL
            </button>
            <button aria-label="Upload" class="dev-expression-btn dev-expression-btn--storage" data-storage="export" title="Export storage to console">
              ${ICONS.upload} Export
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.drama} Ambient & Particles -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.sparkles} Ambient Effects</h3>
        <p class="dev-section__desc">Toggle ambient backgrounds and particles</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Effects</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Particles" class="dev-expression-btn dev-expression-btn--ambient" data-ambient="particles" title="Toggle particles">
              ${ICONS.sparkles} Particles
            </button>
            <button aria-label="Ambient Glow" class="dev-expression-btn dev-expression-btn--ambient" data-ambient="glow" title="Toggle ambient glow">
              ${ICONS.star} Ambient Glow
            </button>
            <button aria-label="Aurora" class="dev-expression-btn dev-expression-btn--ambient" data-ambient="aurora" title="Toggle aurora">
              ${ICONS.aurora} Aurora
            </button>
            <button aria-label="All Off" class="dev-expression-btn dev-expression-btn--ambient" data-ambient="off" title="Turn off all effects">
              ${ICONS.ban} All Off
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Avatar Weather (${getCurrentSeason()})</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Seasonal Moment" class="dev-expression-btn dev-expression-btn--weather dev-expression-btn--primary" data-weather="moment" title="Play brief seasonal moment">
              ${ICONS.sparkles} Seasonal Moment
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'snow' ? 'active' : ''}" data-weather="snow" title="Snow around avatar">
              ${ICONS.snowflake}
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'rain' ? 'active' : ''}" data-weather="rain" title="Rain">
              ${ICONS.cloudRain}
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'leaves' ? 'active' : ''}" data-weather="leaves" title="Falling leaves">
              ${ICONS.leaf}
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'petals' ? 'active' : ''}" data-weather="petals" title="Cherry blossoms">
              ${ICONS.flower}
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather ${getCurrentWeather() === 'fireflies' ? 'active' : ''}" data-weather="fireflies" title="Fireflies">
              ${ICONS.bug}
            </button>
            <button class="dev-expression-btn dev-expression-btn--weather" data-weather="none" title="Stop">
              ${ICONS.x}
            </button>
          </div>
        </div>
        
        <!-- Circadian & Warmth Testing -->
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.moon} Circadian Period (${circadianManager.getCurrentPeriod() || 'auto'})</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button class="dev-expression-btn dev-expression-btn--circadian ${circadianManager.getCurrentPeriod() === 'earlyMorning' ? 'active' : ''}" data-circadian="earlyMorning" title="Dawn">
              🌅 Dawn
            </button>
            <button class="dev-expression-btn dev-expression-btn--circadian ${circadianManager.getCurrentPeriod() === 'morning' ? 'active' : ''}" data-circadian="morning" title="Morning">
              ☀️ Morning
            </button>
            <button class="dev-expression-btn dev-expression-btn--circadian ${circadianManager.getCurrentPeriod() === 'midday' ? 'active' : ''}" data-circadian="midday" title="Midday">
              🌞 Midday
            </button>
            <button class="dev-expression-btn dev-expression-btn--circadian ${circadianManager.getCurrentPeriod() === 'afternoon' ? 'active' : ''}" data-circadian="afternoon" title="Afternoon">
              🌤️ Afternoon
            </button>
            <button class="dev-expression-btn dev-expression-btn--circadian ${circadianManager.getCurrentPeriod() === 'evening' ? 'active' : ''}" data-circadian="evening" title="Evening">
              🌇 Evening
            </button>
            <button class="dev-expression-btn dev-expression-btn--circadian ${circadianManager.getCurrentPeriod() === 'night' ? 'active' : ''}" data-circadian="night" title="Night">
              🌙 Night
            </button>
            <button class="dev-expression-btn dev-expression-btn--circadian ${circadianManager.getCurrentPeriod() === 'lateNight' ? 'active' : ''}" data-circadian="lateNight" title="Late Night">
              🌃 Late Night
            </button>
            <button class="dev-expression-btn dev-expression-btn--circadian ${circadianManager.getCurrentPeriod() === 'deepNight' ? 'active' : ''}" data-circadian="deepNight" title="Deep Night">
              ✨ Deep Night
            </button>
            <button class="dev-expression-btn dev-expression-btn--circadian" data-circadian="auto" title="Reset to Auto">
              🔄 Auto
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">${ICONS.heart} Relationship Warmth</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button class="dev-expression-btn dev-expression-btn--warmth" data-warmth="first-meeting" title="First Meeting">
              1️⃣ First Meeting
            </button>
            <button class="dev-expression-btn dev-expression-btn--warmth" data-warmth="getting-started" title="Getting Started">
              2️⃣ Getting Started
            </button>
            <button class="dev-expression-btn dev-expression-btn--warmth" data-warmth="building-trust" title="Building Trust">
              3️⃣ Building Trust
            </button>
            <button class="dev-expression-btn dev-expression-btn--warmth" data-warmth="established" title="Established">
              4️⃣ Established
            </button>
            <button class="dev-expression-btn dev-expression-btn--warmth" data-warmth="deep-partnership" title="Deep Partnership">
              5️⃣ Deep Partnership
            </button>
            <button class="dev-expression-btn dev-expression-btn--warmth dev-expression-btn--primary" data-warmth="celebrate" title="Trigger Warmth Celebration">
              ${ICONS.sparkles} Celebration
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.upload} Proactive Outreach Testing -->
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
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Confirm" class="dev-expression-btn dev-expression-btn--outreach dev-expression-btn--primary" data-outreach="check-config" title="Check if phone/email is configured">
              ${ICONS.search} Check Config
            </button>
            <button aria-label="Test SMS" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="test-sms" title="Send test SMS">
              ${ICONS.smartphone} Test SMS
            </button>
            <button aria-label="Test Email" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="test-email" title="Send test email">
              ${ICONS.mail} Test Email
            </button>
            <button aria-label="Test Call" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="test-call" title="Make test call">
              ${ICONS.phone} Test Call
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Trigger Types</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Copy" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="trigger-commitment" title="Commitment check-in">
              ${ICONS.clipboard} Commitment
            </button>
            <button aria-label="Emotional" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="trigger-emotional" title="Emotional support">
              ${ICONS.heart} Emotional
            </button>
            <button aria-label="Celebration" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="trigger-celebration" title="Celebration">
              ${ICONS.party} Celebration
            </button>
            <button aria-label="Thinking of You" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="trigger-thinking" title="Thinking of you">
              ${ICONS.messageCircle} Thinking of You
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">View Data</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Copy" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="view-pending" title="View pending outreach">
              ${ICONS.clipboard} Pending
            </button>
            <button aria-label="History" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="view-history" title="View outreach history">
              ${ICONS.scroll} History
            </button>
            <button aria-label="Context" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="view-context" title="View user context">
              ${ICONS.brain} Context
            </button>
            <button aria-label="Timing" class="dev-expression-btn dev-expression-btn--outreach" data-outreach="view-timing" title="View timing patterns">
              ${ICONS.alarm} Timing
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.barChart} Dashboards & Tools -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.target} Dashboards & Tools</h3>
        <p class="dev-section__desc">Quick access to all monitoring dashboards</p>
        
        <div class="dev-subsection">
          <span class="dev-label">Core Dashboards</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/analytics-dashboard.html" target="_blank" title="Analytics Dashboard">
              ${ICONS.trendingUp} Analytics
            </a>
            <a class="dev-dashboard-link" href="/metrics-dashboard.html" target="_blank" title="Metrics Dashboard">
              ${ICONS.barChart} Metrics
            </a>
            <a class="dev-dashboard-link" href="/ux-dashboard.html" target="_blank" title="UX Dashboard">
              ${ICONS.colorPalette} UX
            </a>
            <a class="dev-dashboard-link" href="/error-dashboard.html" target="_blank" title="Error Dashboard">
              ${ICONS.alertTriangle} Errors
            </a>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">AI & Voice</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/llm-dashboard.html" target="_blank" title="LLM Dashboard">
              ${ICONS.robot} LLM
            </a>
            <a class="dev-dashboard-link" href="/voice-presence-dashboard.html" target="_blank" title="Voice Presence Dashboard">
              ${ICONS.micFilled} Voice
            </a>
            <a class="dev-dashboard-link" href="/persona-dashboard.html" target="_blank" title="Persona Dashboard">
              ${ICONS.drama} Personas
            </a>
            <a class="dev-dashboard-link" href="/cognitive-dashboard.html" target="_blank" title="Cognitive Dashboard">
              ${ICONS.brain} Cognitive
            </a>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Infrastructure</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/connection-dashboard.html" target="_blank" title="Connection Dashboard">
              ${ICONS.signalStrength} Connection
            </a>
            <a class="dev-dashboard-link" href="/memory-dashboard.html" target="_blank" title="Memory Dashboard">
              ${ICONS.save} Memory
            </a>
            <a class="dev-dashboard-link" href="/cost-dashboard.html" target="_blank" title="Cost Dashboard">
              ${ICONS.coins} Costs
            </a>
            <a class="dev-dashboard-link" href="/dora-dashboard.html" target="_blank" title="DORA Metrics">
              ${ICONS.rocket} DORA
            </a>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Features & Tools</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/handoff-dashboard.html" target="_blank" title="Handoff Dashboard">
              ${ICONS.handshake} Handoffs
            </a>
            <a class="dev-dashboard-link" href="/outreach-dashboard.html" target="_blank" title="Outreach Dashboard">
              ${ICONS.upload} Outreach
            </a>
            <a class="dev-dashboard-link" href="/tools-dashboard.html" target="_blank" title="Tools Dashboard">
              ${ICONS.wrench} Tools
            </a>
            <a class="dev-dashboard-link" href="/experiments-dashboard.html" target="_blank" title="Experiments">
              ${ICONS.flask} Experiments
            </a>
            <a class="dev-dashboard-link" href="/feature-flags.html" target="_blank" title="Feature Flags">
              ${ICONS.flag} Feature Flags
            </a>
            <button aria-label="EvalOps" class="dev-dashboard-link" data-action="open-evalops" title="EvalOps Dashboard (Cmd+Shift+E)">
              ${ICONS.target} EvalOps
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Admin & Utilities</span>
          <div class="dev-dashboard-links">
            <a class="dev-dashboard-link" href="/admin.html" target="_blank" title="Admin Panel">
              ${ICONS.cog} Admin
            </a>
            <a class="dev-dashboard-link" href="/observability-hub.html" target="_blank" title="Observability Hub">
              ${ICONS.eye} Observability
            </a>
            <a class="dev-dashboard-link" href="/animation-playground.html" target="_blank" title="Animation Playground">
              ${ICONS.movie} Animations
            </a>
            <button aria-label="BTH Analytics" class="dev-dashboard-link" data-action="open-bth-analytics" title="Better Than Human Analytics">
              ${ICONS.heart} BTH Analytics
            </button>
          </div>
        </div>
      </section>
      
      <!-- ${ICONS.movie} Narrative System -->
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
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="First Launch" class="dev-expression-btn dev-expression-btn--narrative" data-beat="first_launch" title="First launch">
              ${ICONS.star} First Launch
            </button>
            <button aria-label="Welcome Back" class="dev-expression-btn dev-expression-btn--narrative" data-beat="welcome_back" title="Welcome back">
              ${ICONS.hand} Welcome Back
            </button>
            <button aria-label="Streak" class="dev-expression-btn dev-expression-btn--narrative" data-beat="streak_continues" title="Streak">
              ${ICONS.flame} Streak
            </button>
            <button aria-label="Connected" class="dev-expression-btn dev-expression-btn--narrative" data-beat="connected" title="Connected">
              ${ICONS.sparkles} Connected
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Conversation Flow</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Volume" class="dev-expression-btn dev-expression-btn--narrative" data-beat="user_starts_speaking" title="User speaking">
              ${ICONS.speaker} User Speaks
            </button>
            <button aria-label="Thinking" class="dev-expression-btn dev-expression-btn--narrative" data-beat="thinking" title="Thinking">
              ${ICONS.thinking} Thinking
            </button>
            <button aria-label="Ferni Speaks" class="dev-expression-btn dev-expression-btn--narrative" data-beat="ferni_starts_speaking" title="Ferni speaking">
              ${ICONS.chat} Ferni Speaks
            </button>
            <button aria-label="Pause" class="dev-expression-btn dev-expression-btn--narrative" data-beat="long_pause" title="Long pause">
              ${ICONS.pause} Long Pause
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Emotional Moments</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Empathy" class="dev-expression-btn dev-expression-btn--narrative" data-beat="empathy_moment" title="Empathy">
              ${ICONS.heart} Empathy
            </button>
            <button aria-label="Vulnerable" class="dev-expression-btn dev-expression-btn--narrative" data-beat="user_vulnerable" title="Vulnerable">
              ${ICONS.hugging} Vulnerable
            </button>
            <button aria-label="Frustrated" class="dev-expression-btn dev-expression-btn--narrative" data-beat="user_frustrated" title="Frustrated">
              ${ICONS.angry} Frustrated
            </button>
            <button aria-label="Sad" class="dev-expression-btn dev-expression-btn--narrative" data-beat="user_sad" title="Sad">
              ${ICONS.frown} Sad
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Achievements</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Small Win" class="dev-expression-btn dev-expression-btn--narrative" data-beat="small_win" title="Small win">
              ${ICONS.star} Small Win
            </button>
            <button aria-label="Big Win" class="dev-expression-btn dev-expression-btn--narrative" data-beat="big_win" title="Big win">
              ${ICONS.trophy} Big Win
            </button>
            <button aria-label="Breakthrough" class="dev-expression-btn dev-expression-btn--narrative" data-beat="breakthrough" title="Breakthrough">
              ${ICONS.lightbulb} Breakthrough
            </button>
            <button aria-label="Milestone" class="dev-expression-btn dev-expression-btn--narrative" data-beat="milestone_reached" title="Milestone">
              ${ICONS.target} Milestone
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Team & Special</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Persona Intro" class="dev-expression-btn dev-expression-btn--narrative" data-beat="persona_introduced" title="Persona intro">
              ${ICONS.drama} Persona Intro
            </button>
            <button aria-label="Team Unlock" class="dev-expression-btn dev-expression-btn--narrative" data-beat="team_unlock" title="Team unlock">
              ${ICONS.unlock} Team Unlock
            </button>
            <button aria-label="Birthday" class="dev-expression-btn dev-expression-btn--narrative" data-beat="birthday" title="Birthday">
              ${ICONS.cake} Birthday
            </button>
            <button aria-label="Morning" class="dev-expression-btn dev-expression-btn--narrative" data-beat="morning_greeting" title="Morning">
              ${ICONS.sun} Morning
            </button>
          </div>
        </div>
        
        <div class="dev-subsection">
          <span class="dev-label">Story Arcs</span>
          <div class="dev-expression-buttons" role="button" tabindex="0">
            <button aria-label="Breakthrough Arc" class="dev-expression-btn dev-expression-btn--arc" data-arc="breakthrough" title="Breakthrough arc">
              ${ICONS.lightbulb} Breakthrough Arc
            </button>
            <button aria-label="Deep Convo Arc" class="dev-expression-btn dev-expression-btn--arc" data-arc="deep_conversation" title="Deep conversation">
              ${ICONS.hugging} Deep Convo Arc
            </button>
            <button aria-label="Goal Complete Arc" class="dev-expression-btn dev-expression-btn--arc" data-arc="goal_completion" title="Goal completion">
              ${ICONS.target} Goal Complete Arc
            </button>
            <button aria-label="Support Arc" class="dev-expression-btn dev-expression-btn--arc" data-arc="frustration_support" title="Frustration support">
              ${ICONS.heart} Support Arc
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
      if (action) handleAction(action);
    });
  });

  // FTUE buttons (First-Time User Experience)
  container.querySelectorAll('[data-ftue]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.ftue;
      if (action) handleFTUEAction(action);
    });
  });

  // Dashboard link buttons (buttons styled as links with data-action)
  container.querySelectorAll('button.dev-dashboard-link[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      if (action) handleAction(action);
    });
  });

  // Soul buttons
  container.querySelectorAll('.dev-soul-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const soul = (btn as HTMLElement).dataset.soul;
      triggerSoulAction(soul!);
    });
  });

  // Avatar Lamp buttons - movements
  container.querySelectorAll('.dev-lamp-btn[data-lamp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.lamp;
      if (action) triggerLampAction(action);
    });
  });

  // Avatar Lamp buttons - emotions
  container.querySelectorAll('.dev-lamp-btn[data-lamp-emotion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emotion = (btn as HTMLElement).dataset.lampEmotion as LampEmotion;
      if (emotion) {
        avatarLamp.express(emotion);
        log.info('Avatar Lamp emotion:', emotion);
      }
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

  // ${ICONS.party} Fun reaction buttons
  container.querySelectorAll('[data-reaction]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reaction = (btn as HTMLElement).dataset.reaction;
      if (reaction) {
        triggerReaction(reaction as 'happy' | 'curious' | 'empathy' | 'laugh' | 'surprise');
      }
    });
  });

  // ${ICONS.movie} Ferni Expressions - Eye Lid Expressions
  container.querySelectorAll('[data-ferni-expr]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const expr = (btn as HTMLElement).dataset.ferniExpr as EmotionalExpression;
      if (expr) {
        triggerFerniExpression(expr);
      }
    });
  });

  // ${ICONS.movie} Ferni Expressions - Advanced Reactions
  container.querySelectorAll('[data-ferni-react]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const react = (btn as HTMLElement).dataset.ferniReact as DevPanelReaction;
      if (react) {
        triggerFerniReaction(react);
      }
    });
  });

  // ${ICONS.movie} Ferni Expressions - Text-to-Icon Morph
  container.querySelectorAll('[data-morph]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const morph = (btn as HTMLElement).dataset.morph;
      if (morph) {
        void triggerFerniMorph(morph);
      }
    });
  });

  // 🤲 Avatar Sidekicks - Side expression icons
  container.querySelectorAll('[data-sidekick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sidekick = (btn as HTMLElement).dataset.sidekick;
      if (sidekick) {
        void triggerSidekick(sidekick);
      }
    });
  });

  // ${ICONS.eye} Ferni Eye - DISABLED (keeping just zen blink)
  // Eye peek-through animations removed for simpler, calmer UX

  // ${ICONS.movie} Narrative story beat buttons
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

  // ${ICONS.movie} Narrative story arc buttons
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

  // ${ICONS.drama} Ferni Moments buttons
  container.querySelectorAll('[data-moment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const moment = (btn as HTMLElement).dataset.moment as MomentType;
      if (moment) {
        ferniMoments.play(moment);
        log.info({ moment }, '${ICONS.drama} Ferni moment triggered');
      }
    });
  });

  // ${ICONS.party} Ferni Milestones buttons
  container.querySelectorAll('[data-milestone]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const milestone = (btn as HTMLElement).dataset.milestone as MilestoneType;
      if (milestone) {
        ferniMilestones.triggerMilestone(milestone);
        log.info({ milestone }, '${ICONS.party} Ferni milestone triggered');
      }
    });
  });

  // Open journey button
  container.querySelector('[data-action="open-journey"]')?.addEventListener('click', () => {
    journeyUI.open();
    log.info('${ICONS.bookOpen} Journey view opened');
  });

  // Open semantic intelligence panel (what Ferni has learned)
  container
    .querySelector('[data-action="open-semantic-intelligence"]')
    ?.addEventListener('click', async () => {
      try {
        const { showSemanticIntelligencePanel } = await import('./semantic-intelligence-panel.ui.js');
        showSemanticIntelligencePanel();
        log.info('${ICONS.brain} Semantic intelligence panel opened');
      } catch (err) {
        log.error({ error: String(err) }, 'Failed to open semantic intelligence panel');
        toast.error("Something went wrong. Try again?");
      }
    });

  // Reset milestones button
  container.querySelector('[data-action="reset-milestones"]')?.addEventListener('click', () => {
    ferniMilestones.resetMilestones();
    log.info('All milestones reset');
  });

  // ${ICONS.heart} Progressive Features - Trust Signals
  container.querySelectorAll('[data-trust-signal]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const signalType = (btn as HTMLElement).dataset.trustSignal;
      if (!signalType) return;

      const testMessages: Record<string, string> = {
        growth: "I noticed you handled that conversation differently than before. You're growing.",
        boundary: "I remember you asked me not to bring up work stress. I'm respecting that.",
        callback:
          'Remember when you told me about your coffee ritual? I think about that sometimes.',
        small_win: 'You actually did it! You asked for help when you needed it.',
        thinking_of_you:
          'I was just thinking about how you mentioned wanting more peaceful mornings.',
        reading_lines: 'I sense there might be something more you want to talk about.',
      };

      // Dispatch the event that the trust signals UI listens for
      window.dispatchEvent(
        new CustomEvent('ferni:backend-trust-signal', {
          detail: {
            type: signalType,
            title: 'Ferni noticed...',
            message: testMessages[signalType] || 'Test signal',
          },
        })
      );
      log.info({ signalType }, '${ICONS.heart} Trust signal triggered');
    });
  });

  // ${ICONS.heart} Progressive Features - Stage Celebrations
  container.querySelectorAll('[data-stage-celebrate]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const stage = (btn as HTMLElement).dataset.stageCelebrate as RelationshipStage;
      if (!stage) return;

      // Import and trigger the stage celebration
      const { showStageCelebration } = await import('./stage-celebration.ui.js');
      const previousStage = relationshipStageService.getStage();
      showStageCelebration({
        previousStage,
        newStage: stage,
        timestamp: new Date().toISOString(),
      });
      log.info({ stage }, '${ICONS.party} Stage celebration triggered');
    });
  });

  // ${ICONS.heart} Progressive Features - Persona Intros
  container.querySelectorAll('[data-persona-intro]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const personaId = (btn as HTMLElement).dataset.personaIntro;
      if (!personaId) return;

      const { showPersonaIntro } = await import('./persona-intro.ui.js');
      showPersonaIntro(personaId);
      log.info({ personaId }, '${ICONS.hand} Persona intro triggered');
    });
  });

  // ${ICONS.heart} Progressive Features - Feature Hints
  container.querySelectorAll('[data-feature-hint]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const hintId = (btn as HTMLElement).dataset.featureHint;
      if (!hintId) return;

      const { showHint } = await import('./feature-hints.ui.js');
      showHint(hintId);
      log.info({ hintId }, '${ICONS.lightbulb} Feature hint triggered');
    });
  });

  // Reset hints button
  container.querySelector('[data-action="reset-hints"]')?.addEventListener('click', async () => {
    const { resetDismissedHints } = await import('./feature-hints.ui.js');
    resetDismissedHints();
    log.info('Feature hints reset');
  });

  // Toggle progress indicator
  container
    .querySelector('[data-action="toggle-progress"]')
    ?.addEventListener('click', async () => {
      const { toggleProgressIndicator } = await import('./progress-indicator.ui.js');
      toggleProgressIndicator();
      log.info('Progress indicator toggled');
    });

  // Expand progress indicator
  container
    .querySelector('[data-action="expand-progress"]')
    ?.addEventListener('click', async () => {
      const { expandProgressIndicator } = await import('./progress-indicator.ui.js');
      expandProgressIndicator();
      log.info('Progress indicator expanded');
    });

  // Outreach test buttons
  container.querySelectorAll('[data-outreach]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = (btn as HTMLElement).dataset.outreach;
      if (!action) return;

      try {
        let result;
        switch (action) {
          case 'welcome-day0':
            result = await outreachService.sendWelcomeEmail('day0');
            break;
          case 'welcome-day3':
            result = await outreachService.sendWelcomeEmail('day3');
            break;
          case 'welcome-week':
            result = await outreachService.sendWelcomeEmail('week');
            break;
          case 'milestone':
            result = await outreachService.sendMilestoneCelebration({
              milestoneId: 'test-milestone',
              milestoneName: 'Test Milestone',
              milestoneMessage: 'This is a test milestone celebration.',
              daysTogether: 7,
              streak: 3,
            });
            break;
          case 'streak-5':
            result = await outreachService.sendStreakReminder(5);
            break;
          case 'streak-14':
            result = await outreachService.sendStreakReminder(14);
            break;
          case 'test-email':
            result = await outreachService.sendTestMessage(
              'email',
              'This is a test email from Ferni dev panel.',
              'Test from Dev Panel'
            );
            break;
          case 'test-sms':
            result = await outreachService.sendTestMessage(
              'sms',
              'This is a test SMS from Ferni dev panel. - Ferni'
            );
            break;
        }
        log.info({ action, result }, 'Outreach test triggered');
      } catch (error) {
        log.error({ action, error }, 'Outreach test failed');
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

  // ${ICONS.gamepad} Game buttons
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

  // Music status action buttons
  container.querySelectorAll('[data-music-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.musicAction;
      void handleMusicStatusAction(action!);
    });
  });

  // Initialize music status
  void updateMusicStatusDisplay();

  // Initialize subscription controls
  setupSubscriptionControlListeners();

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

  // ${ICONS.sunrise} Wrap-up buttons (conversation ending)
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

  // ${ICONS.rocket} Ferni EQ - Micro-expression buttons
  container.querySelectorAll('[data-micro]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const micro = (btn as HTMLElement).dataset.micro as Parameters<
        typeof ferni.playMicroExpression
      >[0];
      ferni.playMicroExpression(micro);
      log.debug('Micro-expression triggered:', micro);
    });
  });

  // ${ICONS.rocket} Ferni EQ - Active listening buttons
  container.querySelectorAll('[data-listen]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const listen = (btn as HTMLElement).dataset.listen;
      switch (listen) {
        case 'micro-nod':
          ferni.onUserSpeechPause(500); // Triggers micro-nod
          break;
        case 'subtle-nod':
          ferni.onUserSpeechPause(900); // Triggers subtle-nod
          break;
        case 'visible-nod':
          // Force a visible nod by calling the internal function
          ferni.startActiveListening();
          ferni.onUserSpeechPause(1200);
          break;
        case 'lean':
          ferni.startActiveListening();
          ferni.onUserSpeechPause(1000); // Triggers lean
          break;
      }
      log.debug('Active listening triggered:', listen);
    });
  });

  // ${ICONS.rocket} Ferni EQ - Concern response buttons
  container.querySelectorAll('[data-concern]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const concern = (btn as HTMLElement).dataset.concern as 'mild' | 'moderate' | 'significant';
      // Simulate concern detection
      const mockTriggers = {
        mild: { voiceStrain: 0.6 },
        moderate: { voiceStrain: 0.7, transcript: "I can't handle this" },
        significant: {
          voiceStrain: 0.8,
          transcript: "Nothing ever works, what's the point",
          voiceBreaking: true,
        },
      };
      ferni.analyzeConcern(mockTriggers[concern]);
      log.debug('Concern response triggered:', concern);
    });
  });

  // ${ICONS.rocket} Ferni EQ - Breath sync buttons
  container.querySelectorAll('[data-breath]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const breath = (btn as HTMLElement).dataset.breath;
      switch (breath) {
        case 'slow':
          ferni.setBreathSyncEnabled(true);
          ferni.detectUserBreathRate([600, 650, 620, 580, 640]); // ~10/min
          ferni.syncBreathing();
          break;
        case 'normal':
          ferni.setBreathSyncEnabled(true);
          ferni.detectUserBreathRate([400, 420, 380, 410, 390]); // ~15/min
          ferni.syncBreathing();
          break;
        case 'fast':
          ferni.setBreathSyncEnabled(true);
          ferni.detectUserBreathRate([300, 280, 320, 290, 310]); // ~20/min
          ferni.syncBreathing();
          break;
        case 'off':
          ferni.setBreathSyncEnabled(false);
          break;
      }
      log.debug('Breath sync triggered:', breath);
    });
  });

  // ${ICONS.plug} Connection state buttons
  container.querySelectorAll('[data-connection]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const state = (btn as HTMLElement).dataset.connection;
      triggerConnectionState(state!);
    });
  });

  // ${ICONS.volumeHigh} Sound effect buttons
  container.querySelectorAll('[data-sound]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sound = (btn as HTMLElement).dataset.sound;
      triggerSound(sound!);
    });
  });

  // ${ICONS.chat} Message buttons
  container.querySelectorAll('[data-message]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const message = (btn as HTMLElement).dataset.message;
      triggerMessage(message!);
    });
  });

  // ${ICONS.bell} Toast buttons
  container.querySelectorAll('[data-toast]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const toast = (btn as HTMLElement).dataset.toast;
      triggerToast(toast!);
    });
  });

  // ${ICONS.smartphone} Modal buttons
  container.querySelectorAll('[data-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = (btn as HTMLElement).dataset.modal;
      openModal(modal!);
    });
  });

  // ${ICONS.clock} Time buttons
  container.querySelectorAll('[data-time]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const time = (btn as HTMLElement).dataset.time;
      setTimeOverride(time!);
    });
  });

  // ${ICONS.accessibility} Accessibility buttons
  container.querySelectorAll('[data-a11y]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a11y = (btn as HTMLElement).dataset.a11y;
      toggleA11ySetting(a11y!);
    });
  });

  // ${ICONS.dice} Easter egg buttons
  container.querySelectorAll('[data-easter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const easter = (btn as HTMLElement).dataset.easter;
      triggerEasterEgg(easter!);
    });
  });

  // ${ICONS.wrench} State buttons
  container.querySelectorAll('[data-state]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stateAction = (btn as HTMLElement).dataset.state;
      handleStateAction(stateAction!);
    });
  });

  // ${ICONS.waves} Waveform buttons
  container.querySelectorAll('[data-waveform]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const waveform = (btn as HTMLElement).dataset.waveform;
      triggerWaveformState(waveform!);
    });
  });

  // ${ICONS.skull} Loading buttons
  container.querySelectorAll('[data-loading]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const loading = (btn as HTMLElement).dataset.loading;
      triggerLoadingState(loading!);
    });
  });

  // ${ICONS.confetti} Streak buttons
  container.querySelectorAll('[data-streak]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const streak = parseInt((btn as HTMLElement).dataset.streak!, 10);
      triggerStreakCelebration(streak);
    });
  });

  // ${ICONS.signalStrength} Network buttons
  container.querySelectorAll('[data-network]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const network = (btn as HTMLElement).dataset.network;
      setNetworkSimulation(network!);
    });
  });

  // ${ICONS.stopwatch} Latency buttons
  container.querySelectorAll('[data-latency]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const latency = parseInt((btn as HTMLElement).dataset.latency!, 10);
      setLatencySimulation(latency);
    });
  });

  // ${ICONS.trash} Storage buttons
  container.querySelectorAll('[data-storage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const storage = (btn as HTMLElement).dataset.storage;
      handleStorageAction(storage!);
    });
  });

  // ${ICONS.drama} Ambient buttons
  container.querySelectorAll('[data-ambient]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ambient = (btn as HTMLElement).dataset.ambient;
      toggleAmbientEffect(ambient!);
    });
  });

  // ${ICONS.cloudSun} Weather buttons
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

  // Circadian period buttons
  container.querySelectorAll('[data-circadian]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const period = (btn as HTMLElement).dataset.circadian;
      if (period === 'auto') {
        circadianManager.clearOverride();
      } else if (period) {
        circadianManager.setOverride(period as CircadianPeriod);
      }
      // Update active states
      container.querySelectorAll('[data-circadian]').forEach((b) => {
        const p = (b as HTMLElement).dataset.circadian;
        if (p === 'auto') {
          b.classList.toggle('active', !circadianManager.hasOverride());
        } else {
          b.classList.toggle('active', p === circadianManager.getCurrentPeriod());
        }
      });
      log.info({ period }, 'Circadian period changed via dev panel');
    });
  });

  // Warmth/relationship stage buttons
  container.querySelectorAll('[data-warmth]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stage = (btn as HTMLElement).dataset.warmth;
      if (stage === 'celebrate') {
        warmthManager.triggerWarmthCelebration();
        log.info('Warmth celebration triggered via dev panel');
      } else if (stage) {
        warmthManager.applyTheme(stage as RelationshipStage);
        // Update active states
        container.querySelectorAll('[data-warmth]').forEach((b) => {
          const s = (b as HTMLElement).dataset.warmth;
          if (s !== 'celebrate') {
            b.classList.toggle('active', s === stage);
          }
        });
        log.info({ stage }, 'Warmth stage changed via dev panel');
      }
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

  // ${ICONS.upload} Outreach buttons
  container.querySelectorAll('[data-outreach]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const outreach = (btn as HTMLElement).dataset.outreach;
      void handleOutreachAction(outreach!);
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

  // Sync to backend voice agent for unlock bypass
  // When tier is 'partner', enable bypass; otherwise just sync tier
  const bypassUnlocks = tier === 'partner';
  void syncDevModeToBackend(bypassUnlocks, tier);

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
  // 🛡️ SECURITY: Only allow in development - this endpoint requires admin_key
  // In production, subscription upgrades go through Stripe checkout flow
  if (!import.meta.env.DEV) {
    log.debug('Skipping server subscription update (production mode)');
    return;
  }

  const deviceId = appState.getState().deviceId;
  if (!deviceId) return;

  try {
    await apiPost('/subscription/upgrade', {
      device_id: deviceId,
      tier,
      admin_key: 'dev-mode',
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
    case 'save-whitelist':
      saveWhitelistFromInput();
      break;
    case 'add-to-whitelist':
      addCurrentUserToWhitelist();
      break;
    case 'remove-from-whitelist':
      removeCurrentUserFromWhitelist();
      break;
    case 'clear-whitelist':
      clearWhitelist();
      updateWhitelistInput();
      break;
    case 'open-evalops':
      void openEvalOpsDashboard();
      break;
    case 'open-bth-analytics':
      void openBTHAnalyticsDashboard();
      break;
  }
}

/**
 * Open EvalOps dashboard
 */
async function openEvalOpsDashboard(): Promise<void> {
  try {
    const { showEvalOpsDashboard } = await import('./evalops-dashboard.ui.js');
    showEvalOpsDashboard();
    log.info('${ICONS.target} Opened EvalOps dashboard');
  } catch (e) {
    log.error('Failed to open EvalOps dashboard:', e);
  }
}

/**
 * Open BTH Analytics dashboard
 */
async function openBTHAnalyticsDashboard(): Promise<void> {
  try {
    const { showBTHAnalyticsDashboard } = await import('./bth-analytics-dashboard.ui.js');
    await showBTHAnalyticsDashboard();
    log.info('Opened BTH Analytics dashboard');
  } catch (e) {
    log.error('Failed to open BTH Analytics dashboard:', e);
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
 * ${ICONS.gamepad} Handle game button actions
 */
async function handleGameAction(action: string): Promise<void> {
  switch (action) {
    case 'dashboard':
      // Open Musical You dashboard
      try {
        const { showMusicDashboard } = await import('./music-dashboard.ui.js');
        showMusicDashboard();
        log.info('${ICONS.barChart} Opened Musical You dashboard');
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

    log.info({ gameType: mappedType }, '${ICONS.gamepad} Sent game start request');
    showToast(`Starting ${gameType.replace(/-/g, ' ')}...`, 'info');
  } catch (error) {
    log.error({ error, gameType }, '${ICONS.gamepad} Failed to send game start request');
    showToast('Failed to start game - try voice command', 'error');
  }
}

/**
 * Simple toast notification - uses centralized toast system
 */
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  // Import dynamically to avoid circular deps
  import('./whisper.ui.js')
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
  // Sync dev mode bypass to backend voice agent
  void syncDevModeToBackend(true, 'partner');
  log.info('All team members unlocked');
}

/**
 * Sync dev mode state to the backend voice agent via data channel.
 *
 * When enabled, this allows the voice agent to bypass team unlock checks,
 * enabling testing of all persona handoffs without needing environment variables.
 *
 * @param bypassUnlocks - Whether to bypass team unlock checks
 * @param simulatedTier - Optional tier to simulate
 */
async function syncDevModeToBackend(
  bypassUnlocks: boolean,
  simulatedTier?: 'free' | 'friend' | 'partner'
): Promise<void> {
  try {
    // Get the LiveKit room from app state
    const state = appState.getState() as unknown as Record<string, unknown>;
    const room = state.room as { localParticipant?: { publishData: (data: Uint8Array, options: { reliable: boolean }) => Promise<void> } } | undefined;

    if (!room?.localParticipant) {
      log.debug('No active voice session - dev mode will sync when connected');
      return;
    }

    const message = JSON.stringify({
      type: 'dev_mode_sync',
      enabled: DEV_MODE_ENABLED,
      bypassUnlocks,
      simulatedTier,
      timestamp: Date.now(),
    });

    await room.localParticipant.publishData(new TextEncoder().encode(message), { reliable: true });

    log.info({ bypassUnlocks, simulatedTier }, 'Dev mode synced to backend voice agent');
    showToast('Dev mode synced to voice agent', 'info');
  } catch (error) {
    log.warn({ error }, 'Failed to sync dev mode to backend - voice agent may not bypass unlocks');
  }
}

function resetToFree(): void {
  tierOverride = 'free';
  stageOverride = 'first-meeting';
  conversationsOverride = 0;
  teamUnlockService.setTier('free');
  relationshipStageService.reset();
  void teamUnlockService.update();
  void updateServerSubscription('free');
  // Sync dev mode reset to backend
  void syncDevModeToBackend(false, 'free');
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

// ============================================================================
// FIRST-TIME USER EXPERIENCE (FTUE) CONTROLS
// ============================================================================

function renderFTUEStatus(): string {
  const status = modalCoordinator.getFirstTimeUserStatus();
  const convCount = status.conversationCount;

  return `
    <div class="dev-ftue-info">
      <div class="dev-ftue-count">
        <span class="dev-ftue-count__number">${convCount}</span>
        <span class="dev-ftue-count__label">${convCount === 1 ? 'conversation' : 'conversations'}</span>
      </div>
      <div class="dev-ftue-badges">
        ${status.unlockedFeatures
          .map(
            (f) =>
              `<span class="dev-ftue-badge dev-ftue-badge--unlocked" title="Unlocked">${ICONS.check} ${f}</span>`
          )
          .join('')}
        ${status.lockedFeatures
          .map(
            (f) =>
              `<span class="dev-ftue-badge dev-ftue-badge--locked" title="Locked">${ICONS.lock} ${f}</span>`
          )
          .join('')}
      </div>
    </div>
  `;
}

function refreshFTUEStatus(): void {
  const statusEl = document.getElementById('dev-ftue-status');
  if (statusEl) {
    statusEl.innerHTML = renderFTUEStatus();
  }
}

function handleFTUEAction(action: string): void {
  switch (action) {
    case 'reset':
      modalCoordinator.resetToFirstTimeUser();
      toast.success('Reset to first-time user. Reload the page to test.');
      log.info('🆕 Reset to first-time user experience');
      break;
    case 'simulate-1':
      modalCoordinator.simulateConversations(1);
      toast.success('Simulated 1 conversation. Reload to see changes.');
      log.info('🆕 Simulated 1 conversation');
      break;
    case 'simulate-3':
      modalCoordinator.simulateConversations(3);
      toast.success('Simulated 3 conversations. Reload to see changes.');
      log.info('🆕 Simulated 3 conversations');
      break;
    case 'simulate-5':
      modalCoordinator.simulateConversations(5);
      toast.success('Simulated 5 conversations. Reload to see changes.');
      log.info('🆕 Simulated 5 conversations');
      break;
    case 'simulate-10':
      modalCoordinator.simulateConversations(10);
      toast.success('Simulated 10 conversations. Reload to see changes.');
      log.info('🆕 Simulated 10 conversations');
      break;
  }
  refreshFTUEStatus();
}

function triggerLimitModal(): void {
  void import('./subscription.ui.js').then(({ showLimitReachedModal }) => {
    showLimitReachedModal(
      "We've used up our time this month. I'd love to keep talking...",
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    );
  });
}

function triggerUpgradeModal(): void {
  void import('./subscription.ui.js').then(({ showUpgradeModal }) => {
    showUpgradeModal("Let's go deeper together.");
  });
}

// ============================================================================
// SUBSCRIPTION CONTROLS
// ============================================================================

const SUBSCRIPTION_BYPASS_KEY = 'ferni_subscription_bypass';
const SUBSCRIPTION_ENABLED_KEY = 'ferni_subscription_enabled';
const SUBSCRIPTION_WHITELIST_KEY = 'ferni_subscription_whitelist';

function getSubscriptionBypass(): boolean {
  return localStorage.getItem(SUBSCRIPTION_BYPASS_KEY) === 'true';
}

function setSubscriptionBypass(bypass: boolean): void {
  localStorage.setItem(SUBSCRIPTION_BYPASS_KEY, String(bypass));
  log.info({ bypass }, 'Subscription bypass updated');
  updateSubscriptionStatusDisplay();
}

function getSubscriptionEnabled(): boolean {
  const stored = localStorage.getItem(SUBSCRIPTION_ENABLED_KEY);
  return stored === null ? true : stored === 'true'; // Default to enabled
}

function setSubscriptionEnabled(enabled: boolean): void {
  localStorage.setItem(SUBSCRIPTION_ENABLED_KEY, String(enabled));
  log.info({ enabled }, 'Subscription gating updated');
  updateSubscriptionStatusDisplay();
}

function getWhitelistIds(): string[] {
  const stored = localStorage.getItem(SUBSCRIPTION_WHITELIST_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function setWhitelistIds(ids: string[]): void {
  localStorage.setItem(SUBSCRIPTION_WHITELIST_KEY, JSON.stringify(ids));
  log.info({ count: ids.length }, 'Whitelist updated');
  updateSubscriptionStatusDisplay();
}

function isUserWhitelisted(userId: string): boolean {
  return getWhitelistIds().includes(userId);
}

function addToWhitelist(userId: string): void {
  const ids = getWhitelistIds();
  if (!ids.includes(userId)) {
    ids.push(userId);
    setWhitelistIds(ids);
  }
}

function removeFromWhitelist(userId: string): void {
  const ids = getWhitelistIds().filter((id) => id !== userId);
  setWhitelistIds(ids);
}

function clearWhitelist(): void {
  setWhitelistIds([]);
}

function updateSubscriptionStatusDisplay(): void {
  const statusEl = document.getElementById('dev-sub-status-text');
  if (!statusEl) return;

  const bypass = getSubscriptionBypass();
  const enabled = getSubscriptionEnabled();
  const whitelist = getWhitelistIds();

  let status = '';
  if (bypass) {
    status = '${ICONS.unlock} BYPASSED (Admin Mode)';
  } else if (!enabled) {
    status = '${ICONS.pause} Gating Disabled';
  } else if (whitelist.length > 0) {
    status = `${ICONS.checkCircle} Active (${whitelist.length} whitelisted)`;
  } else {
    status = '${ICONS.checkCircle} Active';
  }

  statusEl.textContent = status;
}

/**
 * Check if subscription gating should be bypassed for the current user.
 * This is called from subscription.ui.ts to determine if limits apply.
 */
export function shouldBypassSubscription(userId?: string): boolean {
  // Admin bypass takes precedence
  if (getSubscriptionBypass()) return true;

  // If gating is disabled, bypass
  if (!getSubscriptionEnabled()) return true;

  // Check whitelist
  if (userId && isUserWhitelisted(userId)) return true;

  return false;
}

// Export for use in subscription UI
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).ferniSubscriptionBypass = shouldBypassSubscription;
}

function saveWhitelistFromInput(): void {
  const input = document.getElementById('dev-whitelist-ids') as HTMLInputElement;
  if (!input) return;

  const ids = input.value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  setWhitelistIds(ids);
  log.info({ ids }, 'Whitelist saved');
}

function updateWhitelistInput(): void {
  const input = document.getElementById('dev-whitelist-ids') as HTMLInputElement;
  if (!input) return;
  input.value = getWhitelistIds().join(', ');
}

function addCurrentUserToWhitelist(): void {
  const userId = appState.get('deviceId');
  if (userId) {
    addToWhitelist(userId);
    updateWhitelistInput();
    log.info({ userId }, 'Added current user to whitelist');
  } else {
    log.warn('No device ID available to whitelist');
  }
}

function removeCurrentUserFromWhitelist(): void {
  const userId = appState.get('deviceId');
  if (userId) {
    removeFromWhitelist(userId);
    updateWhitelistInput();
    log.info({ userId }, 'Removed current user from whitelist');
  }
}

function setupSubscriptionControlListeners(): void {
  // Bypass toggle
  const bypassToggle = document.getElementById('dev-subscription-bypass') as HTMLInputElement;
  if (bypassToggle) {
    bypassToggle.addEventListener('change', () => {
      setSubscriptionBypass(bypassToggle.checked);
    });
  }

  // Enabled toggle
  const enabledToggle = document.getElementById('dev-subscription-enabled') as HTMLInputElement;
  if (enabledToggle) {
    enabledToggle.addEventListener('change', () => {
      setSubscriptionEnabled(enabledToggle.checked);
    });
  }

  // Update status display
  updateSubscriptionStatusDisplay();
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
// OUTREACH TESTING ACTIONS - Delegated to handlers/outreach.ts
// ============================================================================

async function handleOutreachAction(action: string): Promise<void> {
  // Delegate to extracted handler
  const getUserId = () => appState.getState().deviceId || 'dev-user';
  return handleOutreachActionImpl(action, getUserId);
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
        speakingEl.textContent = '${ICONS.speaker} Ferni';
      } else if (stats.isUserSpeaking) {
        speakingEl.textContent = '${ICONS.user} User';
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
    case 'awakening':
      void showFirstLaunchExperience();
      log.info('Triggered awakening experience');
      break;

    case 'celebrate':
      void celebrationBurst();
      log.info('Triggered celebration');
      break;

    case 'empathy':
      void empathyPulse();
      log.info('Triggered empathy pulse');
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

// ============================================================================
// AVATAR LAMP ACTIONS - Pixar Luxo Jr. Body Language
// ============================================================================

function triggerLampAction(action: string): void {
  switch (action) {
    case 'bounce':
      avatarLamp.bounce(0.5, 1);
      log.info('Avatar Lamp: bounce');
      break;

    case 'bounce-big':
      avatarLamp.bounce(0.9, 3);
      log.info('Avatar Lamp: big bounce');
      break;

    case 'tilt-right':
      avatarLamp.tilt('right', 0.6);
      log.info('Avatar Lamp: tilt right');
      break;

    case 'tilt-left':
      avatarLamp.tilt('left', 0.5);
      log.info('Avatar Lamp: tilt left');
      break;

    case 'tilt-forward':
      avatarLamp.tilt('forward', 0.5);
      log.info('Avatar Lamp: lean forward');
      break;

    case 'perk-up':
      avatarLamp.perkUp();
      log.info('Avatar Lamp: perk up');
      break;

    case 'nod':
      avatarLamp.nod(2, 'normal');
      log.info('Avatar Lamp: nod');
      break;

    case 'nod-slow':
      avatarLamp.nod(1, 'slow');
      log.info('Avatar Lamp: slow nod');
      break;

    case 'shake':
      avatarLamp.shake(0.6);
      log.info('Avatar Lamp: shake');
      break;

    case 'shrink':
      avatarLamp.shrink(0.5);
      trackedTimeout(() => avatarLamp.unshrink(), 1500);
      log.info('Avatar Lamp: shrink');
      break;

    case 'breathing-start':
      avatarLamp.startBreathing();
      log.info('Avatar Lamp: breathing started');
      break;

    case 'breathing-stop':
      avatarLamp.stopBreathing();
      log.info('Avatar Lamp: breathing stopped');
      break;

    default:
      log.warn({ action }, 'Unknown lamp action');
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
      trackedTimeout(() => presenceUI.setVoiceEmotion('neutral'), 2000);
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
      trackedTimeout(() => presenceUI.setVoiceEmotion('neutral'), 3000);
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
// ${ICONS.movie} PIXAR EMOTIONS - Eye Lid Expressions & Advanced Reactions
// ============================================================================

/**
 * Trigger a Ferni eye lid expression.
 */
function triggerFerniExpression(expression: EmotionalExpression): void {
  // Initialize if not already done
  initFerniExpressions();

  // Set the expression with hold for demo purposes
  const holdDuration = expression === 'neutral' ? 0 : DURATION.CELEBRATION;
  ferniExpressions.setExpression(expression, DURATION.SLOW, holdDuration);

  log.info({ expression }, 'Triggered Ferni expression');
}

/**
 * Trigger a Ferni advanced reaction.
 */
// Dev panel uses friendlier names that map to CharacterReaction methods
type DevPanelReaction = 'doubleTake' | 'heldPose' | 'lookAway' | 'nervousEnergy' | 'delightSparkle';

function triggerFerniReaction(reaction: DevPanelReaction): void {
  // Initialize if not already done
  initFerniExpressions();

  switch (reaction) {
    case 'doubleTake':
      ferniExpressions.realization();
      break;
    case 'heldPose':
      ferniExpressions.heldPose('happy', DURATION.SLOW);
      break;
    case 'lookAway':
      ferniExpressions.contemplation(2000);
      break;
    case 'nervousEnergy':
      ferniExpressions.noticing(1500);
      break;
    case 'delightSparkle':
      ferniExpressions.warmthSparkle();
      break;
    default:
      log.warn({ reaction }, 'Unknown Ferni reaction');
  }

  log.info({ reaction }, 'Triggered Ferni reaction');
}

/**
 * Trigger a Ferni text-to-icon morph.
 */
async function triggerFerniMorph(iconType: string): Promise<void> {
  // Initialize if not already done
  initFerniExpressions();

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
  const iconElement = await ferniExpressions.morphTextToIcon(iconSvg, DURATION.MODERATE);

  // Hold the icon visible
  await new Promise((resolve) => trackedTimeout(() => resolve(undefined), DURATION.CELEBRATION));

  // Morph icon → text
  await ferniExpressions.morphIconToText(iconElement);

  log.info({ iconType }, 'Completed Ferni morph');
}

/**
 * Trigger a sidekick (side expression icon).
 * These float beside the avatar instead of over it.
 */
async function triggerSidekick(iconName: string): Promise<void> {
  // Initialize if not already done
  avatarSidekicks.init();
  
  // Cast to SidekickIcon if valid
  const validIcons: SidekickIcon[] = avatarSidekicks.icons;
  if (!validIcons.includes(iconName as SidekickIcon)) {
    log.warn({ iconName }, 'Unknown sidekick icon');
    return;
  }
  
  // Show the sidekick
  avatarSidekicks.show({
    icon: iconName as SidekickIcon,
    position: 'right', // Default to right side
    duration: 2500,
  });
  
  log.info({ iconName }, 'Triggered sidekick');
}

function triggerMusicAction(action: string): void {
  switch (action) {
    case 'start-music':
      // Start music presence and show Now Playing UI
      void (async () => {
        const { nowPlayingUI } = await import('./now-playing.ui.js');
        const { waveformUI } = await import('./waveform.ui.js');

        avatarFeedback.musicPresence();
        waveformUI.setMusicPlaying(true);

        // Show Now Playing card with test track
        nowPlayingUI.show({
          name: 'Test Track',
          artist: 'Dev Panel',
          duration: 30000,
          isAmbient: false,
          isOurSong: false,
        });

        log.info('Started music visualization with Now Playing UI');
      })();
      break;

    case 'stop-music':
      // Stop dancing and hide Now Playing UI
      void (async () => {
        const { nowPlayingUI } = await import('./now-playing.ui.js');
        const { waveformUI } = await import('./waveform.ui.js');

        avatarFeedback.stopDancing();
        waveformUI.setMusicPlaying(false);
        nowPlayingUI.hide();

        log.info('Stopped music and hid Now Playing UI');
      })();
      break;

    case 'duck-music':
      avatarFeedback.ducking();
      log.info('Music ducking (simulating agent speech)');
      break;

    case 'unduck-music':
      avatarFeedback.unduck();
      log.info('Music unduck');
      break;

    case 'our-song':
      // ${ICONS.heart} Test "Our Song" - shared musical memory with heart indicator
      void testOurSong();
      break;
  }
}

/**
 * ${ICONS.heart} Test "Our Song" feature - shows Now Playing with heart indicator
 */
async function testOurSong(): Promise<void> {
  const { nowPlayingUI } = await import('./now-playing.ui.js');
  const { waveformUI } = await import('./waveform.ui.js');

  // Show Now Playing with "our song" indicator
  nowPlayingUI.show({
    name: 'Here Comes the Sun',
    artist: 'The Beatles',
    duration: 180000,
    isAmbient: false,
    isOurSong: true,
    ourSongContext: 'When you got the job offer',
  });

  // Start music visualization
  avatarFeedback.musicPresence();
  waveformUI.setMusicPlaying(true);

  log.info('${ICONS.heart} Testing "Our Song" feature - showing shared memory indicator');
}

// ============================================================================
// MUSIC PLAYER STATUS - Real-time diagnostics
// ============================================================================

interface MusicStatus {
  initialized: boolean;
  isPlaying: boolean;
  currentTrack?: { name: string; artist: string };
  volume: number;
  isDucked: boolean;
  isAmbient: boolean;
  queueLength: number;
  itunesAvailable: boolean;
  spotifyStatus?: {
    configured: boolean;
    linked: boolean;
    accessToken: boolean;
    deviceConnected: boolean;
  };
}

async function fetchMusicStatus(): Promise<MusicStatus | null> {
  try {
    // Use the API endpoint to get music status
    const response = await apiGet<MusicStatus>('/api/music/status');

    if (response.ok && response.data) {
      return response.data;
    }

    // If API not available, return null (we'll show "Not Connected")
    return null;
  } catch {
    return null;
  }
}

async function updateMusicStatusDisplay(): Promise<void> {
  const statusContainer = document.getElementById('dev-music-status');
  if (!statusContainer) return;

  const status = await fetchMusicStatus();

  if (!status) {
    statusContainer.innerHTML = `
      <div class="dev-music-status__grid">
        <div class="dev-music-status__item dev-music-status__item--warning">
          <span class="dev-music-status__label">Status</span>
          <span class="dev-music-status__value">Not Connected</span>
        </div>
        <div class="dev-music-status__item">
          <span class="dev-music-status__label">Note</span>
          <span class="dev-music-status__value">Music player runs in voice agent</span>
        </div>
      </div>
    `;
    return;
  }

  const statusClass = status.initialized
    ? 'dev-music-status__item--success'
    : 'dev-music-status__item--error';
  const playingClass = status.isPlaying ? 'dev-music-status__item--success' : '';
  const itunesClass = status.itunesAvailable
    ? 'dev-music-status__item--success'
    : 'dev-music-status__item--error';

  let spotifyHtml = '';
  if (status.spotifyStatus) {
    const spotifyClass = status.spotifyStatus.linked
      ? 'dev-music-status__item--success'
      : 'dev-music-status__item--warning';
    spotifyHtml = `
      <div class="dev-music-status__item ${spotifyClass}">
        <span class="dev-music-status__label">Spotify</span>
        <span class="dev-music-status__value">${
          status.spotifyStatus.linked
            ? '${ICONS.check} Linked' + (status.spotifyStatus.deviceConnected ? ' + Device' : ' (No Device)')
            : 'Not Linked'
        }</span>
      </div>
    `;
  }

  statusContainer.innerHTML = `
    <div class="dev-music-status__grid">
      <div class="dev-music-status__item ${statusClass}">
        <span class="dev-music-status__label">Player</span>
        <span class="dev-music-status__value">${status.initialized ? '${ICONS.check} Ready' : '${ICONS.x} Not Init'}</span>
      </div>
      <div class="dev-music-status__item ${playingClass}">
        <span class="dev-music-status__label">Playing</span>
        <span class="dev-music-status__value">${status.isPlaying ? '${ICONS.play} Yes' : '${ICONS.stop} No'}</span>
      </div>
      <div class="dev-music-status__item">
        <span class="dev-music-status__label">Volume</span>
        <span class="dev-music-status__value">${Math.round(status.volume * 100)}%${status.isDucked ? ' (ducked)' : ''}</span>
      </div>
      <div class="dev-music-status__item ${itunesClass}">
        <span class="dev-music-status__label">iTunes</span>
        <span class="dev-music-status__value">${status.itunesAvailable ? '${ICONS.check} Available' : '${ICONS.x} Down'}</span>
      </div>
      ${spotifyHtml}
      ${
        status.currentTrack
          ? `
        <div class="dev-music-status__item dev-music-status__item--full">
          <span class="dev-music-status__label">Now Playing</span>
          <span class="dev-music-status__value">${status.currentTrack.name} - ${status.currentTrack.artist}</span>
        </div>
      `
          : ''
      }
    </div>
  `;
}

async function handleMusicStatusAction(action: string): Promise<void> {
  switch (action) {
    case 'refresh-status':
      await updateMusicStatusDisplay();
      log.info('Refreshed music status');
      break;

    case 'test-itunes':
      try {
        const response = await apiPost<{ success?: boolean; track?: { name: string; artist: string }; error?: string }>(
          '/api/music/test-itunes',
          {}
        );
        const result = response.ok && response.data ? response.data : { success: false };
        if (result.success) {
          log.info({ track: result.track }, '${ICONS.check} iTunes API working');
          alert(`${ICONS.check} iTunes API working!\n\nFound: ${result.track?.name} by ${result.track?.artist}`);
        } else {
          log.warn({ error: result.error }, '${ICONS.x} iTunes API failed');
          alert(`${ICONS.x} iTunes API failed\n\n${result.error}`);
        }
      } catch (e) {
        log.error({ error: e }, 'iTunes test failed');
        alert('iTunes test failed - check console');
      }
      break;

    case 'test-spotify':
      try {
        const response = await apiGet<{ configured?: boolean; linked?: boolean; deviceConnected?: boolean }>(
          '/spotify/status'
        );
        const result = response.ok && response.data ? response.data : {};
        const statusLines = [
          `Configured: ${result.configured ? '${ICONS.check}' : '${ICONS.x}'}`,
          `Linked: ${result.linked ? '${ICONS.check}' : '${ICONS.x}'}`,
          `Device Connected: ${result.deviceConnected ? '${ICONS.check}' : '${ICONS.x}'}`,
        ];
        alert(`Spotify Status:\n\n${statusLines.join('\n')}`);
        log.info({ status: result }, 'Spotify status check');
      } catch (e) {
        log.error({ error: e }, 'Spotify check failed');
        alert('Spotify check failed - check console');
      }
      break;

    default:
      log.warn({ action }, 'Unknown music status action');
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
      trackedTimeout(() => presenceUI.setVoiceEmotion('neutral'), 2000);
      log.info('Late night greeting triggered');
      break;

    case 'welcomeback':
      // Happy to see you again!
      presenceUI.flashEmotion('happy', 2000);
      presenceUI.joy();
      trackedTimeout(() => presenceUI.bounce(), 300);
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
      trackedTimeout(() => void celebrationBurst(), 400);
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
      trackedTimeout(() => {
        presenceUI.flashEmotion('excited', 2000);
        presenceUI.joy();
      }, 500);
      log.info('Team member celebration triggered');
      break;

    case 'winter-solstice':
      // 🌟 Winter Solstice - Full cinematic experience!
      void triggerWinterSolstice();
      log.info('Winter Solstice cinematic experience triggered');
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
// 🌟 WINTER SOLSTICE - Cinematic Holiday Experience
// ============================================================================

/**
 * Trigger the Winter Solstice cinematic experience.
 * This is a Pixar-quality full-screen visual journey.
 */
async function triggerWinterSolstice(): Promise<void> {
  // Simulate user context for the experience
  const mockContext = {
    userName: 'Developer',
    conversationsThisYear: 42,
    daysSinceFirstChat: 180,
    relationshipStage: 'friend',
    topTopics: ['habits', 'mindfulness', 'goals', 'growth'],
    unlockedTeamMembers: ['ferni', 'maya-santos', 'peter-john'],
  };

  await winterSolsticeMoment.play(mockContext);
}

// ============================================================================
// ${ICONS.sunrise} WRAP-UP - Test conversation ending flow
// ============================================================================

function triggerWrapUp(sentiment: string): void {
  // Import dynamically to avoid circular deps
  void import('../state/app.state.js').then(({ setWrappingUp }) => {
    void import('../app/data-message-handlers.js').then(({ handleWrapUp }) => {
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
// DRAMATIC ANIMATIONS - Character-quality moves
// ============================================================================

function triggerDramatic(dramatic: string): void {
  const avatar = document.querySelector('#coachAvatar') as HTMLElement;
  if (!avatar) return;

  switch (dramatic) {
    case 'bounce':
      // Character-quality bounce with squash and stretch
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

    // ${ICONS.party} NEW: Fun micro-reactions using CSS-based animations
    case 'happy':
    case 'curious':
    case 'empathy':
    case 'laugh':
    case 'surprise':
      avatarFeedback.react(reaction as 'happy' | 'curious' | 'empathy' | 'laugh' | 'surprise');
      log.info({ reaction }, '${ICONS.party} Fun reaction triggered');
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
      trackedTimeout(() => void celebrationBurst(), 300);
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
    trackedTimeout(() => {
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
        z-index: var(--z-tooltip);
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
            width: 'min(200px, 100%)',
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

      trackedTimeout(() => ripple.remove(), 850);
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
      trackedTimeout(() => avatarFeedback.stopThinking(), 3000);
      log.info('Triggered thinking state for 3s');
      break;
    case 'whisper':
      avatarFeedback.whisper('Testing the whisper feature...');
      trackedTimeout(() => avatarFeedback.hideWhisper(), 3000);
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
      trackedTimeout(() => createConfetti(30), 200);
      trackedTimeout(() => createConfetti(30), 400);
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
      log.info('PARTY MODE ACTIVATED! ${ICONS.party}');
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
      trackedTimeout(() => presenceUI.setVoiceEmotion('neutral'), 12000);
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
      z-index: var(--z-tooltip);
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

    trackedTimeout(() => confetti.remove(), 4000);
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
      trackedTimeout(() => avatarFeedback.stopThinking(), 5000);
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

  trackedTimeout(() => {
    avatar.classList.remove('skeleton-loading');
    avatar.style.removeProperty('--skeleton-opacity');
  }, 3000);
}

function showTeamSkeleton(): void {
  const teamContainer = document.querySelector('.team-roster, .roster-container') as HTMLElement;
  if (!teamContainer) return;

  teamContainer.classList.add('skeleton-loading');
  trackedTimeout(() => teamContainer.classList.remove('skeleton-loading'), 3000);
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

  trackedTimeout(() => {
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
      trackedTimeout(() => void celebrationBurst(), 300);
      trackedTimeout(() => createConfetti(50), 500);
      trackedTimeout(() => void celebrationBurst(), 800);
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

// Store settings in window for other modules to access
declare global {
  interface Window {
    __devNetwork?: {
      quality: string;
      latency: number;
      packetLoss: number;
    };
    __devFetch?: typeof fetch;
    __originalFetch?: typeof fetch;
  }
}

function setNetworkSimulation(network: string): void {
  networkSimulation = network;

  // Initialize dev network settings
  window.__devNetwork = window.__devNetwork || { quality: 'excellent', latency: 0, packetLoss: 0 };
  window.__devNetwork.quality = network;

  // Set packet loss simulation based on network quality
  const packetLossMap: Record<string, number> = {
    excellent: 0,
    good: 0.01, // 1% packet loss
    poor: 0.1, // 10% packet loss
    offline: 1, // 100% packet loss (offline)
  };
  window.__devNetwork.packetLoss = packetLossMap[network] || 0;

  // Dispatch event for connection quality UI
  window.dispatchEvent(
    new CustomEvent('ferni:connection-quality', {
      detail: { quality: network },
    })
  );

  // If offline, simulate disconnection
  if (network === 'offline') {
    window.dispatchEvent(new CustomEvent('ferni:simulate-disconnect'));
  }

  // Visual feedback
  switch (network) {
    case 'excellent':
      avatarFeedback.success('Excellent connection');
      break;
    case 'good':
      avatarFeedback.info('Good connection (1% packet loss)');
      break;
    case 'poor':
      avatarFeedback.warning('Poor connection (10% packet loss)');
      break;
    case 'offline':
      avatarFeedback.error('Offline mode (simulated)');
      avatarFeedback.disconnected();
      break;
  }

  log.info({ network, packetLoss: window.__devNetwork.packetLoss }, 'Set network simulation');
}

function setLatencySimulation(latency: number): void {
  latencySimulation = latency;

  // Initialize dev network settings
  window.__devNetwork = window.__devNetwork || { quality: 'excellent', latency: 0, packetLoss: 0 };
  window.__devNetwork.latency = latency;

  // Install fetch wrapper if latency > 0 and not already installed
  if (latency > 0 && !window.__devFetch) {
    installDevFetchWrapper();
  } else if (latency === 0 && window.__devFetch) {
    uninstallDevFetchWrapper();
  }

  avatarFeedback.info(`Latency: ${latency}ms${latency > 0 ? ' (affects API calls)' : ''}`);
  log.info({ latency }, 'Set latency simulation');
}

/**
 * Install a fetch wrapper that adds simulated latency to all API calls.
 * Only active in dev mode with latency > 0.
 */
function installDevFetchWrapper(): void {
  if (window.__devFetch) return; // Already installed

  // Save original fetch
  window.__originalFetch = window.fetch;

  // Create wrapper that adds delay
  window.__devFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const latency = window.__devNetwork?.latency || 0;
    const packetLoss = window.__devNetwork?.packetLoss || 0;

    // Simulate packet loss
    if (packetLoss > 0 && Math.random() < packetLoss) {
      log.debug({ latency, packetLoss }, 'Simulating packet loss');
      throw new Error('Network request failed (simulated packet loss)');
    }

    // Add latency delay
    if (latency > 0) {
      await new Promise((resolve) => trackedTimeout(() => resolve(undefined), latency));
    }

    // Call original fetch
    return window.__originalFetch!(input, init);
  };

  // Replace global fetch
  window.fetch = window.__devFetch;
  log.info('Dev fetch wrapper installed (latency simulation active)');
}

/**
 * Remove the dev fetch wrapper and restore original fetch.
 */
function uninstallDevFetchWrapper(): void {
  if (window.__originalFetch) {
    window.fetch = window.__originalFetch;
    window.__devFetch = undefined;
    window.__originalFetch = undefined;
    log.info('Dev fetch wrapper removed');
  }
}

// Export for other modules
export function getNetworkSimulation(): string {
  return networkSimulation;
}

export function getLatencySimulation(): number {
  return latencySimulation;
}

/**
 * Check if dev network simulation should fail a request (for packet loss).
 */
export function shouldSimulateNetworkFailure(): boolean {
  const packetLoss = window.__devNetwork?.packetLoss || 0;
  return packetLoss > 0 && Math.random() < packetLoss;
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
    case 'clear-marketplace':
      clearMarketplaceAgents();
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
  console.group('${ICONS.package} Ferni Storage');
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

function clearMarketplaceAgents(): void {
  // Clear marketplace installed agents - fixes "Moxie showing by default" issue
  const marketplaceKey = 'voiceai-marketplace-installed';
  const existing = localStorage.getItem(marketplaceKey);

  if (existing) {
    try {
      const agents = JSON.parse(existing);
      const count = Object.keys(agents).length;
      localStorage.removeItem(marketplaceKey);
      avatarFeedback.success(`Cleared ${count} marketplace agent(s)`);
      updateStorageCount();
      log.info({ count }, 'Cleared marketplace agents');

      // Reload to update UI
      trackedTimeout(() => {
        window.location.reload();
      }, 500);
    } catch {
      localStorage.removeItem(marketplaceKey);
      avatarFeedback.success('Cleared marketplace data');
      log.info('Cleared marketplace data (corrupted format)');
    }
  } else {
    avatarFeedback.info('No marketplace agents installed');
    log.info('No marketplace agents to clear');
  }
}

function clearAllStorage(): void {
  if (!confirm('${ICONS.alertTriangle} This will clear ALL Ferni data including your progress. Continue?')) {
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
  console.log('${ICONS.upload} EXPORT DATA (copy this):');
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

// Ensure ambient effects are initialized
let ambientEffectsInitialized = false;

function ensureAmbientEffectsInitialized(): void {
  if (!ambientEffectsInitialized) {
    initAmbientEffects();
    ambientEffectsInitialized = true;
  }
}

function toggleAmbientEffect(effect: string): void {
  ensureAmbientEffectsInitialized();

  switch (effect) {
    case 'particles':
      ambientStates.particles = !ambientStates.particles;
      if (ambientStates.particles) {
        startParticles();
        log.info('Real particle system started');
      } else {
        stopParticles();
        log.info('Particle system stopped');
      }
      break;
    case 'glow':
      ambientStates.glow = !ambientStates.glow;
      if (ambientStates.glow) {
        addVignette();
        log.info('Vignette glow started');
      } else {
        removeVignette();
        log.info('Vignette glow stopped');
      }
      break;
    case 'aurora':
      ambientStates.aurora = !ambientStates.aurora;
      if (ambientStates.aurora) {
        startAurora();
        log.info('Aurora canvas effect started');
      } else {
        stopAurora();
        log.info('Aurora canvas effect stopped');
      }
      break;
    case 'off':
      // Stop all real effects
      if (ambientStates.particles) {
        stopParticles();
        ambientStates.particles = false;
      }
      if (ambientStates.glow) {
        removeVignette();
        ambientStates.glow = false;
      }
      if (ambientStates.aurora) {
        stopAurora();
        ambientStates.aurora = false;
      }
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
      
      /* Consistent icon sizing - aligned to 4px grid */
      --dev-icon-xs: 12px;   /* Tiny labels, badges */
      --dev-icon-sm: 14px;   /* Section titles, inline icons */
      --dev-icon-md: 16px;   /* Standard button icons */
      --dev-icon-lg: 18px;   /* Header icons, primary actions */
      --dev-icon-xl: 20px;   /* Panel title, hero icons */
      
      /* Consistent button sizing */
      --dev-btn-padding-y: 8px;
      --dev-btn-padding-x: 12px;
      --dev-btn-gap: 6px;      /* Gap between icon and text */
      --dev-btn-icon-only: 32px; /* Square icon-only buttons */
      --dev-btn-icon-only-sm: 28px; /* Small icon-only buttons */
    }

    /* Dev Indicator - VISIBLE! */
    .dev-indicator {
      position: fixed;
      bottom: var(--space-4, 16px);
      left: var(--space-4, 16px);
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
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
      z-index: var(--z-tooltip);
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
      width: var(--dev-icon-md);
      height: var(--dev-icon-md);
      flex-shrink: 0;
    }
    
    /* MOBILE: Hide dev indicator - keyboard shortcuts don't work on mobile */
    @media (max-width: 768px) {
      .dev-indicator {
        display: none !important;
      }
    }
    
    /* Dev Panel */
    .dev-panel {
      position: fixed;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: min(400px, 100%);
      max-height: calc(100vh - 32px);
      background: var(--dev-bg);
      border-radius: var(--radius-xl, 16px);
      box-shadow:
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        0 0 0 1px var(--dev-accent-border),
        0 0 60px rgba(74, 103, 65, 0.15);
      z-index: var(--z-tooltip);
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
      gap: var(--dev-btn-gap);
      color: #e8f5e3;
      font-family: 'Plus Jakarta Sans', var(--font-body, system-ui), sans-serif;
      font-size: 0.9rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    
    .dev-panel__title svg {
      width: var(--dev-icon-xl);
      height: var(--dev-icon-xl);
      color: #9dd690;
      flex-shrink: 0;
    }
    
    .dev-panel__close {
      width: var(--dev-btn-icon-only);
      height: var(--dev-btn-icon-only);
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
      width: var(--dev-icon-md);
      height: var(--dev-icon-md);
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
      gap: var(--dev-btn-gap);
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--dev-accent);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0 0 var(--space-3, 12px);
      font-family: 'Plus Jakarta Sans', var(--font-body, system-ui), sans-serif;
    }
    
    .dev-section__title svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      opacity: 0.8;
      flex-shrink: 0;
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
      gap: var(--dev-btn-gap);
    }
    
    .dev-tier-btn {
      flex: 1;
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
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
      gap: var(--dev-btn-gap);
    }
    
    .dev-stage-btn {
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.75rem;
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
      gap: var(--dev-btn-gap);
    }
    
    .dev-team-member {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(255, 255, 255, 0.03);
      border-radius: var(--radius-md, 8px);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .dev-team-member--unlocked {
      border-color: var(--dev-accent-glow);
    }
    
    .dev-team-member__info {
      flex: 1;
      min-width: 0;
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
      width: var(--dev-btn-icon-only-sm);
      height: var(--dev-btn-icon-only-sm);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    
    .dev-team-member__status svg {
      width: var(--dev-icon-md);
      height: var(--dev-icon-md);
    }
    
    .dev-team-member--unlocked .dev-team-member__status {
      color: var(--dev-accent);
    }
    
    .dev-team-member:not(.dev-team-member--unlocked) .dev-team-member__status {
      color: rgba(255, 255, 255, 0.3);
    }
    
    .dev-team-member__celebrate {
      width: var(--dev-btn-icon-only-sm);
      height: var(--dev-btn-icon-only-sm);
      border: none;
      background: rgba(255, 255, 255, 0.05);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-team-member__celebrate:hover {
      background: var(--dev-celebrate-glow);
      color: var(--dev-celebrate);
    }
    
    .dev-team-member__celebrate svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
    }
    
    /* Action Buttons */
    .dev-actions {
      display: flex;
      flex-direction: column;
      gap: var(--dev-btn-gap);
    }
    
    .dev-action-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.75rem;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-action-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }
    
    .dev-action-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      color: var(--dev-accent);
      flex-shrink: 0;
    }
    
    .dev-action-btn--small {
      padding: 4px 8px;
      font-size: 0.7rem;
    }
    
    .dev-action-btn--small svg {
      width: var(--dev-icon-xs);
      height: var(--dev-icon-xs);
    }
    
    .dev-action-btn--primary {
      background: rgba(124, 181, 113, 0.2);
      border-color: rgba(124, 181, 113, 0.3);
      color: var(--dev-accent-bright);
      font-weight: 600;
    }
    
    .dev-action-btn--primary:hover {
      background: rgba(124, 181, 113, 0.3);
      border-color: rgba(124, 181, 113, 0.4);
    }
    
    .dev-action-btn--primary svg {
      color: var(--dev-accent-bright);
    }
    
    /* Toggle Switches */
    .dev-toggle-row {
      display: flex;
      align-items: center;
      gap: var(--space-3, 12px);
      margin-bottom: var(--space-2, 8px);
    }
    
    .dev-toggle {
      position: relative;
      display: inline-block;
      width: 40px;
      height: 22px;
      flex-shrink: 0;
    }
    
    .dev-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .dev-toggle__slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 11px;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-toggle__slider::before {
      position: absolute;
      content: '';
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 50%;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-toggle input:checked + .dev-toggle__slider {
      background: var(--dev-accent);
    }
    
    .dev-toggle input:checked + .dev-toggle__slider::before {
      transform: translateX(18px);
      background: white;
    }
    
    .dev-toggle__label {
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.8rem;
    }
    
    /* Input Rows */
    .dev-input-row {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
      margin-bottom: var(--space-3, 12px);
    }
    
    .dev-input__label {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.75rem;
    }
    
    .dev-input {
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.9);
      font-size: 0.8rem;
      font-family: var(--font-mono, monospace);
    }
    
    .dev-input:focus {
      outline: none;
      border-color: var(--dev-accent);
    }
    
    .dev-input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }
    
    /* Status Row */
    .dev-status-row {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px);
      background: rgba(0, 0, 0, 0.15);
      border-radius: var(--radius-sm, 4px);
      margin-top: var(--space-2, 8px);
    }
    
    .dev-status__label {
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.75rem;
    }
    
    .dev-status__value {
      color: var(--dev-accent);
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    /* Roster Controls */
    .dev-roster-controls {
      display: flex;
      flex-wrap: wrap;
      gap: var(--dev-btn-gap);
    }
    
    .dev-roster-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
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
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
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
      gap: var(--dev-btn-gap);
    }
    
    .dev-soul-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(74, 103, 65, 0.25);
      border: 1px solid rgba(74, 103, 65, 0.4);
      border-radius: var(--radius-md, 8px);
      color: #90c090;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-soul-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
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
      gap: var(--dev-btn-gap);
    }
    
    .dev-soul-ideas span {
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: var(--radius-sm, 4px);
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.4);
      font-style: italic;
    }
    
    /* Avatar Lamp Buttons - Pixar Luxo Jr. */
    .dev-section--lamp {
      background: linear-gradient(135deg, rgba(255, 180, 50, 0.1), rgba(255, 220, 100, 0.05));
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-3, 12px);
      margin: 0 calc(var(--space-4, 16px) * -1);
      margin-bottom: var(--space-5, 20px);
    }
    
    .dev-lamp-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--dev-btn-gap);
    }
    
    .dev-lamp-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(255, 180, 50, 0.2);
      border: 1px solid rgba(255, 180, 50, 0.35);
      border-radius: var(--radius-md, 8px);
      color: #ffcc66;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-lamp-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
    }
    
    .dev-lamp-btn:hover {
      background: rgba(255, 180, 50, 0.35);
      border-color: #ffb432;
      transform: scale(1.02);
      box-shadow: 0 0 12px rgba(255, 180, 50, 0.3);
    }
    
    .dev-lamp-btn:active {
      transform: scale(0.98);
    }
    
    .dev-lamp-btn--primary {
      background: linear-gradient(135deg, rgba(255, 180, 50, 0.35), rgba(255, 220, 100, 0.35));
      border-color: #ffb432;
      color: #ffe066;
      font-weight: 600;
    }
    
    .dev-lamp-btn--primary:hover {
      background: linear-gradient(135deg, rgba(255, 180, 50, 0.5), rgba(255, 220, 100, 0.5));
      box-shadow: 0 0 20px rgba(255, 180, 50, 0.4);
    }
    
    /* Handoff Buttons */
    .dev-handoff-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--dev-btn-gap);
    }
    
    .dev-handoff-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(74, 103, 65, 0.2);
      border: 1px solid rgba(74, 103, 65, 0.3);
      border-radius: var(--radius-md, 8px);
      color: var(--dev-success-sage);
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-handoff-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
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
    
    /* FTUE (First-Time User Experience) */
    .dev-ftue-info {
      background: rgba(74, 103, 65, 0.15);
      border: 1px solid rgba(74, 103, 65, 0.3);
      border-radius: var(--radius-lg, 12px);
      padding: var(--space-3, 12px);
      margin-bottom: var(--space-3, 12px);
    }
    
    .dev-ftue-count {
      display: flex;
      align-items: baseline;
      gap: var(--space-2, 8px);
      margin-bottom: var(--space-2, 8px);
      white-space: nowrap;
    }
    
    .dev-ftue-count__number {
      font-size: 2rem;
      font-weight: 700;
      color: #4a6741;
      font-family: 'Plus Jakarta Sans', var(--font-body, system-ui), sans-serif;
    }
    
    .dev-ftue-count__label {
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.5);
    }
    
    .dev-ftue-badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1, 4px);
    }
    
    .dev-ftue-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
    
    .dev-ftue-badge svg {
      width: 10px;
      height: 10px;
      flex-shrink: 0;
    }
    
    .dev-ftue-badge--unlocked {
      background: rgba(74, 103, 65, 0.3);
      color: #90d080;
    }
    
    .dev-ftue-badge--locked {
      background: rgba(255, 100, 100, 0.2);
      color: rgba(255, 255, 255, 0.5);
    }
    
    .dev-ftue-legend {
      margin-top: var(--space-3, 12px);
      padding: var(--space-3, 12px);
      background: rgba(0, 0, 0, 0.2);
      border-radius: var(--radius-md, 8px);
      font-size: 0.7rem;
    }
    
    .dev-ftue-legend h4 {
      margin: 0 0 var(--space-2, 8px);
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.6);
    }
    
    .dev-ftue-legend ul {
      margin: 0;
      padding-left: var(--space-4, 16px);
      color: rgba(255, 255, 255, 0.4);
    }
    
    .dev-ftue-legend li {
      margin-bottom: 2px;
    }
    
    .dev-ftue-legend strong {
      color: rgba(255, 255, 255, 0.7);
    }
    
    .dev-action-btn--warning {
      background: rgba(255, 150, 100, 0.15) !important;
      border-color: rgba(255, 150, 100, 0.3) !important;
      color: #ffc080 !important;
    }
    
    .dev-action-btn--warning:hover {
      background: rgba(255, 150, 100, 0.25) !important;
    }
    
    /* Expression Buttons */
    .dev-expression-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--dev-btn-gap);
    }
    
    .dev-expression-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(255, 200, 100, 0.15);
      border: 1px solid rgba(255, 200, 100, 0.25);
      border-radius: var(--radius-md, 8px);
      color: #ffd080;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-expression-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
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
      gap: var(--dev-btn-gap);
    }
    
    .dev-dashboard-link {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(74, 103, 65, 0.1);
      border: 1px solid rgba(74, 103, 65, 0.2);
      border-radius: var(--radius-md, 8px);
      color: var(--color-text-secondary, #a0a0a0);
      text-decoration: none;
      font-size: 0.75rem;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-dashboard-link svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
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
      margin-bottom: var(--space-3, 12px);
    }
    .dev-subsection:last-child {
      margin-bottom: 0;
    }
    .dev-label {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      font-size: 0.7rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: var(--dev-btn-padding-y);
    }
    .dev-label svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
    }
    
    /* Music Buttons */
    .dev-music-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--dev-btn-gap);
    }
    
    .dev-music-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(180, 100, 255, 0.15);
      border: 1px solid rgba(180, 100, 255, 0.25);
      border-radius: var(--radius-md, 8px);
      color: #c080ff;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-music-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
    }
    
    .dev-music-btn:hover {
      background: rgba(180, 100, 255, 0.25);
      border-color: rgba(180, 100, 255, 0.4);
      transform: scale(1.02);
    }
    
    .dev-music-btn:active {
      transform: scale(0.98);
    }
    
    /* ${ICONS.music} Music Status Display */
    .dev-music-status {
      margin-top: 8px;
    }
    
    .dev-music-status__grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    
    .dev-music-status__item {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-sm, 6px);
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .dev-music-status__item--full {
      grid-column: span 2;
    }
    
    .dev-music-status__item--success {
      border-color: rgba(74, 103, 65, 0.5);
      background: rgba(74, 103, 65, 0.15);
    }
    
    .dev-music-status__item--warning {
      border-color: rgba(196, 162, 101, 0.5);
      background: rgba(196, 162, 101, 0.15);
    }
    
    .dev-music-status__item--error {
      border-color: rgba(196, 100, 100, 0.5);
      background: rgba(196, 100, 100, 0.15);
    }
    
    .dev-music-status__label {
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .dev-music-status__value {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 500;
    }
    
    .dev-music-status__loading {
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.75rem;
      text-align: center;
      padding: 12px;
    }
    
    /* 🆕 Emotion System Buttons */
    .dev-emotion-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--dev-btn-gap);
    }
    
    .dev-emotion-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(74, 103, 65, 0.2);
      border: 1px solid rgba(74, 103, 65, 0.3);
      border-radius: var(--radius-md, 8px);
      color: #7cb571;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-emotion-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
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
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(196, 133, 106, 0.2);
      border: 1px solid rgba(196, 133, 106, 0.3);
      border-radius: var(--radius-md, 8px);
      color: #e0a090;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-reaction-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
    }
    
    .dev-reaction-btn:hover {
      background: rgba(196, 133, 106, 0.35);
      border-color: rgba(196, 133, 106, 0.5);
      transform: scale(1.02);
    }
    
    .dev-flash-btn {
      display: flex;
      align-items: center;
      gap: var(--dev-btn-gap);
      padding: var(--dev-btn-padding-y) var(--dev-btn-padding-x);
      background: rgba(196, 162, 101, 0.2);
      border: 1px solid rgba(196, 162, 101, 0.3);
      border-radius: var(--radius-md, 8px);
      color: #e0c880;
      font-size: 0.75rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-flash-btn svg {
      width: var(--dev-icon-sm);
      height: var(--dev-icon-sm);
      flex-shrink: 0;
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
      z-index: var(--z-tooltip);
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
  /** Sync dev mode state to backend voice agent (called on voice connection) */
  syncToBackend: () => {
    if (DEV_MODE_ENABLED && tierOverride === 'partner') {
      return syncDevModeToBackend(true, tierOverride);
    }
    return Promise.resolve();
  },
};
