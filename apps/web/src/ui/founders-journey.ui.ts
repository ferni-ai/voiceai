/**
 * Founders Journey UI
 *
 * A story-driven experience showing Ferni's vision, roadmap, and the role
 * of founding members in building something meaningful together.
 *
 * DESIGN PHILOSOPHY:
 * - "You're not buying a product. You're joining a movement."
 * - Show the journey, not just the destination
 * - Make founders feel like co-creators, not customers
 * - Warm, human, brand-aligned
 *
 * SECTIONS:
 * 1. The Vision - Why Ferni exists
 * 2. Where We Are - Current state + recent wins
 * 3. Where We're Going - Roadmap highlights
 * 4. Your Impact - What founders enable
 * 5. The Founders Wall - Community of believers
 */

import { DURATION } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { roadmapService, STAGE_INFO } from '../services/roadmap.service.js';
import {
  fetchFounderStats,
  fetchFoundersWall,
  fetchFounderStories,
  fetchCommunityMilestones,
  fetchPersonalImpact,
  animateCounter,
  getSeasonalTheme,
  TIER_COLORS,
  BADGE_INFO,
  type Founder,
  type PersonalImpact,
} from '../services/founders.service.js';
import { appState } from '../state/app.state.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// Modular imports for cleaner organization
import { ICONS } from './founders-journey/icons.js';
import { injectFoundersJourneyStyles } from './founders-journey/styles.js';
import type { JourneyMilestone, SectionType, CachedFoundersData } from './founders-journey/types.js';

const log = createLogger('FoundersJourney');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// NOTE: ICONS are imported from ./founders-journey/icons.js
// NOTE: Types are imported from ./founders-journey/types.js
// NOTE: Styles are imported from ./founders-journey/styles.js

// Styles are injected via injectFoundersJourneyStyles function
let _styleElement: HTMLStyleElement | null = null;

// ============================================================================
// STATE
// ============================================================================

let overlay: HTMLElement | null = null;
let activeSection: SectionType = 'vision';
let previouslyFocusedElement: HTMLElement | null = null;
let currentStoryIndex = 0;
let storiesCarouselInterval: ReturnType<typeof setInterval> | null = null;
let cachedFoundersData: CachedFoundersData = {
  stats: null,
  founders: [],
  stories: [],
  milestones: [],
  personalImpact: null,
};

// ============================================================================
// ACCESSIBILITY
// ============================================================================

function saveFocus(): void {
  previouslyFocusedElement = document.activeElement as HTMLElement;
}

function restoreFocus(): void {
  previouslyFocusedElement?.focus();
  previouslyFocusedElement = null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ============================================================================
// DATA
// ============================================================================

// Timeline milestones - honest about where we are
// No fake dates, no manufactured history, no promised timelines
const JOURNEY_MILESTONES: JourneyMilestone[] = [
  {
    id: 'inception',
    date: '2024',
    title: 'Started Building',
    description: 'A small team asking: What if support was actually accessible?',
    type: 'past',
    icon: 'seed',
  },
  {
    id: 'ferni-born',
    date: 'Late 2024',
    title: 'First Version',
    description: 'Voice conversations work. Six coaches exist. Still rough around the edges.',
    type: 'past',
    icon: 'sprout',
  },
  {
    id: 'now',
    date: 'Now',
    title: "You're Here",
    description: "Early days. Lots to improve. Grateful you're giving us a shot.",
    type: 'present',
    icon: 'heart',
  },
  {
    id: 'stability',
    date: 'Next up',
    title: 'Making It Solid',
    description: 'Better voice quality, fewer bugs, faster responses. The basics, done well.',
    type: 'future',
    icon: 'check',
  },
  {
    id: 'features',
    date: 'After that',
    title: 'New Capabilities',
    description: "We have ideas. We'll share them when they're ready, not before.",
    type: 'future',
    icon: 'sparkles',
  },
];

/**
 * Preload all data for the founders journey
 */
async function preloadFoundersData(): Promise<void> {
  try {
    const userId = appState.get('firebaseUid');
    const [stats, founders, stories, milestones, personalImpact] = await Promise.all([
      fetchFounderStats(),
      fetchFoundersWall(),
      fetchFounderStories(),
      fetchCommunityMilestones(),
      userId ? fetchPersonalImpact(userId) : Promise.resolve(null),
    ]);
    cachedFoundersData = { stats, founders, stories, milestones, personalImpact };
  } catch (error) {
    log.warn('Failed to preload founders data', error);
  }
}

// ============================================================================
// MAIN API
// ============================================================================

export async function openFoundersJourney(): Promise<void> {
  saveFocus();
  injectStyles();
  cleanupOrphanedElements();

  // Preload all data
  await preloadFoundersData();

  overlay = createOverlay();
  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => {
    overlay?.classList.add('founders-journey--open');
    const closeBtn = overlay?.querySelector('.founders-journey-close') as HTMLElement;
    closeBtn?.focus();

    // Start animated counters after modal is visible
    trackedTimeout(() => startLiveCounters(), DURATION.SLOW);
  });
}

