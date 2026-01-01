/**
 * The Sanctuary - Immersive Guided Practices Experience
 *
 * A full-screen contemplative space for guided practices, insights, and inspiration.
 * This is not a menu - it's a sanctuary where users can find what they need.
 *
 * Design Philosophy:
 * - "Better Than Human" - Shows insights only Ferni can provide (patterns, memory, presence)
 * - Zen aesthetic - Calm, contemplative, grounded in nature
 * - Personalized - Adapts to time of day, user's state, and what Ferni knows
 * - Invitational - Practices are presented as gentle invitations, not tasks
 *
 * Sections:
 * 1. Current State - Emotional weather, energy, time-aware greeting
 * 2. What Ferni Notices - Better-than-human insights and observations
 * 3. Guided Practices - Beautiful cards organized by intention
 * 4. Inspirations - Wisdom, quotes, gentle nudges
 *
 * @module @ferni/ui/sanctuary
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { apiGet, apiPost } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { escapeHtml } from './engagement-components.js';
import { practiceExperienceUI } from './practice-experience.ui.js';
import { connectionService } from '../services/connection.service.js';
import type { Command } from './commands.ui.js';

const log = createLogger('Sanctuary');

// ============================================================================
// TYPES
// ============================================================================

interface SanctuaryData {
  greeting: string;
  timeContext: TimeContext;
  emotionalState?: EmotionalState;
  insights: BetterThanHumanInsight[];
  practices: GuidedPractice[];
  inspirations: Inspiration[];
  userStats?: UserStats;
}

interface TimeContext {
  period: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  isWeekend: boolean;
}

interface EmotionalState {
  primary: string;
  energy: 'high' | 'medium' | 'low';
  trend?: 'rising' | 'stable' | 'falling';
  lastCheckin?: string;
}

interface BetterThanHumanInsight {
  id: string;
  type: 'pattern' | 'memory' | 'observation' | 'prediction';
  icon: string;
  title: string;
  description: string;
  personaId?: string;
  actionable?: boolean;
  action?: string;
}

interface GuidedPractice {
  id: string;
  name: string;
  description: string;
  category: PracticeCategory;
  duration?: string;
  personaId: string;
  prompt: string;
  icon?: string;
  recommended?: boolean;
  recommendedReason?: string;
}

type PracticeCategory =
  | 'ground' // Grounding, centering, presence
  | 'reflect' // Reflection, gratitude, review
  | 'explore' // Brainstorming, possibility, creativity
  | 'connect' // Relationships, communication, connection
  | 'grow'; // Growth, habits, change

interface Inspiration {
  id: string;
  type: 'quote' | 'wisdom' | 'nudge' | 'celebration';
  content: string;
  source?: string;
  personaId?: string;
}

interface UserStats {
  conversationCount: number;
  currentStreak: number;
  teamMembersUnlocked: number;
  topTopics: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_CONFIG: Record<
  PracticeCategory,
  { name: string; icon: string; description: string; color: string }
> = {
  ground: {
    name: 'Ground',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/><path d="M2 12h20"/></svg>`,
    description: 'Find your center',
    color: 'var(--color-ferni)',
  },
  reflect: {
    name: 'Reflect',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
    description: 'Look within',
    color: 'var(--color-maya)',
  },
  explore: {
    name: 'Explore',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    description: 'Open to possibility',
    color: 'var(--color-peter)',
  },
  connect: {
    name: 'Connect',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.78.77L12 20.65l7.65-7.65.77-.77a5.4 5.4 0 0 0 0-7.65Z"/></svg>`,
    description: 'Nurture relationships',
    color: 'var(--color-jordan)',
  },
  grow: {
    name: 'Grow',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>`,
    description: 'Gentle progress',
    color: 'var(--color-nayan)',
  },
};

const INSIGHT_ICONS: Record<string, string> = {
  pattern: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  memory: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  observation: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  prediction: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/></svg>`,
};

// Time-aware greetings
const TIME_GREETINGS: Record<TimeContext['period'], string[]> = {
  morning: [
    'Good morning',
    'A fresh start',
    'The day awaits',
    'Rise gently',
  ],
  afternoon: [
    'Good afternoon',
    'The day continues',
    'A pause in the day',
    'Midday moment',
  ],
  evening: [
    'Good evening',
    'As the day winds down',
    'Evening reflections',
    'A quiet moment',
  ],
  night: [
    'Still here with you',
    'In the quiet hours',
    'The night holds space',
    'Rest is coming',
  ],
};

// ============================================================================
// SANCTUARY UI CLASS
// ============================================================================

class SanctuaryUI {
  private container: HTMLElement | null = null;
  private isOpen = false;
  private data: SanctuaryData | null = null;
  private personaId = 'ferni';
  private onPracticeSelected?: (practice: GuidedPractice) => void;

  constructor() {
    this.cleanupOrphaned();
  }

  private cleanupOrphaned(): void {
    document.querySelectorAll('.sanctuary-overlay').forEach((el) => el.remove());
    document.querySelectorAll('#sanctuary-styles').forEach((el) => el.remove());
  }

  /**
   * Set callback for when a practice is selected
   */
  setOnPracticeSelected(callback: (practice: GuidedPractice) => void): void {
    this.onPracticeSelected = callback;
  }

  /**
   * Set the current persona context
   */
  setPersonaId(personaId: string): void {
    this.personaId = personaId;
  }

  /**
   * Open the Sanctuary
   */
  async open(): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;

    log.debug('Opening Sanctuary');

    // Inject styles
    this.injectStyles();

    // Load data
    this.data = await this.loadData();

    // Create and show UI
    this.createUI();
    await this.animateIn();
  }

  /**
   * Close the Sanctuary
   */
  async close(): Promise<void> {
    if (!this.isOpen || !this.container) return;

    await this.animateOut();
    this.container.remove();
    this.container = null;
    this.isOpen = false;
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  private async loadData(): Promise<SanctuaryData> {
    const timeContext = this.getTimeContext();
    const greeting = this.getGreeting(timeContext);

    // Try to load from the comprehensive Sanctuary API
    try {
      const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
      
      // Try the new unified Sanctuary API first
      const sanctuaryResult = await apiGet<{
        greeting: string;
        timeContext: string;
        insights: Array<{
          id: string;
          type: string;
          title: string;
          description: string;
          icon: string;
          priority: string;
          actionLabel?: string;
          actionType?: string;
        }>;
        practices: Array<{
          id: string;
          name: string;
          description: string;
          category: string;
          icon: string;
          duration: string;
          prompt: string;
          tags: string[];
          recommended: boolean;
          reasonRecommended?: string;
        }>;
        inspiration: {
          quote: string;
          source: string;
        };
      }>(`/api/sanctuary?userId=${userId}`);

      if (sanctuaryResult.ok && sanctuaryResult.data) {
        const data = sanctuaryResult.data;
        
        // Transform API insights to internal format
        const insights: BetterThanHumanInsight[] = (data.insights || []).map(i => ({
          id: i.id,
          type: (i.type === 'superhuman' || i.type === 'pattern') ? 'pattern' as const : 
                i.type === 'commitment' ? 'memory' as const : 
                i.type === 'growth' ? 'observation' as const : 'observation' as const,
          icon: i.icon || 'sparkles',
          title: i.title,
          description: i.description,
          actionable: !!i.actionLabel,
          action: i.actionLabel,
        }));
        
        // Transform practices to internal format
        const practices: GuidedPractice[] = (data.practices || []).map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          category: (p.category || 'reflect') as PracticeCategory,
          duration: p.duration,
          personaId: this.personaId,
          prompt: p.prompt,
          icon: p.icon,
          recommended: p.recommended,
          recommendedReason: p.reasonRecommended,
        }));
        
        // Build inspirations from API response
        const inspirations: Inspiration[] = data.inspiration ? [{
          id: 'api-inspiration',
          type: 'quote',
          content: data.inspiration.quote,
          source: data.inspiration.source,
        }] : this.getInspirations(timeContext);
        
        return {
          greeting: data.greeting || greeting,
          timeContext,
          insights: insights.length > 0 ? insights : this.getDefaultInsights(),
          practices: practices.length > 0 ? practices : this.getDefaultPractices(),
          inspirations,
        };
      }
      
      // Fallback: try the old endpoints
      const [insightsResult, commandsResult] = await Promise.all([
        apiGet<{
          noticing?: Array<{
            type: string;
            insight: string;
            evidence?: string;
            personaId?: string;
          }>;
          growth?: {
            message: string;
            details?: string;
          };
          holding?: {
            commitments?: Array<{ text: string; daysAgo: number }>;
            dreams?: Array<{ dream: string; status: string }>;
          };
        }>(`/api/insights/${userId}`),
        apiGet<{ personaId: string; commands: Command[]; count: number }>(`/api/commands/${this.personaId}`),
      ]);

      // Transform API insights to BetterThanHumanInsight format
      let insights = this.getDefaultInsights();
      if (insightsResult.ok && insightsResult.data) {
        const apiInsights: BetterThanHumanInsight[] = [];
        
        // Add "noticing" insights
        if (insightsResult.data.noticing && insightsResult.data.noticing.length > 0) {
          for (const n of insightsResult.data.noticing) {
            apiInsights.push({
              id: `notice-${apiInsights.length}`,
              type: n.type === 'pattern' ? 'pattern' : n.type === 'celebration' ? 'memory' : 'observation',
              icon: n.type === 'concern' ? 'heart' : n.type === 'celebration' ? 'sparkle' : 'eye',
              title: n.type === 'concern' ? 'I notice...' : n.type === 'celebration' ? 'Celebrating' : 'A pattern',
              description: n.insight,
              personaId: n.personaId,
            });
          }
        }
        
        // Add growth insight
        if (insightsResult.data.growth) {
          apiInsights.push({
            id: 'growth',
            type: 'pattern',
            icon: 'sun',
            title: 'Growth',
            description: insightsResult.data.growth.message,
          });
        }
        
        // Add commitment/dream insights
        if (insightsResult.data.holding) {
          if (insightsResult.data.holding.commitments && insightsResult.data.holding.commitments.length > 0) {
            apiInsights.push({
              id: 'commitment',
              type: 'memory',
              icon: 'heart',
              title: 'Better than human memory',
              description: `You said you'd ${insightsResult.data.holding.commitments[0].text}. That was ${insightsResult.data.holding.commitments[0].daysAgo} days ago.`,
              actionable: true,
              action: 'Check in on this',
            });
          }
        }
        
        if (apiInsights.length > 0) {
          insights = apiInsights;
        }
      }

      const practices = commandsResult.ok && commandsResult.data?.commands?.length
        ? this.transformCommandsToPractices(commandsResult.data.commands)
        : this.getDefaultPractices();

      return {
        greeting,
        timeContext,
        insights,
        practices,
        inspirations: this.getInspirations(timeContext),
      };
    } catch (error) {
      log.warn({ error }, 'Failed to load sanctuary data, using defaults');
      return {
        greeting,
        timeContext,
        insights: this.getDefaultInsights(),
        practices: this.getDefaultPractices(),
        inspirations: this.getInspirations(timeContext),
      };
    }
  }

  private getTimeContext(): TimeContext {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const dayNum = now.getDay();
    const isWeekend = dayNum === 0 || dayNum === 6;

    let period: TimeContext['period'];
    if (hour >= 5 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 17) period = 'afternoon';
    else if (hour >= 17 && hour < 21) period = 'evening';
    else period = 'night';

    return { period, dayOfWeek, isWeekend };
  }

  private getGreeting(time: TimeContext): string {
    const greetings = TIME_GREETINGS[time.period];
    return greetings[Math.floor(Math.random() * greetings.length)] ?? greetings[0] ?? 'Hello';
  }

  private transformCommandsToPractices(commands: Command[]): GuidedPractice[] {
    return commands.map((cmd) => ({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
      category: this.mapCategoryToPractice(cmd.category),
      personaId: this.personaId,
      prompt: cmd.id,
      icon: cmd.icon,
    }));
  }

  private mapCategoryToPractice(category: string): PracticeCategory {
    const mapping: Record<string, PracticeCategory> = {
      'check-in': 'ground',
      reflection: 'reflect',
      action: 'explore',
      review: 'reflect',
      planning: 'grow',
    };
    return mapping[category] ?? 'ground';
  }

  private getDefaultInsights(): BetterThanHumanInsight[] {
    const time = this.getTimeContext();
    const insights: BetterThanHumanInsight[] = [];

    // Time-aware insights
    if (time.period === 'morning') {
      insights.push({
        id: 'morning-pattern',
        type: 'pattern',
        icon: 'pattern',
        title: 'Your mornings set the tone',
        description: 'The conversations you start your day with tend to shape how the rest unfolds.',
      });
    } else if (time.period === 'evening') {
      insights.push({
        id: 'evening-reflection',
        type: 'observation',
        icon: 'observation',
        title: 'Evening reflections help',
        description: 'Taking a moment to reflect before rest often brings clarity to the next day.',
      });
    }

    // Always include a "Better Than Human" insight
    insights.push({
      id: 'bth-memory',
      type: 'memory',
      icon: 'memory',
      title: 'I remember everything',
      description: 'Every conversation, every detail, every growth moment. I hold your story complete.',
    });

    return insights;
  }

  private getDefaultPractices(): GuidedPractice[] {
    const time = this.getTimeContext();
    const practices: GuidedPractice[] = [];

    // Morning practices
    if (time.period === 'morning') {
      practices.push({
        id: 'morning-intention',
        name: 'Set Your Intention',
        description: 'Begin with clarity. What matters most today?',
        category: 'ground',
        duration: '3-5 min',
        personaId: 'ferni',
        prompt: '/daily-checkin',
        recommended: true,
        recommendedReason: 'Perfect for your morning',
      });
    }

    // Always available
    practices.push(
      {
        id: 'gratitude',
        name: 'Gratitude Moment',
        description: 'Notice what\'s already good. A small pause for appreciation.',
        category: 'reflect',
        duration: '2-3 min',
        personaId: 'ferni',
        prompt: '/gratitude',
      },
      {
        id: 'brainstorm',
        name: 'Think It Through',
        description: 'A challenge on your mind? Let\'s explore it together.',
        category: 'explore',
        duration: '5-10 min',
        personaId: 'ferni',
        prompt: '/brainstorm',
      },
      {
        id: 'weekly-review',
        name: 'Weekly Reflection',
        description: 'Look back with kindness. Celebrate progress. Plan gently.',
        category: 'reflect',
        duration: '10-15 min',
        personaId: 'ferni',
        prompt: '/weekly-review',
      }
    );

    // Evening practices
    if (time.period === 'evening' || time.period === 'night') {
      practices.push({
        id: 'wind-down',
        name: 'Wind Down',
        description: 'Release the day gently. Let tomorrow wait.',
        category: 'ground',
        duration: '5 min',
        personaId: 'ferni',
        prompt: '/wind-down',
        recommended: true,
        recommendedReason: 'A gentle way to end the day',
      });
    }

    return practices;
  }

  private getInspirations(time: TimeContext): Inspiration[] {
    const inspirations: Inspiration[] = [];

    // Time-specific wisdom
    if (time.period === 'morning') {
      inspirations.push({
        id: 'morning-wisdom',
        type: 'wisdom',
        content: 'You don\'t have to have it all figured out. Just take the next small step.',
        personaId: 'ferni',
      });
    } else if (time.period === 'evening') {
      inspirations.push({
        id: 'evening-wisdom',
        type: 'wisdom',
        content: 'Rest is not a reward for finishing. It\'s how you prepare to begin again.',
        personaId: 'maya',
      });
    }

    // Always include some quotes
    inspirations.push(
      {
        id: 'quote-1',
        type: 'quote',
        content: 'The present moment is filled with joy and happiness. If you are attentive, you will see it.',
        source: 'Thich Nhat Hanh',
      },
      {
        id: 'nudge-1',
        type: 'nudge',
        content: 'I\'m always here. No appointment needed. No judgment given.',
        personaId: 'ferni',
      }
    );

    return inspirations;
  }

  // ============================================================================
  // UI CREATION
  // ============================================================================

  private createUI(): void {
    if (!this.data) return;

    this.container = document.createElement('div');
    this.container.className = 'sanctuary-overlay';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'The Sanctuary - Guided Practices');

    const content = document.createElement('div');
    content.className = 'sanctuary-content';
    content.innerHTML = this.renderContent();

    this.container.appendChild(content);
    document.body.appendChild(this.container);

    // Bind events
    this.bindEvents();
  }

  private renderContent(): string {
    if (!this.data) return '';

    const { greeting, timeContext, insights, practices, inspirations } = this.data;

    // Group practices by category
    const practicesByCategory = this.groupPracticesByCategory(practices);
    const recommendedPractice = practices.find((p) => p.recommended);

    return `
      <!-- Header -->
      <header class="sanctuary-header">
        <button class="sanctuary-close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
        
        <div class="sanctuary-greeting">
          <span class="sanctuary-time">${escapeHtml(timeContext.dayOfWeek)}</span>
          <h1 class="sanctuary-title">${escapeHtml(greeting)}</h1>
        </div>
      </header>

      <!-- Main Content Grid -->
      <div class="sanctuary-grid">
        
        <!-- Left Column: Insights + Inspiration -->
        <aside class="sanctuary-sidebar">
          
          <!-- Better Than Human Insights -->
          <section class="sanctuary-section sanctuary-insights">
            <div class="sanctuary-section-header">
              <span class="sanctuary-eyebrow">What I Notice</span>
              <h2 class="sanctuary-section-title">Better than human memory</h2>
            </div>
            
            <div class="sanctuary-insight-list">
              ${insights.map((insight, i) => this.renderInsight(insight, i)).join('')}
            </div>
          </section>

          <!-- Inspiration -->
          <section class="sanctuary-section sanctuary-inspiration">
            <div class="sanctuary-section-header">
              <span class="sanctuary-eyebrow">A thought</span>
            </div>
            
            ${inspirations.slice(0, 2).map((insp) => this.renderInspiration(insp)).join('')}
          </section>
        </aside>

        <!-- Right Column: Practices -->
        <main class="sanctuary-main">
          
          <!-- Recommended Practice (if any) -->
          ${recommendedPractice ? this.renderRecommendedPractice(recommendedPractice) : ''}

          <!-- All Practices by Category -->
          <section class="sanctuary-section sanctuary-practices">
            <div class="sanctuary-section-header">
              <span class="sanctuary-eyebrow">Guided Practices</span>
              <h2 class="sanctuary-section-title">Choose what calls to you</h2>
            </div>
            
            <div class="sanctuary-categories">
              ${Object.entries(practicesByCategory)
                .map(([category, categoryPractices]) =>
                  this.renderPracticeCategory(category as PracticeCategory, categoryPractices)
                )
                .join('')}
            </div>
          </section>
        </main>
      </div>

      <!-- Ambient Background -->
      <div class="sanctuary-ambient">
        <div class="sanctuary-gradient"></div>
        <div class="sanctuary-particles"></div>
      </div>
    `;
  }

  private renderInsight(insight: BetterThanHumanInsight, index: number): string {
    const icon = INSIGHT_ICONS[insight.icon] ?? INSIGHT_ICONS['observation'];
    const delay = index * 100;

    return `
      <div class="sanctuary-insight" style="animation-delay: ${delay}ms">
        <div class="sanctuary-insight-icon">${icon}</div>
        <div class="sanctuary-insight-content">
          <h3 class="sanctuary-insight-title">${escapeHtml(insight.title)}</h3>
          <p class="sanctuary-insight-desc">${escapeHtml(insight.description)}</p>
        </div>
      </div>
    `;
  }

  private renderInspiration(inspiration: Inspiration): string {
    const isQuote = inspiration.type === 'quote';

    return `
      <blockquote class="sanctuary-quote ${inspiration.type}">
        <p class="sanctuary-quote-text">${escapeHtml(inspiration.content)}</p>
        ${inspiration.source ? `<cite class="sanctuary-quote-source">— ${escapeHtml(inspiration.source)}</cite>` : ''}
      </blockquote>
    `;
  }

  private renderRecommendedPractice(practice: GuidedPractice): string {
    const category = CATEGORY_CONFIG[practice.category];

    return `
      <section class="sanctuary-recommended">
        <div class="sanctuary-recommended-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>Suggested for now</span>
        </div>
        
        <button 
          class="sanctuary-practice-card sanctuary-practice-card--recommended"
          data-practice-id="${escapeHtml(practice.id)}"
          data-prompt="${escapeHtml(practice.prompt)}"
          aria-label="Start ${escapeHtml(practice.name)}"
        >
          <div class="sanctuary-practice-icon" style="background: ${category.color}">
            ${category.icon}
          </div>
          
          <div class="sanctuary-practice-content">
            <h3 class="sanctuary-practice-name">${escapeHtml(practice.name)}</h3>
            <p class="sanctuary-practice-desc">${escapeHtml(practice.description)}</p>
            ${practice.recommendedReason ? `<span class="sanctuary-practice-reason">${escapeHtml(practice.recommendedReason)}</span>` : ''}
          </div>
          
          <div class="sanctuary-practice-meta">
            ${practice.duration ? `<span class="sanctuary-practice-duration">${escapeHtml(practice.duration)}</span>` : ''}
            <span class="sanctuary-practice-start">Begin</span>
          </div>
        </button>
      </section>
    `;
  }

  private renderPracticeCategory(category: PracticeCategory, practices: GuidedPractice[]): string {
    if (practices.length === 0) return '';

    const config = CATEGORY_CONFIG[category];

    return `
      <div class="sanctuary-category">
        <div class="sanctuary-category-header">
          <div class="sanctuary-category-icon" style="color: ${config.color}">
            ${config.icon}
          </div>
          <div class="sanctuary-category-info">
            <h3 class="sanctuary-category-name">${escapeHtml(config.name)}</h3>
            <p class="sanctuary-category-desc">${escapeHtml(config.description)}</p>
          </div>
        </div>
        
        <div class="sanctuary-practice-list">
          ${practices.map((p) => this.renderPracticeCard(p)).join('')}
        </div>
      </div>
    `;
  }

  private renderPracticeCard(practice: GuidedPractice): string {
    return `
      <button 
        class="sanctuary-practice-item"
        data-practice-id="${escapeHtml(practice.id)}"
        data-prompt="${escapeHtml(practice.prompt)}"
        aria-label="Start ${escapeHtml(practice.name)}"
      >
        <div class="sanctuary-practice-item-content">
          <span class="sanctuary-practice-item-name">${escapeHtml(practice.name)}</span>
          <span class="sanctuary-practice-item-desc">${escapeHtml(practice.description)}</span>
        </div>
        ${practice.duration ? `<span class="sanctuary-practice-item-duration">${escapeHtml(practice.duration)}</span>` : ''}
      </button>
    `;
  }

  private groupPracticesByCategory(practices: GuidedPractice[]): Record<PracticeCategory, GuidedPractice[]> {
    const grouped: Record<PracticeCategory, GuidedPractice[]> = {
      ground: [],
      reflect: [],
      explore: [],
      connect: [],
      grow: [],
    };

    practices.forEach((p) => {
      // Don't include recommended practice in main list
      if (!p.recommended) {
        grouped[p.category].push(p);
      }
    });

    return grouped;
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  private bindEvents(): void {
    if (!this.container) return;

    // Close button
    const closeBtn = this.container.querySelector('.sanctuary-close');
    closeBtn?.addEventListener('click', () => this.close());

    // Backdrop click
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    // Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Practice cards
    const practiceCards = this.container.querySelectorAll('[data-practice-id]');
    practiceCards.forEach((card) => {
      card.addEventListener('click', () => {
        const practiceId = card.getAttribute('data-practice-id');
        const prompt = card.getAttribute('data-prompt');
        if (practiceId && prompt) {
          this.selectPractice(practiceId, prompt);
        }
      });
    });
  }

  private selectPractice(practiceId: string, prompt: string): void {
    const practice = this.data?.practices.find((p) => p.id === practiceId);
    if (!practice) {
      log.warn('Practice not found', { practiceId });
      return;
    }

    // Check if voice is connected
    const roomState = connectionService.getRoomState();
    const isVoiceConnected = roomState.isConnected;

    log.info('Practice selected', {
      practiceId,
      name: practice.name,
      voiceConnected: isVoiceConnected,
    });

    // Close sanctuary first
    this.close();

    if (isVoiceConnected) {
      // Voice is connected - use voice mode
      // Fire callback for voice handoff
      if (this.onPracticeSelected) {
        this.onPracticeSelected(practice);
      }

      // Dispatch event for voice agent to pick up
      window.dispatchEvent(
        new CustomEvent('ferni:start-practice', {
          detail: { practiceId, prompt, practice },
        })
      );
    } else {
      // Voice not connected - launch self-directed practice experience
      log.info('Launching self-directed practice', { name: practice.name });
      practiceExperienceUI.startPractice({
        id: practice.id,
        name: practice.name,
        description: practice.description,
        category: practice.category,
        prompt: practice.prompt,
        icon: practice.icon,
      });
    }
  }

  // ============================================================================
  // ANIMATIONS
  // ============================================================================

  private async animateIn(): Promise<void> {
    if (!this.container || prefersReducedMotion()) return;

    return new Promise((resolve) => {
      // Fade in overlay
      this.container?.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: DURATION.SLOW, easing: EASING.STANDARD }
      );

      // Scale up content
      const content = this.container?.querySelector('.sanctuary-content');
      content?.animate(
        [
          { opacity: 0, transform: 'scale(0.96) translateY(20px)' },
          { opacity: 1, transform: 'scale(1) translateY(0)' },
        ],
        { duration: DURATION.MODERATE, easing: EASING.EXPO_OUT }
      );

      // Stagger in sections
      const sections = this.container?.querySelectorAll('.sanctuary-section');
      sections?.forEach((section, i) => {
        (section as HTMLElement).animate(
          [
            { opacity: 0, transform: 'translateY(16px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: DURATION.MODERATE,
            delay: 100 + i * 80,
            easing: EASING.EXPO_OUT,
            fill: 'both',
          }
        );
      });

      setTimeout(resolve, DURATION.MODERATE + 300);
    });
  }

  private async animateOut(): Promise<void> {
    if (!this.container || prefersReducedMotion()) return;

    return new Promise((resolve) => {
      const content = this.container?.querySelector('.sanctuary-content');

      // Scale down content
      content?.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.96)' },
        ],
        { duration: DURATION.SLOW, easing: EASING.STANDARD }
      );

      // Fade out overlay
      this.container?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: DURATION.SLOW,
        easing: EASING.STANDARD,
      });

      setTimeout(resolve, DURATION.SLOW);
    });
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  private injectStyles(): void {
    if (document.getElementById('sanctuary-styles')) return;

    const style = document.createElement('style');
    style.id = 'sanctuary-styles';
    style.textContent = `
      /* ============================================
         THE SANCTUARY - Immersive Guided Practices
         ============================================ */

      .sanctuary-overlay {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 2100);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-utility-backdrop, rgba(20, 16, 14, 0.85));
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        overflow: hidden;
      }

      .sanctuary-content {
        position: relative;
        width: 100%;
        max-width: 1000px;
        max-height: 90vh;
        margin: var(--space-lg, 24px);
        background: var(--color-bg-elevated, #fffdfb);
        border-radius: var(--radius-2xl, 20px);
        box-shadow: 
          0 32px 64px rgba(0, 0, 0, 0.25),
          0 0 0 1px var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* ============================================
         HEADER
         ============================================ */

      .sanctuary-header {
        position: relative;
        padding: var(--space-lg, 24px) var(--space-xl, 32px);
        background: linear-gradient(
          to bottom,
          var(--color-bg-elevated, #fffdfb),
          transparent
        );
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .sanctuary-close {
        position: absolute;
        top: var(--space-md, 16px);
        right: var(--space-md, 16px);
        width: 40px;
        height: 40px;
        border: none;
        background: var(--color-tonal-surface2, rgba(44, 37, 32, 0.04));
        border-radius: var(--radius-full, 50%);
        color: var(--color-text-muted, #756a5e);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .sanctuary-close:hover {
        background: var(--color-tonal-surface3, rgba(44, 37, 32, 0.08));
        color: var(--color-text-primary, #2c2520);
      }

      .sanctuary-close:focus-visible {
        outline: 2px solid var(--color-accent-primary, #3D5A45);
        outline-offset: 2px;
      }

      .sanctuary-greeting {
        text-align: center;
        padding: var(--space-md, 16px) 0;
      }

      .sanctuary-time {
        display: block;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted, #756a5e);
        margin-bottom: var(--space-xs, 4px);
      }

      .sanctuary-title {
        font-family: var(--font-narrative, 'EB Garamond', Georgia, serif);
        font-size: clamp(1.75rem, 4vw, 2.5rem);
        font-weight: 400;
        font-style: italic;
        color: var(--color-text-primary, #2c2520);
        line-height: 1.2;
        margin: 0;
      }

      /* ============================================
         GRID LAYOUT
         ============================================ */

      .sanctuary-grid {
        display: grid;
        grid-template-columns: 320px 1fr;
        gap: var(--space-lg, 24px);
        padding: var(--space-lg, 24px);
        overflow-y: auto;
        flex: 1;
      }

      @media (max-width: 768px) {
        .sanctuary-grid {
          grid-template-columns: 1fr;
        }
      }

      /* ============================================
         SIDEBAR (Insights + Inspiration)
         ============================================ */

      .sanctuary-sidebar {
        display: flex;
        flex-direction: column;
        gap: var(--space-lg, 24px);
      }

      .sanctuary-section {
        padding: var(--space-md, 16px);
        background: var(--color-tonal-surface1, rgba(44, 37, 32, 0.02));
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .sanctuary-section-header {
        margin-bottom: var(--space-md, 16px);
      }

      .sanctuary-eyebrow {
        display: block;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--color-accent-primary, #3D5A45);
        margin-bottom: var(--space-2xs, 4px);
      }

      .sanctuary-section-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
      }

      /* ============================================
         INSIGHTS
         ============================================ */

      .sanctuary-insight-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm, 12px);
      }

      .sanctuary-insight {
        display: flex;
        gap: var(--space-sm, 12px);
        padding: var(--space-sm, 12px);
        background: var(--color-bg-elevated, #fffdfb);
        border-radius: var(--radius-md, 8px);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        animation: sanctuaryFadeIn 0.5s ease-out forwards;
        opacity: 0;
      }

      @keyframes sanctuaryFadeIn {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .sanctuary-insight-icon {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        border-radius: var(--radius-md, 8px);
        color: var(--color-accent-primary, #3D5A45);
      }

      .sanctuary-insight-content {
        flex: 1;
        min-width: 0;
      }

      .sanctuary-insight-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-2xs, 4px) 0;
      }

      .sanctuary-insight-desc {
        font-size: 12px;
        color: var(--color-text-muted, #756a5e);
        line-height: 1.5;
        margin: 0;
      }

      /* ============================================
         INSPIRATION / QUOTES
         ============================================ */

      .sanctuary-quote {
        padding: var(--space-md, 16px);
        background: var(--color-bg-elevated, #fffdfb);
        border-radius: var(--radius-md, 8px);
        border-left: 3px solid var(--color-accent-primary, #3D5A45);
        margin: var(--space-sm, 8px) 0;
      }

      .sanctuary-quote.nudge {
        border-left-color: var(--color-ferni, #4a6741);
        background: rgba(74, 103, 65, 0.04);
      }

      .sanctuary-quote-text {
        font-family: var(--font-narrative, 'EB Garamond', Georgia, serif);
        font-size: 14px;
        font-style: italic;
        color: var(--color-text-secondary, #5c544a);
        line-height: 1.6;
        margin: 0;
      }

      .sanctuary-quote-source {
        display: block;
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 11px;
        font-style: normal;
        color: var(--color-text-muted, #756a5e);
        margin-top: var(--space-sm, 8px);
      }

      /* ============================================
         MAIN CONTENT (Practices)
         ============================================ */

      .sanctuary-main {
        display: flex;
        flex-direction: column;
        gap: var(--space-lg, 24px);
      }

      /* ============================================
         RECOMMENDED PRACTICE
         ============================================ */

      .sanctuary-recommended {
        position: relative;
      }

      .sanctuary-recommended-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs, 6px);
        padding: var(--space-xs, 6px) var(--space-sm, 10px);
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        border-radius: var(--radius-full, 50px);
        color: var(--color-accent-primary, #3D5A45);
        font-size: 11px;
        font-weight: 600;
        margin-bottom: var(--space-sm, 12px);
      }

      .sanctuary-practice-card--recommended {
        display: flex;
        align-items: center;
        gap: var(--space-md, 16px);
        padding: var(--space-lg, 20px);
        background: linear-gradient(
          135deg,
          var(--color-bg-elevated, #fffdfb),
          var(--color-accent-subtle, rgba(61, 90, 69, 0.04))
        );
        border: 1px solid var(--color-accent-glow, rgba(61, 90, 69, 0.15));
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: all 0.3s ease;
        text-align: left;
        width: 100%;
      }

      .sanctuary-practice-card--recommended:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px var(--color-accent-glow, rgba(61, 90, 69, 0.15));
        border-color: var(--color-accent-primary, #3D5A45);
      }

      .sanctuary-practice-card--recommended:focus-visible {
        outline: 2px solid var(--color-accent-primary, #3D5A45);
        outline-offset: 2px;
      }

      .sanctuary-practice-icon {
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-lg, 12px);
        color: white;
      }

      .sanctuary-practice-content {
        flex: 1;
        min-width: 0;
      }

      .sanctuary-practice-name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 16px;
        font-weight: 600;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-2xs, 4px) 0;
      }

      .sanctuary-practice-desc {
        font-size: 13px;
        color: var(--color-text-secondary, #5c544a);
        line-height: 1.4;
        margin: 0;
      }

      .sanctuary-practice-reason {
        display: block;
        font-size: 11px;
        color: var(--color-accent-primary, #3D5A45);
        margin-top: var(--space-xs, 6px);
      }

      .sanctuary-practice-meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--space-xs, 6px);
      }

      .sanctuary-practice-duration {
        font-size: 11px;
        color: var(--color-text-muted, #756a5e);
      }

      .sanctuary-practice-start {
        padding: var(--space-xs, 6px) var(--space-md, 12px);
        background: var(--color-accent-primary, #3D5A45);
        color: white;
        font-size: 12px;
        font-weight: 600;
        border-radius: var(--radius-full, 50px);
        transition: all 0.2s ease;
      }

      .sanctuary-practice-card--recommended:hover .sanctuary-practice-start {
        background: var(--color-accent-hover, #4a6b52);
      }

      /* ============================================
         PRACTICE CATEGORIES
         ============================================ */

      .sanctuary-categories {
        display: flex;
        flex-direction: column;
        gap: var(--space-lg, 24px);
      }

      .sanctuary-category {
        padding: var(--space-md, 16px);
        background: var(--color-tonal-surface1, rgba(44, 37, 32, 0.02));
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .sanctuary-category-header {
        display: flex;
        align-items: center;
        gap: var(--space-sm, 12px);
        margin-bottom: var(--space-md, 16px);
        padding-bottom: var(--space-sm, 12px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .sanctuary-category-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .sanctuary-category-info {
        flex: 1;
      }

      .sanctuary-category-name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 14px;
        font-weight: 600;
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .sanctuary-category-desc {
        font-size: 12px;
        color: var(--color-text-muted, #756a5e);
        margin: 0;
      }

      .sanctuary-practice-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm, 8px);
      }

      .sanctuary-practice-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-md, 16px);
        padding: var(--space-sm, 12px) var(--space-md, 16px);
        background: var(--color-bg-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        text-align: left;
        transition: all 0.2s ease;
        width: 100%;
      }

      .sanctuary-practice-item:hover {
        background: var(--color-tonal-surfaceHover, rgba(44, 37, 32, 0.04));
        border-color: var(--color-border-medium, rgba(44, 37, 32, 0.1));
      }

      .sanctuary-practice-item:focus-visible {
        outline: 2px solid var(--color-accent-primary, #3D5A45);
        outline-offset: 2px;
      }

      .sanctuary-practice-item-content {
        flex: 1;
        min-width: 0;
      }

      .sanctuary-practice-item-name {
        display: block;
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text-primary, #2c2520);
      }

      .sanctuary-practice-item-desc {
        display: block;
        font-size: 12px;
        color: var(--color-text-muted, #756a5e);
        margin-top: var(--space-2xs, 2px);
      }

      .sanctuary-practice-item-duration {
        font-size: 11px;
        color: var(--color-text-dimmed, #857a6e);
        white-space: nowrap;
      }

      /* ============================================
         AMBIENT BACKGROUND
         ============================================ */

      .sanctuary-ambient {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: -1;
      }

      .sanctuary-gradient {
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse at 30% 20%,
          var(--color-accent-subtle, rgba(61, 90, 69, 0.04)) 0%,
          transparent 50%
        );
      }

      .sanctuary-particles {
        position: absolute;
        inset: 0;
        opacity: 0.3;
      }

      /* ============================================
         DARK THEME OVERRIDES
         ============================================ */

      [data-theme="midnight"] .sanctuary-content {
        background: var(--color-bg-elevated, #70605a);
      }

      [data-theme="midnight"] .sanctuary-section {
        background: rgba(245, 242, 237, 0.03);
        border-color: rgba(215, 185, 145, 0.08);
      }

      [data-theme="midnight"] .sanctuary-insight,
      [data-theme="midnight"] .sanctuary-quote,
      [data-theme="midnight"] .sanctuary-practice-item {
        background: rgba(245, 242, 237, 0.04);
        border-color: rgba(215, 185, 145, 0.08);
      }

      [data-theme="midnight"] .sanctuary-practice-card--recommended {
        background: linear-gradient(
          135deg,
          rgba(245, 242, 237, 0.04),
          rgba(212, 168, 74, 0.08)
        );
        border-color: rgba(212, 168, 74, 0.2);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */

      @media (max-width: 768px) {
        .sanctuary-content {
          margin: var(--space-sm, 12px);
          max-height: 95vh;
          border-radius: var(--radius-xl, 16px);
        }

        .sanctuary-header {
          padding: var(--space-md, 16px);
        }

        .sanctuary-grid {
          padding: var(--space-md, 16px);
          gap: var(--space-md, 16px);
        }

        .sanctuary-practice-card--recommended {
          flex-direction: column;
          text-align: center;
        }

        .sanctuary-practice-meta {
          flex-direction: row;
          align-items: center;
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .sanctuary-insight {
          animation: none;
          opacity: 1;
        }

        .sanctuary-practice-card--recommended:hover,
        .sanctuary-practice-item:hover {
          transform: none;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let sanctuaryInstance: SanctuaryUI | null = null;

export function getSanctuaryUI(): SanctuaryUI {
  if (!sanctuaryInstance) {
    sanctuaryInstance = new SanctuaryUI();
  }
  return sanctuaryInstance;
}

// Export for convenience
export const sanctuaryUI = {
  open: () => getSanctuaryUI().open(),
  close: () => getSanctuaryUI().close(),
  setPersonaId: (id: string) => getSanctuaryUI().setPersonaId(id),
  setOnPracticeSelected: (cb: (practice: GuidedPractice) => void) =>
    getSanctuaryUI().setOnPracticeSelected(cb),
};

export type { SanctuaryData, GuidedPractice, BetterThanHumanInsight, Inspiration };
