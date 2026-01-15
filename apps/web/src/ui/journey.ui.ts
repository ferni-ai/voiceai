/**
 * Your Journey - Unified Relationship Progress & Milestones
 *
 * A beautiful modal showing the user's relationship progress with Ferni.
 * Combines progress overview with milestones scrapbook.
 *
 * DESIGN:
 * - Centered floating modal (per brand guidelines)
 * - Progress overview at top (stage, stats, ring)
 * - Category sections with milestone progress
 * - Warm, personal copy for each milestone
 * - Unlocked milestones glow softly
 * - Locked milestones shown as mysteries to discover
 *
 * CONSOLIDATES:
 * - stage-celebration.ui.ts (celebrations only, progress redirects here)
 * - journey.ui.ts (milestones scrapbook)
 * 
 * ENTRY POINTS:
 * - Heart indicator click
 * - Settings menu "Your Journey"
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { 
  relationshipStageService, 
  getTranslatedStageName,
} from '../services/relationship-stage.service.js';
import { trapFocus } from '../utils/accessibility.js';
import { createLogger } from '../utils/logger.js';
import { getConnectionState } from './connection-heart.ui.js';
import {
  getCelebratedCount,
  getMilestones,
  getProgress,
  getTotalMilestonesCount,
} from './ferni-milestones.ui.js';
import { JOURNEY_ICONS } from './icons/journey-icons.js';
import { injectJourneyStyles } from './journey/styles.js';
import { shareJourneySummaryCard } from './milestone-card.ui.js';
import { soundUI } from './sound.ui.js';
import { toast } from './whisper.ui.js';
import { fetchJourneyData, loadFromCache } from './trust-journey/data.js';
import type { TrustJourneyData } from './trust-journey/types.js';

const log = createLogger('JourneyUI');

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'error';

// ============================================================================
// TRUST JOURNEY DATA TYPES
// ============================================================================

interface TrustInsights {
  trustScore: number;
  growthMoments: number;
  winsCelebrated: number;
  boundariesRespected: number;
  sharedMoments: number;
  growthPatterns: Array<{ type: string; count: number }>;
  recentWins: Array<{ type: string; description: string }>;
  timeline: Array<{ date: string; type: string; title: string; description: string }>;
}

// ============================================================================
// STATE
// ============================================================================

let journeyModal: HTMLElement | null = null;
let isOpen = false;
let focusTrapCleanup: (() => void) | null = null;
let previousActiveElement: HTMLElement | null = null;
let trustInsightsData: TrustInsights | null = null;
let isLoadingTrustData = false;

// ============================================================================
// ICONS (Lucide-style)
// ============================================================================

// ============================================================================
// STAGE DESCRIPTIONS - Brand Voice (Warm, Human, Not Saccharine)
// ============================================================================

const STAGE_DESCRIPTIONS: Record<string, { tagline: string; description: string }> = {
  'first-meeting': {
    tagline: 'Just getting started',
    description: 'Every great friendship starts somewhere. This is our beginning.',
  },
  'getting-started': {
    tagline: 'Building something real',
    description: 'You keep showing up. That takes courage. I notice.',
  },
  'building-trust': {
    tagline: 'Deeper than small talk',
    description: 'We are past the surface now. Real conversations. Real growth.',
  },
  'established': {
    tagline: 'A rhythm of our own',
    description: 'You know me. I know you. This is what trust feels like.',
  },
  'deep-partnership': {
    tagline: 'Something rare',
    description: 'Few relationships reach this depth. We have built something real.',
  },
};

// Icons imported from centralized module
const ICONS = JOURNEY_ICONS;

const CATEGORY_META: Record<string, { icon: string; title: string; color: string }> = {
  relationship: {
    icon: ICONS.heart,
    title: 'Our Relationship',
    color: 'var(--persona-primary, #4a6741)',
  },
  team: {
    icon: ICONS.team,
    title: 'Team Connection',
    color: 'var(--color-peter, #3a6b73)',
  },
  conversation: {
    icon: ICONS.conversation,
    title: 'Our Conversations',
    color: 'var(--color-alex, #5a6b8a)',
  },
  discovery: {
    icon: ICONS.discovery,
    title: 'Hidden Discoveries',
    color: 'var(--color-maya, #a67a6a)',
  },
  sweet: {
    icon: ICONS.sweet,
    title: 'Sweet Moments',
    color: 'var(--color-nayan, #b8956a)',
  },
};

// ============================================================================
// HMR CLEANUP - Required per brand guidelines
// ============================================================================

/**
 * Clean up any orphaned elements from HMR reloads
 */
