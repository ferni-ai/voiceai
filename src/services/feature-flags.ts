/**
 * Feature Flag Service
 *
 * Centralized feature flag management with:
 * - Persistent storage (JSON file, easy to migrate to Redis/DB)
 * - Multiple flag types: boolean, percentage, user-targeted
 * - Real-time updates without restart
 * - API for dashboard management
 * - SDK for checking flags in code
 *
 * Usage:
 *   import { getFeatureFlags } from './services/feature-flags.js';
 *   const flags = getFeatureFlags();
 *
 *   // Check a boolean flag
 *   if (flags.isEnabled('voice_presence')) { ... }
 *
 *   // Check with user context (for percentage/targeting)
 *   if (flags.isEnabledForUser('new_ui', userId)) { ... }
 *
 *   // Get flag value (for non-boolean flags)
 *   const limit = flags.getValue('max_turns', 50);
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from '../utils/safe-logger.js';
import { createHash } from 'crypto';

const log = getLogger().child({ module: 'FeatureFlags' });

// ============================================================================
// TYPES
// ============================================================================

export type FlagType = 'boolean' | 'percentage' | 'user_list' | 'value';

export interface FeatureFlag {
  /** Unique flag identifier (kebab-case) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this flag controls */
  description: string;

  /** Flag type */
  type: FlagType;

  /** Is the flag enabled? (for boolean type) */
  enabled: boolean;

  /** Percentage of users (0-100) for percentage type */
  percentage?: number;

  /** List of user IDs for user_list type */
  userIds?: string[];

  /** Arbitrary value for value type */
  value?: unknown;

  /** Category for grouping in dashboard */
  category: string;

  /** When the flag was created */
  createdAt: string;

  /** When the flag was last updated */
  updatedAt: string;

  /** Who last updated it */
  updatedBy?: string;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface FlagCheckContext {
  userId?: string;
  sessionId?: string;
  personaId?: string;
  tier?: string;
  [key: string]: unknown;
}

export interface FlagEvaluationResult {
  enabled: boolean;
  reason:
    | 'flag_enabled'
    | 'flag_disabled'
    | 'percentage_match'
    | 'percentage_miss'
    | 'user_match'
    | 'user_miss'
    | 'flag_not_found';
  value?: unknown;
}

// ============================================================================
// DEFAULT FLAGS
// ============================================================================

