/**
 * User Personalization Layer
 *
 * Learns individual user preferences to improve routing accuracy.
 * A user who always says "play music" meaning Spotify should get
 * boosted Spotify confidence, while another who means Apple Music
 * should get Apple Music boosted.
 *
 * Features:
 * 1. Per-user tool boosts learned from history
 * 2. Vocabulary adaptation (user's word → tool mapping)
 * 3. Time-of-day preferences
 * 4. Context-dependent routing (work vs personal)
 *
 * @module tools/semantic-router/advanced/personalization
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import {
  initializeFirestorePersistence,
  isPersistenceAvailable,
  saveUserProfile as persistProfile,
  loadUserProfile as loadPersistedProfile,
  type PersistedUserProfile,
} from '../persistence/index.js';

const log = createLogger({ module: 'semantic-router:personalization' });

// Simplified ToolMatch for internal use (avoids complex type dependency)
interface ToolMatch {
  toolId: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// TYPES
// ============================================================================

export interface UserProfile {
  userId: string;

  // Tool preference adjustments
  toolBoosts: Map<string, number>; // toolId → boost (-0.5 to +0.5)

  // Vocabulary mapping
  vocabulary: Map<string, string>; // user's phrase → toolId

  // Time-of-day preferences
  timePatterns: Map<string, Map<string, number>>; // hour → toolId → frequency

  // Context preferences
  contextPatterns: Map<string, Map<string, number>>; // context → toolId → frequency

  // Statistics
  totalInteractions: number;
  lastUpdated: Date;
  correctionRate: number;
}

interface PersonalizationConfig {
  minInteractionsForBoost: number;
  maxBoost: number;
  decayFactor: number; // How fast old preferences decay
  learningRate: number;
}

interface InteractionEvent {
  userId: string;
  query: string;
  predictedTool: string;
  actualTool: string;
  timestamp: Date;
  context?: string;
}

// ============================================================================
// PERSONALIZATION ENGINE
// ============================================================================

export class PersonalizationEngine {
  private profiles = new Map<string, UserProfile>();
  private dirtyProfiles = new Set<string>();
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private loadedProfiles = new Set<string>(); // Track which profiles have been loaded from Firestore
  private initialized = false;

  private config: PersonalizationConfig = {
    minInteractionsForBoost: 5,
    maxBoost: 0.3,
    decayFactor: 0.95, // 5% decay per day
    learningRate: 0.1,
  };

  constructor(customConfig?: Partial<PersonalizationConfig>) {
    if (customConfig) {
      Object.assign(this.config, customConfig);
    }
  }

  /**
   * Initialize the engine (loads Firestore connection)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await initializeFirestorePersistence();
      this.initialized = true;
      log.info('PersonalizationEngine initialized with Firestore persistence');
    } catch (error) {
      log.warn({ error: String(error) }, 'PersonalizationEngine using in-memory only');
      this.initialized = true;
    }
  }

  /**
   * Apply user personalization to tool matches
   * Will auto-load profile from Firestore if not in memory
   */
  personalize(
    userId: string,
    matches: ToolMatch[],
    context?: { query: string; time?: Date; contextTag?: string }
  ): ToolMatch[] {
    const profile = this.profiles.get(userId);

    // Trigger background load if profile not in memory and not yet loaded
    if (!profile && !this.loadedProfiles.has(userId)) {
      this.loadProfileInBackground(userId);
    }

    if (!profile || profile.totalInteractions < this.config.minInteractionsForBoost) {
      // Not enough data to personalize
      return matches;
    }

    const personalizedMatches = matches.map((match) => {
      let boost = 0;

      // 1. Apply learned tool boost
      boost += profile.toolBoosts.get(match.toolId) || 0;

      // 2. Check vocabulary mapping
      if (context?.query) {
        const vocabMatch = this.checkVocabulary(profile, context.query, match.toolId);
        boost += vocabMatch;
      }

      // 3. Apply time-of-day preference
      if (context?.time) {
        const timeBoost = this.getTimeBoost(profile, context.time, match.toolId);
        boost += timeBoost;
      }

      // 4. Apply context preference
      if (context?.contextTag) {
        const contextBoost = this.getContextBoost(profile, context.contextTag, match.toolId);
        boost += contextBoost;
      }

      // Clamp boost
      boost = Math.max(-this.config.maxBoost, Math.min(this.config.maxBoost, boost));

      return {
        ...match,
        confidence: Math.max(0, Math.min(1, match.confidence + boost)),
        metadata: {
          ...match.metadata,
          personalizationBoost: boost,
          personalized: true,
        },
      };
    });

    // Re-sort by adjusted confidence
    personalizedMatches.sort((a, b) => b.confidence - a.confidence);

    log.debug({ userId, topTool: personalizedMatches[0]?.toolId }, 'Applied personalization');

    return personalizedMatches;
  }

  /**
   * Learn from a user interaction
   */
  learn(event: InteractionEvent): void {
    const profile = this.getOrCreateProfile(event.userId);

    // Update statistics
    profile.totalInteractions++;
    profile.lastUpdated = new Date();

    // Learn from correction or confirmation
    if (event.predictedTool !== event.actualTool) {
      // Correction: decrease confidence in predicted, increase in actual
      this.updateToolBoost(profile, event.predictedTool, -this.config.learningRate);
      this.updateToolBoost(profile, event.actualTool, this.config.learningRate * 1.5);

      profile.correctionRate = profile.correctionRate * 0.9 + 0.1; // Increase correction rate
    } else {
      // Confirmation: slightly increase confidence
      this.updateToolBoost(profile, event.actualTool, this.config.learningRate * 0.5);

      profile.correctionRate *= 0.95; // Decrease correction rate
    }

    // Learn vocabulary
    this.learnVocabulary(profile, event.query, event.actualTool);

    // Learn time pattern
    this.updateTimePattern(profile, event.timestamp, event.actualTool);

    // Learn context pattern
    if (event.context) {
      this.updateContextPattern(profile, event.context, event.actualTool);
    }

    // Mark profile as dirty for persistence
    this.markProfileDirty(event.userId);

    log.debug(
      {
        userId: event.userId,
        tool: event.actualTool,
        wasCorrection: event.predictedTool !== event.actualTool,
      },
      'Learned from interaction'
    );
  }

  /**
   * Load a user profile from Firestore
   */
  async loadProfile(userId: string): Promise<UserProfile | null> {
    if (!isPersistenceAvailable()) {
      return this.profiles.get(userId) ?? null;
    }

    this.loadedProfiles.add(userId);

    try {
      const persisted = await loadPersistedProfile(userId);
      if (persisted) {
        const profile: UserProfile = {
          userId,
          toolBoosts: new Map(Object.entries(persisted.toolBoosts || {})),
          vocabulary: new Map(Object.entries(persisted.vocabulary || {})),
          timePatterns: new Map(
            Object.entries(persisted.timePatterns || {}).map(([k, v]) => [
              k,
              new Map(Object.entries(v)),
            ])
          ),
          contextPatterns: new Map(
            Object.entries(persisted.contextPatterns || {}).map(([k, v]) => [
              k,
              new Map(Object.entries(v)),
            ])
          ),
          totalInteractions: persisted.totalInteractions,
          lastUpdated: persisted.lastUpdated,
          correctionRate: persisted.correctionRate,
        };
        this.profiles.set(userId, profile);
        log.debug({ userId }, 'Loaded profile from Firestore');
        return profile;
      }
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to load profile from Firestore');
    }

    return this.profiles.get(userId) ?? null;
  }

  /**
   * Load profile in background (non-blocking)
   */
  private loadProfileInBackground(userId: string): void {
    this.loadProfile(userId).catch((err) => {
      log.debug({ error: String(err), userId }, 'Background profile load failed');
    });
  }

  /**
   * Mark a profile as needing to be saved
   */
  private markProfileDirty(userId: string): void {
    this.dirtyProfiles.add(userId);
    this.scheduleDebouncedSave();
  }

  /**
   * Schedule a debounced save of dirty profiles
   */
  private scheduleDebouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      void this.saveDirtyProfiles();
      this.saveDebounceTimer = null;
    }, 30000); // 30 second debounce
  }

  /**
   * Save all dirty profiles to Firestore
   */
  private async saveDirtyProfiles(): Promise<void> {
    if (!isPersistenceAvailable() || this.dirtyProfiles.size === 0) {
      return;
    }

    const userIds = Array.from(this.dirtyProfiles);
    this.dirtyProfiles.clear();

    for (const userId of userIds) {
      const profile = this.profiles.get(userId);
      if (!profile) continue;

      try {
        const persisted: PersistedUserProfile = {
          userId,
          toolBoosts: Object.fromEntries(profile.toolBoosts),
          vocabulary: Object.fromEntries(profile.vocabulary),
          timePatterns: Object.fromEntries(
            Array.from(profile.timePatterns.entries()).map(([k, v]) => [k, Object.fromEntries(v)])
          ),
          contextPatterns: Object.fromEntries(
            Array.from(profile.contextPatterns.entries()).map(([k, v]) => [
              k,
              Object.fromEntries(v),
            ])
          ),
          totalInteractions: profile.totalInteractions,
          lastUpdated: profile.lastUpdated,
          correctionRate: profile.correctionRate,
        };

        await persistProfile(persisted);
        log.debug({ userId }, 'Saved profile to Firestore');
      } catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save profile');
        // Re-mark as dirty for retry
        this.dirtyProfiles.add(userId);
      }
    }
  }

  /**
   * Force save all dirty profiles immediately (call on shutdown)
   */
  async flushProfiles(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    await this.saveDirtyProfiles();
  }

  /**
   * Get user's correction rate (for uncertainty adjustment)
   */
  getCorrectionRate(userId: string): number {
    const profile = this.profiles.get(userId);
    return profile?.correctionRate ?? 0.1; // Default 10%
  }

  /**
   * Export profile for debugging
   */
  exportProfile(userId: string): UserProfile | null {
    return this.profiles.get(userId) ?? null;
  }

  /**
   * Apply time decay to all profiles
   */
  applyDecay(): void {
    const now = new Date();

    const profileArray = Array.from(this.profiles.values());
    for (const profile of profileArray) {
      const daysSinceUpdate =
        (now.getTime() - profile.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceUpdate > 1) {
        const decayFactor = Math.pow(this.config.decayFactor, daysSinceUpdate);

        // Decay tool boosts
        const boostEntries = Array.from(profile.toolBoosts.entries());
        for (const [toolId, boost] of boostEntries) {
          profile.toolBoosts.set(toolId, boost * decayFactor);
        }
      }
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getOrCreateProfile(userId: string): UserProfile {
    let profile = this.profiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        toolBoosts: new Map(),
        vocabulary: new Map(),
        timePatterns: new Map(),
        contextPatterns: new Map(),
        totalInteractions: 0,
        lastUpdated: new Date(),
        correctionRate: 0.1,
      };
      this.profiles.set(userId, profile);
    }

    return profile;
  }

  private updateToolBoost(profile: UserProfile, toolId: string, delta: number): void {
    const current = profile.toolBoosts.get(toolId) || 0;
    const newBoost = Math.max(
      -this.config.maxBoost,
      Math.min(this.config.maxBoost, current + delta)
    );
    profile.toolBoosts.set(toolId, newBoost);
  }

  private checkVocabulary(profile: UserProfile, query: string, toolId: string): number {
    const normalizedQuery = query.toLowerCase().trim();

    // Check if any learned phrase matches
    const vocabEntries = Array.from(profile.vocabulary.entries());
    for (const [phrase, mappedTool] of vocabEntries) {
      if (normalizedQuery.includes(phrase) && mappedTool === toolId) {
        return 0.15; // Boost for vocabulary match
      }
    }

    return 0;
  }

  private learnVocabulary(profile: UserProfile, query: string, toolId: string): void {
    // Extract key phrases (simple n-gram extraction)
    const words = query.toLowerCase().split(/\s+/);

    // Learn unigrams and bigrams
    for (let i = 0; i < words.length; i++) {
      const unigram = words[i];
      if (unigram.length > 3) {
        profile.vocabulary.set(unigram, toolId);
      }

      if (i < words.length - 1) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        profile.vocabulary.set(bigram, toolId);
      }
    }

    // Keep vocabulary size bounded
    if (profile.vocabulary.size > 500) {
      // Remove oldest entries (convert to array, remove first 100)
      const entries = Array.from(profile.vocabulary.entries());
      profile.vocabulary = new Map(entries.slice(100));
    }
  }

  private getTimeBoost(profile: UserProfile, time: Date, toolId: string): number {
    const hour = time.getHours().toString();
    const hourPatterns = profile.timePatterns.get(hour);

    if (!hourPatterns) {
      return 0;
    }

    const frequency = hourPatterns.get(toolId) || 0;
    const totalInHour = Array.from(hourPatterns.values()).reduce((sum, v) => sum + v, 0);

    if (totalInHour < 3) {
      return 0; // Not enough data
    }

    // Calculate relative frequency and convert to boost
    const relativeFreq = frequency / totalInHour;
    const baselineFreq = 1 / hourPatterns.size;

    return (relativeFreq - baselineFreq) * 0.2; // Scale to small boost
  }

  private updateTimePattern(profile: UserProfile, timestamp: Date, toolId: string): void {
    const hour = timestamp.getHours().toString();

    let hourPatterns = profile.timePatterns.get(hour);
    if (!hourPatterns) {
      hourPatterns = new Map();
      profile.timePatterns.set(hour, hourPatterns);
    }

    hourPatterns.set(toolId, (hourPatterns.get(toolId) || 0) + 1);
  }

  private getContextBoost(profile: UserProfile, context: string, toolId: string): number {
    const contextPatterns = profile.contextPatterns.get(context);

    if (!contextPatterns) {
      return 0;
    }

    const frequency = contextPatterns.get(toolId) || 0;
    const total = Array.from(contextPatterns.values()).reduce((sum, v) => sum + v, 0);

    if (total < 3) {
      return 0;
    }

    const relativeFreq = frequency / total;
    return (relativeFreq - 0.5) * 0.2;
  }

  private updateContextPattern(profile: UserProfile, context: string, toolId: string): void {
    let contextPatterns = profile.contextPatterns.get(context);
    if (!contextPatterns) {
      contextPatterns = new Map();
      profile.contextPatterns.set(context, contextPatterns);
    }

    contextPatterns.set(toolId, (contextPatterns.get(toolId) || 0) + 1);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let engineInstance: PersonalizationEngine | null = null;

export function getPersonalizationEngine(): PersonalizationEngine {
  if (!engineInstance) {
    engineInstance = new PersonalizationEngine();
  }
  return engineInstance;
}

/**
 * Initialize the personalization engine with Firestore persistence
 * Call this on startup to enable cross-session learning
 */
export async function initializePersonalization(): Promise<void> {
  const engine = getPersonalizationEngine();
  await engine.initialize();
}

/**
 * Flush profiles on shutdown
 */
export async function flushPersonalizationProfiles(): Promise<void> {
  const engine = getPersonalizationEngine();
  await engine.flushProfiles();
}
