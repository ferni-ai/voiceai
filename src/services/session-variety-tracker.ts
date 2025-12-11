/**
 * Session Variety Tracker
 *
 * Prevents repetitive personality expressions by tracking themes mentioned
 * per session. Ferni's core identity stays consistent, but HOW he expresses
 * it varies naturally - like a real person who loves coffee but doesn't
 * mention it every conversation.
 *
 * Philosophy: Static personality files define WHO Ferni is.
 * This tracker ensures he expresses himself dynamically, not repetitively.
 *
 * @module services/session-variety-tracker
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'session-variety-tracker' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Theme categories that group related personality expressions
 * These map multiple specific mentions to a single theme
 */
export type ThemeCategory =
  | 'warm_drinks' // coffee, tea, mint tea
  | 'global_traveler' // Japan, Morocco, Wyoming, Brazil, Scotland
  | 'music_taste' // Bon Iver, Japanese songs, jazz
  | 'family_life' // wife, kids, brother
  | 'physical_habits' // notebook, glasses, early riser
  | 'food_opinions' // street food, cereal, pineapple pizza
  | 'nature_connection' // Tetons, sky, weather, sunrise
  | 'philosophical' // meaning, presence, patience
  | 'vulnerability' // tsunami, grief, survivor guilt
  | 'professional' // coaching, listening, questions
  | 'quirky_interests' // golf, disaster movies, flight searches
  | 'sensory_moment'; // sounds, smells, textures

/**
 * A specific personality expression with its theme
 */
export interface PersonalityExpression {
  id: string;
  theme: ThemeCategory;
  content: string;
  weight?: number; // Higher = more likely to be selected (default: 1.0)
  emotionalContext?: string[]; // Only use when user emotion matches
}

/**
 * Selection options for variety-aware selection
 */
export interface SelectionOptions {
  /** Force this theme even if used (for follow-ups) */
  forceTheme?: ThemeCategory;
  /** Only consider expressions matching this emotion */
  emotionalContext?: string;
  /** Boost weight for these themes */
  preferThemes?: ThemeCategory[];
  /** How many items to select */
  count?: number;
}

/**
 * Session variety state
 */
interface SessionState {
  usedThemes: Set<ThemeCategory>;
  usedExpressionIds: Set<string>;
  themeUsageCounts: Map<ThemeCategory, number>;
  lastThemeUsed: ThemeCategory | null;
  turnCount: number;
}

// ============================================================================
// THEME MAPPINGS
// ============================================================================

/**
 * Keyword to theme mapping - ORDER MATTERS for detection
 * More specific keywords must come before generic ones
 * (e.g., "mint tea from Morocco" should match 'morocco' not 'tea')
 */
const KEYWORD_TO_THEME_ORDERED: [string, ThemeCategory][] = [
  // Global traveler (check BEFORE warm drinks since "mint tea from Morocco" should be traveler)
  ['japan', 'global_traveler'],
  ['japanese', 'global_traveler'],
  ['tokyo', 'global_traveler'],
  ['morocco', 'global_traveler'],
  ['marrakech', 'global_traveler'],
  ['wyoming', 'global_traveler'],
  ['tetons', 'global_traveler'],
  ['brazil', 'global_traveler'],
  ['scotland', 'global_traveler'],
  ['mumbai', 'global_traveler'],
  ['passport', 'global_traveler'],

  // Warm drinks (after locations so "mint tea from Morocco" isn't caught by "tea")
  ['coffee', 'warm_drinks'],
  ['mint tea', 'warm_drinks'],
  ['tea', 'warm_drinks'],

  // Music
  ['bon iver', 'music_taste'],
  ['sukiyaki', 'music_taste'],
  ['jazz', 'music_taste'],
  ['playlist', 'music_taste'],
  ['song', 'music_taste'],
  ['music', 'music_taste'],

  // Family
  ['wife', 'family_life'],
  ['kids', 'family_life'],
  ['children', 'family_life'],
  ['brother', 'family_life'],
  ['family', 'family_life'],

  // Physical habits
  ['notebook', 'physical_habits'],
  ['glasses', 'physical_habits'],
  ['5 am', 'physical_habits'],
  ['morning', 'physical_habits'],
  ['bow', 'physical_habits'],

  // Food
  ['street food', 'food_opinions'],
  ['cereal', 'food_opinions'],
  ['pineapple', 'food_opinions'],

  // Nature
  ['sky', 'nature_connection'],
  ['weather', 'nature_connection'],
  ['sunrise', 'nature_connection'],
  ['sunset', 'nature_connection'],
  ['mountains', 'nature_connection'],
  ['stars', 'nature_connection'],

  // Philosophical
  ['meaning', 'philosophical'],
  ['purpose', 'philosophical'],
  ['presence', 'philosophical'],
  ['patience', 'philosophical'],

  // Vulnerability
  ['tsunami', 'vulnerability'],
  ['grief', 'vulnerability'],
  ['2011', 'vulnerability'],
  ['survivor guilt', 'vulnerability'],

  // Professional
  ['coaching', 'professional'],
  ['listening', 'professional'],
  ['breakthrough', 'professional'],

  // Quirky
  ['golf', 'quirky_interests'],
  ['disaster movies', 'quirky_interests'],
  ['flights', 'quirky_interests'],
];