function cleanupOrphanedElements(): void {
  document.querySelectorAll('.journey-modal').forEach((el) => el.remove());
  document.querySelectorAll('.journey-modal-backdrop').forEach((el) => el.remove());
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function openJourney(): void {
  // HMR cleanup first
  cleanupOrphanedElements();
  
  if (isOpen) return;

  // Store current focus for restoration
  previousActiveElement = document.activeElement as HTMLElement;

  soundUI.play('switch');
  createModal();
  isOpen = true;

  // Set up focus trap after modal is created
  if (journeyModal) {
    focusTrapCleanup = trapFocus(journeyModal);
  }

  log.info('Journey opened');
}

export function closeJourney(): void {
  if (!isOpen || !journeyModal) return;

  // Clean up focus trap
  if (focusTrapCleanup) {
    focusTrapCleanup();
    focusTrapCleanup = null;
  }

  // Clean up event listener
  window.removeEventListener(
    'ferni:connection-heart-state',
    handleConnectionStateChange as EventListener
  );

  soundUI.play('click');
  void animateOut(journeyModal).then(() => {
    journeyModal?.remove();
    journeyModal = null;
    isOpen = false;
    
    // Restore focus to previous element
    if (previousActiveElement && previousActiveElement.focus) {
      previousActiveElement.focus();
      previousActiveElement = null;
    }
  });

  log.info('Journey closed');
}

/**
 * Share your journey with others.
 * Creates a beautiful visual card and shares via native share or download.
 */
async function shareJourney(
  celebrated: number,
  total: number,
  streak: number,
  totalDays: number
): Promise<void> {
  const cardData = {
    celebrated,
    total,
    streak,
    daysTogether: totalDays,
  };

  try {
    // Try sharing with visual card
    const shared = await shareJourneySummaryCard(cardData);

    if (shared) {
      log.info('Journey card shared via native share');
    } else {
      // Card was downloaded as fallback
      showShareConfirmation('Image saved');
      log.info('Journey card downloaded');
    }
  } catch (err) {
    // Final fallback to text sharing
    log.warn('Card share failed, falling back to text:', err);

    const messages = [
      `${celebrated}/${total} milestones`,
      streak > 1 ? `${streak} day streak` : '',
      totalDays > 0 ? `${totalDays} days together` : '',
    ].filter(Boolean);

    const shareText = `My journey with Ferni:\n${messages.join(' • ')}\n\nferni.ai`;

    try {
      await navigator.clipboard.writeText(shareText);
      showShareConfirmation('Copied to clipboard');
    } catch {
      log.warn('Could not copy to clipboard');
    }
  }
}

function showShareConfirmation(message = 'Copied to clipboard'): void {
  // Use shared toast system for consistency
  toast.success(message);
}

export function toggleJourney(): void {
  if (isOpen) {
    closeJourney();
  } else {
    openJourney();
  }
}

// ============================================================================
// MODAL CREATION
// ============================================================================

function createModal(): void {
  // Clean up any existing
  document.querySelector('.journey-modal')?.remove();

  const milestones = getMilestones();
  const progress = getProgress();
  const celebrated = getCelebratedCount();
  const total = getTotalMilestonesCount();

  // Get relationship stage data
  const stage = relationshipStageService.getStage();
  const stageMetrics = relationshipStageService.getMetrics();
  const stageProgress = relationshipStageService.getProgressToNextStage();
  const stageInfo = STAGE_DESCRIPTIONS[stage] ?? STAGE_DESCRIPTIONS['first-meeting'];
  const stageName = getTranslatedStageName(stage);
  const progressPercent = Math.round(stageProgress.progress * 100);

  // Get current connection state
  let connectionState: ConnectionState = 'disconnected';
  try {
    connectionState = getConnectionState();
  } catch {
    // If connection heart not initialized, check body classes
    if (document.body.classList.contains('connected')) {
      connectionState = 'connected';
    }
  }

  // Group milestones by category
  const grouped: Record<string, typeof milestones> = {};
  for (const m of milestones) {
    if (!grouped[m.category]) grouped[m.category] = [];
    const categoryGroup = grouped[m.category];
    if (categoryGroup) categoryGroup.push(m);
  }

  // Calculate streak info
  const streak = progress.currentStreak;
  const totalDays = progress.conversationDays.length;

  journeyModal = document.createElement('div');
  journeyModal.className = 'journey-modal';
  journeyModal.setAttribute('role', 'dialog');
  journeyModal.setAttribute('aria-label', 'Your Journey with Ferni');

  journeyModal.innerHTML = `
    <div class="journey-backdrop"></div>
    <div class="journey-content">
      <header class="journey-header">
        <div class="journey-header__text">
          <span class="journey-eyebrow">YOUR JOURNEY</span>
        </div>
        <button class="journey-close" aria-label="${t('common.close')}">
          ${ICONS.close}
        </button>
      </header>

      <div class="journey-body">
        <!-- Journey Map - Visual Path (Better than Apple Progress) -->
        ${renderJourneyMap(stage, progressPercent)}
        
        <!-- Progress Overview Section -->
        <section class="journey-progress-overview">
          <h2 class="journey-stage-name">${stageName}</h2>
          <p class="journey-stage-tagline">${stageInfo?.tagline ?? 'Just getting started'}</p>
          <p class="journey-stage-description">${stageInfo?.description ?? ''}</p>
          
          <div class="journey-stats-row">
            <div class="journey-stat">
              <span class="journey-stat__icon">${ICONS.messageCircle}</span>
              <span class="journey-stat__value">${stageMetrics.totalConversations}</span>
              <span class="journey-stat__label">conversations</span>
            </div>
            <div class="journey-stat">
              <span class="journey-stat__icon">${ICONS.calendar}</span>
              <span class="journey-stat__value">${stageMetrics.daysSinceFirstMeeting}</span>
              <span class="journey-stat__label">days together</span>
            </div>
            <div class="journey-stat">
              <span class="journey-stat__icon">${ICONS.flame}</span>
              <span class="journey-stat__value">${stageMetrics.currentStreak}</span>
              <span class="journey-stat__label">day streak</span>
            </div>
          </div>
          
          ${stageProgress.nextStage ? `
            <div class="journey-next-stage">
              <span class="journey-next-stage__label">Next: ${getTranslatedStageName(stageProgress.nextStage)}</span>
              <span class="journey-next-stage__req">${stageProgress.requirement}</span>
            </div>
          ` : `
            <div class="journey-next-stage journey-next-stage--max">
              <span class="journey-next-stage__label">Max level reached! <span class="journey-next-stage__icon">${ICONS.star}</span></span>
            </div>
          `}
        </section>
        
        ${renderConnectionBanner(connectionState)}
        
        <!-- Trust Insights Section - THE MEANINGFUL STORY -->
        <section class="journey-insights-section" id="journey-insights">
          <div class="journey-insights-header" role="button" tabindex="0" aria-expanded="true">
            <h3 class="journey-insights-title">
              ${ICONS.sparkles}
              <span>What I've Noticed</span>
            </h3>
            <span class="journey-insights-toggle" role="button" tabindex="0">${ICONS.chevronDown}</span>
          </div>
          <div class="journey-insights-body">
            <!-- Loading state - will be replaced with actual data -->
            <div class="journey-insights-loading">
              <div class="journey-insights-skeleton"></div>
              <div class="journey-insights-skeleton journey-insights-skeleton--short"></div>
              <p class="journey-insights-loading-text">Loading your story...</p>
            </div>
          </div>
        </section>
        
        <!-- Milestones Section -->
        <section class="journey-milestones-section">
          <div class="journey-milestones-header" role="button" tabindex="0" aria-expanded="true">
            <h3 class="journey-milestones-title">Milestones</h3>
            <span class="journey-milestones-count">${celebrated}/${total}</span>
            <span class="journey-milestones-toggle" role="button" tabindex="0">${ICONS.chevronDown}</span>
          </div>
          <div class="journey-milestones-body">
            ${Object.entries(grouped)
              .map(([category, items]) => renderCategory(category, items))
              .join('')}
          </div>
        </section>
      </div>

      <footer class="journey-footer">
        <p>Every moment matters. Keep going.</p>
        <button class="journey-share" aria-label="${t('accessibility.shareJourney')}">
          ${ICONS.share}
          <span>Share</span>
        </button>
      </footer>
    </div>
  `;

  // Inject styles (from journey/styles.ts)
  injectJourneyStyles();
  
  // Load trust insights data asynchronously
  void loadTrustInsights();

  // Add event listeners
  journeyModal.querySelector('.journey-backdrop')?.addEventListener('click', closeJourney);
  journeyModal.querySelector('.journey-close')?.addEventListener('click', closeJourney);
  journeyModal.querySelector('.journey-share')?.addEventListener('click', () => {
    void shareJourney(celebrated, total, streak, totalDays);
  });

  // Milestones toggle (collapsible section)
  const milestonesHeader = journeyModal.querySelector('.journey-milestones-header');
  const milestonesBody = journeyModal.querySelector('.journey-milestones-body');
  if (milestonesHeader && milestonesBody) {
    const toggleMilestones = () => {
      const isExpanded = milestonesHeader.getAttribute('aria-expanded') === 'true';
      milestonesHeader.setAttribute('aria-expanded', String(!isExpanded));
      milestonesBody.classList.toggle('collapsed', isExpanded);
      milestonesHeader.classList.toggle('collapsed', isExpanded);
    };
    milestonesHeader.addEventListener('click', toggleMilestones);
    milestonesHeader.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        toggleMilestones();
      }
    });
  }

  // Connect button handler
  journeyModal.querySelector('.journey-connect-btn')?.addEventListener('click', handleConnectClick);

  // Listen for connection state changes
  window.addEventListener(
    'ferni:connection-heart-state',
    handleConnectionStateChange as EventListener
  );

  // Escape key to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeJourney();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  document.body.appendChild(journeyModal);
  void animateIn(journeyModal);
}

