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

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { appState } from '../state/app.state.js';
import { teamUnlockService, TEAM_MEMBERS, type TeamMemberId } from '../services/team-unlock.service.js';
import { teamUnlockCelebration } from './team-unlock-celebration.ui.js';
import { relationshipStageService, STAGE_NAMES, type RelationshipStage } from '../services/relationship-stage.service.js';
import { avatarFeedback } from './avatar-feedback.ui.js';
import { rosterPreferences } from '../services/roster-preferences.service.js';
import { presenceUI } from './presence.ui.js';
import type { VoiceEmotion } from '@design-system/tokens';

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

const DEV_MODE_ENABLED = 
  isDevEnvironment() ||
  localStorage.getItem('ferni_dev_mode') === 'true' ||
  new URLSearchParams(window.location.search).has('dev');

// ============================================================================
// ICONS (Lucide-style)
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
  drama: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
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
  document.querySelectorAll('.dev-panel').forEach(el => el.remove());
  document.querySelectorAll('.dev-indicator').forEach(el => el.remove());
  document.querySelectorAll('#dev-panel-styles').forEach(el => el.remove());
}

function showDevIndicator(): void {
  const indicator = document.createElement('div');
  indicator.className = 'dev-indicator';
  indicator.innerHTML = `${ICONS.code} DEV`;
  indicator.title = 'Click to open dev panel (or Cmd/Ctrl+Shift+D)';
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
          ${(['first-meeting', 'getting-started', 'building-trust', 'established', 'deep-partnership'] as RelationshipStage[])
            .map(s => `
              <button class="dev-stage-btn ${stage === s ? 'dev-stage-btn--active' : ''}" data-stage="${s}">
                ${STAGE_NAMES[s]}
              </button>
            `).join('')}
        </div>
      </section>
      
      <!-- Team Members -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.users} Team Members</h3>
        <div class="dev-team-grid">
          ${TEAM_MEMBERS.map(member => {
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
      
      <!-- Agent Tester -->
      <section class="dev-section">
        <h3 class="dev-section__title">${ICONS.users} Handoff Tester</h3>
        <div class="dev-handoff-buttons">
          ${TEAM_MEMBERS.filter(m => m.id !== 'ferni').map(member => `
            <button class="dev-handoff-btn" data-persona="${member.id}">
              → ${member.displayName}
            </button>
          `).join('')}
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
    </div>
    
    <div class="dev-panel__footer">
      <span>Press Cmd/Ctrl+Shift+D to close</span>
    </div>
  `;
  
  // Event listeners
  container.querySelector('.dev-panel__close')?.addEventListener('click', hidePanel);
  
  // Tier buttons
  container.querySelectorAll('.dev-tier-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tier = (btn as HTMLElement).dataset.tier as 'free' | 'friend' | 'partner';
      setTierOverride(tier);
    });
  });
  
  // Stage buttons
  container.querySelectorAll('.dev-stage-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const stage = (btn as HTMLElement).dataset.stage as RelationshipStage;
      setStageOverride(stage);
    });
  });
  
  // Celebrate buttons
  container.querySelectorAll('.dev-team-member__celebrate').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const memberId = (btn as HTMLElement).dataset.member as TeamMemberId;
      const member = TEAM_MEMBERS.find(m => m.id === memberId);
      if (member) {
        teamUnlockCelebration.show(member);
      }
    });
  });
  
  // Action buttons
  container.querySelectorAll('.dev-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      handleAction(action!);
    });
  });
  
  // Handoff buttons
  container.querySelectorAll('.dev-handoff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const persona = (btn as HTMLElement).dataset.persona;
      triggerHandoff(persona!);
    });
  });
  
  // Expression buttons
  container.querySelectorAll('.dev-expression-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const expression = (btn as HTMLElement).dataset.expression;
      triggerExpression(expression!);
    });
  });
  
  // Roster buttons
  container.querySelectorAll('.dev-roster-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.roster;
      handleRosterAction(action!);
    });
  });
  
  // Music buttons
  container.querySelectorAll('.dev-music-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.action;
      triggerMusicAction(action!);
    });
  });
  
  // Voice mode buttons (listening/speaking)
  container.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode;
      triggerVoiceMode(mode!);
    });
  });
  
  // Greeting buttons
  container.querySelectorAll('[data-greeting]').forEach(btn => {
    btn.addEventListener('click', () => {
      const greeting = (btn as HTMLElement).dataset.greeting;
      triggerGreeting(greeting!);
    });
  });
  
  // Celebration buttons
  container.querySelectorAll('[data-celebration]').forEach(btn => {
    btn.addEventListener('click', () => {
      const celebration = (btn as HTMLElement).dataset.celebration;
      triggerCelebration(celebration!);
    });
  });
  
  // Thinking buttons
  container.querySelectorAll('[data-thinking]').forEach(btn => {
    btn.addEventListener('click', () => {
      const thinking = (btn as HTMLElement).dataset.thinking;
      triggerThinking(thinking!);
    });
  });
  
  // 🆕 Dramatic animation buttons
  container.querySelectorAll('[data-dramatic]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dramatic = (btn as HTMLElement).dataset.dramatic;
      triggerDramatic(dramatic!);
    });
  });
  
  // 🆕 Ring/Aura buttons
  container.querySelectorAll('[data-ring]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ring = (btn as HTMLElement).dataset.ring;
      triggerRingEffect(ring!);
    });
  });
  
  // 🆕 Ripple buttons
  container.querySelectorAll('[data-ripple]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ripple = (btn as HTMLElement).dataset.ripple;
      triggerRippleEffect(ripple!);
    });
  });
  
  // 🆕 Emotion buttons
  container.querySelectorAll('[data-emotion]').forEach(btn => {
    btn.addEventListener('click', () => {
      const emotion = (btn as HTMLElement).dataset.emotion as VoiceEmotion;
      triggerEmotion(emotion);
    });
  });
  
  // 🆕 Reaction buttons
  container.querySelectorAll('[data-reaction]').forEach(btn => {
    btn.addEventListener('click', () => {
      const reaction = (btn as HTMLElement).dataset.reaction;
      triggerReaction(reaction!);
    });
  });
  
  // 🆕 Flash emotion buttons
  container.querySelectorAll('[data-flash]').forEach(btn => {
    btn.addEventListener('click', () => {
      const emotion = (btn as HTMLElement).dataset.flash as VoiceEmotion;
      triggerFlashEmotion(emotion);
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
    'established': 20,
    'deep-partnership': 50,
  };
  
  conversationsOverride = stageConversations[stage];
  
  // Update relationship service (hack for testing)
  for (let i = 0; i < (conversationsOverride - relationshipStageService.getMetrics().totalConversations); i++) {
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
      prefs.addedMembers.forEach(m => rosterPreferences.removeMember(m));
      log.info('Showing minimal roster (Ferni only)');
      break;
    case 'reset':
      rosterPreferences.reset();
      log.info('Reset roster preferences');
      break;
  }
  refreshPanel();
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
  window.dispatchEvent(new CustomEvent('ferni:switch-persona', {
    detail: { personaId }
  }));
  log.info({ personaId }, 'Triggered handoff');
}

// ============================================================================
// AVATAR EXPRESSION TESTING
// ============================================================================

function triggerExpression(expression: string): void {
  // Map expressions to available avatar feedback methods
  switch (expression) {
    case 'chuckle':
    case 'empathy':
    case 'delight':
    case 'contemplate':
    case 'encourage':
    case 'surprise':
    case 'settle':
      // These expressions are not yet implemented - use info as fallback
      avatarFeedback.info(`Expression: ${expression}`);
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
// PLANNED AVATAR ANIMATION TESTING (Not yet implemented)
// These functions are stubs for planned features - the avatar API will be
// expanded to support these animations in a future update.
// ============================================================================

function triggerVoiceMode(mode: string): void {
  // TODO: Implement voice mode animations when avatar API supports them
  log.warn({ mode }, 'Voice mode not yet implemented');
}

function triggerGreeting(greeting: string): void {
  // TODO: Implement greeting animations when avatar API supports them
  log.warn({ greeting }, 'Greeting animation not yet implemented');
}

function triggerCelebration(celebration: string): void {
  // Use existing success feedback as a fallback
  avatarFeedback.success(`Celebration: ${celebration}`);
  log.info({ celebration }, 'Triggered celebration (using success feedback)');
}

function triggerThinking(thinking: string): void {
  // Use existing thinking feedback
  if (thinking === 'start') {
    avatarFeedback.thinking();
    log.info('Started thinking mode');
  } else {
    avatarFeedback.stopThinking();
    log.info('Stopped thinking mode');
  }
}

// 🆕 Dramatic animation handlers
function triggerDramatic(dramatic: string): void {
  // TODO: Implement dramatic animations when avatar API supports them
  avatarFeedback.success(`Dramatic: ${dramatic}`);
  log.warn({ dramatic }, 'Dramatic animation not yet implemented');
}

function triggerRingEffect(ring: string): void {
  // TODO: Implement ring effects when avatar API supports them
  log.warn({ ring }, 'Ring effect not yet implemented');
}

// ============================================================================
// FERNI EMOTION SYSTEM TESTING
// ============================================================================

function triggerEmotion(emotion: VoiceEmotion): void {
  presenceUI.setVoiceEmotion(emotion);
  log.info({ emotion }, 'Set Ferni emotion');
}

function triggerReaction(reaction: string): void {
  const validReactions = ['nod', 'shake', 'bounce', 'pulse'] as const;
  if (validReactions.includes(reaction as typeof validReactions[number])) {
    presenceUI.react(reaction as 'nod' | 'shake' | 'bounce' | 'pulse');
    log.info({ reaction }, 'Triggered Ferni reaction');
  } else {
    log.warn({ reaction }, 'Reaction not yet implemented');
  }
}

function triggerFlashEmotion(emotion: VoiceEmotion): void {
  presenceUI.flashEmotion(emotion, 2000);
  log.info({ emotion }, 'Flashed Ferni emotion (2s)');
}

function triggerRippleEffect(ripple: string): void {
  // TODO: Implement ripple effects when avatar API supports them
  avatarFeedback.success(`Ripple: ${ripple}`);
  log.warn({ ripple }, 'Ripple effect not yet implemented');
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
    /* Dev Indicator */
    .dev-indicator {
      position: fixed;
      bottom: var(--space-4, 16px);
      left: var(--space-4, 16px);
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--dev-bg);
      color: var(--dev-accent);
      font-family: var(--font-code, 'SF Mono', monospace);
      font-size: 0.7rem;
      font-weight: 600;
      border-radius: var(--radius-lg, 12px);
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 12px var(--dev-accent-glow);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }

    .dev-indicator:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 16px var(--dev-accent-glow-hover);
    }
    
    .dev-indicator svg {
      width: 14px;
      height: 14px;
    }
    
    /* Dev Panel */
    .dev-panel {
      position: fixed;
      top: var(--space-4, 16px);
      right: var(--space-4, 16px);
      width: 380px;
      max-height: calc(100vh - 32px);
      background: var(--dev-bg);
      border-radius: var(--radius-xl, 16px);
      box-shadow:
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        0 0 0 1px var(--dev-accent-border);
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
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .dev-panel__title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      color: var(--dev-accent);
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.85rem;
      font-weight: 600;
    }
    
    .dev-panel__title svg {
      width: 18px;
      height: 18px;
    }
    
    .dev-panel__close {
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255, 255, 255, 0.05);
      border-radius: var(--radius-md, 8px);
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .dev-panel__close:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
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
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      text-align: center;
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.4);
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    
    /* Sections */
    .dev-section {
      margin-bottom: var(--space-5, 20px);
    }
    
    .dev-section__title {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      font-size: 0.75rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 var(--space-3, 12px);
    }
    
    .dev-section__title svg {
      width: 14px;
      height: 14px;
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
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.85rem;
      color: var(--dev-accent);
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

