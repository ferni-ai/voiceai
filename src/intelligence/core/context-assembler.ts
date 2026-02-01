/**
 * Context Assembler - Unified Intelligence Level 2
 *
 * "Knows what matters RIGHT NOW"
 *
 * Assembles a unified context window from multiple data sources,
 * prioritizing what's most relevant for the current conversation turn.
 *
 * Data Sources:
 * - Calendar/schedule
 * - Recent conversation topics
 * - Emotional patterns
 * - Active commitments
 * - Relationship data
 * - Capacity/stress indicators
 *
 * @module intelligence/context-assembler
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  buildCommitmentContext,
  loadUserCommitments,
} from '../../services/superhuman/commitment-keeper.js';
import {
  buildCapacityContext,
  assessBurnoutRisk,
} from '../../services/superhuman/capacity-guardian.js';
import { buildNetworkContext } from '../../services/superhuman/relationship-network.js';
import { buildSeasonalContext } from '../../services/superhuman/seasonal-awareness.js';
import { buildNarrativeContextString } from '../../services/superhuman/life-narrative.js';
import { getSessionState } from '../state/session.js';
import type { PersonaConfig } from '../../personas/types.js';

const log = createLogger({ module: 'context-assembler' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Immediate context about the current moment
 */
export interface ImmediateContext {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'late_night';
  dayOfWeek: string;
  isWeekend: boolean;
  hour: number;
  currentMood?: string;
  recentActivity?: string;
  isLateNight: boolean;
}

/**
 * Today's context
 */
export interface TodayContext {
  agenda: string[];
  upcomingMeetings: number;
  hasImportantEvent: boolean;
  eventHighlight?: string;
}

/**
 * Recent conversation context
 */
export interface RecentContext {
  topicsDiscussed: string[];
  emotionalPatterns: string[];
  openThreads: string[];
  lastSessionSummary?: string;
}

/**
 * Relationship context with Ferni
 */
export interface RelationshipContext {
  trustLevel: number; // 0-1
  sessionCount: number;
  daysSinceFirstContact: number;
  activeCommitments: string[];
  relationshipMilestone?: string;
}

/**
 * Capacity/bandwidth context
 */
export interface CapacityContext {
  bandwidth: 'low' | 'medium' | 'high';
  stressIndicators: string[];
  burnoutRisk: 'low' | 'moderate' | 'high' | 'critical';
  energyLevel?: 'depleted' | 'low' | 'moderate' | 'high' | 'energized';
}

/**
 * Full context window assembled for a turn
 */
export interface ContextWindow {
  immediate: ImmediateContext;
  activeDomains: string[];
  today: TodayContext;
  recent: RecentContext;
  relationship: RelationshipContext;
  capacity: CapacityContext;
  seasonal?: string;
  narrative?: string;
}

/**
 * Options for context assembly
 */
export interface AssemblyOptions {
  userId: string;
  sessionId?: string;
  voiceEmotion?: {
    primary?: string;
    valence?: string;
    energy?: number;
  };
  calendarEvents?: Array<{
    title: string;
    startTime: Date;
    isImportant?: boolean;
  }>;
  recentTopics?: string[];
  forceRefresh?: boolean;
}

// ============================================================================
// CACHE
// ============================================================================

interface CachedContext {
  context: ContextWindow;
  timestamp: number;
  userId: string;
}

const contextCache = new Map<string, CachedContext>();
const CACHE_TTL_MS = 30_000; // 30 seconds

// ============================================================================
// CORE ASSEMBLER
// ============================================================================

/**
 * Assemble a unified context window for a conversation turn.
 *
 * This is the main entry point - call this once per turn to get
 * everything Ferni needs to know about the current moment.
 */
