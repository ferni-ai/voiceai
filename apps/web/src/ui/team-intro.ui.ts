/**
 * Team Introduction UI - "Meet Your Team"
 *
 * A warm, inviting modal that introduces users to Ferni's team.
 * Shows all team members with their roles, unlock status, and hints.
 *
 * Design Philosophy:
 * - Centered floating modal (per brand guidelines)
 * - Warm, human copy - not corporate
 * - Shows the journey, not just a paywall
 * - Celebrates unlocked members, gently teases locked ones
 *
 * @see FERNI-BRAND-GUIDELINES.md
 * @see FERNI-SCREEN-GUIDELINES.md
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { Modal, type ModalConfig } from '../components/base/modal.js';
import {
  teamUnlockService,
  TEAM_MEMBERS,
  type TeamMemberId,
} from '../services/team-unlock.service.js';
import { rosterPreferences } from '../services/roster-preferences.service.js';
import { relationshipStageService } from '../services/relationship-stage.service.js';
import { getPersonaColorConfig } from '../config/persona-colors.js';

const log = createLogger('TeamIntro');

// Track timeouts for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// ICONS (Lucide-style SVG)
// ============================================================================

const ICONS = {
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  sparkle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
};

// ============================================================================
// TEAM MEMBER DATA (extends unlock service data with copy)
// ============================================================================

interface TeamMemberInfo {
  id: TeamMemberId;
  displayName: string;
  role: string;
  description: string;
  unlockHint: string;
  unlockedMessage: string;
  initials: string;
}

const TEAM_INFO: TeamMemberInfo[] = [
  {
    id: 'ferni',
    displayName: 'Ferni',
    role: 'Your Life Coach',
    description: "Your guide through life's journey. Always here, always listening.",
    unlockHint: 'Always available',
    unlockedMessage: 'Start every conversation here',
    initials: 'FE',
  },
  {
    id: 'maya-santos',
    displayName: 'Maya Santos',
    role: 'Habits & Routines',
    description: 'Helps you build lasting habits and create routines that stick.',
    unlockHint: 'Have 2 conversations with Ferni',
    unlockedMessage: 'Ready to help you build better habits',
    initials: 'MS',
  },
  {
    id: 'peter-john',
    displayName: 'Peter John',
    role: 'Research & Strategy',
    description: 'Deep dives into topics, helps you make informed decisions.',
    unlockHint: 'Build trust over 7 conversations',
    unlockedMessage: 'Here to research anything you need',
    initials: 'PJ',
  },
  {
    id: 'alex-chen',
    displayName: 'Alex Chen',
    role: 'Communication',
    description: 'Crafts messages, helps with difficult conversations.',
    unlockHint: 'Reach "Established" relationship',
    unlockedMessage: 'Ready to help you communicate better',
    initials: 'AC',
  },
  {
    id: 'jordan-taylor',
    displayName: 'Jordan Taylor',
    role: 'Event Planning',
    description: 'Plans gatherings, coordinates details, makes moments special.',
    unlockHint: 'Reach "Established" relationship',
    unlockedMessage: "Let's plan something memorable",
    initials: 'JT',
  },
  {
    id: 'nayan-patel',
    displayName: 'Nayan',
    role: 'Premium Partner',
    description: 'Advanced support for your most complex challenges.',
    unlockHint: 'Available with Partner subscription',
    unlockedMessage: 'Your premium partner for growth',
    initials: 'NA',
  },
];

// ============================================================================
// TEAM INTRO MODAL CLASS
// ============================================================================

/**
 * TeamIntroModal extends the base Modal component with team-specific
 * content and behavior.
 */
class TeamIntroModal extends Modal {
  constructor() {
    const config: ModalConfig = {
      id: 'team-intro',
      eyebrow: 'YOUR JOURNEY',
      title: 'Meet Your Team',
      onClose: () => {
        log.debug('Team intro closed');
      },
    };

    super(config, {
      closeOnBackdropClick: true,
      closeOnEscape: true,
      maxWidth: 'clamp(560px, 90vw, 800px)',
    });
  }

