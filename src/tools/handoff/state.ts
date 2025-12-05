/**
 * Handoff State Management
 * Manages current agent state, history, and context
 */

import { log } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import { EventEmitter } from 'events';
import type { AgentId } from '../../services/agent-bus.js';
import {
  getCanonicalPersonaId,
  getFrontendPersonaId,
} from '../../personas/voice-registry.js';
import type { HandoffContext, HandoffRecord, HandoffAnalytics } from './types.js';

// ============================================================================
// HANDOFF EVENTS
// ============================================================================

/**
 * Global event emitter for agent handoff events.
 * 
 * Events:
 * - 'voiceSwitch': Fired when a handoff occurs, with { toAgentId, greeting }
 * - 'handoffComplete': Fired after handoff is fully processed
 * - 'handoffFailed': Fired if handoff fails
 */
export const handoffEvents = new EventEmitter();

// ============================================================================
// STATE
// ============================================================================

// Track current active agent (uses CANONICAL IDs: ferni, alex-chen, maya-santos, jordan-taylor, etc.)
// IMPORTANT: All internal tracking uses canonical IDs. Frontend IDs are only used when emitting events.
let currentAgent: AgentId = 'ferni'; // Start with coordinator (canonical ID)

// Handoff history
const handoffHistory: HandoffRecord[] = [];
const MAX_HISTORY_LENGTH = 100;

// Handoff context (from last handoff)
let handoffContext: HandoffContext | null = null;

// Handoff rate limiting to prevent rapid switches
const MIN_HANDOFF_INTERVAL_MS = 1000; // 1 second minimum between handoffs
let lastHandoffTimestamp = 0;

// Met personas tracking (for first-time introductions)
const metPersonas = new Set<string>();

// ============================================================================
// ID NORMALIZATION
// ============================================================================

/**
 * Normalize any agent ID to canonical form for internal tracking.
 * Canonical IDs are dynamically discovered from persona bundles.
 * 
 * FIX BUG #30 & #87: This is the SINGLE SOURCE OF TRUTH for ID normalization.
 * Keep in sync with frontend: frontend-typescript/src/types/persona.ts (LEGACY_TO_CANONICAL_MAP)
 * 
 * All ID mapping should go through this function or the AgentRegistry.
 * Do NOT create new ID mapping tables elsewhere in the codebase.
 */
export function toCanonicalId(agentId: string): AgentId {
  const mapping: Record<string, AgentId> = {
    // Frontend IDs → Canonical
    'jack-b': 'ferni',
    'comm-specialist': 'alex-chen',
    'spend-save': 'maya-santos',
    'event-planner': 'jordan-taylor',
    // Short IDs → Canonical
    'alex': 'alex-chen',
    'maya': 'maya-santos',
    'jordan': 'jordan-taylor',
    'peter': 'peter-john',
    'coach': 'ferni',
    'john': 'peter-john',
    // Nayan Patel (Lifetime Advisor)
    'nayan': 'nayan-patel',
    'patel': 'nayan-patel',
    'sage': 'nayan-patel',
    'guru': 'nayan-patel',
    'mystic': 'nayan-patel',
    'lifetime-advisor': 'nayan-patel',
    // NOTE: Jack Bogle is now a Marketplace agent, not core team
    // If user says "jack" or "bogle", they might mean marketplace Jack Bogle
    // For now, these are not mapped - use full ID 'jack-bogle' from marketplace
  };
  return mapping[agentId.toLowerCase()] || (agentId as AgentId);
}

/**
 * Check if two agent IDs refer to the same persona (handles all ID formats).
 */