export async function assembleContext(options: AssemblyOptions): Promise<ContextWindow> {
  const { userId, forceRefresh } = options;

  // Check cache
  const cached = contextCache.get(userId);
  if (cached && !forceRefresh && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    log.debug({ userId }, 'Using cached context');
    return cached.context;
  }

  log.debug({ userId }, 'Assembling fresh context');

  // Assemble in parallel for performance
  const [immediateCtx, todayCtx, recentCtx, relationshipCtx, capacityCtx, seasonalCtx] =
    await Promise.all([
      assembleImmediate(options),
      assembleToday(options),
      assembleRecent(options),
      assembleRelationship(userId),
      assembleCapacity(userId),
      assembleSeasonal(userId),
    ]);

  // Determine active domains based on assembled context
  const activeDomains = detectActiveDomains(
    immediateCtx,
    todayCtx,
    recentCtx,
    relationshipCtx,
    capacityCtx
  );

  const context: ContextWindow = {
    immediate: immediateCtx,
    activeDomains,
    today: todayCtx,
    recent: recentCtx,
    relationship: relationshipCtx,
    capacity: capacityCtx,
    seasonal: seasonalCtx,
  };

  // Cache the result
  contextCache.set(userId, {
    context,
    timestamp: Date.now(),
    userId,
  });

  return context;
}

/**
 * Assemble immediate context (current moment)
 */
async function assembleImmediate(options: AssemblyOptions): Promise<ImmediateContext> {
  const now = new Date();
  const hour = now.getHours();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const timeOfDay: ImmediateContext['timeOfDay'] =
    hour < 6
      ? 'late_night'
      : hour < 12
        ? 'morning'
        : hour < 17
          ? 'afternoon'
          : hour < 21
            ? 'evening'
            : 'late_night';

  const immediate: ImmediateContext = {
    timeOfDay,
    dayOfWeek: dayNames[now.getDay()],
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    hour,
    isLateNight: hour >= 22 || hour < 6,
  };

  // Add voice emotion if available
  if (options.voiceEmotion?.primary) {
    immediate.currentMood = options.voiceEmotion.primary;
  }

  return immediate;
}

/**
 * Assemble today's context (calendar, schedule)
 */
async function assembleToday(options: AssemblyOptions): Promise<TodayContext> {
  const today: TodayContext = {
    agenda: [],
    upcomingMeetings: 0,
    hasImportantEvent: false,
  };

  if (options.calendarEvents?.length) {
    const now = new Date();

    for (const event of options.calendarEvents) {
      // Only include today's events
      if (event.startTime.toDateString() === now.toDateString()) {
        today.agenda.push(event.title);

        if (event.startTime > now) {
          today.upcomingMeetings++;
        }

        if (event.isImportant) {
          today.hasImportantEvent = true;
          today.eventHighlight = event.title;
        }
      }
    }
  }

  return today;
}

/**
 * Assemble recent conversation context
 */
async function assembleRecent(options: AssemblyOptions): Promise<RecentContext> {
  const recent: RecentContext = {
    topicsDiscussed: [],
    emotionalPatterns: [],
    openThreads: [],
  };

  // Get from session state if available
  const sessionState = getSessionState(options.userId);
  if (sessionState) {
    // Get emotional trajectory - build patterns from trajectory data
    if (sessionState.emotionalTrajectory) {
      const trajectory = sessionState.emotionalTrajectory;
      // Build emotional patterns from available data
      const patterns: string[] = [];
      if (trajectory.startEmotion) patterns.push(trajectory.startEmotion);
      if (trajectory.currentEmotion && trajectory.currentEmotion !== trajectory.startEmotion) {
        patterns.push(trajectory.currentEmotion);
      }
      if (trajectory.trend) patterns.push(`trend:${trajectory.trend}`);
      recent.emotionalPatterns = patterns;
    }

    // Get open threads from conversation flow
    if (sessionState.conversationFlow?.topicsDiscussed?.length) {
      recent.topicsDiscussed = sessionState.conversationFlow.topicsDiscussed.slice(-10);
    }
  }

  // Add recent topics from options
  if (options.recentTopics?.length) {
    recent.topicsDiscussed = [...new Set([...recent.topicsDiscussed, ...options.recentTopics])];
  }

  return recent;
}

/**
 * Assemble relationship context
 */