function closeFoundersJourney(): void {
  if (!overlay) return;

  overlay.classList.remove('founders-journey--open');

  // Clean up stories carousel
  if (storiesCarouselInterval) {
    clearInterval(storiesCarouselInterval);
    storiesCarouselInterval = null;
  }

  trackedTimeout(
    () => {
      overlay?.remove();
      overlay = null;
      restoreFocus();
      _clearAllTimeouts();
    },
    prefersReducedMotion() ? 0 : DURATION.SLOW
  );
}

export { closeFoundersJourney };

// ============================================================================
// CREATE OVERLAY
// ============================================================================

function createOverlay(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'founders-journey';
  container.setAttribute('role', 'dialog');
  container.setAttribute('aria-modal', 'true');
  container.setAttribute('aria-labelledby', 'founders-journey-title');

  container.innerHTML = `
    <div class="founders-journey-backdrop" aria-hidden="true"></div>
    <div class="founders-journey-card">
      <button class="founders-journey-close" aria-label="${t('common.close')}">${ICONS.close}</button>

      <!-- Hero Section -->
      <header class="founders-journey-hero">
        <div class="founders-journey-hero-icon">${ICONS.heart}</div>
        <span class="founders-journey-eyebrow">${t('foundersJourney.eyebrow')}</span>
        <h1 id="founders-journey-title" class="founders-journey-title">${t('foundersJourney.title')}</h1>
        <p class="founders-journey-subtitle">${t('foundersJourney.subtitle')}</p>
      </header>

      <!-- Navigation Tabs -->
      <nav class="founders-journey-nav" role="tablist" aria-label="${t('foundersJourney.navigation')}">
        <button role="tab" aria-selected="true" data-section="vision" class="founders-journey-tab founders-journey-tab--active">
          ${ICONS.compass}
          <span>${t('foundersJourney.tabs.vision')}</span>
        </button>
        <button role="tab" aria-selected="false" data-section="now" class="founders-journey-tab">
          ${ICONS.seed}
          <span>${t('foundersJourney.tabs.now')}</span>
        </button>
        <button role="tab" aria-selected="false" data-section="future" class="founders-journey-tab">
          ${ICONS.bloom}
          <span>${t('foundersJourney.tabs.future')}</span>
        </button>
        <button role="tab" aria-selected="false" data-section="impact" class="founders-journey-tab">
          ${ICONS.trophy}
          <span>${t('foundersJourney.tabs.impact')}</span>
        </button>
        <button role="tab" aria-selected="false" data-section="founders" class="founders-journey-tab">
          ${ICONS.crown}
          <span>${t('foundersJourney.tabs.founders')}</span>
        </button>
      </nav>

      <!-- Content Area -->
      <div class="founders-journey-content">
        ${renderVisionSection()}
      </div>

      <!-- Footer CTA -->
      <footer class="founders-journey-footer">
        <button class="founders-journey-cta" data-action="join">
          <span>${t('foundersJourney.cta.join')}</span>
          ${ICONS.arrowRight}
        </button>
        <p class="founders-journey-footer-note">${t('foundersJourney.footer.note')}</p>
      </footer>
    </div>
  `;

  // Bind events
  container.querySelector('.founders-journey-backdrop')?.addEventListener('click', closeFoundersJourney);
  container.querySelector('.founders-journey-close')?.addEventListener('click', closeFoundersJourney);

  // Tab navigation
  container.querySelectorAll('.founders-journey-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const section = (tab as HTMLElement).dataset.section as typeof activeSection;
      if (section) switchSection(container, section);
    });
  });

  // CTA button
  container.querySelector('[data-action="join"]')?.addEventListener('click', () => {
    closeFoundersJourney();
    // Dispatch event to open subscription modal
    document.dispatchEvent(new CustomEvent('ferni:open-support'));
  });

  // Escape key closes
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFoundersJourney();
  });

  return container;
}