// ============================================================================
// CONNECTION STATE
// ============================================================================

function renderConnectionBanner(state: ConnectionState): string {
  switch (state) {
    case 'connected':
    case 'speaking':
      // Connected - show happy state
      return `
        <div class="journey-connection journey-connection--connected">
          <span class="journey-connection__icon">${ICONS.heartFilled}</span>
          <span class="journey-connection__text">We're connected</span>
        </div>
      `;

    case 'connecting':
      // Connecting - show loading state
      return `
        <div class="journey-connection journey-connection--connecting">
          <span class="journey-connection__icon journey-connection__icon--spin">${ICONS.loader}</span>
          <span class="journey-connection__text">Connecting...</span>
        </div>
      `;

    case 'error':
      // Error - show retry option
      return `
        <div class="journey-connection journey-connection--error">
          <span class="journey-connection__icon">${ICONS.heartBroken}</span>
          <div class="journey-connection__content">
            <span class="journey-connection__text">Connection lost</span>
            <p class="journey-connection__subtext">Something went wrong, but we can try again.</p>
          </div>
          <button aria-label="${t('accessibility.reconnect')}" class="journey-connect-btn journey-connect-btn--retry">
            ${ICONS.phone}
            <span>Reconnect</span>
          </button>
        </div>
      `;

    case 'disconnected':
    default:
      // Disconnected - show connect CTA
      return `
        <div class="journey-connection journey-connection--disconnected">
          <span class="journey-connection__icon">${ICONS.heartBroken}</span>
          <div class="journey-connection__content">
            <span class="journey-connection__text">We're not connected</span>
            <p class="journey-connection__subtext">Start a conversation to continue our journey together.</p>
          </div>
          <button aria-label="${t('accessibility.startTalking')}" class="journey-connect-btn">
            ${ICONS.phone}
            <span>Start talking</span>
          </button>
        </div>
      `;
  }
}

