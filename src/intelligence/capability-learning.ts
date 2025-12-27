/**
 * Capability Learning System
 *
 * Tracks which capability mentions lead to engagement, feeding into
 * the collective learning system to improve domain fluency over time.
 *
 * This implements the "Community Learning" layer from COLLECTIVE-LEARNING.md:
 * - Aggregates anonymized learning signals across users
 * - Discovers which capability framings resonate best
 * - Feeds back into domain fluency context builder
 *
 * > "Better than human" = learning from every conversation to get smarter
 *
 * @module intelligence/capability-learning
 */

import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import {
  getCapabilityEffectiveness,
  clearCapabilityTracking,
  markCapabilityEngaged,
  markCapabilityToolUsed,
  type CapabilityEffectiveness,
} from './context-builders/domain-fluency.js';

const log = createLogger({ module: 'capability-learning' });

// ============================================================================
// AGGREGATED PATTERNS (Community Learning)
// ============================================================================

/**
 * Aggregated effectiveness pattern across all users
 */
export interface CapabilityPattern {
  /** Domain name */
  domain: string;
  /** How often this domain is surfaced */
  surfaceCount: number;
  /** How often users engage after surfacing */
  engagementCount: number;
  /** How often a tool is actually used */
  toolUseCount: number;
  /** Engagement rate (engagementCount / surfaceCount) */
  engagementRate: number;
  /** Tool use rate (toolUseCount / surfaceCount) */
  toolUseRate: number;
  /** Best emotional contexts for this domain */
  bestEmotionalContexts: Array<{ emotion: string; engagementRate: number }>;
  /** Best personas for surfacing this domain */
  bestPersonas: Array<{ personaId: string; engagementRate: number }>;
  /** Sample size (for confidence) */
  sampleSize: number;
  /** Last updated */
  lastUpdated: Date;
}

/**
 * In-memory aggregate store (should be persisted to Firestore in production)
 * Key: domain name
 */
const aggregatePatterns = new Map<string, CapabilityPattern>();

/**
 * Track recently surfaced domains per session (for engagement detection)
 * Key: sessionKey, Value: { domains, timestamp }
 */
const sessionSurfacedDomains = new Map<string, { domains: string[]; timestamp: number }>();

/**
 * Track which domains were recently surfaced for a session
 * Called from domain-fluency builder when domains are surfaced
 */
export function trackSurfacedDomains(sessionKey: string, domains: string[]): void {
  sessionSurfacedDomains.set(cleanForFirestore(sessionKey), {
    domains,
    timestamp: Date.now(),
  });
}

/**
 * Get domains that were recently surfaced (within last 30 seconds)
 * Used by engagement detection to know what capabilities user might be responding to
 */
export function getRecentlySurfacedDomains(sessionKey: string): string[] {
  const entry = sessionSurfacedDomains.get(sessionKey);
  if (!entry) return [];

  // Only return if surfaced within last 30 seconds
  const thirtySecondsAgo = Date.now() - 30_000;
  if (entry.timestamp < thirtySecondsAgo) {
    sessionSurfacedDomains.delete(sessionKey);
    return [];
  }

  return entry.domains;
}

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

/**
 * Called when a session ends - aggregates learning data
 */
export async function finalizeSessionLearning(sessionKey: string, userId: string): Promise<void> {
  const effectiveness = getCapabilityEffectiveness(sessionKey);

  if (effectiveness.length === 0) {
    log.debug({ sessionKey }, 'No capability data to learn from');
    return;
  }

  // Aggregate into patterns
  for (const record of effectiveness) {
    await updateAggregatePattern(record);
  }

  log.info(
    {
      sessionKey,
      recordCount: effectiveness.length,
      engaged: effectiveness.filter((e) => e.userEngaged).length,
      toolsUsed: effectiveness.filter((e) => e.toolUsed).length,
    },
    '📚 Session learning finalized'
  );

  // Clear session tracking
  clearCapabilityTracking(sessionKey);
}

/**
 * Update aggregate pattern with new data point
 */