const DEFAULT_FLAGS: FeatureFlag[] = [
  // Voice Presence Features
  {
    id: 'voice-presence',
    name: 'Voice Presence (Master)',
    description: 'Master toggle for all voice presence features',
    type: 'boolean',
    enabled: false,
    category: 'voice-presence',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'voice-presence-breath-pause',
    name: 'Breath Pause Detection',
    description: 'Audio-based breath pause detection for backchanneling',
    type: 'boolean',
    enabled: true,
    category: 'voice-presence',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'voice-presence-live-backchannel',
    name: 'Live Backchanneling',
    description: 'Soft backchannels during user speech at breath pauses',
    type: 'boolean',
    enabled: true,
    category: 'voice-presence',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'voice-presence-turn-prediction',
    name: 'Turn Prediction',
    description: 'Predict when user will finish speaking for preemptive generation',
    type: 'boolean',
    enabled: true,
    category: 'voice-presence',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'voice-presence-cartesia-context',
    name: 'Cartesia Context Patch',
    description: 'Prosody continuity across TTS streams via context_id',
    type: 'boolean',
    enabled: true,
    category: 'voice-presence',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'voice-presence-analytics',
    name: 'Voice Presence Analytics',
    description: 'Record metrics for voice presence features',
    type: 'boolean',
    enabled: true,
    category: 'voice-presence',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Conversation Features
  {
    id: 'meaningful-silence',
    name: 'Meaningful Silence',
    description: 'Transform silent moments into connection opportunities',
    type: 'boolean',
    enabled: true,
    category: 'conversation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'spontaneous-shares',
    name: 'Spontaneous Shares',
    description: 'Persona shares personal stories unprompted',
    type: 'boolean',
    enabled: true,
    category: 'conversation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'thinking-fillers',
    name: 'Thinking Fillers',
    description: 'Natural "hmm", "let me think" during processing',
    type: 'boolean',
    enabled: true,
    category: 'conversation',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Debug/Dev Features
  {
    id: 'debug-logging',
    name: 'Debug Logging',
    description: 'Enable verbose debug logging',
    type: 'boolean',
    enabled: false,
    category: 'debug',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'dev-panel',
    name: 'Dev Panel Access',
    description: 'Enable dev panel for all users (not just dev mode)',
    type: 'boolean',
    enabled: false,
    category: 'debug',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // Experimental Features (percentage rollout)
  {
    id: 'experimental-greeting-v2',
    name: 'New Greeting System',
    description: 'Alive intros with personality bleed-through',
    type: 'percentage',
    enabled: true,
    percentage: 100,
    category: 'experimental',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // ============================================================================
  // SIMPLE UTILITIES - "Better Than Human" Everyday Helpers
  // ============================================================================
  {
    id: 'simple-utilities',
    name: 'Simple Utilities (Master)',
    description: 'Master toggle for all simple utility tools (timers, tips, timezone, etc.)',
    type: 'boolean',
    enabled: true,
    category: 'simple-utilities',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'simple-utilities-voice-callbacks',
    name: 'Voice Callbacks',
    description: 'Speak when timer completes (vs silent completion)',
    type: 'boolean',
    enabled: true,
    category: 'simple-utilities',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'simple-utilities-pattern-learning',
    name: 'Pattern Learning',
    description: 'Learn user patterns (tip %, timer duration, timezones)',
    type: 'boolean',
    enabled: true,
    category: 'simple-utilities',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'simple-utilities-proactive',
    name: 'Proactive Suggestions',
    description: 'Offer help before asked ("Want your usual tea timer?")',
    type: 'percentage',
    enabled: true,
    percentage: 30, // Start with 30% rollout
    category: 'simple-utilities',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'simple-utilities-persistence',
    name: 'Cross-Session Memory',
    description: 'Remember preferences across conversations (Firestore)',
    type: 'boolean',
    enabled: true,
    category: 'simple-utilities',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'simple-utilities-context-enrichment',
    name: 'Context Enrichment',
    description: 'Connect utilities to life context (travel, goals, habits)',
    type: 'boolean',
    enabled: true, // Now stable - connects utilities to goals, memories, habits
    category: 'simple-utilities',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'simple-utilities-insights',
    name: 'Contextual Insights',
    description: 'Add wisdom to responses ("That\'s 12% - fine if service was rough")',
    type: 'boolean',
    enabled: true,
    category: 'simple-utilities',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ============================================================================
// STORAGE
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '../../data');
const FLAGS_FILE = join(DATA_DIR, 'feature-flags.json');

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFlags(): Map<string, FeatureFlag> {
  ensureDataDir();

  if (!existsSync(FLAGS_FILE)) {
    // Initialize with defaults
    const flagsMap = new Map<string, FeatureFlag>();
    DEFAULT_FLAGS.forEach((flag) => flagsMap.set(flag.id, flag));
    saveFlags(flagsMap);
    return flagsMap;
  }

  try {
    const data = readFileSync(FLAGS_FILE, 'utf-8');
    const flags = JSON.parse(data) as FeatureFlag[];
    const flagsMap = new Map<string, FeatureFlag>();

    // Load saved flags
    flags.forEach((flag) => flagsMap.set(flag.id, flag));

    // Add any new default flags that don't exist
    DEFAULT_FLAGS.forEach((defaultFlag) => {
      if (!flagsMap.has(defaultFlag.id)) {
        flagsMap.set(defaultFlag.id, defaultFlag);
      }
    });

    return flagsMap;
  } catch (error) {
    log.error({ error }, 'Failed to load feature flags, using defaults');
    const flagsMap = new Map<string, FeatureFlag>();
    DEFAULT_FLAGS.forEach((flag) => flagsMap.set(flag.id, flag));
    return flagsMap;
  }
}

function saveFlags(flags: Map<string, FeatureFlag>): void {
  ensureDataDir();
  const flagsArray = Array.from(flags.values());
  writeFileSync(FLAGS_FILE, JSON.stringify(flagsArray, null, 2));
}

// ============================================================================
// FEATURE FLAG SERVICE
// ============================================================================

export class FeatureFlagService {
  private flags: Map<string, FeatureFlag>;
  private lastReload = 0;
  private reloadIntervalMs = 30000; // Reload every 30s

  constructor() {
    this.flags = loadFlags();
    log.info({ flagCount: this.flags.size }, 'Feature flag service initialized');
  }

  /**
   * Reload flags from storage (for hot reloading)
   */
  reload(): void {
    this.flags = loadFlags();
    this.lastReload = Date.now();
    log.debug({ flagCount: this.flags.size }, 'Feature flags reloaded');
  }

  /**
   * Maybe reload if enough time has passed (for auto-refresh)
   */
  private maybeReload(): void {
    if (Date.now() - this.lastReload > this.reloadIntervalMs) {
      this.reload();
    }
  }

  /**
   * Check if a flag is enabled (simple boolean check)
   */
  isEnabled(flagId: string): boolean {
    this.maybeReload();
    const flag = this.flags.get(flagId);
    if (!flag) {
      log.debug({ flagId }, 'Flag not found, defaulting to disabled');
      return false;
    }
    return flag.enabled;
  }

  /**
   * Check if a flag is enabled for a specific user/context
   * Handles percentage rollouts and user targeting
   */
  isEnabledForUser(flagId: string, context: FlagCheckContext = {}): boolean {
    this.maybeReload();
    const result = this.evaluate(flagId, context);
    return result.enabled;
  }

  /**
   * Full evaluation with reason
   */
  evaluate(flagId: string, context: FlagCheckContext = {}): FlagEvaluationResult {
    const flag = this.flags.get(flagId);

    if (!flag) {
      return { enabled: false, reason: 'flag_not_found' };
    }

    // If flag is globally disabled, return immediately
    if (!flag.enabled) {
      return { enabled: false, reason: 'flag_disabled', value: flag.value };
    }

    // Handle different flag types
    switch (flag.type) {
      case 'boolean':
        return { enabled: true, reason: 'flag_enabled', value: flag.value };

      case 'percentage': {
        if (!flag.percentage || flag.percentage <= 0) {
          return { enabled: false, reason: 'percentage_miss' };
        }
        if (flag.percentage >= 100) {
          return { enabled: true, reason: 'percentage_match' };
        }

        // Use userId or sessionId for consistent bucketing
        const bucketKey = context.userId || context.sessionId || 'anonymous';
        const bucket = this.hashToBucket(flagId, bucketKey);
        const enabled = bucket < flag.percentage;

        return {
          enabled,
          reason: enabled ? 'percentage_match' : 'percentage_miss',
        };
      }

      case 'user_list': {
        if (!flag.userIds || flag.userIds.length === 0) {
          return { enabled: false, reason: 'user_miss' };
        }

        const userId = context.userId || '';
        const enabled = flag.userIds.includes(userId);

        return {
          enabled,
          reason: enabled ? 'user_match' : 'user_miss',
        };
      }

      case 'value':
        return { enabled: true, reason: 'flag_enabled', value: flag.value };

      default:
        return { enabled: flag.enabled, reason: 'flag_enabled' };
    }
  }

  /**
   * Get the value of a flag (for non-boolean flags)
   */
  getValue<T>(flagId: string, defaultValue: T): T {
    this.maybeReload();
    const flag = this.flags.get(flagId);
    if (!flag || flag.value === undefined) {
      return defaultValue;
    }
    return flag.value as T;
  }

  /**
   * Get all flags (for dashboard)
   */
  getAllFlags(): FeatureFlag[] {
    this.maybeReload();
    return Array.from(this.flags.values());
  }

  /**
   * Get flags by category
   */
  getFlagsByCategory(category: string): FeatureFlag[] {
    this.maybeReload();
    return Array.from(this.flags.values()).filter((f) => f.category === category);
  }

  /**
   * Get a single flag
   */
  getFlag(flagId: string): FeatureFlag | undefined {
    this.maybeReload();
    return this.flags.get(flagId);
  }

  /**
   * Update a flag
   */
  updateFlag(
    flagId: string,
    updates: Partial<FeatureFlag>,
    updatedBy?: string
  ): FeatureFlag | null {
    const flag = this.flags.get(flagId);
    if (!flag) {
      log.warn({ flagId }, 'Cannot update non-existent flag');
      return null;
    }

    const updatedFlag: FeatureFlag = {
      ...flag,
      ...updates,
      id: flag.id, // Don't allow changing ID
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    this.flags.set(flagId, updatedFlag);
    saveFlags(this.flags);

    log.info({ flagId, enabled: updatedFlag.enabled, updatedBy }, 'Feature flag updated');

    return updatedFlag;
  }

  /**
   * Create a new flag
   */
  createFlag(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): FeatureFlag {
    if (this.flags.has(flag.id)) {
      throw new Error(`Flag with id "${flag.id}" already exists`);
    }

    const newFlag: FeatureFlag = {
      ...flag,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.flags.set(flag.id, newFlag);
    saveFlags(this.flags);

    log.info({ flagId: flag.id, category: flag.category }, 'Feature flag created');

    return newFlag;
  }

  /**
   * Delete a flag
   */
  deleteFlag(flagId: string): boolean {
    if (!this.flags.has(flagId)) {
      return false;
    }

    this.flags.delete(flagId);
    saveFlags(this.flags);

    log.info({ flagId }, 'Feature flag deleted');

    return true;
  }

  /**
   * Hash a key to a bucket (0-100) for percentage rollouts
   * Uses consistent hashing so the same user always gets the same bucket
   */
  private hashToBucket(flagId: string, key: string): number {
    const hash = createHash('md5').update(`${flagId}:${key}`).digest('hex');
    const num = parseInt(hash.substring(0, 8), 16);
    return num % 100;
  }

  /**
   * Get categories for dashboard grouping
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.flags.forEach((flag) => categories.add(flag.category));
    return Array.from(categories).sort();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: FeatureFlagService | null = null;

export function getFeatureFlags(): FeatureFlagService {
  if (!instance) {
    instance = new FeatureFlagService();
  }
  return instance;
}

export function resetFeatureFlags(): void {
  instance = null;
}

// ============================================================================
// CONVENIENCE FUNCTIONS (for migration from static flags)
// ============================================================================

/**
 * Check if voice presence master toggle is enabled
 */
export function isVoicePresenceEnabled(): boolean {
  return getFeatureFlags().isEnabled('voice-presence');
}

/**
 * Check if a specific voice presence feature is enabled
 * Returns false if master toggle is off
 */
export function isVoicePresenceFeatureEnabled(
  feature:
    | 'breathPauseDetection'
    | 'liveBackchanneling'
    | 'turnPrediction'
    | 'cartesiaContextPatch'
    | 'analyticsRecording'
): boolean {
  const flags = getFeatureFlags();

  // Check master toggle first
  if (!flags.isEnabled('voice-presence')) {
    return false;
  }

  // Map feature names to flag IDs
  const flagMap: Record<string, string> = {
    breathPauseDetection: 'voice-presence-breath-pause',
    liveBackchanneling: 'voice-presence-live-backchannel',
    turnPrediction: 'voice-presence-turn-prediction',
    cartesiaContextPatch: 'voice-presence-cartesia-context',
    analyticsRecording: 'voice-presence-analytics',
  };

  const flagId = flagMap[feature];
  return flagId ? flags.isEnabled(flagId) : false;
}

// ============================================================================
// SIMPLE UTILITIES FLAGS
// ============================================================================

/**
 * Check if simple utilities master toggle is enabled
 */
export function isSimpleUtilitiesEnabled(): boolean {
  return getFeatureFlags().isEnabled('simple-utilities');
}

/**
 * Check if a specific simple utilities feature is enabled
 * Returns false if master toggle is off
 */
export function isSimpleUtilitiesFeatureEnabled(
  feature:
    | 'voiceCallbacks'
    | 'patternLearning'
    | 'proactive'
    | 'persistence'
    | 'contextEnrichment'
    | 'insights',
  context?: FlagCheckContext
): boolean {
  const flags = getFeatureFlags();

  // Check master toggle first
  if (!flags.isEnabled('simple-utilities')) {
    return false;
  }

  // Map feature names to flag IDs
  const flagMap: Record<string, string> = {
    voiceCallbacks: 'simple-utilities-voice-callbacks',
    patternLearning: 'simple-utilities-pattern-learning',
    proactive: 'simple-utilities-proactive',
    persistence: 'simple-utilities-persistence',
    contextEnrichment: 'simple-utilities-context-enrichment',
    insights: 'simple-utilities-insights',
  };

  const flagId = flagMap[feature];
  if (!flagId) return false;

  // For proactive, use percentage-based rollout
  if (feature === 'proactive' && context) {
    return flags.isEnabledForUser(flagId, context);
  }

  return flags.isEnabled(flagId);
}

/**
 * Get simple utilities feature config for initialization
 */
export function getSimpleUtilitiesConfig(context?: FlagCheckContext): {
  enabled: boolean;
  voiceCallbacks: boolean;
  patternLearning: boolean;
  proactive: boolean;
  persistence: boolean;
  contextEnrichment: boolean;
  insights: boolean;
} {
  const enabled = isSimpleUtilitiesEnabled();
  
  return {
    enabled,
    voiceCallbacks: enabled && isSimpleUtilitiesFeatureEnabled('voiceCallbacks'),
    patternLearning: enabled && isSimpleUtilitiesFeatureEnabled('patternLearning'),
    proactive: enabled && isSimpleUtilitiesFeatureEnabled('proactive', context),
    persistence: enabled && isSimpleUtilitiesFeatureEnabled('persistence'),
    contextEnrichment: enabled && isSimpleUtilitiesFeatureEnabled('contextEnrichment'),
    insights: enabled && isSimpleUtilitiesFeatureEnabled('insights'),
  };
}