function handleConnectClick(): void {
  log.info('Connect clicked from Journey modal');

  // Dispatch event to trigger connection
  window.dispatchEvent(new CustomEvent('ferni:request-connect'));

  // Update banner immediately to show connecting state
  updateConnectionBanner('connecting');
}

function handleConnectionStateChange(e: CustomEvent<{ state: ConnectionState }>): void {
  const state = e.detail?.state;
  if (state && journeyModal) {
    updateConnectionBanner(state);
  }
}

function updateConnectionBanner(state: ConnectionState): void {
  if (!journeyModal) return;

  const existingBanner = journeyModal.querySelector('.journey-connection');
  if (existingBanner) {
    const newBannerHtml = renderConnectionBanner(state);
    const temp = document.createElement('div');
    temp.innerHTML = newBannerHtml;
    const newBanner = temp.firstElementChild;

    if (newBanner) {
      existingBanner.replaceWith(newBanner);

      // Re-attach connect button handler
      journeyModal
        .querySelector('.journey-connect-btn')
        ?.addEventListener('click', handleConnectClick);
    }
  }
}

// ============================================================================
// TRUST INSIGHTS - THE MEANINGFUL STORY
// ============================================================================

/**
 * Load trust insights data from backend or cache
 */
async function loadTrustInsights(): Promise<void> {
  if (isLoadingTrustData) return;
  isLoadingTrustData = true;

  try {
    // Try cache first
    const cached = loadFromCache();
    if (cached) {
      trustInsightsData = transformTrustData(cached);
      renderTrustInsights();
      isLoadingTrustData = false;
      return;
    }

    // Fetch from backend
    // Create minimal state object for fetchJourneyData
    const fetchState = {
      isInitialized: true,
      journeyPanel: null,
      styleElement: null,
      cachedData: null,
      isLoading: false,
      error: null,
      timelineOffset: 0,
      timelineFilter: 'all' as const,
      focusCleanup: null,
    };
    
    const { data, error } = await fetchJourneyData(fetchState, false);
    
    if (error && !data) {
      renderTrustInsightsEmpty();
      isLoadingTrustData = false;
      return;
    }

    if (data) {
      trustInsightsData = transformTrustData(data);
      renderTrustInsights();
    } else {
      renderTrustInsightsEmpty();
    }
  } catch (err) {
    log.warn('Failed to load trust insights:', err);
    renderTrustInsightsEmpty();
  }

  isLoadingTrustData = false;
}