async function updateAggregatePattern(record: CapabilityEffectiveness): Promise<void> {
  const existing = aggregatePatterns.get(record.domain) ?? createEmptyPattern(record.domain);

  // Update counts
  existing.surfaceCount++;
  if (record.userEngaged) existing.engagementCount++;
  if (record.toolUsed) existing.toolUseCount++;

  // Recalculate rates
  existing.engagementRate = existing.engagementCount / existing.surfaceCount;
  existing.toolUseRate = existing.toolUseCount / existing.surfaceCount;

  // Update emotional context tracking
  if (record.userEmotion) {
    const emotionEntry = existing.bestEmotionalContexts.find(
      (e) => e.emotion === record.userEmotion
    );
    if (emotionEntry) {
      // Simple running average update
      const emotionEngaged = record.userEngaged ? 1 : 0;
      emotionEntry.engagementRate = emotionEntry.engagementRate * 0.9 + emotionEngaged * 0.1;
    } else {
      existing.bestEmotionalContexts.push({
        emotion: record.userEmotion,
        engagementRate: record.userEngaged ? 1.0 : 0.0,
      });
    }
    // Sort by engagement rate
    existing.bestEmotionalContexts.sort((a, b) => b.engagementRate - a.engagementRate);
    // Keep top 5
    existing.bestEmotionalContexts = existing.bestEmotionalContexts.slice(0, 5);
  }

  // Update persona tracking
  const personaEntry = existing.bestPersonas.find((p) => p.personaId === record.personaId);
  if (personaEntry) {
    const personaEngaged = record.userEngaged ? 1 : 0;
    personaEntry.engagementRate = personaEntry.engagementRate * 0.9 + personaEngaged * 0.1;
  } else {
    existing.bestPersonas.push({
      personaId: record.personaId,
      engagementRate: record.userEngaged ? 1.0 : 0.0,
    });
  }
  // Sort by engagement rate
  existing.bestPersonas.sort((a, b) => b.engagementRate - a.engagementRate);

  existing.sampleSize++;
  existing.lastUpdated = new Date();

  aggregatePatterns.set(record.domain, existing);
}

function createEmptyPattern(domain: string): CapabilityPattern {
  return {
    domain,
    surfaceCount: 0,
    engagementCount: 0,
    toolUseCount: 0,
    engagementRate: 0,
    toolUseRate: 0,
    bestEmotionalContexts: [],
    bestPersonas: [],
    sampleSize: 0,
    lastUpdated: new Date(),
  };
}

// ============================================================================
// REAL-TIME HOOKS (Called during conversation)
// ============================================================================

/**
 * Called when user engages with a capability domain
 * (e.g., asks follow-up questions, expresses interest)
 */
export function onUserEngagedWithCapability(sessionKey: string, domain: string): void {
  markCapabilityEngaged(sessionKey, domain);
  log.debug({ sessionKey, domain }, '✨ User engaged with capability');
}

/**
 * Called when a tool is used in a domain
 * (e.g., playMusic called after music capability surfaced)
 */
export function onToolUsedInDomain(sessionKey: string, domain: string): void {
  markCapabilityToolUsed(sessionKey, domain);
  log.debug({ sessionKey, domain }, '🔧 Tool used in domain');
}

/**
 * Map tool names to domains for automatic tracking
 */
const TOOL_TO_DOMAIN_MAP: Record<string, string> = {
  // Music & Mood
  playMusic: 'Music & Mood',
  musicControl: 'Music & Mood',
  musicInfo: 'Music & Mood',

  // World Awareness
  getNews: 'World Awareness',
  getWeather: 'World Awareness',
  searchWeb: 'World Awareness',

  // Memory
  rememberAboutMe: 'Your Story',
  whatDoYouKnowAboutMe: 'Your Story',
  saveMemory: 'Your Story',

  // Habits (Maya)
  createHabit: 'Habits That Stick',
  logHabitCompletion: 'Habits That Stick',
  getHabits: 'Habits That Stick',

  // Calendar (Alex)
  getCalendar: 'Calendar Mastery',
  createCalendarEvent: 'Calendar Mastery',
  scheduleReminder: 'Calendar Mastery',

  // Communication (Alex)
  sendMessage: 'Email & Communication',
  draftMessage: 'Email & Communication',

  // Research (Peter)
  getMarketSummary: 'Market Research',
  analyzeStock: 'Company Deep Dives',

  // Milestones (Jordan)
  celebrateMilestone: 'Life Milestones',
  trackGoal: 'Goal Celebration',

  // Handoffs
  handoffToMaya: 'Habits & Routines',
  handoffToAlex: 'Calendar & Time',
  handoffToPeter: 'Research & Curiosity',
  handoffToJordan: 'Milestones & Celebrations',
  handoffToNayan: 'Meaning & Big Questions',
};

/**
 * Called when any tool is executed - auto-maps to domain
 */
export function onToolExecuted(sessionKey: string, toolName: string): void {
  const domain = TOOL_TO_DOMAIN_MAP[toolName];
  if (domain) {
    onToolUsedInDomain(sessionKey, domain);
  }
}

// ============================================================================
// QUERY API (For domain fluency optimization)
// ============================================================================

/**
 * Get the most effective domains overall
 */
