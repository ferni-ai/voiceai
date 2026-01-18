/**
 * Your Story Dashboard
 *
 * A narrative-focused dashboard that tells the user's story through
 * 9 cross-platform visualizations, consolidated analytics, and milestones.
 *
 * Replaces the old insights-hub.ui.ts with a unified, scrollable view
 * that shows life unfolding over time.
 *
 * @module ui/your-story-dashboard
 */

import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { prefersReducedMotion } from '../utils/accessibility.js';
import { t } from '../i18n/index.js';
import {
  createDeviceAdapter,
  injectVisualizationStyles,
  type YourStoryData,
} from './visualizations/index.js';
import { DURATION, EASING } from './visualizations/utils/dom.js';

const log = createLogger('YourStoryDashboard');
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface YourStoryCallbacks {
  onClose?: () => void;
}

interface ShowOptions {
  showDemoBanner?: boolean;
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: YourStoryUI | null = null;

export function getYourStoryUI(): YourStoryUI {
  if (!instance) {
    instance = new YourStoryUI();
  }
  return instance;
}

export function showYourStory(data: YourStoryData, options?: ShowOptions): void {
  getYourStoryUI().show(data, options);
}

export function hideYourStory(): void {
  getYourStoryUI().hide();
}

// ============================================================================
// DOM HELPERS
// ============================================================================

function el(tag: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

function svg(iconName: string): SVGElement {
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('width', '20');
  svgEl.setAttribute('height', '20');
  svgEl.setAttribute('viewBox', '0 0 24 24');
  svgEl.setAttribute('fill', 'none');
  svgEl.setAttribute('stroke', 'currentColor');
  svgEl.setAttribute('stroke-width', '1.5');

  const paths: Record<string, string[]> = {
    close: ['M18 6L6 18', 'M6 6L18 18'],
    calendar: ['M3 4h18v18H3z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
    chat: ['M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'],
    flame: ['M12 22c4-2.5 6-5.5 6-9 0-3-1.5-4.5-3-6-1.5-1.5-3-3-3-6 0 3-1.5 4.5-3 6s-3 3-3 6c0 3.5 2 6.5 6 9z'],
    check: ['M9 12l2 2 4-4'],
    sparkles: ['M12 2v4', 'M12 18v4', 'M4.93 4.93l2.83 2.83', 'M16.24 16.24l2.83 2.83', 'M2 12h4', 'M18 12h4', 'M4.93 19.07l2.83-2.83', 'M16.24 7.76l2.83-2.83'],
  };

  const iconPaths = paths[iconName] || [];
  for (const d of iconPaths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svgEl.appendChild(path);
  }

  if (iconName === 'check') {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '10');
    svgEl.insertBefore(circle, svgEl.firstChild);
  }

  return svgEl;
}

// ============================================================================
// UI CLASS
// ============================================================================

class YourStoryUI {
  private panel: HTMLElement | null = null;
  private callbacks: YourStoryCallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private deviceAdapter = createDeviceAdapter();

  setCallbacks(callbacks: YourStoryCallbacks): void {
    this.callbacks = callbacks;
  }

  show(data: YourStoryData, options: ShowOptions = {}): void {
    this.initialize();
    if (!this.panel) return;

    log.debug({ userId: data.userId }, 'Showing Your Story dashboard');

    this.renderContent(data, options);
    this.panel.classList.add('your-story--visible');
    this.isVisible = true;

    trackedTimeout(() => {
      this.panel?.querySelector<HTMLElement>('.your-story__close')?.focus();
    }, 100);
  }

  showLoading(): void {
    this.initialize();
    if (!this.panel) return;

    const content = this.panel.querySelector('.your-story__content');
    if (content) {
      content.textContent = '';

      // Build skeleton loading state matching dashboard shape
      const skeleton = el('div', 'your-story__skeleton');

      // Skeleton header
      const headerSkel = el('div', 'your-story__skeleton-header');

      // Title skeleton
      const titleSkel = el('div', 'your-story__skeleton-line your-story__skeleton-line--title');
      const subtitleSkel = el('div', 'your-story__skeleton-line your-story__skeleton-line--subtitle');
      headerSkel.appendChild(titleSkel);
      headerSkel.appendChild(subtitleSkel);

      // Stats skeleton (3 cards)
      const statsSkel = el('div', 'your-story__skeleton-stats');
      for (let i = 0; i < 3; i++) {
        const statSkel = el('div', 'your-story__skeleton-stat');
        statsSkel.appendChild(statSkel);
      }
      headerSkel.appendChild(statsSkel);

      // Stage skeleton
      const stageSkel = el('div', 'your-story__skeleton-stage');
      const stageLineSkel = el('div', 'your-story__skeleton-line your-story__skeleton-line--short');
      const stageBarSkel = el('div', 'your-story__skeleton-progress');
      stageSkel.appendChild(stageLineSkel);
      stageSkel.appendChild(stageBarSkel);
      headerSkel.appendChild(stageSkel);

      skeleton.appendChild(headerSkel);

      // Section skeletons (3 sections)
      for (let i = 0; i < 3; i++) {
        const sectionSkel = el('div', 'your-story__skeleton-section');

        // Section title
        const sectionTitleSkel = el('div', 'your-story__skeleton-line your-story__skeleton-line--section-title');
        sectionSkel.appendChild(sectionTitleSkel);

        // Visualization cards (2x2 grid)
        const vizGridSkel = el('div', 'your-story__skeleton-viz-grid');
        for (let j = 0; j < 4; j++) {
          const vizCardSkel = el('div', 'your-story__skeleton-viz-card');
          vizGridSkel.appendChild(vizCardSkel);
        }
        sectionSkel.appendChild(vizGridSkel);

        skeleton.appendChild(sectionSkel);
      }

      // Loading indicator text
      const loadingText = el('div', 'your-story__loading-text');
      loadingText.textContent = t('yourStory.loading') || 'Loading your story...';
      skeleton.appendChild(loadingText);

      content.appendChild(skeleton);
    }

    this.panel.classList.add('your-story--visible');
    this.isVisible = true;
  }

  hide(): void {
    if (!this.panel) return;
    this.panel.classList.remove('your-story--visible');
    this.isVisible = false;
    trackedTimeout(
      () => this.callbacks.onClose?.(),
      prefersReducedMotion() ? 0 : DURATION.NORMAL
    );
  }

  toggle(data?: YourStoryData): void {
    if (this.isVisible) {
      this.hide();
    } else if (data) {
      this.show(data);
    }
  }

  destroy(): void {
    clearAllTimeouts();
    this.hide();
    this.panel?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.styleElement = null;
    instance = null;
  }

  private initialize(): void {
    if (this.panel) return;
    document.querySelectorAll('.your-story').forEach((e) => e.remove());
    this.injectStyles();
    this.createPanel();
  }

  private createPanel(): void {
    this.panel = el('div', 'your-story');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', t('yourStory.aria.dashboard') || 'Your Story Dashboard');

    const backdrop = el('div', 'your-story__backdrop');
    backdrop.addEventListener('click', () => this.hide());

    const card = el('div', 'your-story__card');
    const content = el('div', 'your-story__content');
    card.appendChild(content);

    this.panel.appendChild(backdrop);
    this.panel.appendChild(card);
    document.body.appendChild(this.panel);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) this.hide();
    });
  }

  private renderContent(data: YourStoryData, options: ShowOptions): void {
    const content = this.panel?.querySelector('.your-story__content');
    if (!content) return;
    content.textContent = '';

    content.appendChild(this.buildHeader(data));
    if (options.showDemoBanner) {
      content.appendChild(this.buildDemoBanner());
    }
    content.appendChild(this.buildSections(data));
    this.renderVisualizations(data);
  }

  private buildHeader(data: YourStoryData): HTMLElement {
    const header = el('header', 'your-story__header');

    // Top row
    const top = el('div', 'your-story__header-top');
    const titleGroup = el('div');
    const title = el('h2', 'your-story__title');
    title.textContent = this.getTimeGreeting();
    const subtitle = el('p', 'your-story__subtitle');
    subtitle.textContent = t('yourStory.subtitle') || "Here's your story so far";
    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const closeBtn = el('button', 'your-story__close') as HTMLButtonElement;
    closeBtn.setAttribute('aria-label', t('yourStory.aria.close') || 'Close');
    closeBtn.appendChild(svg('close'));
    closeBtn.addEventListener('click', () => this.hide());

    top.appendChild(titleGroup);
    top.appendChild(closeBtn);
    header.appendChild(top);

    // Stats row
    const stats = el('div', 'your-story__stats');
    const statItems = [
      { icon: 'calendar', value: data.analytics.daysTogether, label: t('yourStory.stats.daysTogether') || 'days together' },
      { icon: 'chat', value: data.analytics.conversations, label: t('yourStory.stats.conversations') || 'conversations' },
      { icon: 'flame', value: data.analytics.streak, label: t('yourStory.stats.dayStreak') || 'day streak' },
    ];
    for (const item of statItems) {
      const stat = el('div', 'your-story__stat');
      stat.appendChild(svg(item.icon));
      const value = el('span', 'your-story__stat-value');
      value.textContent = String(item.value);
      const label = el('span', 'your-story__stat-label');
      label.textContent = item.label;
      stat.appendChild(value);
      stat.appendChild(label);
      stats.appendChild(stat);
    }
    header.appendChild(stats);

    // Stage - Enhanced with progress percentage
    const stage = el('div', 'your-story__stage');
    const stageInfo = el('div', 'your-story__stage-info');
    const stageName = el('span', 'your-story__stage-name');
    stageName.textContent = data.stage.name;
    const stageTagline = el('span', 'your-story__stage-tagline');
    stageTagline.textContent = data.stage.tagline;
    stageInfo.appendChild(stageName);
    stageInfo.appendChild(stageTagline);
    const stageProgress = el('div', 'your-story__stage-progress');
    // Add progress percentage as data attribute for CSS display
    const progressPercent = Math.round(data.stage.progress * 100);
    stageProgress.setAttribute('data-progress', `${progressPercent}%`);
    const stageBar = el('div', 'your-story__stage-bar');
    stageBar.style.width = `${progressPercent}%`;
    stageProgress.appendChild(stageBar);
    stage.appendChild(stageInfo);
    stage.appendChild(stageProgress);
    header.appendChild(stage);

    // Milestones
    if (data.milestones.length > 0) {
      const milestones = el('div', 'your-story__milestones');
      for (const m of data.milestones.slice(0, 3)) {
        const badge = el('span', 'your-story__milestone');
        badge.title = m.name;
        badge.appendChild(svg('check'));
        const text = document.createTextNode(m.name);
        badge.appendChild(text);
        milestones.appendChild(badge);
      }
      header.appendChild(milestones);
    }

    return header;
  }

  private buildDemoBanner(): HTMLElement {
    const banner = el('div', 'your-story__demo-banner');
    banner.appendChild(svg('sparkles'));
    const p = el('p');
    p.textContent = t('yourStory.demo.banner') || "Here's a glimpse of the story we could write together. Start a conversation to begin yours.";
    banner.appendChild(p);
    return banner;
  }

  private buildSections(data: YourStoryData): HTMLElement {
    const sections = el('div', 'your-story__sections');
    sections.appendChild(this.buildRightNowSection(data));
    sections.appendChild(this.buildGrowthSection(data));
    sections.appendChild(this.buildWorldSection(data));
    return sections;
  }

  private buildRightNowSection(data: YourStoryData): HTMLElement {
    const section = el('section', 'your-story__section');
    const title = el('h3', 'your-story__section-title');
    title.textContent = t('yourStory.sections.rightNow') || 'Right Now';
    section.appendChild(title);

    const hero = el('div', 'your-story__hero-viz');
    hero.id = 'viz-energy-rings';
    hero.setAttribute('data-viz', 'energy-rings');
    section.appendChild(hero);

    const row = el('div', 'your-story__viz-row');
    const mood = el('div', 'your-story__compact-viz');
    mood.id = 'viz-mood-calendar';
    mood.setAttribute('data-viz', 'mood-calendar');
    const burnout = el('div', 'your-story__compact-viz');
    burnout.id = 'viz-burnout-gauge';
    burnout.setAttribute('data-viz', 'burnout-gauge');
    row.appendChild(mood);
    row.appendChild(burnout);
    section.appendChild(row);

    const insight = el('p', 'your-story__insight');
    const dominantMood = data.moodCalendar?.summary?.dominantMood ?? 'calm';
    const moodSummaryTemplate = t('yourStory.insights.moodSummary') || "You've been feeling mostly {mood} this week";
    insight.textContent = moodSummaryTemplate.replace('{mood}', dominantMood);
    section.appendChild(insight);

    return section;
  }

  private buildGrowthSection(data: YourStoryData): HTMLElement {
    const section = el('section', 'your-story__section');
    const title = el('h3', 'your-story__section-title');
    title.textContent = t('yourStory.sections.yourGrowth') || 'Your Growth';
    section.appendChild(title);

    const hero = el('div', 'your-story__hero-viz');
    hero.id = 'viz-life-timeline';
    hero.setAttribute('data-viz', 'life-timeline');
    section.appendChild(hero);

    const row = el('div', 'your-story__viz-row');
    const radar = el('div', 'your-story__compact-viz');
    radar.id = 'viz-growth-radar';
    radar.setAttribute('data-viz', 'growth-radar');
    const arcs = el('div', 'your-story__compact-viz');
    arcs.id = 'viz-emotional-arcs';
    arcs.setAttribute('data-viz', 'emotional-arcs');
    row.appendChild(radar);
    row.appendChild(arcs);
    section.appendChild(row);

    const insight = el('p', 'your-story__insight');
    const chapter = data.lifeTimeline?.currentChapter?.title ?? (t('yourStory.fallbacks.chapter') ?? 'Your Journey');
    const focus = data.growthRadar?.focusArea ?? (t('yourStory.fallbacks.focus') ?? 'growth');
    const chapterFocusTemplate = t('yourStory.insights.chapterFocus') || 'Current chapter: {chapter} | Focus area: {focus}';
    insight.textContent = chapterFocusTemplate.replace('{chapter}', chapter).replace('{focus}', focus);
    section.appendChild(insight);

    return section;
  }

  private buildWorldSection(data: YourStoryData): HTMLElement {
    const section = el('section', 'your-story__section');
    const title = el('h3', 'your-story__section-title');
    title.textContent = t('yourStory.sections.yourWorld') || 'Your World';
    section.appendChild(title);

    const hero = el('div', 'your-story__hero-viz');
    hero.id = 'viz-relationship-network';
    hero.setAttribute('data-viz', 'relationship-network');
    section.appendChild(hero);

    const row = el('div', 'your-story__viz-row');
    const loops = el('div', 'your-story__compact-viz');
    loops.id = 'viz-open-loops';
    loops.setAttribute('data-viz', 'open-loops');
    const preds = el('div', 'your-story__compact-viz');
    preds.id = 'viz-predictions';
    preds.setAttribute('data-viz', 'predictions');
    row.appendChild(loops);
    row.appendChild(preds);
    section.appendChild(row);

    const insight = el('p', 'your-story__insight');
    const active = data.relationshipNetwork?.activeConnections || 0;
    const open = data.openLoops?.totalOpen || 0;
    const connectionsTemplate = t('yourStory.insights.connections') || '{active} active connections | {open} open loops';
    insight.textContent = connectionsTemplate.replace('{active}', String(active)).replace('{open}', String(open));
    section.appendChild(insight);

    return section;
  }

  private renderVisualizations(data: YourStoryData): void {
    // Render each visualization if data is present
    // The device adapter handles rendering based on type
    const visualizations = [
      { id: 'viz-energy-rings', type: 'energy-rings' as const, getData: () => data.energyRings },
      { id: 'viz-mood-calendar', type: 'mood-calendar' as const, getData: () => data.moodCalendar },
      { id: 'viz-burnout-gauge', type: 'burnout-gauge' as const, getData: () => data.burnoutGauge },
      { id: 'viz-life-timeline', type: 'life-timeline' as const, getData: () => data.lifeTimeline },
      { id: 'viz-growth-radar', type: 'growth-radar' as const, getData: () => data.growthRadar },
      { id: 'viz-emotional-arcs', type: 'emotional-arcs' as const, getData: () => data.emotionalArcs },
      { id: 'viz-relationship-network', type: 'relationship-network' as const, getData: () => data.relationshipNetwork },
      { id: 'viz-open-loops', type: 'open-loops' as const, getData: () => data.openLoops },
      { id: 'viz-predictions', type: 'predictions' as const, getData: () => data.predictions },
    ];

    for (const viz of visualizations) {
      const container = this.panel?.querySelector(`#${viz.id}`);
      const vizData = viz.getData();
      if (container && vizData) {
        this.deviceAdapter.render(
          container as HTMLElement,
          viz.type,
          vizData
        );
      }
    }
  }

  private getTimeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return t('yourStory.greeting.morning') || 'Good morning';
    if (hour < 17) return t('yourStory.greeting.afternoon') || 'Good afternoon';
    return t('yourStory.greeting.evening') || 'Good evening';
  }

  private injectStyles(): void {
    // Inject shared visualization component styles
    injectVisualizationStyles();

    if (document.getElementById('your-story-styles')) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'your-story-styles';
    // MA (間) spacing philosophy: breath=8px, pause=13px, rest=21px, silence=34px, meditation=55px
    // Golden ratio typography: sectionTitle=1.5rem, cardTitle=1.0625rem, body=0.9375rem
    // Pixar-inspired easings: spring, playful, organic
    this.styleElement.textContent = `
      /* ========================================================================
         YOUR STORY DASHBOARD - Design System Aligned
         Inspired by: MA (間), Golden Ratio, Pixar animation principles
         ======================================================================== */

      .your-story {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 2100);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms cubic-bezier(0.4, 0, 0.2, 1);
      }

      .your-story--visible {
        opacity: 1;
        visibility: visible;
      }

      /* Backdrop */
      .your-story__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }

      /* Card with Liquid Glass Aesthetic */
      .your-story__card {
        position: relative;
        width: min(95%, 52rem); /* 832px - container 5xl */
        max-height: 90vh;
        background: var(--color-bg-elevated, #ffffff);
        border-radius: var(--radius-2xl, 1.5rem);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.15));
        overflow: hidden;
        transform: translateY(1.25rem) scale(0.96);
        opacity: 0;
        /* Pixar-inspired spring entrance */
        transition:
          transform ${DURATION.MODERATE}ms cubic-bezier(0.34, 1.56, 0.64, 1),
          opacity ${DURATION.SLOW}ms cubic-bezier(0.4, 0, 0.2, 1);
      }

      .your-story--visible .your-story__card {
        transform: translateY(0) scale(1);
        opacity: 1;
      }

      /* Specular highlight on card */
      .your-story__card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 120px;
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.08) 0%,
          transparent 100%
        );
        pointer-events: none;
        border-radius: var(--radius-2xl, 1.5rem) var(--radius-2xl, 1.5rem) 0 0;
      }

      /* Content with MA-based padding: meditation (55px) on desktop, silence (34px) on mobile */
      .your-story__content {
        position: relative;
        max-height: 90vh;
        overflow-y: auto;
        overflow-x: hidden;
        padding: clamp(1.5rem, 5vw, 3.4rem); /* 24px to 55px (meditation) */
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
      }

      /* Custom scrollbar */
      .your-story__content::-webkit-scrollbar {
        width: 6px;
      }
      .your-story__content::-webkit-scrollbar-track {
        background: transparent;
      }
      .your-story__content::-webkit-scrollbar-thumb {
        background: var(--color-border-subtle, #e5e2de);
        border-radius: 3px;
      }
      .your-story__content::-webkit-scrollbar-thumb:hover {
        background: var(--color-border-medium, #d0ccc6);
      }

      /* ========================================================================
         HEADER - Typography aligned with design system
         ======================================================================== */

      .your-story__header {
        margin-bottom: 2.125rem; /* MA: silence (34px) */
        animation: your-story-slide-up 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .your-story__header-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 1.3125rem; /* MA: rest (21px) */
      }

      /* Title uses pageTitle text style */
      .your-story__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: clamp(1.5rem, 4vw, 2.25rem); /* 24px to 36px (pageTitle) */
        font-weight: 700;
        line-height: 1.15;
        letter-spacing: -0.015em;
        color: var(--color-text-primary, #2C2520);
        margin: 0;
      }

      /* Subtitle uses bodySmall */
      .your-story__subtitle {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.8125rem; /* 13px - bodySmall */
        line-height: 1.5;
        color: var(--color-text-secondary, #5c544a);
        margin: 0.5rem 0 0;
        opacity: 0.9;
      }

      /* Close button with anticipation hover */
      .your-story__close {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        color: var(--color-text-muted, #8a8279);
        border-radius: var(--radius-lg, 1rem);
        transition:
          background 150ms cubic-bezier(0.4, 0, 0.2, 1),
          color 150ms cubic-bezier(0.4, 0, 0.2, 1),
          transform 80ms cubic-bezier(0.38, -0.4, 0.88, 0.65);
      }

      .your-story__close:hover {
        background: var(--color-bg-tertiary, #f5f3f0);
        color: var(--color-text-secondary, #5c544a);
        transform: scale(0.98);
      }

      /* Icon rotation on close hover */
      .your-story__close:hover svg {
        transform: rotate(90deg);
      }

      .your-story__close svg {
        transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .your-story__close:active {
        transform: scale(0.94);
      }

      /* Focus ring for accessibility */
      .your-story__close:focus-visible {
        outline: 2px solid var(--color-accent, #3D5A45);
        outline-offset: 2px;
      }

      .your-story__close:focus-visible {
        outline: 2px solid var(--color-accent, #3D5A45);
        outline-offset: 2px;
      }

      .your-story__close svg {
        width: 1.25rem;
        height: 1.25rem;
      }

      /* ========================================================================
         STATS ROW - Glass cards with MA spacing
         ======================================================================== */

      .your-story__stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.8125rem; /* MA: pause (13px) */
        margin-bottom: 1.3125rem; /* MA: rest (21px) */
        animation: your-story-fade-in 400ms cubic-bezier(0.4, 0, 0.2, 1) 100ms both;
      }

      @media (max-width: 479px) {
        .your-story__stats {
          grid-template-columns: 1fr 1fr;
        }
        .your-story__stat:last-child {
          grid-column: span 2;
        }
      }

      .your-story__stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.375rem; /* 6px */
        padding: 0.8125rem; /* MA: pause (13px) */
        font-family: var(--font-body, 'Inter', sans-serif);
        
        /* visionOS glass morphism */
        background: var(--glass-thin-background, rgba(255, 255, 255, 0.7));
        backdrop-filter: var(--glass-blur, blur(16px));
        -webkit-backdrop-filter: var(--glass-blur, blur(16px));
        border: 1px solid var(--glass-thin-border, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-lg, 1rem);
        box-shadow: var(--shadow-sm, 0 2px 12px rgba(0, 0, 0, 0.04));
        
        /* Pixar-style hover transition */
        transition: 
          transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
      }

      .your-story__stat:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: var(--shadow-md, 0 4px 20px rgba(0, 0, 0, 0.08));
      }

      /* Icon bounce on stat hover */
      .your-story__stat:hover svg {
        transform: scale(1.15) rotate(-5deg);
      }

      /* Focus ring for keyboard navigation */
      .your-story__stat:focus-visible {
        outline: 2px solid var(--color-accent, #3D5A45);
        outline-offset: 2px;
      }

      .your-story__stat svg {
        width: 1.25rem;
        height: 1.25rem;
        color: var(--color-accent, #3D5A45);
        opacity: 0.9;
        transition: transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .your-story__stat-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.5rem; /* 24px - hero metric */
        font-weight: 700;
        line-height: 1;
        color: var(--color-text-primary, #2C2520);
        letter-spacing: -0.02em;
      }

      .your-story__stat-label {
        font-size: 0.6875rem; /* 11px */
        font-weight: 500;
        color: var(--color-text-muted, #8a8279);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* ========================================================================
         STAGE CARD - Enhanced timeline visual hierarchy
         ======================================================================== */

      .your-story__stage {
        position: relative;
        background: linear-gradient(
          135deg,
          var(--color-bg-tertiary, #f9f8f6) 0%,
          var(--color-bg-elevated, #fffdfb) 100%
        );
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        padding: 1rem 1.3125rem; /* md (16px) vertical, rest (21px) horizontal */
        border-radius: var(--radius-xl, 1.25rem);
        margin-bottom: 1.3125rem; /* MA: rest (21px) */
        animation: your-story-fade-in 400ms cubic-bezier(0.4, 0, 0.2, 1) 150ms both;
        
        /* Subtle shadow for depth */
        box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.03));
        
        /* Hover effect */
        transition: 
          box-shadow 200ms cubic-bezier(0.2, 0, 0.2, 1),
          transform 200ms cubic-bezier(0.2, 0, 0.2, 1);
      }

      .your-story__stage:hover {
        box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.05));
        transform: translateY(-1px);
      }

      .your-story__stage-info {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 1rem;
        margin-bottom: 0.625rem; /* 10px */
      }

      .your-story__stage-name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1rem; /* 16px */
        font-weight: 600;
        color: var(--color-accent, #3D5A45);
        letter-spacing: -0.01em;
      }

      .your-story__stage-tagline {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.75rem; /* 12px caption */
        font-weight: 500;
        font-style: italic;
        color: var(--color-text-muted, #8a8279);
        text-align: right;
      }

      .your-story__stage-progress {
        position: relative;
        height: 6px;
        background: linear-gradient(
          90deg,
          var(--color-border-subtle, #e5e2de) 0%,
          var(--color-border-medium, #d8d4ce) 100%
        );
        border-radius: 3px;
        overflow: visible;
      }

      /* Progress percentage indicator */
      .your-story__stage-progress::after {
        content: attr(data-progress);
        position: absolute;
        right: 0;
        top: -1.25rem;
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.625rem;
        font-weight: 600;
        color: var(--color-text-muted, #8a8279);
        letter-spacing: 0.02em;
      }

      .your-story__stage-bar {
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--color-accent, #3D5A45) 0%,
          var(--color-accent-hover, #4a6b52) 60%,
          var(--color-accent-light, #5a7b5a) 100%
        );
        border-radius: 3px;
        transition: width 800ms cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
        overflow: visible;
        min-width: 6px; /* Minimum visible width */
      }

      /* Glowing dot at the end of progress bar */
      .your-story__stage-bar::before {
        content: '';
        position: absolute;
        right: -3px;
        top: 50%;
        transform: translateY(-50%);
        width: 10px;
        height: 10px;
        background: var(--color-accent, #3D5A45);
        border: 2px solid var(--color-bg-elevated, #fffdfb);
        border-radius: 50%;
        box-shadow: var(--shadow-glow-sm, 0 0 6px rgba(61, 90, 69, 0.4));
      }

      /* Subtle shimmer effect on progress bar */
      .your-story__stage-bar::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.4) 50%,
          transparent 100%
        );
        transform: translateX(-100%);
        animation: your-story-shimmer 3s ease-in-out infinite;
        animation-delay: 1.5s;
        border-radius: 3px;
      }

      @keyframes your-story-shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      /* ========================================================================
         MILESTONES - Pill badges with stagger animation
         ======================================================================== */

      .your-story__milestones {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem; /* breath */
        animation: your-story-fade-in 400ms cubic-bezier(0.4, 0, 0.2, 1) 200ms both;
      }

      .your-story__milestone {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem; /* 6px */
        padding: 0.375rem 0.75rem; /* 6px 12px */
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        color: var(--color-accent, #3D5A45);
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.6875rem; /* label */
        font-weight: 600;
        letter-spacing: 0.02em;
        border-radius: var(--radius-full, 9999px);
        transition:
          background 150ms,
          transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .your-story__milestone:hover {
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.15));
        transform: scale(1.04);
        box-shadow: var(--shadow-sm, 0 2px 8px rgba(61, 90, 69, 0.15));
      }

      /* Icon pulse on milestone hover */
      .your-story__milestone:hover svg {
        transform: scale(1.1);
      }

      .your-story__milestone svg {
        width: 0.75rem;
        height: 0.75rem;
        opacity: 0.85;
        transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      /* Focus ring for keyboard navigation */
      .your-story__milestone:focus-visible {
        outline: 2px solid var(--color-accent, #3D5A45);
        outline-offset: 2px;
      }

      /* ========================================================================
         DEMO BANNER - Gradient with accent glow
         ======================================================================== */

      .your-story__demo-banner {
        display: flex;
        align-items: flex-start;
        gap: 0.8125rem; /* pause (13px) */
        padding: 1rem 1.3125rem; /* md (16px) horizontal, rest (21px) */
        background: linear-gradient(
          135deg,
          var(--color-accent-subtle, rgba(61, 90, 69, 0.06)) 0%,
          rgba(61, 90, 69, 0.02) 100%
        );
        border: 1px solid var(--color-accent, rgba(61, 90, 69, 0.2));
        border-radius: var(--radius-xl, 1.25rem);
        margin-bottom: 2.125rem; /* silence (34px) */
        animation: your-story-slide-up 500ms cubic-bezier(0.16, 1, 0.3, 1) 250ms both;
      }

      .your-story__demo-banner svg {
        flex-shrink: 0;
        width: 1.25rem;
        height: 1.25rem;
        color: var(--color-accent, #3D5A45);
        margin-top: 0.125rem;
      }

      .your-story__demo-banner p {
        margin: 0;
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.8125rem; /* bodySmall */
        line-height: 1.6;
        color: var(--color-text-secondary, #5c544a);
      }

      /* ========================================================================
         SECTIONS - MA silence (34px) between sections with subtle gradients
         ======================================================================== */

      .your-story__sections {
        display: flex;
        flex-direction: column;
        gap: 2.125rem; /* MA: silence (34px) */
      }

      .your-story__section {
        position: relative;
        padding: 1.3125rem; /* MA: rest (21px) */
        border-radius: var(--radius-xl, 1.25rem);
        
        /* Subtle gradient background */
        background: linear-gradient(
          145deg,
          var(--color-bg-elevated, rgba(255, 253, 251, 0.95)) 0%,
          var(--color-bg-secondary, rgba(250, 246, 240, 0.8)) 100%
        );
        
        /* Layered shadows for depth */
        box-shadow: var(--shadow-sm, 0 4px 16px rgba(44, 37, 32, 0.04));
        
        /* Subtle border */
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
        
        /* Entrance animation */
        animation: your-story-slide-up 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
        
        /* Smooth hover transition */
        transition:
          box-shadow 300ms cubic-bezier(0.2, 0, 0.2, 1),
          transform 300ms cubic-bezier(0.2, 0, 0.2, 1);
      }

      /* Hover lift effect */
      .your-story__section:hover {
        box-shadow: var(--shadow-lg, 0 8px 24px rgba(44, 37, 32, 0.06));
        transform: translateY(-1px);
      }

      /* Section 1 - Right Now - sage green accent */
      .your-story__section:nth-child(1) {
        animation-delay: 300ms;
        background: linear-gradient(
          145deg,
          rgba(61, 90, 69, 0.025) 0%,
          var(--color-bg-elevated, rgba(255, 253, 251, 0.95)) 40%,
          var(--color-bg-secondary, rgba(250, 246, 240, 0.8)) 100%
        );
      }

      /* Section 2 - Your Growth - golden accent */
      .your-story__section:nth-child(2) {
        animation-delay: 400ms;
        background: linear-gradient(
          145deg,
          rgba(184, 149, 106, 0.025) 0%,
          var(--color-bg-elevated, rgba(255, 253, 251, 0.95)) 40%,
          var(--color-bg-secondary, rgba(250, 246, 240, 0.8)) 100%
        );
      }

      /* Section 3 - Your World - teal accent */
      .your-story__section:nth-child(3) {
        animation-delay: 500ms;
        background: linear-gradient(
          145deg,
          rgba(58, 107, 115, 0.025) 0%,
          var(--color-bg-elevated, rgba(255, 253, 251, 0.95)) 40%,
          var(--color-bg-secondary, rgba(250, 246, 240, 0.8)) 100%
        );
      }

      /* Section title uses sectionTitle text style */
      .your-story__section-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.125rem; /* 18px - more refined */
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.01em;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 1.3125rem; /* rest (21px) */
        position: relative;
        padding-left: 0.875rem;
      }

      /* Accent bar before section title */
      .your-story__section-title::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.125rem;
        bottom: 0.125rem;
        width: 3px;
        background: var(--color-accent, #3D5A45);
        border-radius: 1.5px;
      }

      /* Section-specific accent bars */
      .your-story__section:nth-child(2) .your-story__section-title::before {
        background: var(--persona-nayan-primary, #b8956a);
      }

      .your-story__section:nth-child(3) .your-story__section-title::before {
        background: var(--persona-peter-primary, #3a6b73);
      }

      /* ========================================================================
         VISUALIZATION CONTAINERS - Responsive grid with proper stacking
         ======================================================================== */

      .your-story__hero-viz {
        min-height: 220px;
        margin-bottom: 1.3125rem; /* rest (21px) */
        border-radius: var(--radius-xl, 1.25rem);
        overflow: hidden;
        background: var(--color-bg-tertiary, #f9f8f6);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
      }

      .your-story__viz-row {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem; /* md (16px) */
        margin-bottom: 1rem;
      }

      /* Hero spans full width on desktop grid */
      .your-story__viz-row > .your-story__hero-viz {
        grid-column: 1 / -1;
      }

      .your-story__compact-viz {
        min-height: 180px;
        background: var(--color-bg-tertiary, #f9f8f6);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
        border-radius: var(--radius-xl, 1.25rem);
        padding: 0.8125rem; /* pause (13px) */
        overflow: hidden;
        
        /* Smooth hover */
        transition:
          transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 200ms cubic-bezier(0.2, 0, 0.2, 1);
      }

      .your-story__compact-viz:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.06));
      }

      /* Ensure proper content flow within viz containers */
      .your-story__compact-viz > * {
        max-width: 100%;
        overflow: hidden;
      }

      /* ========================================================================
         INSIGHTS - Styled callout boxes
         ======================================================================== */

      .your-story__insight {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.8125rem; /* bodySmall */
        line-height: 1.5;
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
        padding: 0.8125rem 1rem; /* pause (13px) vertical, md horizontal */
        background: var(--color-bg-secondary, #faf9f7);
        border-left: 3px solid var(--color-accent, rgba(61, 90, 69, 0.3));
        border-radius: 0 var(--radius-md, 0.75rem) var(--radius-md, 0.75rem) 0;
      }

      /* ========================================================================
         LOADING STATE - Skeleton UI matching dashboard shape
         ======================================================================== */

      @keyframes your-story-skeleton-pulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }

      @keyframes your-story-skeleton-shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }

      .your-story__skeleton {
        display: flex;
        flex-direction: column;
        gap: 2.125rem; /* MA: silence (34px) */
      }

      .your-story__skeleton-header {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      /* Skeleton line - base */
      .your-story__skeleton-line {
        height: 0.875rem;
        background: linear-gradient(
          90deg,
          var(--color-border-subtle, rgba(44, 37, 32, 0.08)) 0%,
          var(--color-border-medium, rgba(44, 37, 32, 0.12)) 50%,
          var(--color-border-subtle, rgba(44, 37, 32, 0.08)) 100%
        );
        border-radius: var(--radius-sm, 0.375rem);
        animation: your-story-skeleton-pulse 1.5s ease-in-out infinite;
        position: relative;
        overflow: hidden;
      }

      .your-story__skeleton-line::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.3) 50%,
          transparent 100%
        );
        animation: your-story-skeleton-shimmer 2s ease-in-out infinite;
      }

      .your-story__skeleton-line--title {
        width: 60%;
        height: 1.5rem;
      }

      .your-story__skeleton-line--subtitle {
        width: 40%;
        height: 0.75rem;
        animation-delay: 0.1s;
      }

      .your-story__skeleton-line--short {
        width: 50%;
        height: 0.875rem;
      }

      .your-story__skeleton-line--section-title {
        width: 35%;
        height: 1.125rem;
        margin-bottom: 0.5rem;
      }

      /* Skeleton stats grid */
      .your-story__skeleton-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.8125rem;
        margin-top: 0.5rem;
      }

      .your-story__skeleton-stat {
        height: 4.5rem;
        background: linear-gradient(
          135deg,
          var(--color-bg-tertiary, rgba(44, 37, 32, 0.04)) 0%,
          var(--color-bg-secondary, rgba(44, 37, 32, 0.06)) 100%
        );
        border-radius: var(--radius-xl, 1.25rem);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
        animation: your-story-skeleton-pulse 1.5s ease-in-out infinite;
        position: relative;
        overflow: hidden;
      }

      .your-story__skeleton-stat::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.2) 50%,
          transparent 100%
        );
        animation: your-story-skeleton-shimmer 2s ease-in-out infinite;
      }

      .your-story__skeleton-stat:nth-child(2) {
        animation-delay: 0.15s;
      }

      .your-story__skeleton-stat:nth-child(3) {
        animation-delay: 0.3s;
      }

      /* Skeleton stage */
      .your-story__skeleton-stage {
        padding: 1rem;
        background: var(--color-bg-tertiary, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-xl, 1.25rem);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
      }

      .your-story__skeleton-progress {
        height: 6px;
        background: var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: 3px;
        margin-top: 0.5rem;
        position: relative;
        overflow: hidden;
      }

      .your-story__skeleton-progress::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 40%;
        height: 100%;
        background: linear-gradient(
          90deg,
          var(--color-accent, #3D5A45) 0%,
          rgba(61, 90, 69, 0.5) 100%
        );
        border-radius: 3px;
        animation: your-story-skeleton-pulse 1.5s ease-in-out infinite;
      }

      /* Skeleton sections */
      .your-story__skeleton-section {
        padding: 1.3125rem;
        background: linear-gradient(
          145deg,
          var(--color-bg-elevated, rgba(255, 253, 251, 0.95)) 0%,
          var(--color-bg-secondary, rgba(250, 246, 240, 0.8)) 100%
        );
        border-radius: var(--radius-xl, 1.25rem);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
      }

      .your-story__skeleton-section:nth-child(2) {
        animation-delay: 0.2s;
      }

      .your-story__skeleton-section:nth-child(3) {
        animation-delay: 0.4s;
      }

      /* Skeleton viz grid */
      .your-story__skeleton-viz-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        margin-top: 0.5rem;
      }

      .your-story__skeleton-viz-card {
        height: 140px;
        background: linear-gradient(
          135deg,
          var(--color-bg-tertiary, rgba(44, 37, 32, 0.04)) 0%,
          var(--color-bg-secondary, rgba(44, 37, 32, 0.06)) 100%
        );
        border-radius: var(--radius-xl, 1.25rem);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
        animation: your-story-skeleton-pulse 1.5s ease-in-out infinite;
        position: relative;
        overflow: hidden;
      }

      .your-story__skeleton-viz-card::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.2) 50%,
          transparent 100%
        );
        animation: your-story-skeleton-shimmer 2s ease-in-out infinite;
      }

      .your-story__skeleton-viz-card:nth-child(1) { animation-delay: 0s; }
      .your-story__skeleton-viz-card:nth-child(2) { animation-delay: 0.1s; }
      .your-story__skeleton-viz-card:nth-child(3) { animation-delay: 0.2s; }
      .your-story__skeleton-viz-card:nth-child(4) { animation-delay: 0.3s; }

      /* Loading text */
      .your-story__loading-text {
        text-align: center;
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.8125rem;
        color: var(--color-text-muted, #8a8279);
        margin-top: 1rem;
      }

      /* Fallback spinner (kept for backwards compatibility) */
      .your-story__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3.4rem; /* meditation (55px) */
        color: var(--color-text-muted, #8a8279);
        text-align: center;
      }

      .your-story__loading-spinner {
        width: 2.5rem;
        height: 2.5rem;
        border: 2px solid var(--color-border-subtle, #e5e2de);
        border-top-color: var(--color-accent, #3D5A45);
        border-radius: 50%;
        animation: your-story-spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        margin-bottom: 1rem;
      }

      .your-story__loading p {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.8125rem;
        margin: 0;
      }

      /* ========================================================================
         KEYFRAME ANIMATIONS - Pixar-inspired
         ======================================================================== */

      @keyframes your-story-spin {
        to { transform: rotate(360deg); }
      }

      @keyframes your-story-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes your-story-slide-up {
        from {
          opacity: 0;
          transform: translateY(1rem);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ========================================================================
         RESPONSIVE - Mobile (xs), Tablet (md), Desktop (lg+)
         ======================================================================== */

      /* Mobile: < 640px */
      @media (max-width: 639px) {
        .your-story__card {
          width: 100%;
          max-width: 100%;
          max-height: 100vh;
          border-radius: var(--radius-xl, 1.25rem) var(--radius-xl, 1.25rem) 0 0;
          margin-top: auto;
        }

        .your-story__content {
          padding: 1.5rem 1.25rem 2rem;
          max-height: calc(100vh - 1rem);
        }

        .your-story__header-top {
          flex-direction: column-reverse;
          gap: 0.75rem;
        }

        .your-story__close {
          align-self: flex-end;
          margin-bottom: -0.5rem;
        }

        .your-story__stats {
          gap: 0.5rem; /* MA: breath (8px) */
        }

        .your-story__stat {
          padding: 0.5rem; /* MA: breath (8px) */
        }

        .your-story__stat-value {
          font-size: 1.25rem; /* 20px on mobile */
        }

        .your-story__stat-label {
          font-size: 0.625rem; /* 10px on mobile */
        }

        .your-story__viz-row {
          grid-template-columns: 1fr;
          gap: 0.8125rem;
        }

        .your-story__section-title {
          font-size: 1rem; /* 16px on mobile */
        }

        /* Section adjustments for mobile */
        .your-story__sections {
          gap: 1.3125rem; /* MA: rest (21px) on mobile */
        }

        .your-story__section {
          padding: 0.8125rem; /* MA: pause (13px) on mobile */
          border-radius: var(--radius-lg, 0.75rem);
        }

        .your-story__section:hover {
          transform: none; /* No hover lift on mobile */
        }

        /* Hero viz - full width, reduced height on mobile */
        .your-story__hero-viz {
          min-height: 180px;
          margin-bottom: 0.8125rem;
        }

        /* Compact viz - full width stack, reduced height */
        .your-story__compact-viz {
          min-height: 140px;
          padding: 0.625rem;
          border-radius: var(--radius-lg, 0.75rem);
        }

        .your-story__compact-viz:hover {
          transform: none; /* No hover on touch devices */
        }

        /* Skeleton mobile adjustments */
        .your-story__skeleton {
          gap: 1.3125rem;
        }

        .your-story__skeleton-stats {
          grid-template-columns: repeat(2, 1fr);
        }

        .your-story__skeleton-stat:last-child {
          grid-column: span 2;
        }

        .your-story__skeleton-viz-grid {
          grid-template-columns: 1fr;
          gap: 0.625rem;
        }

        .your-story__skeleton-viz-card {
          height: 100px;
        }

        .your-story__skeleton-section {
          padding: 0.8125rem;
        }
      }

      /* Small Tablet: 480px - 639px */
      @media (min-width: 480px) and (max-width: 639px) {
        .your-story__viz-row {
          grid-template-columns: repeat(2, 1fr);
          gap: 0.625rem;
        }

        .your-story__stats {
          grid-template-columns: repeat(3, 1fr);
        }

        .your-story__stat:last-child {
          grid-column: auto;
        }
      }

      /* Tablet: 640px - 1023px */
      @media (min-width: 640px) and (max-width: 1023px) {
        .your-story__card {
          width: min(90%, 42rem); /* 672px */
        }

        .your-story__content {
          padding: 2rem;
        }

        /* Sections get more breathing room on tablet */
        .your-story__sections {
          gap: 1.618rem; /* MA: between rest and silence */
        }

        .your-story__section {
          padding: 1rem; /* MA: md (16px) */
        }

        /* 2-column grid maintained on tablet */
        .your-story__viz-row {
          gap: 0.8125rem; /* pause */
        }

        /* Hero viz fills full width */
        .your-story__hero-viz {
          min-height: 200px;
        }

        .your-story__compact-viz {
          min-height: 160px;
        }
      }

      /* Desktop: 1024px+ */
      @media (min-width: 1024px) {
        .your-story__card {
          width: min(90%, 52rem); /* 832px */
        }

        .your-story__content {
          padding: 2.5rem 3rem;
        }

        /* Full silence gap on desktop */
        .your-story__sections {
          gap: 2.125rem; /* MA: silence (34px) */
        }

        .your-story__section {
          padding: 1.3125rem; /* MA: rest (21px) */
        }

        .your-story__viz-row {
          gap: 1.3125rem; /* rest (21px) */
        }

        .your-story__hero-viz {
          min-height: 240px;
        }

        .your-story__compact-viz {
          min-height: 200px;
        }
      }

      /* ========================================================================
         REDUCED MOTION - Accessibility
         ======================================================================== */

      @media (prefers-reduced-motion: reduce) {
        .your-story,
        .your-story__card,
        .your-story__header,
        .your-story__section,
        .your-story__demo-banner,
        .your-story__stats,
        .your-story__stage,
        .your-story__milestones {
          animation: none !important;
          transition: opacity 150ms linear !important;
          transform: none !important;
        }

        /* Disable shimmer effect and glow */
        .your-story__stage-bar::after {
          animation: none !important;
          display: none;
        }

        .your-story__stage-bar::before {
          box-shadow: none;
        }

        .your-story__stage:hover {
          transform: none;
        }

        /* Icons should still respond but instantly */
        .your-story__stat svg,
        .your-story__milestone svg,
        .your-story__close svg {
          transition: none !important;
        }

        .your-story--visible .your-story__card {
          transform: none;
        }

        .your-story__loading-spinner {
          animation: your-story-spin 1.5s linear infinite;
        }

        .your-story__compact-viz:hover {
          transform: none;
        }

        .your-story__milestone:hover {
          transform: none;
        }

        .your-story__stage-bar {
          transition: width 200ms linear;
        }

        /* Skeleton reduced motion */
        .your-story__skeleton-line,
        .your-story__skeleton-stat,
        .your-story__skeleton-viz-card,
        .your-story__skeleton-progress::after {
          animation: none !important;
        }

        .your-story__skeleton-line::after,
        .your-story__skeleton-stat::after,
        .your-story__skeleton-viz-card::after {
          animation: none !important;
        }
      }

      /* ========================================================================
         DARK MODE SUPPORT
         ======================================================================== */

      @media (prefers-color-scheme: dark) {
        .your-story__card {
          background: rgba(44, 37, 32, 0.85);
          border-color: rgba(255, 255, 255, 0.06);
        }

        .your-story__card::before {
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.03) 0%,
            transparent 100%
          );
        }

        /* Dark mode section gradients */
        .your-story__section {
          background: linear-gradient(
            145deg,
            rgba(44, 37, 32, 0.6) 0%,
            rgba(55, 47, 42, 0.5) 100%
          );
          border-color: rgba(255, 255, 255, 0.06);
          box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.15));
        }

        .your-story__section:hover {
          box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.2));
        }

        .your-story__section:nth-child(1) {
          background: linear-gradient(
            145deg,
            rgba(61, 90, 69, 0.08) 0%,
            rgba(44, 37, 32, 0.6) 40%,
            rgba(55, 47, 42, 0.5) 100%
          );
        }

        .your-story__section:nth-child(2) {
          background: linear-gradient(
            145deg,
            rgba(184, 149, 106, 0.08) 0%,
            rgba(44, 37, 32, 0.6) 40%,
            rgba(55, 47, 42, 0.5) 100%
          );
        }

        .your-story__section:nth-child(3) {
          background: linear-gradient(
            145deg,
            rgba(58, 107, 115, 0.08) 0%,
            rgba(44, 37, 32, 0.6) 40%,
            rgba(55, 47, 42, 0.5) 100%
          );
        }

        /* Dark mode stat cards */
        .your-story__stat {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.08);
        }

        .your-story__stat:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        /* Dark mode compact viz */
        .your-story__compact-viz {
          background: rgba(44, 37, 32, 0.5);
          border-color: rgba(255, 255, 255, 0.06);
        }

        .your-story__compact-viz:hover {
          box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.3));
        }

        /* Dark mode stage card */
        .your-story__stage {
          background: linear-gradient(
            135deg,
            rgba(44, 37, 32, 0.7) 0%,
            rgba(55, 47, 42, 0.6) 100%
          );
          border-color: rgba(255, 255, 255, 0.06);
          box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.2));
        }

        .your-story__stage:hover {
          box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.25));
        }

        .your-story__stage-progress {
          background: rgba(255, 255, 255, 0.1);
        }

        .your-story__stage-bar::before {
          border-color: rgba(44, 37, 32, 0.9);
          box-shadow: var(--shadow-glow, 0 0 8px rgba(61, 90, 69, 0.5));
        }
      }

      /* ========================================================================
         VISUALIZATION BUILDER STYLES
         These styles apply to elements created by visualization builders
         (mood-calendar, burnout-gauge, predictions, open-loops, etc.)

         Uses higher specificity to override inline styles from setStyles()
         Applies glass morphism, design tokens, and proper typography
         ======================================================================== */

      /* VIZ HEADER - Used by all visualization builders */
      .your-story .viz-header {
        margin-bottom: 0.8125rem; /* pause (13px) */
        padding-bottom: 0.5rem; /* breath (8px) */
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06));
      }

      .your-story .viz-header h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 0.9375rem; /* body - 15px */
        font-weight: 600;
        line-height: 1.3;
        letter-spacing: -0.01em;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 0.25rem;
      }

      .your-story .viz-header p {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.6875rem; /* label - 11px */
        font-weight: 500;
        color: var(--color-text-muted, #8a8279);
        margin: 0;
        letter-spacing: 0.01em;
      }

      /* MOBILE CARD - Solid background */
      .your-story .mobile-card {
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-lg, 1rem);
        padding: 0.8125rem 1rem; /* pause vertical, md horizontal */
        margin-top: 0.8125rem; /* pause */
        box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.06));
        transition:
          transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
      }

      .your-story .mobile-card:first-of-type {
        margin-top: 0;
      }

      .your-story .mobile-card:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.05));
      }

      /* Subtle border glow on mobile card hover */
      .your-story .mobile-card:hover {
        border-color: var(--color-accent-subtle, rgba(61, 90, 69, 0.15));
      }

      /* Focus ring for keyboard navigation */
      .your-story .mobile-card:focus-visible {
        outline: 2px solid var(--color-accent, #3D5A45);
        outline-offset: 2px;
      }

      /* MOBILE CARD HEADER */
      .your-story .mobile-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.8125rem; /* pause */
        margin-bottom: 0.5rem; /* breath */
      }

      .your-story .mobile-card-title {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.8125rem; /* bodySmall - 13px */
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        letter-spacing: -0.005em;
      }

      /* MOBILE CARD BADGE - Pill style */
      .your-story .mobile-card-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.25rem 0.625rem; /* 4px 10px */
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        color: var(--color-accent, #3D5A45);
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.6875rem; /* label - 11px */
        font-weight: 600;
        letter-spacing: 0.02em;
        border-radius: var(--radius-full, 9999px);
      }

      /* WATCH METRIC - For watch-sized displays */
      .your-story .watch-metric {
        text-align: center;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 0.875rem; /* 14px */
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0.5rem 0; /* breath */
      }

      /* MOBILE INSIGHT - Callout text */
      .your-story .mobile-insight {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.75rem; /* caption - 12px */
        line-height: 1.5;
        color: var(--color-text-secondary, #5c544a);
        margin-top: 0.8125rem; /* pause */
        padding: 0.625rem 0.8125rem; /* 10px 13px */
        background: var(--tonal-surface1, rgba(44, 37, 32, 0.02));
        border-radius: var(--radius-md, 0.75rem);
        border-left: 2px solid var(--color-accent, rgba(61, 90, 69, 0.3));
      }

      /* ========================================================================
         VISUALIZATION CONTENT OVERRIDES
         Override inline styles from builders for consistent design
         ======================================================================== */

      /* Force proper font families on all viz text */
      .your-story__hero-viz *,
      .your-story__compact-viz * {
        font-family: var(--font-body, 'Inter', sans-serif);
      }

      .your-story__hero-viz h1,
      .your-story__hero-viz h2,
      .your-story__hero-viz h3,
      .your-story__compact-viz h1,
      .your-story__compact-viz h2,
      .your-story__compact-viz h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      }

      /* Override hardcoded background colors on viz containers */
      .your-story__compact-viz > div:first-child {
        background: transparent !important;
      }

      /* Priority dots - semantic colors */
      .your-story .mobile-card div[style*="border-radius: 50%"][style*="8px"] {
        box-shadow: var(--shadow-xs, 0 1px 3px rgba(0, 0, 0, 0.1));
      }

      /* Override flex containers in visualizations */
      .your-story [style*="display: flex"] {
        gap: 0.5rem; /* breath - normalize gaps */
      }

      /* SVG elements in visualizations */
      .your-story svg text {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      }

      /* ========================================================================
         VISUALIZATION-SPECIFIC REFINEMENTS
         ======================================================================== */

      /* Energy Rings - Hero visualization */
      .your-story__hero-viz[data-viz="energy-rings"] {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 280px;
        background: linear-gradient(
          180deg,
          var(--tonal-surface1, rgba(44, 37, 32, 0.02)) 0%,
          transparent 100%
        );
      }

      /* Life Timeline - Hero visualization */
      .your-story__hero-viz[data-viz="life-timeline"] {
        padding: 0.5rem;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      /* Relationship Network - Hero visualization */
      .your-story__hero-viz[data-viz="relationship-network"] {
        display: flex;
        justify-content: center;
        padding: 1rem;
      }

      /* Mood Calendar cells */
      .your-story [style*="grid"][style*="7"] > div {
        border-radius: var(--radius-sm, 0.5rem);
        transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .your-story [style*="grid"][style*="7"] > div:hover {
        transform: scale(1.1);
      }

      /* Predictions scenario bars */
      .your-story div[style*="height: 6px"],
      .your-story div[style*="height: 8px"] {
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      /* Progress/gauge elements */
      .your-story div[style*="border-radius"][style*="100%"] {
        box-shadow: var(--shadow-sm, 0 2px 6px rgba(0, 0, 0, 0.08));
      }

      /* ========================================================================
         TABLET/DESKTOP VISUALIZATION STYLES
         Override inline styles from tablet builders with solid backgrounds
         ======================================================================== */

      /* Category panels in Open Loops - solid background */
      .your-story__compact-viz[data-viz="open-loops"] div[style*="background: var(--color-background)"],
      .your-story__compact-viz[data-viz="open-loops"] div[style*="background"][style*="padding: 12px"] {
        background: var(--color-bg-elevated, #FFFDFB) !important;
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08)) !important;
        box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.06)) !important;
      }

      /* Stats panels - elevated solid treatment */
      .your-story__compact-viz div[style*="background: var(--color-bg-elevated)"],
      .your-story__compact-viz div[style*="padding: 16px"][style*="border-radius: 12px"] {
        background: var(--color-bg-elevated, #FFFDFB) !important;
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08)) !important;
        box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.08)) !important;
      }

      /* Content grid in tablet builders - tighter padding */
      .your-story__compact-viz > div[style*="padding: 16px"] {
        padding: 0.5rem !important; /* reduce excessive padding */
      }

      /* Loop items - cleaner borders and spacing */
      .your-story__compact-viz[data-viz="open-loops"] div[style*="padding: 8px 0"][style*="border-bottom"] {
        border-bottom-color: rgba(44, 37, 32, 0.04) !important;
        padding: 0.5rem 0 !important;
      }

      /* Priority dots - add subtle shadow */
      .your-story__compact-viz div[style*="width: 8px"][style*="border-radius: 50%"] {
        box-shadow: var(--shadow-xs, 0 1px 3px rgba(0, 0, 0, 0.15)) !important;
      }

      /* Age/date text - proper typography */
      .your-story__compact-viz span[style*="font-size: 0.75rem"][style*="color: var(--color-text-muted)"] {
        font-weight: 500 !important;
        letter-spacing: 0.01em !important;
      }

      /* Chart area in predictions - add subtle background */
      .your-story__compact-viz[data-viz="predictions"] div[style*="flex: 2"] {
        padding: 0.5rem !important;
        background: var(--tonal-surface1, rgba(44, 37, 32, 0.015)) !important;
        border-radius: var(--radius-lg, 1rem) !important;
      }

      /* SVG charts - ensure proper sizing */
      .your-story__compact-viz svg {
        max-width: 100% !important;
        height: auto !important;
      }

      /* Section labels in stats panels */
      .your-story__compact-viz div[style*="text-transform: uppercase"][style*="letter-spacing"] {
        color: var(--color-text-muted, #8a8279) !important;
        font-size: 0.6875rem !important;
        font-weight: 600 !important;
      }

      /* Value highlights - accent color */
      .your-story__compact-viz span[style*="font-weight: 600"][style*="color: var(--color-accent)"] {
        color: var(--color-accent, #3D5A45) !important;
      }

      /* Trend indicators */
      .your-story__compact-viz div[style*="color: var(--color-semantic-success)"],
      .your-story__compact-viz span[style*="color"][style*="27ae60"] {
        color: var(--color-semantic-success, #27ae60) !important;
        font-weight: 600 !important;
      }

      /* ========================================================================
         LOOP ITEM STYLES (Open Loops visualization)
         ======================================================================== */

      .your-story .mobile-card > div:not(.mobile-card-header):not([style*="flex"]) {
        padding: 0.5rem 0; /* breath vertical */
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.04));
      }

      .your-story .mobile-card > div:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      /* Category icons in loop items */
      .your-story span[style*="font-size: 0.85rem"] {
        color: var(--color-text-secondary, #5c544a);
      }

      /* ========================================================================
         PREDICTION CARD REFINEMENTS
         ======================================================================== */

      /* Confidence indicator text */
      .your-story div[style*="font-size: 0.7rem"] {
        font-weight: 500;
        letter-spacing: 0.02em;
      }

      /* Scenario bars container */
      .your-story div[style*="margin-top: 12px"] {
        margin-top: 0.8125rem !important; /* pause - normalize */
      }

      /* Historical accuracy section */
      .your-story__compact-viz[data-viz="predictions"] div[style*="margin-top"][style*="padding"] {
        margin-top: 0.8125rem !important;
        padding-top: 0.8125rem !important;
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06)) !important;
      }

      /* ========================================================================
         RESPONSIVE VISUALIZATION ADJUSTMENTS
         ======================================================================== */

      @media (max-width: 639px) {
        .your-story .viz-header h3 {
          font-size: 0.875rem; /* 14px on mobile */
        }

        .your-story .mobile-card {
          padding: 0.75rem 0.875rem;
        }

        .your-story .mobile-card-title {
          font-size: 0.75rem;
        }

        .your-story .mobile-card-badge {
          font-size: 0.625rem;
          padding: 0.1875rem 0.5rem;
        }

        .your-story__hero-viz {
          min-height: 200px;
        }
      }

      @media (min-width: 1024px) {
        .your-story .viz-header h3 {
          font-size: 1rem; /* 16px on desktop */
        }

        .your-story .mobile-card {
          padding: 1rem 1.25rem;
        }

        .your-story .mobile-card:hover {
          transform: translateY(-2px);
        }
      }

      /* ========================================================================
         REDUCED MOTION - Visualization animations
         ======================================================================== */

      @media (prefers-reduced-motion: reduce) {
        .your-story .mobile-card,
        .your-story .mobile-card:hover {
          transform: none;
          transition: box-shadow 150ms linear;
        }

        .your-story [style*="grid"][style*="7"] > div,
        .your-story [style*="grid"][style*="7"] > div:hover {
          transform: none;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }
}