// ============================================================================
// SESSION VARIETY TRACKER
// ============================================================================

/**
 * Tracks variety within a session to prevent repetitive expressions
 */
export class SessionVarietyTracker {
  private sessionStates = new Map<string, SessionState>();

  // Configuration
  private readonly config = {
    /** Max times a theme can be used per session */
    maxThemeUsagePerSession: 2,
    /** Min turns before a theme can be reused */
    themeReuseMinTurns: 5,
    /** Probability of avoiding recently-used themes */
    avoidanceWeight: 0.8,
  };

  /**
   * Get or create session state
   */
  private getState(sessionId: string): SessionState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = {
        usedThemes: new Set(),
        usedExpressionIds: new Set(),
        themeUsageCounts: new Map(),
        lastThemeUsed: null,
        turnCount: 0,
      };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Detect theme from content
   * Uses ordered keyword list so specific matches come before generic ones
   */
  detectTheme(content: string): ThemeCategory | null {
    const lowerContent = content.toLowerCase();
    for (const [keyword, theme] of KEYWORD_TO_THEME_ORDERED) {
      if (lowerContent.includes(keyword)) {
        return theme;
      }
    }
    return null;
  }

  /**
   * Check if a theme should be avoided this session
   */
  shouldAvoidTheme(sessionId: string, theme: ThemeCategory): boolean {
    const state = this.getState(sessionId);

    // Check usage count
    const usageCount = state.themeUsageCounts.get(theme) || 0;
    if (usageCount >= this.config.maxThemeUsagePerSession) {
      return true;
    }

    // Avoid if it was the last theme used (prevents back-to-back)
    if (state.lastThemeUsed === theme) {
      return true;
    }

    return false;
  }

  /**
   * Record that a theme/expression was used
   */
  recordUsage(sessionId: string, theme: ThemeCategory, expressionId?: string): void {
    const state = this.getState(sessionId);

    state.usedThemes.add(theme);
    state.themeUsageCounts.set(theme, (state.themeUsageCounts.get(theme) || 0) + 1);
    state.lastThemeUsed = theme;

    if (expressionId) {
      state.usedExpressionIds.add(expressionId);
    }

    log.debug({ sessionId, theme, expressionId }, 'Recorded variety usage');
  }

  /**
   * Record a turn (call at end of each turn)
   */
  recordTurn(sessionId: string): void {
    const state = this.getState(sessionId);
    state.turnCount++;

    // Reset lastThemeUsed after a few turns to allow reuse
    if (state.turnCount % this.config.themeReuseMinTurns === 0) {
      state.lastThemeUsed = null;
    }
  }

