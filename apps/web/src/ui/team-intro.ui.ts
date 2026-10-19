/**
 * Team Introduction UI - "Meet Your Team"
 *
 * A warm, inviting modal that introduces users to Ferni's team.
 * Shows the whole team with their roles.
 *
 * Design Philosophy:
 * - Centered floating modal (per brand guidelines)
 * - Warm, human copy - not corporate
 * - The whole team from the first call (Seth, 2026-10-11 TEAM_BY_NEED; "drop
 *   the locks", 2026-10-17): no locks, progress bars, counts or "have N
 *   conversations" hints. Ferni brings a teammate in when what you're working
 *   on calls for them.
 *
 * @see FERNI-BRAND-GUIDELINES.md
 * @see FERNI-SCREEN-GUIDELINES.md
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { Modal, type ModalConfig } from '../components/base/modal.js';
import { type TeamMemberId } from '../services/team-unlock.service.js';
import { rosterPreferences } from '../services/roster-preferences.service.js';
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
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
};

// ============================================================================
// TEAM MEMBER DATA
// ============================================================================

interface TeamMemberInfo {
  id: TeamMemberId;
  displayName: string;
  role: string;
  description: string;
  initials: string;
}

const teamInfo = (): TeamMemberInfo[] => [
  {
    id: 'ferni',
    displayName: t('teamIntro.members.ferni.name', 'Ferni'),
    role: t('teamIntro.members.ferni.role', 'Your Life Coach'),
    description: t('teamIntro.members.ferni.description', "Your guide through life's journey. Always here, always listening."),
    initials: 'FE',
  },
  {
    id: 'maya-santos',
    displayName: t('teamIntro.members.maya.name', 'Maya Santos'),
    role: t('teamIntro.members.maya.role', 'Habits & Routines'),
    description: t('teamIntro.members.maya.description', 'Helps you build lasting habits and create routines that stick.'),
    initials: 'MS',
  },
  {
    id: 'peter-john',
    displayName: t('teamIntro.members.peter.name', 'Peter John'),
    role: t('teamIntro.members.peter.role', 'Research & Strategy'),
    description: t('teamIntro.members.peter.description', 'Deep dives into topics, helps you make informed decisions.'),
    initials: 'PJ',
  },
  {
    id: 'alex-chen',
    displayName: t('teamIntro.members.alex.name', 'Alex Chen'),
    role: t('teamIntro.members.alex.role', 'Communication'),
    description: t('teamIntro.members.alex.description', 'Crafts messages, helps with difficult conversations.'),
    initials: 'AC',
  },
  {
    id: 'jordan-taylor',
    displayName: t('teamIntro.members.jordan.name', 'Jordan Taylor'),
    role: t('teamIntro.members.jordan.role', 'Event Planning'),
    description: t('teamIntro.members.jordan.description', 'Plans gatherings, coordinates details, makes moments special.'),
    initials: 'JT',
  },
  {
    id: 'nayan-patel',
    displayName: t('teamIntro.members.nayan.name', 'Nayan'),
    role: t('teamIntro.members.nayan.role', 'Wisdom & Reflection'),
    description: t('teamIntro.members.nayan.description', 'Advanced support for your most complex challenges.'),
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
      eyebrow: t('teamIntro.eyebrow', 'YOUR JOURNEY'),
      title: t('teamIntro.title', 'Meet Your Team'),
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
    return `
      <p class="team-intro__subtitle">
        ${t('teamIntro.wholeTeam')}
      </p>
      
      <div class="team-intro__grid">
        ${teamInfo().map((member) => createMemberCard(member)).join('')}
      </div>
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
    button.innerHTML = `${ICONS.check} ${t('teamIntro.added', 'Added!')}`;
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
  const isInRoster = rosterPreferences.isMemberVisible(member.id);
  const colors = getPersonaColorConfig(member.id);
  const isFerni = member.id === 'ferni';

  let status: string;
  if (isFerni) {
    status = `<span class="team-member-card__always">${ICONS.heart} ${t('teamIntro.alwaysHere', 'Always here for you')}</span>`;
  } else if (isInRoster) {
    status = `<span class="team-member-card__added">${ICONS.check} ${t('teamIntro.inRoster', 'In your roster')}</span>`;
  } else {
    status = `<button class="team-member-card__action" data-member="${member.id}">
      ${ICONS.plus} ${t('teamIntro.addToRoster', 'Add to Roster')}
    </button>`;
  }

  return `
    <div class="team-member-card ${isFerni ? 'team-member-card--ferni' : ''}"
         data-member="${member.id}"
         style="--member-color: ${colors.primary}; --member-glow: ${colors.glow};">
      <div class="team-member-card__avatar">
        <div class="team-member-card__avatar-bg">${member.initials}</div>
      </div>
      
      <div class="team-member-card__info">
        <h3 class="team-member-card__name">${member.displayName}</h3>
        <p class="team-member-card__role">${member.role}</p>
        <p class="team-member-card__desc">${member.description}</p>
      </div>
      
      <div class="team-member-card__status">
        <div class="team-member-card__ready">${status}</div>
      </div>
    </div>
  `;
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