  /**
   * Build the modal content with team member cards
   */
  protected override buildContent(): string {
    const metrics = relationshipStageService.getMetrics();

    return `
      <p class="team-intro__subtitle">
        As we get to know each other, you'll unlock specialists who can help with specific areas of your life.
      </p>
      
      <div class="team-intro__progress">
        <div class="team-intro__progress-label">
          <span>${getProgressMessage(metrics.totalConversations)}</span>
          <span class="team-intro__progress-count">${getUnlockedCount()} of 6 unlocked</span>
        </div>
        <div class="team-intro__progress-bar">
          <div class="team-intro__progress-fill" style="width: ${getProgressPercent()}%"></div>
        </div>
      </div>
      
      <div class="team-intro__grid">
        ${TEAM_INFO.map((member) => createMemberCard(member)).join('')}
      </div>
      
      <footer class="team-intro__footer">
        <p class="team-intro__footer-text">
          ${getFooterMessage()}
        </p>
      </footer>
    `;
  }

  /**
   * Set up event handlers after mount
   */
  protected override afterMount(): void {
    super.afterMount();

    // Add to roster buttons
    this.container?.querySelectorAll('.team-member-card__action').forEach((btn) => {
      this.addListener(btn, 'click', (e) => {
        const memberId = (btn as HTMLElement).dataset.member as TeamMemberId;
        this.handleAddToRoster(memberId, btn as HTMLElement);
        e.stopPropagation();
      });
    });
  }