  /**
   * Select from a pool of expressions with variety tracking
   */
  selectWithVariety<T extends PersonalityExpression>(
    sessionId: string,
    pool: T[],
    options: SelectionOptions = {}
  ): T | null {
    if (pool.length === 0) return null;

    const state = this.getState(sessionId);
    const count = options.count || 1;

    // Filter pool based on variety
    let candidates = pool.filter((expr) => {
      // Skip already-used expressions
      if (state.usedExpressionIds.has(expr.id)) {
        return false;
      }

      // Skip avoided themes (unless forced)
      if (!options.forceTheme && this.shouldAvoidTheme(sessionId, expr.theme)) {
        return false;
      }

      // Filter by emotional context if specified
      if (options.emotionalContext && expr.emotionalContext) {
        if (!expr.emotionalContext.includes(options.emotionalContext)) {
          return false;
        }
      }

      return true;
    });

    // If no candidates after filtering, fall back to unused expressions only
    if (candidates.length === 0) {
      candidates = pool.filter((expr) => !state.usedExpressionIds.has(expr.id));
    }

    // If still no candidates, just use the full pool (better than nothing)
    if (candidates.length === 0) {
      log.debug({ sessionId, poolSize: pool.length }, 'All expressions used, resetting pool');
      candidates = pool;
    }

    // Apply weights
    const weightedCandidates = candidates.map((expr) => {
      let weight = expr.weight || 1.0;

      // Boost preferred themes
      if (options.preferThemes?.includes(expr.theme)) {
        weight *= 1.5;
      }

      // Reduce weight for recently-used themes (soft avoidance)
      if (state.usedThemes.has(expr.theme)) {
        weight *= 1 - this.config.avoidanceWeight;
      }

      return { expr, weight };
    });

    // Weighted random selection
    const totalWeight = weightedCandidates.reduce((sum, c) => sum + c.weight, 0);
    let random = Math.random() * totalWeight;

    for (const { expr, weight } of weightedCandidates) {
      random -= weight;
      if (random <= 0) {
        // Record usage
        this.recordUsage(sessionId, expr.theme, expr.id);
        return expr;
      }
    }

    // Fallback to first candidate
    const selected = candidates[0];
    this.recordUsage(sessionId, selected.theme, selected.id);
    return selected;
  }

  /**
   * Select multiple expressions with variety
   */
  selectMultipleWithVariety<T extends PersonalityExpression>(
    sessionId: string,
    pool: T[],
    count: number,
    options: Omit<SelectionOptions, 'count'> = {}
  ): T[] {
    const results: T[] = [];
    const usedInThisSelection = new Set<string>();

    for (let i = 0; i < count && i < pool.length; i++) {
      // Filter out already selected in this batch
      const availablePool = pool.filter((e) => !usedInThisSelection.has(e.id));
      const selected = this.selectWithVariety(sessionId, availablePool, options);

      if (selected) {
        results.push(selected);
        usedInThisSelection.add(selected.id);
      }
    }

    return results;
  }

  /**
   * Get usage stats for a session
   */
  getStats(sessionId: string): {
    usedThemes: ThemeCategory[];
    themeUsageCounts: Record<ThemeCategory, number>;
    usedExpressionCount: number;
    turnCount: number;
  } {
    const state = this.getState(sessionId);

    return {
      usedThemes: Array.from(state.usedThemes),
      themeUsageCounts: Object.fromEntries(state.themeUsageCounts) as Record<ThemeCategory, number>,
      usedExpressionCount: state.usedExpressionIds.size,
      turnCount: state.turnCount,
    };
  }

  /**
   * Clear session state
   */
  clearSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
    log.debug({ sessionId }, 'Session variety state cleared');
  }

  /**
   * Clear all sessions (for testing)
   */
  clearAll(): void {
    this.sessionStates.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultTracker: SessionVarietyTracker | null = null;

export function getSessionVarietyTracker(): SessionVarietyTracker {
  if (!defaultTracker) {
    defaultTracker = new SessionVarietyTracker();
  }
  return defaultTracker;
}

export function resetSessionVarietyTracker(): void {
  defaultTracker = null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  SessionVarietyTracker,
  getSessionVarietyTracker,
  resetSessionVarietyTracker,
};