function switchSection(container: HTMLElement, section: typeof activeSection): void {
  activeSection = section;

  // Update tab states
  container.querySelectorAll('.founders-journey-tab').forEach((tab) => {
    const tabSection = (tab as HTMLElement).dataset.section;
    const isActive = tabSection === section;
    tab.classList.toggle('founders-journey-tab--active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  // Render new content
  const contentArea = container.querySelector('.founders-journey-content');
  if (contentArea) {
    contentArea.innerHTML = getSectionContent(section);
    attachSectionListeners(container, section);
  }
}

function getSectionContent(section: typeof activeSection): string {
  switch (section) {
    case 'vision':
      return renderVisionSection();
    case 'now':
      return renderNowSection();
    case 'future':
      return renderFutureSection();
    case 'impact':
      return renderImpactSection();
    case 'founders':
      return renderFoundersWallSection();
    default:
      return renderVisionSection();
  }
}

function attachSectionListeners(container: HTMLElement, section: typeof activeSection): void {
  if (section === 'future') {
    // Roadmap feature cards
    container.querySelectorAll('[data-feature-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const featureId = (card as HTMLElement).dataset.featureId;
        if (featureId) {
          closeFoundersJourney();
          document.dispatchEvent(new CustomEvent('ferni:open-roadmap', { detail: { featureId } }));
        }
      });
    });
  }

  if (section === 'impact') {
    // Start stories carousel
    startStoriesCarousel(container);

    // Stories navigation
    container.querySelector('[data-action="prev-story"]')?.addEventListener('click', () => {
      navigateStory(container, 'prev');
    });
    container.querySelector('[data-action="next-story"]')?.addEventListener('click', () => {
      navigateStory(container, 'next');
    });

    // Animate counters
    trackedTimeout(() => animateImpactCounters(container), DURATION.NORMAL);
  }

  if (section === 'founders') {
    // Founder tile hover effects handled by CSS
    // But we can add click to view founder detail
    container.querySelectorAll('.founders-wall-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const founderId = (tile as HTMLElement).dataset.founderId;
        if (founderId) {
          showFounderDetail(container, founderId);
        }
      });
    });
  }
}

// ============================================================================
// SECTION RENDERERS
// ============================================================================

function renderVisionSection(): string {
  return `
    <section class="founders-section founders-section--vision">
      <div class="founders-vision-quote">
        <blockquote>
          "${t('foundersJourney.vision.quote')}"
        </blockquote>
      </div>

      <div class="founders-vision-principles">
        <h3 class="founders-section-subtitle">${t('foundersJourney.vision.principlesTitle')}</h3>
        
        <div class="founders-principle">
          <div class="founders-principle-icon">${ICONS.infinity}</div>
          <div class="founders-principle-content">
            <h4>${t('foundersJourney.vision.principles.free.title')}</h4>
            <p>${t('foundersJourney.vision.principles.free.description')}</p>
          </div>
        </div>

        <div class="founders-principle">
          <div class="founders-principle-icon">${ICONS.users}</div>
          <div class="founders-principle-content">
            <h4>${t('foundersJourney.vision.principles.community.title')}</h4>
            <p>${t('foundersJourney.vision.principles.community.description')}</p>
          </div>
        </div>

        <div class="founders-principle">
          <div class="founders-principle-icon">${ICONS.heart}</div>
          <div class="founders-principle-content">
            <h4>${t('foundersJourney.vision.principles.human.title')}</h4>
            <p>${t('foundersJourney.vision.principles.human.description')}</p>
          </div>
        </div>
      </div>

      <div class="founders-vision-promise">
        <p class="founders-vision-promise-text">
          ${t('foundersJourney.vision.promise')}
        </p>
      </div>
    </section>
  `;
}