  /**
   * Handle adding a team member to the roster
   */
  private handleAddToRoster(memberId: TeamMemberId, button: HTMLElement): void {
    rosterPreferences.addMember(memberId);

    // Animate button
    button.innerHTML = `${ICONS.check} Added!`;
    button.classList.add('team-member-card__action--added');
    button.setAttribute('disabled', 'true');

    // Update parent card
    const card = button.closest('.team-member-card');
    card?.classList.add('team-member-card--added');

    log.info({ memberId }, 'Added team member to roster');

    // Close modal after a moment (use tracked timeout for cleanup)
    trackedTimeout(() => {
      this.close();
    }, 800);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function createMemberCard(member: TeamMemberInfo): string {
  const status = teamUnlockService.getMemberStatus(member.id);
  const isInRoster = rosterPreferences.isMemberVisible(member.id);
  const colors = getPersonaColorConfig(member.id);

  const isLocked = !status.unlocked;
  const isFerni = member.id === 'ferni';

  // Progress for locked members
  const progressPercent = isLocked ? Math.round(status.progress * 100) : 100;

  return `
    <div class="team-member-card ${isLocked ? 'team-member-card--locked' : ''} ${isFerni ? 'team-member-card--ferni' : ''}"
         data-member="${member.id}"
         style="--member-color: ${colors.primary}; --member-glow: ${colors.glow};">
      <div class="team-member-card__avatar">
        <div class="team-member-card__avatar-bg">${member.initials}</div>
        ${isLocked ? `<div class="team-member-card__lock">${ICONS.lock}</div>` : ''}
        ${!isLocked && !isFerni ? `<div class="team-member-card__unlocked">${ICONS.check}</div>` : ''}
      </div>
      
      <div class="team-member-card__info">
        <h3 class="team-member-card__name">${member.displayName}</h3>
        <p class="team-member-card__role">${member.role}</p>
        <p class="team-member-card__desc">${member.description}</p>
      </div>
      
      <div class="team-member-card__status">
        ${
          isLocked
            ? `
          <div class="team-member-card__progress">
            <div class="team-member-card__progress-bar">
              <div class="team-member-card__progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="team-member-card__hint">${member.unlockHint}</span>
          </div>
        `
            : `
          <div class="team-member-card__ready">
            ${
              isFerni
                ? `
              <span class="team-member-card__always">${ICONS.heart} Always here for you</span>
            `
                : `
              ${
                isInRoster
                  ? `
                <span class="team-member-card__added">${ICONS.check} In your roster</span>
              `
                  : `
                <button aria-label="${t('accessibility.add')}" class="team-member-card__action" data-member="${member.id}">
                  ${ICONS.plus} Add to Roster
                </button>
              `
              }
            `
            }
          </div>
        `
        }
      </div>
    </div>
  `;
}

function getUnlockedCount(): number {
  return TEAM_MEMBERS.filter((m) => teamUnlockService.getMemberStatus(m.id).unlocked).length;
}

function getProgressPercent(): number {
  const unlocked = getUnlockedCount();
  return Math.round((unlocked / 6) * 100);
}

function getProgressMessage(conversations: number): string {
  if (conversations === 0) return "Let's start your journey";
  if (conversations < 3) return "We're just getting started";
  if (conversations < 7) return 'Building something special';
  if (conversations < 15) return 'Growing together';
  return 'Deep partnership';
}

function getFooterMessage(): string {
  const unlocked = getUnlockedCount();
  if (unlocked <= 1) {
    return 'Keep talking to Ferni. Your team grows as your relationship deepens.';
  }
  if (unlocked < 4) {
    return "You're on your way! More team members unlock as we continue our journey.";
  }
  if (unlocked < 6) {
    return "Your team is growing. Just a few more milestones to unlock everyone.";
  }
  return "You've unlocked the full team! Everyone's here to support you.";
}

// ============================================================================
// SINGLETON INSTANCE & STYLES
// ============================================================================

let modalInstance: TeamIntroModal | null = null;

/**
 * Inject team intro specific styles
 */
function injectTeamIntroStyles(): void {
  if (document.getElementById('team-intro-styles')) return;

  const styleElement = document.createElement('style');
  styleElement.id = 'team-intro-styles';
  styleElement.textContent = `
    /* Team Intro Modal Extensions */
    .team-intro .ferni-modal__content {
      padding: 0;
    }
    
    .team-intro__subtitle {
      font-size: 0.95rem;
      color: var(--color-text-secondary, #5a5048);
      max-width: clamp(350px, 90vw, 500px);
      margin: 0 auto var(--space-4, 16px);
      line-height: 1.5;
      text-align: center;
      padding: 0 var(--space-8, 32px);
    }
    
    /* Progress */
    .team-intro__progress {
      padding: var(--space-4, 16px) var(--space-8, 32px);
      background: var(--color-background-secondary, #f9f7f5);
    }
    
    .team-intro__progress-label {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-2, 8px);
      font-size: 0.85rem;
      color: var(--color-text-secondary, #5a5048);
    }
    
    .team-intro__progress-count {
      font-weight: 600;
      color: var(--color-accent-text);
    }
    
    .team-intro__progress-bar {
      height: 6px;
      background: var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      border-radius: 3px;
      overflow: hidden;
    }
    
    .team-intro__progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
      border-radius: 3px;
      transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    /* Grid */
    .team-intro__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--space-4, 16px);
      padding: var(--space-6, 24px) var(--space-8, 32px);
    }
    
    /* Member Card */
    .team-member-card {
      position: relative;
      background: var(--color-background-primary, #ffffff);
      border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      border-radius: var(--radius-xl, 16px);
      padding: var(--space-4, 16px);
      transition: all ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .team-member-card:hover {
      border-color: var(--member-color, var(--persona-primary));
      box-shadow: var(--shadow-md);
    }
    
    .team-member-card--locked {
      opacity: 0.85;
    }
    
    .team-member-card--locked:hover {
      opacity: 1;
    }
    
    .team-member-card--ferni {
      border-color: var(--color-accent-text);
      background: linear-gradient(135deg, rgba(74, 103, 65, 0.03) 0%, transparent 100%);
    }
    
    .team-member-card--added {
      border-color: var(--color-accent-text);
      background: rgba(74, 103, 65, 0.05);
    }
    
    /* Avatar */
    .team-member-card__avatar {
      position: relative;
      width: 56px;
      height: 56px;
      margin-bottom: var(--space-3, 12px);
    }
    
    .team-member-card__avatar-bg {
      width: 100%;
      height: 100%;
      border-radius: var(--radius-full, 9999px);
      background: var(--member-color, var(--persona-primary));
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.1rem;
      letter-spacing: 0.02em;
    }
    
    .team-member-card--locked .team-member-card__avatar-bg {
      filter: grayscale(0.5);
      opacity: 0.7;
    }
    
    .team-member-card__lock,
    .team-member-card__unlocked {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 22px;
      height: 22px;
      border-radius: var(--radius-full, 9999px);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--color-background-elevated, white);
    }
    
    .team-member-card__lock {
      background: var(--color-text-muted, #8a7f75);
      color: white;
    }
    
    .team-member-card__unlocked {
      background: var(--persona-primary, #4a6741);
      color: white;
    }
    
    .team-member-card__lock svg,
    .team-member-card__unlocked svg {
      width: 12px;
      height: 12px;
    }
    
    /* Info */
    .team-member-card__name {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 1rem;
      font-weight: 600;
      color: var(--color-text-primary, #2C2520);
      margin: 0 0 var(--space-1, 4px);
    }
    
    .team-member-card__role {
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--member-color, var(--persona-primary));
      margin: 0 0 var(--space-2, 8px);
    }
    
    .team-member-card__desc {
      font-size: 0.85rem;
      color: var(--color-text-secondary, #5a5048);
      line-height: 1.4;
      margin: 0 0 var(--space-3, 12px);
    }
    
    /* Status - Locked */
    .team-member-card__progress {
      margin-top: auto;
    }
    
    .team-member-card__progress-bar {
      height: 4px;
      background: var(--color-border-subtle, rgba(0, 0, 0, 0.1));
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: var(--space-2, 8px);
    }
    
    .team-member-card__progress-fill {
      height: 100%;
      background: var(--member-color, var(--persona-primary));
      border-radius: 2px;
      opacity: 0.5;
    }
    
    .team-member-card__hint {
      font-size: 0.75rem;
      color: var(--color-text-muted, #8a7f75);
      font-style: italic;
    }
    
    /* Status - Ready */
    .team-member-card__ready {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
    }
    
    .team-member-card__always,
    .team-member-card__added {
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
      font-size: 0.8rem;
      color: var(--color-accent-text);
      font-weight: 500;
    }
    
    .team-member-card__always svg,
    .team-member-card__added svg {
      width: 14px;
      height: 14px;
    }
    
    .team-member-card__action {
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-2, 8px) var(--space-3, 12px);
      background: var(--member-color, var(--persona-primary));
      color: white;
      border: none;
      border-radius: var(--radius-md, 8px);
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .team-member-card__action:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px var(--member-glow, rgba(74, 103, 65, 0.3));
    }
    
    .team-member-card__action:active {
      transform: translateY(0);
    }
    
    .team-member-card__action svg {
      width: 14px;
      height: 14px;
    }
    
    .team-member-card__action--added {
      background: var(--persona-primary, #4a6741);
      pointer-events: none;
    }
    
    /* Footer */
    .team-intro__footer {
      padding: var(--space-4, 16px) var(--space-8, 32px);
      border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.06));
      text-align: center;
    }
    
    .team-intro__footer-text {
      font-size: 0.85rem;
      color: var(--color-text-muted, #8a7f75);
      margin: 0;
    }
    
    /* Mobile responsive */
    @media (max-width: 600px) {
      .team-intro .ferni-modal__card {
        max-height: 95vh;
      }
      
      .team-intro__subtitle {
        padding: 0 var(--space-4, 16px);
      }
      
      .team-intro__grid {
        grid-template-columns: 1fr;
        padding: var(--space-4, 16px);
      }
      
      .team-intro__progress {
        padding: var(--space-3, 12px) var(--space-4, 16px);
      }
    }
    
    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .team-member-card {
        transition: none;
      }
    }
  `;

  document.head.appendChild(styleElement);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function initTeamIntro(): void {
  // Cleanup any orphaned elements
  document.querySelectorAll('.team-intro').forEach((el) => el.remove());

  // Inject styles
  injectTeamIntroStyles();

  log.debug('Team intro initialized');
}

export function showTeamIntro(): void {
  if (!modalInstance) {
    modalInstance = new TeamIntroModal();
    modalInstance.mount(document.body);
  }

  modalInstance.open();
  log.info('Team intro opened');
}

export function hideTeamIntro(): void {
  modalInstance?.close();
  log.debug('Team intro closed');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const teamIntroUI = {
  init: initTeamIntro,
  show: showTeamIntro,
  hide: hideTeamIntro,
};