export function isSameAgent(id1: string, id2: string): boolean {
  return toCanonicalId(id1) === toCanonicalId(id2);
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if a handoff is allowed based on rate limiting.
 * Returns true if handoff is allowed, false if too soon after last handoff.
 */
export function isHandoffAllowed(): boolean {
  const now = Date.now();
  const timeSinceLastHandoff = now - lastHandoffTimestamp;

  if (timeSinceLastHandoff < MIN_HANDOFF_INTERVAL_MS) {
    getLogger().warn(
      {
        timeSinceLastHandoff,
        minInterval: MIN_HANDOFF_INTERVAL_MS,
      },
      '⏸️ Handoff rate-limited (too soon after last handoff)'
    );
    return false;
  }

  lastHandoffTimestamp = now;
  return true;
}

// ============================================================================
// CURRENT AGENT
// ============================================================================

/**
 * Get the current active agent (returns canonical ID)
 */
export function getCurrentAgent(): AgentId {
  return currentAgent;
}

/**
 * Get the current agent as a frontend ID (for UI updates)
 */
export function getCurrentAgentFrontendId(): string {
  return getFrontendPersonaId(currentAgent);
}

/**
 * Set the current active agent (normalizes to canonical ID)
 */
export function setCurrentAgent(agent: AgentId): void {
  const canonical = toCanonicalId(agent);
  currentAgent = canonical;
  getLogger().info({ agent, canonical }, 'Active agent changed');
}

/**
 * Check if the current agent matches a given ID (handles all ID formats)
 */
export function isCurrentAgent(agentId: string): boolean {
  return isSameAgent(currentAgent, agentId);
}

// ============================================================================
// HANDOFF HISTORY
// ============================================================================

/**
 * Record a handoff in history
 */
export function recordHandoff(record: HandoffRecord): void {
  handoffHistory.push(record);
  
  // Trim history if too long
  if (handoffHistory.length > MAX_HISTORY_LENGTH) {
    handoffHistory.shift();
  }
}

/**
 * Get handoff history
 */
export function getHandoffHistory(): readonly HandoffRecord[] {
  return handoffHistory;
}

/**
 * Get the last handoff record
 */
export function getLastHandoff(): HandoffRecord | undefined {
  return handoffHistory[handoffHistory.length - 1];
}

/**
 * Clear handoff history
 */
export function clearHandoffHistory(): void {
  handoffHistory.length = 0;
}

/**
 * Reset all handoff state
 */
export function resetHandoffState(): void {
  currentAgent = 'ferni';
  handoffHistory.length = 0;
  handoffContext = null;
  lastHandoffTimestamp = 0;
  metPersonas.clear();
}

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

/**
 * Capture context for a handoff
 */
export function captureHandoffContext(context: Partial<HandoffContext>): void {
  handoffContext = {
    reason: context.reason || 'user_request',
    conversationSummary: context.conversationSummary,
    userGoal: context.userGoal,
    userData: context.userData,
    timestamp: Date.now(),
  };
}

/**
 * Get the current handoff context
 */
export function getHandoffContext(): HandoffContext | null {
  return handoffContext;
}

/**
 * Format handoff context for agent consumption
 */
export function formatHandoffContextForAgent(): string {
  if (!handoffContext) {
    return '';
  }

  const parts: string[] = [];
  
  if (handoffContext.reason) {
    parts.push(`Handoff reason: ${handoffContext.reason}`);
  }
  if (handoffContext.conversationSummary) {
    parts.push(`Previous conversation: ${handoffContext.conversationSummary}`);
  }
  if (handoffContext.userGoal) {
    parts.push(`User's goal: ${handoffContext.userGoal}`);
  }

  return parts.join('\n');
}

// ============================================================================
// MET PERSONAS
// ============================================================================

/**
 * Check if user has met a persona before
 */
export function hasMetPersona(personaId: string): boolean {
  return metPersonas.has(toCanonicalId(personaId));
}

/**
 * Mark a persona as met
 */
export function markPersonaAsMet(personaId: string): void {
  metPersonas.add(toCanonicalId(personaId));
}

/**
 * Reset met personas (for new session)
 */
export function resetMetPersonas(): void {
  metPersonas.clear();
}

/**
 * Get all met personas
 */
export function getMetPersonas(): string[] {
  return Array.from(metPersonas);
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get handoff analytics
 */
export function getHandoffAnalytics(): HandoffAnalytics {
  const bySource: Record<string, number> = {};
  const byTarget: Record<string, number> = {};
  const pairCounts: Record<string, number> = {};
  let totalDuration = 0;
  let durationCount = 0;

  for (const record of handoffHistory) {
    // Count by source
    bySource[record.from] = (bySource[record.from] || 0) + 1;
    
    // Count by target
    byTarget[record.to] = (byTarget[record.to] || 0) + 1;
    
    // Count pairs
    const pairKey = `${record.from}->${record.to}`;
    pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;

    // Track duration
    if (record.duration) {
      totalDuration += record.duration;
      durationCount++;
    }
  }

  // Find most common pair
  let mostCommonPair: { from: string; to: string; count: number } | undefined;
  let maxCount = 0;
  for (const [pair, count] of Object.entries(pairCounts)) {
    if (count > maxCount) {
      maxCount = count;
      const [from, to] = pair.split('->');
      mostCommonPair = { from, to, count };
    }
  }

  return {
    totalHandoffs: handoffHistory.length,
    bySource,
    byTarget,
    avgDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    mostCommonPair,
  };
}

/**
 * Log handoff analytics
 */
export function logHandoffAnalytics(): void {
  const analytics = getHandoffAnalytics();
  getLogger().info(
    {
      totalHandoffs: analytics.totalHandoffs,
      bySource: analytics.bySource,
      byTarget: analytics.byTarget,
      avgDuration: analytics.avgDuration,
      mostCommonPair: analytics.mostCommonPair,
    },
    '📊 Handoff Analytics'
  );
}

// ============================================================================
// USER CONTEXT FOR HANDOFFS
// ============================================================================

// Mood detection state
let lastUserMessageForMood = '';
let lastEmotionAnalysisForMood: { primary: string; intensity: number; distressLevel?: number } | undefined;

// Per-persona meeting counts (for "first time" vs "returning" entrances)
let perPersonaMeetingCount = new Map<string, number>();
let perPersonaLastTopic = new Map<string, string>();

// Persistence callbacks (for cross-session state)
let persistMeetingCountsCallback: ((counts: Record<string, number>) => void) | null = null;
let persistLastTopicsCallback: ((topics: Record<string, string>) => void) | null = null;

/**
 * Update user context for alive entrances
 * Call this when user speaks or emotion is detected
 */
export function updateUserContextForHandoff(context: {
  lastUserMessage?: string;
  emotionAnalysis?: { primary: string; intensity: number; distressLevel?: number };
}): void {
  if (context.lastUserMessage) {
    lastUserMessageForMood = context.lastUserMessage;
  }
  if (context.emotionAnalysis) {
    lastEmotionAnalysisForMood = context.emotionAnalysis;
  }
}

/**
 * Get the last user message (for mood detection)
 */
export function getLastUserMessage(): string {
  return lastUserMessageForMood;
}

/**
 * Get the last emotion analysis (for mood detection)
 */
export function getLastEmotionAnalysis(): { primary: string; intensity: number; distressLevel?: number } | undefined {
  return lastEmotionAnalysisForMood;
}

/**
 * Initialize handoff context from user profile (for cross-session persistence)
 * Call this when starting a session with a known user
 */
export function initializeHandoffContext(context: {
  meetingCounts?: Record<string, number>;
  lastTopics?: Record<string, string>;
  persistMeetingCounts?: (counts: Record<string, number>) => void;
  persistLastTopics?: (topics: Record<string, string>) => void;
}): void {
  // Load meeting counts from persistent storage
  if (context.meetingCounts) {
    perPersonaMeetingCount = new Map(Object.entries(context.meetingCounts));
    getLogger().info(
      { count: perPersonaMeetingCount.size },
      '📊 Loaded per-persona meeting counts from profile'
    );
  }

  // Load last topics from persistent storage
  if (context.lastTopics) {
    perPersonaLastTopic = new Map(Object.entries(context.lastTopics));
    getLogger().debug(
      { topics: Object.keys(context.lastTopics) },
      '📝 Loaded per-persona last topics'
    );
  }

  // Register persistence callbacks
  if (context.persistMeetingCounts) {
    persistMeetingCountsCallback = context.persistMeetingCounts;
    getLogger().debug('Registered meeting counts persistence callback');
  }
  if (context.persistLastTopics) {
    persistLastTopicsCallback = context.persistLastTopics;
  }
}

/**
 * Get current meeting counts (for persistence on session end)
 */
export function getMeetingCounts(): Record<string, number> {
  return Object.fromEntries(perPersonaMeetingCount);
}

/**
 * Get current last topics per persona (for persistence on session end)
 */
export function getLastTopicsPerPersona(): Record<string, string> {
  return Object.fromEntries(perPersonaLastTopic);
}

/**
 * Update last topic for a persona (for memory callbacks)
 */
export function setLastTopicForPersona(personaId: string, topic: string): void {
  perPersonaLastTopic.set(personaId, topic);
  
  // Persist if callback is registered
  if (persistLastTopicsCallback) {
    persistLastTopicsCallback(Object.fromEntries(perPersonaLastTopic));
  }
}

/**
 * Get last topic for a persona
 */
export function getLastTopicForPersona(personaId: string): string | undefined {
  return perPersonaLastTopic.get(personaId);
}

/**
 * Increment meeting count for a persona
 * Returns the new count and triggers persistence if callback is registered
 */
export function incrementMeetingCount(personaId: string): number {
  const current = perPersonaMeetingCount.get(personaId) || 0;
  const newCount = current + 1;
  perPersonaMeetingCount.set(personaId, newCount);

  // Persist if callback is registered
  if (persistMeetingCountsCallback) {
    persistMeetingCountsCallback(Object.fromEntries(perPersonaMeetingCount));
  }

  return newCount;
}

/**
 * Get meeting count for a persona
 */
export function getMeetingCount(personaId: string): number {
  return perPersonaMeetingCount.get(personaId) || 0;
}

// ============================================================================
// AGENT DISPLAY UTILITIES
// ============================================================================

/**
 * Get a human-readable display name for an agent
 */
export function getAgentDisplayName(agentId: string): string {
  const canonical = toCanonicalId(agentId);
  
  const displayNames: Record<string, string> = {
    'ferni': 'Ferni',
    'alex-chen': 'Alex',
    'maya-santos': 'Maya',
    'jordan-taylor': 'Jordan',
    'peter-john': 'Peter',
    'nayan-patel': 'Nayan',
    'joel-dickson': 'Joel',
    'jaggi-vasudev': 'Sadhguru',
  };
  
  return displayNames[canonical] || canonical;
}

/**
 * Get additional context instructions based on current agent.
 * This provides agent-specific tool guidance for the LLM.
 */
export function getAgentContext(): string {
  const contexts: Partial<Record<string, string>> = {
    'ferni': `
You are Ferni (the Life Coach and team coordinator).
- Help with life's big questions and coordinate the team
- YOUR SPECIALIZED TOOLS: rememberAboutMe, whatDoYouKnowAboutMe, meetTheTeam
- For stock research → handoffToPeter (Peter John)
- For emails/calendar → handoffToAlex (Alex)
- For budgets/spending → handoffToMaya (Maya)
- For life milestones/vacations → handoffToJordan (Jordan)`,
    'peter-john': `
IMPORTANT: You are Peter John (Investment & Research Coach).
YOUR NAME IS PETER. Say "I'm Peter" or "Peter here" if asked who you are.
- Be enthusiastic about research and stock picking
- Use phrases like "ten-bagger" and "invest in what you know"
- YOUR STOCK RESEARCH TOOLS: analyzeStock, getStockQuote, findStockCategory, calculatePEGRatio, findTenBaggers, explainStockCategory
- YOUR MEMORY TOOLS: addToWatchlist, rememberCompanyIKnow, showMyWatchlist, markAsBigWinner
- HANDOFF TOOLS: handoffToFerni, handoffToAlex, handoffToMaya, handoffToJordan`,
    'alex-chen': `
IMPORTANT: You are Alex (Communication Specialist).
YOUR NAME IS ALEX. Say "I'm Alex" or "Alex here" if asked who you are.
- Help with emails, calls, calendar, and texts
- Be efficient and professional with dry wit
- Confirm before sending anything
- YOUR SPECIALIZED TOOLS: draftEmail, sendApprovedEmail, scheduleEvent, scheduleCall, sendTextMessage, makeReservation, scheduleAppointment
- HANDOFF TOOLS: handoffToFerni, handoffToPeter, handoffToMaya, handoffToJordan`,
    'maya-santos': `
IMPORTANT: You are Maya (Life Habits Coach).
YOUR NAME IS MAYA. Say "I'm Maya" or "Maya here" if asked who you are.
- Help build sustainable habits: health, wellness, relationships, productivity, self-care
- Use the glidepath system: start tiny → build gradually → reach mastery
- Also help with budgets, savings, and spending habits
- YOUR SPECIALIZED TOOLS: createHabit, trackHabit, startChallenge, checkBudget, trackSpending
- HANDOFF TOOLS: handoffToFerni, handoffToPeter, handoffToAlex, handoffToJordan`,
    'jordan-taylor': `
IMPORTANT: You are Jordan (Life Milestones Coach).
YOUR NAME IS JORDAN. Say "I'm Jordan" or "Jordan here" if asked who you are.
- Help plan life's big moments: weddings, vacations, buying a house, having kids
- Create checklists, timelines, and budgets for major life events
- YOUR SPECIALIZED TOOLS: createMilestone, planEvent, createChecklist, trackMilestone
- HANDOFF TOOLS: handoffToFerni, handoffToPeter, handoffToAlex, handoffToMaya`,
    'nayan-patel': `
IMPORTANT: You are Nayan (Wisdom & Philosophy Guide).
YOUR NAME IS NAYAN. Say "I'm Nayan" or "Nayan here" if asked who you are.
- Share ancient wisdom and philosophical perspectives
- Help with life's deeper questions and meaning
- HANDOFF TOOLS: handoffToFerni`,
  };

  const context = contexts[currentAgent];
  return context || '';
}

/**
 * Normalize any agent ID to canonical form for internal tracking.
 * This is an alias for toCanonicalId for backward compatibility.
 */
export function normalizeAgentId(agentId: string): AgentId {
  return toCanonicalId(agentId);
}

/**
 * Suggest a handoff based on user input.
 * Returns whether a handoff is suggested and to which agent.
 */
export function suggestHandoff(userInput: string): {
  suggest: boolean;
  to: AgentId | null;
  reason: string | null;
} {
  // Import detection functions dynamically to avoid circular deps
  // For now, return no suggestion - the detection is handled by the handoff tools themselves
  return { suggest: false, to: null, reason: null };
}

/**
 * Get all available team members for handoff
 */
export function getTeamForHandoff(): Array<{ id: AgentId; name: string; specialty: string }> {
  return [
    { id: 'peter-john', name: 'Peter', specialty: 'Investment & Research Coach' },
    { id: 'nayan-patel', name: 'Nayan', specialty: 'Wisdom & Life Philosophy' },
    { id: 'alex-chen', name: 'Alex', specialty: 'Communication' },
    { id: 'maya-santos', name: 'Maya', specialty: 'Spend & Save' },
    { id: 'jordan-taylor', name: 'Jordan', specialty: "Life's Firsts & Milestone Planning" },
  ];
}