function renderNowSection(): string {
  const recentWins = [
    { icon: 'check', text: t('foundersJourney.now.wins.memory') },
    { icon: 'check', text: t('foundersJourney.now.wins.team') },
    { icon: 'check', text: t('foundersJourney.now.wins.voice') },
    { icon: 'check', text: t('foundersJourney.now.wins.music') },
  ];

  return `
    <section class="founders-section founders-section--now">
      <div class="founders-now-intro">
        <h3 class="founders-section-subtitle">${t('foundersJourney.now.title')}</h3>
        <p>${t('foundersJourney.now.description')}</p>
      </div>

      <div class="founders-timeline">
        ${JOURNEY_MILESTONES.filter((m) => m.type !== 'future')
          .map(
            (milestone) => `
          <div class="founders-timeline-item founders-timeline-item--${milestone.type}">
            <div class="founders-timeline-marker">
              <div class="founders-timeline-icon">${ICONS[milestone.icon as keyof typeof ICONS] || ICONS.seed}</div>
            </div>
            <div class="founders-timeline-content">
              <span class="founders-timeline-date">${milestone.date}</span>
              <h4 class="founders-timeline-title">${milestone.title}</h4>
              <p class="founders-timeline-desc">${milestone.description}</p>
            </div>
          </div>
        `
          )
          .join('')}
      </div>

      <div class="founders-now-wins">
        <h4 class="founders-wins-title">${t('foundersJourney.now.winsTitle')}</h4>
        <ul class="founders-wins-list">
          ${recentWins.map((win) => `
            <li class="founders-win-item">
              <span class="founders-win-icon">${ICONS.check}</span>
              <span>${win.text}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    </section>
  `;
}

function renderFutureSection(): string {
  const features = roadmapService.getAllFeatures().slice(0, 4);

  return `
    <section class="founders-section founders-section--future">
      <div class="founders-future-intro">
        <h3 class="founders-section-subtitle">${t('foundersJourney.future.title')}</h3>
        <p>${t('foundersJourney.future.description')}</p>
      </div>

      <div class="founders-future-timeline">
        ${JOURNEY_MILESTONES.filter((m) => m.type === 'future')
          .map(
            (milestone) => `
          <div class="founders-timeline-item founders-timeline-item--future">
            <div class="founders-timeline-marker">
              <div class="founders-timeline-icon">${ICONS[milestone.icon as keyof typeof ICONS] || ICONS.bloom}</div>
            </div>
            <div class="founders-timeline-content">
              <span class="founders-timeline-date">${milestone.date}</span>
              <h4 class="founders-timeline-title">${milestone.title}</h4>
              <p class="founders-timeline-desc">${milestone.description}</p>
            </div>
          </div>
        `
          )
          .join('')}
      </div>

      <div class="founders-future-features">
        <h4 class="founders-features-title">${t('foundersJourney.future.featuresTitle')}</h4>
        <div class="founders-feature-cards">
          ${features
            .map(
              (feature) => `
            <button class="founders-feature-card" data-feature-id="${feature.id}">
              <div class="founders-feature-stage founders-feature-stage--${feature.stage}">
                ${STAGE_INFO[feature.stage].label}
              </div>
              <h5 class="founders-feature-headline">${feature.headline}</h5>
              <p class="founders-feature-desc">${feature.description.slice(0, 80)}...</p>
              <span class="founders-feature-arrival">${feature.estimatedArrival}</span>
            </button>
          `
            )
            .join('')}
        </div>
        <button class="founders-see-all" data-action="see-roadmap">
          ${t('foundersJourney.future.seeAll')} ${ICONS.arrowRight}
        </button>
      </div>
    </section>
  `;
}

function renderImpactSection(): string {
  const stats = cachedFoundersData.stats;
  const stories = cachedFoundersData.stories;
  const personal = cachedFoundersData.personalImpact;
  const milestones = cachedFoundersData.milestones;
  const season = getSeasonalTheme();

  // Calculate next milestone
  const nextMilestone = milestones.find((m) => !m.reached);
  const milestoneProgress = nextMilestone
    ? Math.min(100, (nextMilestone.current / nextMilestone.target) * 100)
    : 100;

  // Honest numbers: show real values, 0 is fine
  const founderCount = stats?.totalFounders || 0;
  const conversationCount = stats?.conversationsSupported || 0;
  const featureCount = stats?.featuresUnlocked?.length || 0;
  const newThisMonth = stats?.thisMonthFounders || 0;

  return `
    <section class="founders-section founders-section--impact" data-season="${season.season}">
      <!-- Seasonal Header -->
      <div class="founders-season-badge">
        <span class="founders-season-icon">${ICONS[season.icon as keyof typeof ICONS] || ICONS.seed}</span>
        <span class="founders-season-name">${season.name}</span>
      </div>

      <div class="founders-impact-intro">
        <h3 class="founders-section-subtitle">${t('foundersJourney.impact.title')}</h3>
        <p>${t('foundersJourney.impact.description')}</p>
      </div>

      <!-- Honest Counters -->
      <div class="founders-impact-stats ${founderCount === 0 ? 'founders-impact-stats--empty' : 'founders-impact-stats--live'}">
        <div class="founders-impact-stat">
          <div class="founders-impact-stat-value" data-stat="founders" data-end="${founderCount}" data-format="number">${founderCount}</div>
          <div class="founders-impact-stat-label">${t('foundersJourney.impact.stats.founders')}</div>
          ${newThisMonth > 0 ? `<div class="founders-impact-stat-live">+${newThisMonth} this month</div>` : ''}
        </div>
        <div class="founders-impact-stat">
          <div class="founders-impact-stat-value" data-stat="conversations" data-end="${conversationCount}" data-format="compact">${conversationCount}</div>
          <div class="founders-impact-stat-label">${t('foundersJourney.impact.stats.conversations')}</div>
        </div>
        <div class="founders-impact-stat">
          <div class="founders-impact-stat-value" data-stat="features" data-end="${featureCount}" data-format="number">${featureCount}</div>
          <div class="founders-impact-stat-label">${t('foundersJourney.impact.stats.features')}</div>
        </div>
      </div>

      ${personal ? renderPersonalImpactCard(personal) : ''}

      <!-- Community Milestone Progress -->
      ${nextMilestone ? `
      <div class="founders-milestone-progress">
        <div class="founders-milestone-header">
          <span class="founders-milestone-icon">${ICONS.milestone}</span>
          <span class="founders-milestone-title">${t('foundersJourney.impact.nextMilestone')}</span>
        </div>
        <div class="founders-milestone-target">${nextMilestone.title}</div>
        <div class="founders-milestone-bar">
          <div class="founders-milestone-fill" style="width: ${milestoneProgress}%"></div>
        </div>
        <div class="founders-milestone-meta">
          <span>${nextMilestone.current.toLocaleString()} / ${nextMilestone.target.toLocaleString()}</span>
          <span class="founders-milestone-reward">${nextMilestone.celebration}</span>
        </div>
      </div>
      ` : ''}

      <!-- Stories Section - Only show if we have real stories -->
      ${stories.length > 0 ? `
      <div class="founders-stories-carousel">
        <h4 class="founders-stories-title">
          ${ICONS.quote}
          <span>${t('foundersJourney.impact.storiesTitle')}</span>
        </h4>
        
        <div class="founders-stories-slider">
          ${stories.map((story, i) => `
            <div class="founders-story-slide ${i === 0 ? 'founders-story-slide--active' : ''}" data-story-index="${i}">
              <blockquote class="founders-story-quote">"${story.quote}"</blockquote>
              <cite class="founders-story-cite">— ${story.attribution}</cite>
            </div>
          `).join('')}
        </div>

        <div class="founders-stories-controls">
          <button class="founders-stories-nav" data-action="prev-story" aria-label="Previous story">
            ${ICONS.chevronLeft}
          </button>
          <div class="founders-stories-dots">
            ${stories.map((_, i) => `
              <button class="founders-stories-dot ${i === 0 ? 'founders-stories-dot--active' : ''}" 
                      data-story-index="${i}" aria-label="Go to story ${i + 1}"></button>
            `).join('')}
          </div>
          <button class="founders-stories-nav" data-action="next-story" aria-label="Next story">
            ${ICONS.chevronRight}
          </button>
        </div>
      </div>
      ` : `
      <div class="founders-stories-empty">
        <p class="founders-stories-empty-text">${t('foundersJourney.impact.noStories')}</p>
      </div>
      `}

      <div class="founders-impact-cta">
        <p class="founders-impact-cta-text">${t('foundersJourney.impact.ctaText')}</p>
      </div>
    </section>
  `;
}

function renderPersonalImpactCard(impact: PersonalImpact): string {
  return `
    <div class="founders-personal-impact">
      <div class="founders-personal-header">
        <span class="founders-personal-icon">${ICONS.gift}</span>
        <span class="founders-personal-title">${t('foundersJourney.impact.yourImpact')}</span>
      </div>
      <div class="founders-personal-stats">
        <div class="founders-personal-stat">
          <span class="founders-personal-value">${impact.conversationsEnabled.toLocaleString()}</span>
          <span class="founders-personal-label">${t('foundersJourney.impact.personal.conversations')}</span>
        </div>
        <div class="founders-personal-stat">
          <span class="founders-personal-value">${impact.impact.familiesHelped}</span>
          <span class="founders-personal-label">${t('foundersJourney.impact.personal.families')}</span>
        </div>
        <div class="founders-personal-stat">
          <span class="founders-personal-value">${impact.streak}</span>
          <span class="founders-personal-label">${t('foundersJourney.impact.personal.streak')}</span>
        </div>
      </div>
      ${impact.badges.length > 0 ? `
        <div class="founders-personal-badges">
          ${impact.badges.map((badge) => `
            <div class="founders-personal-badge" title="${badge.description}">
              <span class="founders-badge-icon">${badge.icon}</span>
              <span class="founders-badge-name">${badge.name}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <p class="founders-personal-thanks">${t('foundersJourney.impact.personal.thanks')}</p>
    </div>
  `;
}

function renderFoundersWallSection(): string {
  const founders = cachedFoundersData.founders;
  const stats = cachedFoundersData.stats;
  const milestones = cachedFoundersData.milestones.filter((m) => m.reached);

  // Group founders by tier
  const tierGroups = {
    forest: founders.filter((f) => f.tier === 'forest'),
    tree: founders.filter((f) => f.tier === 'tree'),
    sprout: founders.filter((f) => f.tier === 'sprout'),
    seed: founders.filter((f) => f.tier === 'seed'),
  };

  const hasFounders = founders.length > 0;
  const totalCount = stats?.totalFounders || founders.length;

  return `
    <section class="founders-section founders-section--founders-wall">
      <div class="founders-wall-intro">
        <h3 class="founders-section-subtitle">${t('foundersJourney.founders.title')}</h3>
        <p>${t('foundersJourney.founders.description')}</p>
      </div>

      ${milestones.length > 0 ? `
      <!-- Milestone Badges - only show if we've reached any -->
      <div class="founders-achieved-milestones">
        ${milestones.map((m) => `
          <div class="founders-achieved-badge">
            <span class="founders-achieved-icon">${ICONS.check}</span>
            <span class="founders-achieved-text">${m.title}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <!-- The Wall -->
      ${hasFounders ? `
      <div class="founders-wall">
        ${Object.entries(tierGroups).map(([tier, members]) => members.length > 0 ? `
          <div class="founders-wall-tier">
            <h4 class="founders-wall-tier-title">
              ${getTierIcon(tier as Founder['tier'])}
              <span>${t(`foundersJourney.founders.tiers.${tier}`)}</span>
              <span class="founders-wall-tier-count">${members.length}</span>
            </h4>
            <div class="founders-wall-grid">
              ${members.map((founder) => renderFounderTile(founder)).join('')}
            </div>
          </div>
        ` : '').join('')}
      </div>
      ` : `
      <div class="founders-wall-empty">
        <div class="founders-wall-empty-icon">${ICONS.seed}</div>
        <p class="founders-wall-empty-text">${t('foundersJourney.founders.empty')}</p>
      </div>
      `}

      <!-- Join the Wall CTA -->
      <div class="founders-wall-join">
        <p class="founders-wall-join-text">${t('foundersJourney.founders.joinCta')}</p>
        ${totalCount > 0 ? `
        <div class="founders-wall-stats">
          <span class="founders-wall-count">${totalCount}</span>
          <span class="founders-wall-label">${t('foundersJourney.founders.believers')}</span>
        </div>
        ` : ''}
      </div>
    </section>
  `;
}

function renderFounderTile(founder: Founder): string {
  const colors = TIER_COLORS[founder.tier];
  const badgeInfo = founder.badge ? BADGE_INFO[founder.badge] : null;

  return `
    <div class="founders-wall-tile" 
         data-founder-id="${founder.id}" 
         data-tier="${founder.tier}"
         style="--tile-bg: ${colors.bg}; --tile-border: ${colors.border}; --tile-text: ${colors.text}">
      <div class="founders-tile-avatar">
        ${founder.avatar 
          ? `<img src="${founder.avatar}" alt="${founder.displayName || 'Anonymous'}" />`
          : `<span class="founders-tile-initials">${founder.initials}</span>`
        }
        ${founder.isEarlyBird ? `<span class="founders-tile-early" title="Early bird">⭐</span>` : ''}
      </div>
      <div class="founders-tile-info">
        <span class="founders-tile-name">${founder.displayName || 'Anonymous'}</span>
        ${badgeInfo ? `
          <span class="founders-tile-badge" title="${badgeInfo.description}">
            ${badgeInfo.icon} ${badgeInfo.label}
          </span>
        ` : ''}
      </div>
    </div>
  `;
}

function getTierIcon(tier: Founder['tier']): string {
  const icons = {
    seed: ICONS.seed,
    sprout: ICONS.sprout,
    tree: ICONS.bloom,
    forest: ICONS.crown,
  };
  return icons[tier] || ICONS.seed;
}

// ============================================================================
// ANIMATED COUNTERS & CAROUSEL
// ============================================================================

function startLiveCounters(): void {
  if (!overlay) return;

  const statElements = overlay.querySelectorAll<HTMLElement>('.founders-impact-stat-value[data-end]');
  statElements.forEach((el) => {
    const endValue = parseInt(el.dataset.end || '0', 10);
    const format = (el.dataset.format || 'number') as 'number' | 'compact' | 'percentage';

    animateCounter(el, {
      start: 0,
      end: endValue,
      duration: 1500,
      format,
    });
  });
}

function animateImpactCounters(container: HTMLElement): void {
  const statElements = container.querySelectorAll<HTMLElement>('.founders-impact-stat-value[data-end]');
  statElements.forEach((el, index) => {
    const endValue = parseInt(el.dataset.end || '0', 10);
    const format = (el.dataset.format || 'number') as 'number' | 'compact' | 'percentage';

    // Stagger the animations
    trackedTimeout(() => {
      animateCounter(el, {
        start: 0,
        end: endValue,
        duration: 1200,
        format,
      });
    }, index * 150);
  });
}

function startStoriesCarousel(container: HTMLElement): void {
  // Clean up existing interval
  if (storiesCarouselInterval) {
    clearInterval(storiesCarouselInterval);
  }

  // Auto-advance every 6 seconds
  storiesCarouselInterval = setInterval(() => {
    navigateStory(container, 'next');
  }, 6000);
}

function navigateStory(container: HTMLElement, direction: 'prev' | 'next'): void {
  const stories = cachedFoundersData.stories;
  if (stories.length === 0) return;

  // Update index
  if (direction === 'next') {
    currentStoryIndex = (currentStoryIndex + 1) % stories.length;
  } else {
    currentStoryIndex = (currentStoryIndex - 1 + stories.length) % stories.length;
  }

  // Update active slide
  const slides = container.querySelectorAll('.founders-story-slide');
  slides.forEach((slide, i) => {
    slide.classList.toggle('founders-story-slide--active', i === currentStoryIndex);
  });

  // Update dots
  const dots = container.querySelectorAll('.founders-stories-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('founders-stories-dot--active', i === currentStoryIndex);
  });

  // Reset auto-advance timer
  if (storiesCarouselInterval) {
    clearInterval(storiesCarouselInterval);
    storiesCarouselInterval = setInterval(() => {
      navigateStory(container, 'next');
    }, 6000);
  }
}

function showFounderDetail(container: HTMLElement, founderId: string): void {
  const founder = cachedFoundersData.founders.find((f) => f.id === founderId);
  if (!founder) return;

  // For now, just add a subtle highlight effect
  const tile = container.querySelector(`[data-founder-id="${founderId}"]`);
  if (tile) {
    tile.classList.add('founders-tile--highlighted');
    trackedTimeout(() => {
      tile.classList.remove('founders-tile--highlighted');
    }, 1000);
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.founders-journey').forEach((el) => el.remove());
  if (storiesCarouselInterval) {
    clearInterval(storiesCarouselInterval);
    storiesCarouselInterval = null;
  }
  currentStoryIndex = 0;
}

// ============================================================================
// STYLES (Imported from modular styles file)
// ============================================================================

function injectStyles(): void {
  _styleElement = injectFoundersJourneyStyles();
}

// ============================================================================
// EXPORTS
// ============================================================================

export const foundersJourneyUI = {
  open: openFoundersJourney,
  close: closeFoundersJourney,
};

export default foundersJourneyUI;