async function assembleRelationship(userId: string): Promise<RelationshipContext> {
  const relationship: RelationshipContext = {
    trustLevel: 0.5, // Default medium trust
    sessionCount: 1,
    daysSinceFirstContact: 0,
    activeCommitments: [],
  };

  try {
    // Load commitments
    const commitments = await loadUserCommitments(userId);
    if (commitments?.length) {
      relationship.activeCommitments = commitments
        .filter((c) => c.status === 'active')
        .slice(0, 5)
        .map((c) => c.summary || c.statement || 'Commitment');
    }

    // Get session count from session state
    // Note: sessionCount not available in SessionState, use default
    // Trust level starts at default and can be adjusted based on other factors
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load relationship data');
  }

  return relationship;
}

/**
 * Assemble capacity/bandwidth context
 */
async function assembleCapacity(userId: string): Promise<CapacityContext> {
  const capacity: CapacityContext = {
    bandwidth: 'medium',
    stressIndicators: [],
    burnoutRisk: 'low',
  };

  try {
    // Get burnout assessment
    const burnout = await assessBurnoutRisk(userId);
    if (burnout) {
      // Map BurnoutRisk to CapacityContext.burnoutRisk (elevated -> moderate)
      const riskMap: Record<string, 'low' | 'moderate' | 'high' | 'critical'> = {
        low: 'low',
        moderate: 'moderate',
        elevated: 'moderate',
        high: 'high',
        critical: 'critical',
      };
      capacity.burnoutRisk = riskMap[burnout.risk] || 'low';
      capacity.stressIndicators = burnout.factors?.map((f) => f.description) || [];

      // Map burnout risk to bandwidth
      if (burnout.risk === 'critical' || burnout.risk === 'high') {
        capacity.bandwidth = 'low';
      } else if (burnout.risk === 'moderate' || burnout.risk === 'elevated') {
        capacity.bandwidth = 'medium';
      } else {
        capacity.bandwidth = 'high';
      }
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to assess capacity');
  }

  return capacity;
}

/**
 * Assemble seasonal context
 */
async function assembleSeasonal(userId: string): Promise<string | undefined> {
  try {
    const seasonal = await buildSeasonalContext(userId);
    return seasonal || undefined;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to build seasonal context');
    return undefined;
  }
}

/**
 * Detect which domains are active based on assembled context
 */
function detectActiveDomains(
  immediate: ImmediateContext,
  today: TodayContext,
  recent: RecentContext,
  relationship: RelationshipContext,
  capacity: CapacityContext
): string[] {
  const domains: string[] = [];

  // Time-based domains
  if (immediate.isLateNight) {
    domains.push('late_night_support');
  }
  if (immediate.isWeekend) {
    domains.push('weekend_mode');
  }

  // Calendar-based domains
  if (today.hasImportantEvent) {
    domains.push('event_support');
  }
  if (today.upcomingMeetings > 3) {
    domains.push('busy_day');
  }

  // Emotional domains
  if (
    immediate.currentMood &&
    ['sad', 'anxious', 'stressed', 'overwhelmed'].includes(immediate.currentMood.toLowerCase())
  ) {
    domains.push('emotional_support');
  }

  // Capacity domains
  if (capacity.bandwidth === 'low' || capacity.burnoutRisk === 'high') {
    domains.push('burnout_prevention');
  }

  // Relationship domains
  if (relationship.trustLevel > 0.7) {
    domains.push('deep_conversation');
  }
  if (relationship.activeCommitments.length > 0) {
    domains.push('commitment_follow_up');
  }

  // Topic-based domains from recent conversation
  for (const topic of recent.topicsDiscussed) {
    const topicLower = topic.toLowerCase();
    if (topicLower.includes('sleep') || topicLower.includes('tired')) {
      domains.push('sleep');
    }
    if (
      topicLower.includes('work') ||
      topicLower.includes('job') ||
      topicLower.includes('career')
    ) {
      domains.push('work');
    }
    if (topicLower.includes('relationship') || topicLower.includes('family')) {
      domains.push('relationships');
    }
    if (topicLower.includes('health') || topicLower.includes('exercise')) {
      domains.push('health');
    }
    if (topicLower.includes('habit') || topicLower.includes('routine')) {
      domains.push('habits');
    }
  }

  // Deduplicate
  return [...new Set(domains)];
}

// ============================================================================
// CONTEXT SELECTION
// ============================================================================

/**
 * Select and prioritize context for a specific turn.
 *
 * Not all context is relevant for every turn. This function
 * filters and prioritizes based on current conversation needs.
 */
export function selectContextForTurn(
  context: ContextWindow,
  currentTopic: string,
  persona?: PersonaConfig
): ContextWindow {
  // Create a copy to avoid mutating original
  const selected = { ...context };

  // Prioritize domains based on persona
  if (persona) {
    const personaDomains = getPersonaDomains(persona.id);
    selected.activeDomains = [
      // Persona's specialty domains first
      ...selected.activeDomains.filter((d) => personaDomains.includes(d)),
      // Then other active domains
      ...selected.activeDomains.filter((d) => !personaDomains.includes(d)),
    ].slice(0, 5); // Limit to avoid context bloat
  }

  return selected;
}

/**
 * Get domains that a persona specializes in
 */
function getPersonaDomains(personaId: string): string[] {
  const personaDomainMap: Record<string, string[]> = {
    ferni: ['emotional_support', 'deep_conversation', 'late_night_support'],
    maya: ['habits', 'routines', 'sleep', 'health'],
    peter: ['research', 'learning', 'work'],
    alex: ['communication', 'relationships', 'work'],
    jordan: ['events', 'planning', 'celebration'],
    nayan: ['wisdom', 'deep_conversation', 'reflection'],
  };

  return personaDomainMap[personaId] || [];
}

// ============================================================================
// FORMATTING
// ============================================================================

/**
 * Format context window for LLM injection
 */
export function formatAssembledContextForPrompt(context: ContextWindow): string {
  const sections: string[] = [];

  // Immediate context
  sections.push(`[MOMENT] ${context.immediate.timeOfDay}, ${context.immediate.dayOfWeek}`);

  if (context.immediate.isLateNight) {
    sections.push('[AWARENESS] Late night - be extra gentle and present');
  }

  if (context.immediate.currentMood) {
    sections.push(`[MOOD] Sensing: ${context.immediate.currentMood}`);
  }

  // Today's context
  if (context.today.hasImportantEvent && context.today.eventHighlight) {
    sections.push(`[TODAY] Important: ${context.today.eventHighlight}`);
  } else if (context.today.upcomingMeetings > 0) {
    sections.push(`[TODAY] ${context.today.upcomingMeetings} meetings remaining`);
  }

  // Capacity
  if (context.capacity.bandwidth === 'low') {
    sections.push('[CAPACITY] Low bandwidth - keep responses focused');
  }
  if (context.capacity.burnoutRisk === 'high' || context.capacity.burnoutRisk === 'critical') {
    sections.push('[CARE] Elevated stress signals - prioritize well-being');
  }

  // Relationship
  if (context.relationship.activeCommitments.length > 0) {
    sections.push(
      `[COMMITMENTS] Active: ${context.relationship.activeCommitments.slice(0, 2).join(', ')}`
    );
  }

  // Active domains
  if (context.activeDomains.length > 0) {
    sections.push(`[DOMAINS] ${context.activeDomains.slice(0, 3).join(', ')}`);
  }

  // Seasonal
  if (context.seasonal) {
    sections.push(`[SEASONAL] ${context.seasonal}`);
  }

  return sections.join('\n');
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear context cache for a user
 */
export function clearContextCache(userId?: string): void {
  if (userId) {
    contextCache.delete(userId);
  } else {
    contextCache.clear();
  }
}

/**
 * Invalidate cache when significant changes occur
 */
export function invalidateContext(userId: string): void {
  contextCache.delete(userId);
  log.debug({ userId }, 'Context cache invalidated');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const contextAssembler = {
  assemble: assembleContext,
  select: selectContextForTurn,
  format: formatAssembledContextForPrompt,
  clearCache: clearContextCache,
  invalidate: invalidateContext,
};