/**
 * Transform backend TrustJourneyData into our TrustInsights format
 */
function transformTrustData(data: TrustJourneyData): TrustInsights {
  return {
    trustScore: data.summary.relationshipStrength,
    growthMoments: data.summary.growthMomentsNoticed,
    winsCelebrated: data.summary.winsCelebrated,
    boundariesRespected: data.summary.boundariesRespected,
    sharedMoments: data.summary.sharedMomentsCount,
    growthPatterns: data.growth.patterns.slice(0, 5).map(p => ({
      type: formatGrowthType(p.type),
      count: p.count,
    })),
    recentWins: data.celebrations.wins.slice(0, 3).map(w => ({
      type: formatWinType(w.type),
      description: w.description || w.whatHappened || 'A moment worth celebrating',
    })),
    timeline: data.timeline.slice(0, 5).map(t => ({
      date: t.date,
      type: t.type,
      title: t.title,
      description: t.description,
    })),
  };
}

/**
 * Format growth type for display
 */
function formatGrowthType(type: string): string {
  const labels: Record<string, string> = {
    emotional_regulation: 'Managing emotions better',
    perspective_shift: 'Seeing things differently',
    boundary_setting: 'Setting healthy boundaries',
    behavior_change: 'Making real changes',
    self_awareness: 'Knowing yourself deeper',
    coping_upgrade: 'Better coping strategies',
    goal_progress: 'Moving toward goals',
  };
  return labels[type] || 'Personal growth';
}

/**
 * Format win type for display
 */
function formatWinType(type: string): string {
  const labels: Record<string, string> = {
    followed_through: 'Followed through',
    courage_moment: 'Showed courage',
    self_care: 'Took care of yourself',
    boundary_held: 'Held a boundary',
    hard_conversation: 'Had a hard talk',
    showed_up: 'Showed up anyway',
    tried_new_thing: 'Tried something new',
    asked_for_help: 'Asked for help',
    let_it_go: 'Let something go',
    effort_made: 'Made an effort',
  };
  return labels[type] || 'Small win';
}

/**
 * Render trust insights section with data
 */