export function getMostEffectiveDomains(limit = 10): CapabilityPattern[] {
  return Array.from(aggregatePatterns.values())
    .filter((p) => p.sampleSize >= 10) // Minimum sample size
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, limit);
}

/**
 * Get best emotional context for a domain
 */
export function getBestEmotionalContext(domain: string): string | null {
  const pattern = aggregatePatterns.get(domain);
  if (!pattern || pattern.bestEmotionalContexts.length === 0) return null;
  return pattern.bestEmotionalContexts[0].emotion;
}

/**
 * Get best persona for a domain
 */
export function getBestPersonaForDomain(domain: string): string | null {
  const pattern = aggregatePatterns.get(domain);
  if (!pattern || pattern.bestPersonas.length === 0) return null;
  return pattern.bestPersonas[0].personaId;
}

/**
 * Get engagement rate for a domain
 */
export function getDomainEngagementRate(domain: string): number {
  const pattern = aggregatePatterns.get(domain);
  return pattern?.engagementRate ?? 0;
}

/**
 * Get all patterns (for debugging/admin)
 */
export function getAllPatterns(): CapabilityPattern[] {
  return Array.from(aggregatePatterns.values());
}

// ============================================================================
// PERSISTENCE (Firestore)
// ============================================================================

const COLLECTION_NAME = 'community_insights';
const PATTERNS_DOC = 'capability_patterns';

/**
 * Get Firestore instance (lazy loaded)
 */
async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getGCPProjectId, getFirestoreDatabase } = await import('../config/environment.js');
    const { Firestore } = await import('@google-cloud/firestore');

    return new Firestore({
      projectId: getGCPProjectId(),
      databaseId: getFirestoreDatabase(),
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to initialize Firestore for capability learning');
    return null;
  }
}

/**
 * Save aggregate patterns to Firestore
 */
export async function persistPatterns(): Promise<void> {
  const patterns = getAllPatterns();
  if (patterns.length === 0) {
    log.debug('No capability patterns to persist');
    return;
  }

  const db = await getFirestore();
  if (!db) {
    log.warn('Cannot persist patterns: Firestore not available');
    return;
  }

  try {
    const docRef = db.collection(COLLECTION_NAME).doc(PATTERNS_DOC);

    // Convert Map to serializable object
    const patternsObj: Record<string, CapabilityPattern> = {};
    for (const pattern of patterns) {
      patternsObj[pattern.domain] = {
        ...pattern,
        lastUpdated: pattern.lastUpdated,
      };
    }

    await docRef.set(
      cleanForFirestore({
        patterns: patternsObj,
        updatedAt: new Date(),
        version: 1,
      }),
      { merge: true }
    );

    log.info({ patternCount: patterns.length }, '💾 Capability patterns persisted to Firestore');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist capability patterns');
  }
}

/**
 * Load aggregate patterns from Firestore
 */
export async function loadPatterns(): Promise<void> {
  const db = await getFirestore();
  if (!db) {
    log.debug('Cannot load patterns: Firestore not available (using empty patterns)');
    return;
  }

  try {
    const docRef = db.collection(COLLECTION_NAME).doc(PATTERNS_DOC);
    const doc = await docRef.get();

    if (!doc.exists) {
      log.debug('No capability patterns document found (starting fresh)');
      return;
    }

    const data = doc.data();
    if (!data?.patterns) {
      log.debug('No patterns in capability patterns document');
      return;
    }

    // Load patterns into memory
    const patternsObj = data.patterns as Record<string, CapabilityPattern>;
    let loadedCount = 0;

    for (const [domain, pattern] of Object.entries(patternsObj)) {
      aggregatePatterns.set(cleanForFirestore(domain), {
        ...pattern,
        // Convert Firestore timestamp to Date if needed
        lastUpdated:
          pattern.lastUpdated instanceof Date
            ? pattern.lastUpdated
            : new Date(pattern.lastUpdated as unknown as string),
      });
      loadedCount++;
    }

    log.info({ patternCount: loadedCount }, '📂 Capability patterns loaded from Firestore');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to load capability patterns (starting fresh)');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the capability learning system
 */
export async function initializeCapabilityLearning(): Promise<void> {
  await loadPatterns();
  log.info('🧠 Capability learning system initialized');
}

export default {
  finalizeSessionLearning,
  onUserEngagedWithCapability,
  onToolUsedInDomain,
  onToolExecuted,
  getMostEffectiveDomains,
  getBestEmotionalContext,
  getBestPersonaForDomain,
  getDomainEngagementRate,
  getAllPatterns,
  initializeCapabilityLearning,
};