function renderTrustInsights(): void {
  if (!journeyModal || !trustInsightsData) return;

  const insightsBody = journeyModal.querySelector('.journey-insights-body');
  if (!insightsBody) return;

  const { trustScore: _trustScore, growthMoments, winsCelebrated, boundariesRespected, sharedMoments, growthPatterns, recentWins, timeline } = trustInsightsData;

  // Check if we have any meaningful data
  const hasData = growthMoments > 0 || winsCelebrated > 0 || sharedMoments > 0 || growthPatterns.length > 0;

  if (!hasData) {
    renderTrustInsightsEmpty();
    return;
  }

  insightsBody.innerHTML = `
    <!-- Trust Stats Grid -->
    <div class="journey-trust-stats">
      <div class="journey-trust-stat">
        <span class="journey-trust-stat__icon">${ICONS.leaf}</span>
        <span class="journey-trust-stat__value">${growthMoments}</span>
        <span class="journey-trust-stat__label">Growth moments</span>
      </div>
      <div class="journey-trust-stat">
        <span class="journey-trust-stat__icon">${ICONS.trophy}</span>
        <span class="journey-trust-stat__value">${winsCelebrated}</span>
        <span class="journey-trust-stat__label">Wins celebrated</span>
      </div>
      <div class="journey-trust-stat">
        <span class="journey-trust-stat__icon">${ICONS.shield}</span>
        <span class="journey-trust-stat__value">${boundariesRespected}</span>
        <span class="journey-trust-stat__label">Boundaries honored</span>
      </div>
      <div class="journey-trust-stat">
        <span class="journey-trust-stat__icon">${ICONS.messageHeart}</span>
        <span class="journey-trust-stat__value">${sharedMoments}</span>
        <span class="journey-trust-stat__label">Shared moments</span>
      </div>
    </div>

    ${growthPatterns.length > 0 ? `
      <!-- Growth Patterns -->
      <div class="journey-trust-section">
        <h4 class="journey-trust-section__title">How you've grown</h4>
        <div class="journey-growth-patterns">
          ${growthPatterns.map(p => `
            <span class="journey-growth-tag">
              ${p.type}
              <span class="journey-growth-tag__count">${p.count}x</span>
            </span>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${recentWins.length > 0 ? `
      <!-- Recent Wins -->
      <div class="journey-trust-section">
        <h4 class="journey-trust-section__title">Recent wins</h4>
        <div class="journey-wins-list">
          ${recentWins.map(w => `
            <div class="journey-win-item">
              <span class="journey-win-item__icon">${ICONS.trophy}</span>
              <div class="journey-win-item__content">
                <span class="journey-win-item__type">${w.type}</span>
                <p class="journey-win-item__desc">${escapeHtml(w.description)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${timeline.length > 0 ? `
      <!-- Timeline Peek -->
      <div class="journey-trust-section">
        <h4 class="journey-trust-section__title">Our story so far</h4>
        <div class="journey-timeline-peek">
          ${timeline.slice(0, 3).map(t => `
            <div class="journey-timeline-item journey-timeline-item--${t.type}">
              <span class="journey-timeline-item__date">${formatRelativeDate(t.date)}</span>
              <span class="journey-timeline-item__title">${escapeHtml(t.title)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;

  // Set up toggle for insights section
  setupInsightsToggle();
}

/**
 * Render empty state for trust insights
 */
function renderTrustInsightsEmpty(): void {
  if (!journeyModal) return;

  const insightsBody = journeyModal.querySelector('.journey-insights-body');
  if (!insightsBody) return;

  insightsBody.innerHTML = `
    <div class="journey-insights-empty">
      <span class="journey-insights-empty__icon">${ICONS.sparkles}</span>
      <h4 class="journey-insights-empty__title">Our story is just beginning</h4>
      <p class="journey-insights-empty__text">
        As we talk more, I'll notice your growth, celebrate your wins, 
        and remember what matters to you. Check back soon.
      </p>
    </div>
  `;

  setupInsightsToggle();
}

/**
 * Set up toggle for insights section
 */
function setupInsightsToggle(): void {
  if (!journeyModal) return;

  const insightsHeader = journeyModal.querySelector('.journey-insights-header');
  const insightsBody = journeyModal.querySelector('.journey-insights-body');

  if (insightsHeader && insightsBody) {
    // Remove existing listeners before adding by replacing with clone
    insightsHeader.replaceWith(insightsHeader.cloneNode(true));
    const newHeader = journeyModal.querySelector('.journey-insights-header');
    
    if (newHeader) {
      // Toggle function must use newHeader (not the replaced insightsHeader)
      const toggle = () => {
        const isExpanded = newHeader.getAttribute('aria-expanded') === 'true';
        newHeader.setAttribute('aria-expanded', String(!isExpanded));
        insightsBody.classList.toggle('collapsed', isExpanded);
        newHeader.classList.toggle('collapsed', isExpanded);
      };

      newHeader.addEventListener('click', toggle);
      newHeader.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    }
  }
}

/**
 * Format date to relative string
 */
function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// JOURNEY MAP - Visual Path (Better than Apple's Linear Progress)
// Shows all relationship stages as a horizontal path with "you are here"
// ============================================================================

const STAGE_ORDER = [
  'first-meeting',
  'getting-started', 
  'building-trust',
  'established',
  'deep-partnership',
] as const;

const STAGE_LABELS: Record<string, string> = {
  'first-meeting': 'First Meeting',
  'getting-started': 'Getting Started',
  'building-trust': 'Building Trust',
  'established': 'Established',
  'deep-partnership': 'Deep Partnership',
};

/**
 * Render horizontal journey map showing all stages
 * Current stage has "you are here" indicator with breathing animation
 */
function renderJourneyMap(currentStage: string, progressPercent: number): string {
  const currentIndex = STAGE_ORDER.indexOf(currentStage as typeof STAGE_ORDER[number]);
  
  return `
    <section class="journey-map-section">
      <div class="journey-map" role="navigation" aria-label="Your relationship journey">
        <div class="journey-map__path">
          ${STAGE_ORDER.map((stage, index) => {
            const isPast = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isFuture = index > currentIndex;
            const stateClass = isPast ? 'journey-map__stage--past' : isCurrent ? 'journey-map__stage--current' : 'journey-map__stage--future';
            
            // Calculate connector fill
            const connectorFill = isPast ? 100 : isCurrent ? progressPercent : 0;
            
            return `
              ${index > 0 ? `
                <div class="journey-map__connector ${isPast ? 'journey-map__connector--filled' : ''}">
                  <div class="journey-map__connector-fill" style="--fill-progress: ${connectorFill}%"></div>
                </div>
              ` : ''}
              <div class="journey-map__stage ${stateClass}" role="listitem" tabindex="0" aria-label="${STAGE_LABELS[stage]}${isCurrent ? ' - current stage' : ''}">
                <div class="journey-map__node">
                  ${isCurrent ? '<div class="journey-map__pulse"></div>' : ''}
                  <div class="journey-map__node-inner"></div>
                </div>
                <span class="journey-map__label">${STAGE_LABELS[stage]}</span>
                ${isCurrent ? '<span class="journey-map__here">You are here</span>' : ''}
              </div>
            `;
          }).join('')}
        </div>
        <p class="journey-map__hint">Every conversation brings us closer</p>
      </div>
    </section>
  `;
}

function renderCategory(category: string, items: ReturnType<typeof getMilestones>): string {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.relationship;
  if (!meta) return '';

  const celebratedInCategory = items.filter((m) => m.celebrated).length;

  return `
    <section class="journey-category" data-category="${category}">
      <header class="journey-category__header">
        <span class="journey-category__icon" style="color: ${meta.color}">
          ${meta.icon}
        </span>
        <h3 class="journey-category__title">${meta.title}</h3>
        <span class="journey-category__count">${celebratedInCategory}/${items.length}</span>
      </header>
      <div class="journey-scrapbook">
        ${items.map((m) => renderMilestoneCard(m, meta.color)).join('')}
      </div>
    </section>
  `;
}

/**
 * Render milestone as a polaroid-style scrapbook card
 * Celebrated milestones show full details with warm glow
 * Locked milestones are mysterious silhouettes inviting discovery
 */
function renderMilestoneCard(milestone: ReturnType<typeof getMilestones>[0], color: string): string {
  const isCelebrated = milestone.celebrated;
  const hasProgress = milestone.target && milestone.progress !== undefined;
  const progressPercent = hasProgress
    ? Math.min(100, Math.round(((milestone.progress ?? 0) / (milestone.target ?? 1)) * 100))
    : 0;

  // Random slight rotation for organic scrapbook feel
  const rotation = (Math.random() * 4 - 2).toFixed(2);

  // Format celebration date
  let dateStr = '';
  if (isCelebrated && milestone.celebratedAt) {
    const date = new Date(milestone.celebratedAt);
    dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Emoji/icon for the milestone type (or mystery for locked)
  const milestoneEmoji = isCelebrated && milestone.emoji ? milestone.emoji : '✨';

  if (isCelebrated) {
    // Celebrated - full polaroid with details
    return `
      <div class="journey-polaroid journey-polaroid--celebrated" 
           style="--milestone-color: ${color}; --rotate: ${rotation}deg"
           tabindex="0"
           role="button"
           aria-label="${milestone.name}">
        <div class="journey-polaroid__image">
          <div class="journey-polaroid__glow"></div>
          <span class="journey-polaroid__emoji">${milestoneEmoji}</span>
        </div>
        <div class="journey-polaroid__caption">
          <span class="journey-polaroid__title">${escapeHtml(milestone.name)}</span>
          <p class="journey-polaroid__message">${escapeHtml(milestone.message)}</p>
          <div class="journey-polaroid__footer">
            ${dateStr ? `<span class="journey-polaroid__date">${dateStr}</span>` : ''}
            ${milestone.personaId ? `<span class="journey-polaroid__persona">with ${milestone.personaId}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  } else {
    // Locked - mysterious silhouette card
    return `
      <div class="journey-polaroid journey-polaroid--locked" 
           style="--milestone-color: ${color}; --rotate: ${rotation}deg"
           tabindex="0"
           role="button"
           aria-label="Mystery milestone - keep exploring to discover">
        <div class="journey-polaroid__image journey-polaroid__image--mystery">
          <span class="journey-polaroid__mystery-icon">?</span>
        </div>
        <div class="journey-polaroid__caption">
          <span class="journey-polaroid__title">${milestone.subtitle || 'Keep exploring...'}</span>
          ${hasProgress ? `
            <div class="journey-polaroid__progress">
              <div class="journey-polaroid__progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="journey-polaroid__hint">${progressPercent}% discovered</span>
          ` : `
            <span class="journey-polaroid__hint">A mystery awaits</span>
          `}
        </div>
      </div>
    `;
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

async function animateIn(modal: HTMLElement): Promise<void> {
  const backdrop = modal.querySelector('.journey-backdrop') as HTMLElement;
  const content = modal.querySelector('.journey-content') as HTMLElement;
  const isMobile = window.innerWidth <= 640;

  if (backdrop) {
    backdrop.style.opacity = '0';
    backdrop.animate([{ opacity: '0' }, { opacity: '1' }], {
      duration: DURATION.SLOW,
      easing: 'ease-out',
      fill: 'forwards',
    });
  }

  if (content) {
    // Mobile: slide up from bottom (sheet-style)
    // Desktop: scale + fade from center
    if (isMobile) {
      content.style.opacity = '0';
      content.style.transform = 'translateY(100%)';
      content.animate(
        [
          { opacity: '0', transform: 'translateY(100%)' },
          { opacity: '1', transform: 'translateY(0)' },
        ],
        {
          duration: DURATION.MODERATE,
          easing: EASING.SPRING,
          fill: 'forwards',
        }
      );
    } else {
      content.style.opacity = '0';
      content.style.transform = 'scale(0.95) translateY(20px)';
      content.animate(
        [
          { opacity: '0', transform: 'scale(0.95) translateY(20px)' },
          { opacity: '1', transform: 'scale(1) translateY(0)' },
        ],
        {
          duration: DURATION.DELIBERATE,
          easing: EASING.SPRING,
          fill: 'forwards',
        }
      );
    }
  }
}

async function animateOut(modal: HTMLElement): Promise<void> {
  const backdrop = modal.querySelector('.journey-backdrop') as HTMLElement;
  const content = modal.querySelector('.journey-content') as HTMLElement;
  const isMobile = window.innerWidth <= 640;

  const animations: Animation[] = [];

  if (backdrop) {
    animations.push(
      backdrop.animate([{ opacity: '1' }, { opacity: '0' }], {
        duration: DURATION.NORMAL,
        easing: 'ease-out',
        fill: 'forwards',
      })
    );
  }

  if (content) {
    // Mobile: slide down (sheet-style)
    // Desktop: scale + fade out
    if (isMobile) {
      animations.push(
        content.animate(
          [
            { opacity: '1', transform: 'translateY(0)' },
            { opacity: '0', transform: 'translateY(100%)' },
          ],
          {
            duration: DURATION.NORMAL,
            easing: EASING.STANDARD,
            fill: 'forwards',
          }
        )
      );
    } else {
      animations.push(
        content.animate(
          [
            { opacity: '1', transform: 'scale(1) translateY(0)' },
            { opacity: '0', transform: 'scale(0.98) translateY(-10px)' },
          ],
          {
            duration: DURATION.NORMAL,
            easing: EASING.GENTLE,
            fill: 'forwards',
          }
        )
      );
    }
  }

  await Promise.all(animations.map((a) => a.finished));
}

// NOTE: Styles extracted to journey/styles.ts (~1,200 lines of CSS)
// Import: injectJourneyStyles() from './journey/styles.js'


// ============================================================================
// GLOBAL EVENT LISTENER - For backwards compatibility
// ============================================================================

// Listen for ferni:open-journey event (fired by stage-celebration.ui.ts fallback)
if (typeof window !== 'undefined') {
  window.addEventListener('ferni:open-journey', () => {
    openJourney();
  });
  
  // Expose journeyUI on window for E2E tests and external access
  (window as unknown as { journeyUI: typeof journeyUI }).journeyUI = {
    open: openJourney,
    close: closeJourney,
    toggle: toggleJourney,
    isOpen: () => isOpen,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const journeyUI = {
  open: openJourney,
  close: closeJourney,
  toggle: toggleJourney,
  isOpen: () => isOpen,
};

export default journeyUI;

