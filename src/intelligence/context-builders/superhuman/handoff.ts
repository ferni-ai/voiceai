/**
 * Handoff Context Builder
 *
 * Handles handoff-related context injections:
 * - IMMEDIATE handoffs for wake words ("Hey Alex", "Hey Ferni", etc.)
 * - Suggests handoffs when conversation topic matches another team member's specialty
 * - Provides current agent context for response styling
 * - Tracks handoff history for continuity
 *
 * Wake words and triggers are now loaded from persona bundle manifests!
 */
import {
  registerContextBuilder,
  createHintInjection,
  createCriticalInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { isTeamMemberUnlocked } from './team-availability.js';

const log = createLogger({ module: 'HandoffContext' });
import { isDebugEnabled } from '../../../config/feature-flags.js';

// Use centralized feature flag system for debug toggle
const DEBUG_HANDOFF = isDebugEnabled('handoff');
import {
  getCurrentAgent,
  suggestHandoff,
  getAgentContext,
  getLastHandoff,
  formatHandoffContextForAgent,
  getHandoffContextNew as getHandoffContext, // Use executor version which includes cognitiveContext
} from '../../../tools/handoff/index.js';
import { detectHandoffEnhanced } from '../../../services/coaching/semantic-handoff.js';
import { formatCognitiveHandoffForPrompt } from '../../../tools/handoff/cognitive-handoff.js';
import type { AgentId } from '../../../services/agent-bus.js';
import { getAllHandoffTriggers } from '../../../personas/team/team-config.js';
import {
  getPersonaDisplayName,
  getCanonicalPersonaId,
  getFrontendPersonaId,
} from '../../../personas/voice-registry.js';

// ============================================================================
// TYPES
// ============================================================================

interface WakeWordResult {
  isWakeWord: boolean;
  targetAgent: string | null;
  targetName: string | null;
  tool: string | null;
}

interface AgentInfo {
  name: string;
  tool: string;
  specialty: string;
}

// ============================================================================
// AGENT METADATA (maps canonical IDs to tools and info)
// ============================================================================

const AGENT_TOOLS: Record<string, string> = {
  ferni: 'handoffToJackB',
  'peter-john': 'handoffToPeter',
  'alex-chen': 'handoffToAlex',
  'maya-santos': 'handoffToMaya',
  'jordan-taylor': 'handoffToJordan',
};

const AGENT_SPECIALTIES: Record<string, string> = {
  ferni: 'life coaching and team coordination',
  'nayan-patel': 'wisdom, life philosophy, and mindfulness',
  'peter-john': 'stock picking and active investing',
  'alex-chen': 'emails, calendar, and communication',
  'maya-santos': 'budgets, spending, and savings',
  'jordan-taylor': 'big purchases, vacations, and life planning',
};

// Legacy ID mappings (for compatibility with existing handoff tools)
// NOTE: Now that handoff.ts uses canonical IDs internally, these should match!
const CANONICAL_TO_LEGACY: Record<string, string> = {
  ferni: 'ferni', // Canonical ID (was jack-b)
  'nayan-patel': 'nayan-patel',
  'peter-john': 'peter-john',
  'alex-chen': 'alex-chen', // Canonical ID (was alex)
  'maya-santos': 'maya-santos', // Canonical ID (was maya)
  'jordan-taylor': 'jordan-taylor', // Canonical ID (was jordan)
};

// ============================================================================
// CACHED TRIGGER MAP (loaded from bundles)
// ============================================================================

let cachedTriggerMap: Map<string, string[]> | null = null;
let triggerMapPromise: Promise<Map<string, string[]>> | null = null;

/**
 * Get trigger map, loading from bundles if needed
 */
async function getTriggerMap(): Promise<Map<string, string[]>> {
  if (cachedTriggerMap) return cachedTriggerMap;

  // Avoid multiple concurrent loads
  if (triggerMapPromise) return triggerMapPromise;

  triggerMapPromise = getAllHandoffTriggers().then((map) => {
    cachedTriggerMap = map;
    return map;
  });

  return triggerMapPromise;
}

/**
 * Get trigger map synchronously (returns cached or empty)
 * Use this for sync functions - will use fallback if bundles not loaded
 */
function getTriggerMapSync(): Map<string, string[]> {
  if (cachedTriggerMap) return cachedTriggerMap;

  // Return fallback triggers (hardcoded) while bundles load
  // NOTE: These should match the persona.manifest.json handoff_triggers!
  return new Map([
    [
      'ferni',
      [
        'hey ferni',
        'hi ferni',
        'hello ferni',
        'talk to ferni',
        'get ferni',
        'coach',
        'life coach',
        'back to ferni',
      ],
    ],
    [
      'nayan-patel',
      [
        'hey nayan',
        'hi jack',
        'hello jack',
        'hey jack bogle',
        'hi jack bogle',
        'hello jack bogle',
        'talk to jack',
        'talk to jack bogle',
        'index fund',
        'index funds',
        'vanguard',
        'passive investing',
      ],
    ],
    [
      'peter-john',
      [
        'hey peter',
        'hi peter',
        'hello peter',
        'talk to peter',
        'hey peter john',
        'stock pick',
        'stock picking',
      ],
    ],
    [
      'alex-chen',
      [
        'hey alex',
        'hi alex',
        'hello alex',
        'talk to alex',
        'send an email',
        'schedule',
        'calendar',
      ],
    ],
    [
      'maya-santos',
      ['hey maya', 'hi maya', 'hello maya', 'talk to maya', 'budget', 'spending', 'savings'],
    ],
    [
      'jordan-taylor',
      [
        'hey jordan',
        'hi jordan',
        'hello jordan',
        'talk to jordan',
        'vacation',
        'big purchase',
        'wedding',
        'baby',
      ],
    ],
  ]);
}

// Start loading triggers in background on module load
getTriggerMap().catch(() => {
  // Silently use fallback triggers if bundle load fails
});

// ============================================================================
// WAKE WORD DETECTION
// ============================================================================

/**
 * Check if user said a wake word that should trigger IMMEDIATE handoff
 * Uses triggers from bundle manifests with fallback to hardcoded triggers
 */
function detectWakeWord(userText: string): WakeWordResult {
  const lowerText = userText.toLowerCase().trim();
  const triggerMap = getTriggerMapSync();

  // Sort persona IDs to check more specific patterns first
  // (e.g., 'nayan-patel' before 'ferni' which has generic patterns)
  const sortedPersonaIds = Array.from(triggerMap.keys()).sort((a, b) => {
    // nayan-patel should come before ferni
    if (a === 'nayan-patel') return -1;
    if (b === 'nayan-patel') return 1;
    // peter-john should come before generic patterns
    if (a === 'peter-john') return -1;
    if (b === 'peter-john') return 1;
    return 0;
  });

  for (const canonicalId of sortedPersonaIds) {
    const triggers = triggerMap.get(canonicalId) || [];

    for (const trigger of triggers) {
      const lowerTrigger = trigger.toLowerCase();

      // Check if message starts with trigger or IS the trigger
      if (
        lowerText === lowerTrigger ||
        lowerText.startsWith(`${lowerTrigger} `) ||
        lowerText.startsWith(`${lowerTrigger},`) ||
        lowerText.startsWith(`${lowerTrigger}!`) ||
        lowerText.startsWith(`${lowerTrigger}?`)
      ) {
        const displayName = getPersonaDisplayName(canonicalId);
        const tool = AGENT_TOOLS[canonicalId] || `handoffTo${displayName}`;
        const legacyId = CANONICAL_TO_LEGACY[canonicalId] || canonicalId;

        return {
          isWakeWord: true,
          targetAgent: legacyId,
          targetName: displayName,
          tool,
        };
      }
    }
  }

  return { isWakeWord: false, targetAgent: null, targetName: null, tool: null };
}

// ============================================================================
// AGENT INFO HELPERS
// ============================================================================

/**
 * Get agent info from canonical ID
 */
function getAgentInfo(canonicalId: string): AgentInfo | null {
  const displayName = getPersonaDisplayName(canonicalId);
  const tool = AGENT_TOOLS[canonicalId];
  const specialty = AGENT_SPECIALTIES[canonicalId];

  if (!tool) return null;

  return { name: displayName, tool, specialty };
}

/**
 * Map any agent ID (legacy, short, or frontend) to canonical ID
 */
function legacyToCanonical(agentId: string): string {
  const mapping: Record<string, string> = {
    // Frontend IDs → Canonical
    'jack-b': 'ferni',
    'comm-specialist': 'alex-chen',
    'spend-save': 'maya-santos',
    'event-planner': 'jordan-taylor',
    // Short IDs → Canonical
    alex: 'alex-chen',
    maya: 'maya-santos',
    jordan: 'jordan-taylor',
    nayan: 'nayan-patel',
    peter: 'peter-john',
    coach: 'ferni',
    // Canonical → Canonical (pass-through)
    ferni: 'ferni',
    'alex-chen': 'alex-chen',
    'maya-santos': 'maya-santos',
    'jordan-taylor': 'jordan-taylor',
    'nayan-patel': 'nayan-patel',
    'peter-john': 'peter-john',
  };
  return mapping[agentId.toLowerCase()] || getCanonicalPersonaId(agentId);
}

// ============================================================================
// HANDOFF CONTEXT BUILDER
// ============================================================================

/**
 * Build handoff-related context injections
 */
async function buildHandoffContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, analysis, userProfile } = input;
  const injections: ContextInjection[] = [];
  const currentAgent = getCurrentAgent();

  // Get subscription tier for unlock checking
  const tier: 'free' | 'friend' | 'partner' =
    (userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

  // -----------------------------------------------
  // CURRENT AGENT CONTEXT
  // -----------------------------------------------
  const agentContext = getAgentContext();
  if (agentContext && agentContext.trim()) {
    injections.push(createHintInjection('agent_identity', agentContext));
  }

  // -----------------------------------------------
  // WAKE WORD DETECTION - IMMEDIATE MANDATORY HANDOFF (if unlocked)
  // -----------------------------------------------
  const wakeWord = detectWakeWord(userText);
  if (DEBUG_HANDOFF)
    log.debug('Wake word check', {
      userText: userText.slice(0, 50),
      isWakeWord: wakeWord.isWakeWord,
      target: wakeWord.targetAgent,
      currentAgent,
    });

  if (wakeWord.isWakeWord && wakeWord.targetAgent !== currentAgent) {
    // Check if target is unlocked
    const targetUnlocked = isTeamMemberUnlocked(wakeWord.targetAgent || '', userProfile, tier);

    if (targetUnlocked) {
      if (DEBUG_HANDOFF)
        log.debug('Wake word detected', {
          target: wakeWord.targetName,
          tool: wakeWord.tool,
        });
      // This is a CRITICAL injection - the LLM MUST call the handoff tool immediately
      injections.push(
        createCriticalInjection(
          'wake_word_handoff',
          `[CRITICAL - IMMEDIATE HANDOFF REQUIRED]
The user said "${userText}" which is a WAKE WORD for ${wakeWord.targetName}.
You MUST call the ${wakeWord.tool} tool RIGHT NOW with reason: "User requested ${wakeWord.targetName} by name"

DO NOT respond with text first. DO NOT ask clarifying questions.
IMMEDIATELY call: ${wakeWord.tool}({ reason: "User requested ${wakeWord.targetName} by name" })

This is NON-NEGOTIABLE. The user explicitly asked for ${wakeWord.targetName}.`
        )
      );
      // Return early - wake word takes priority over everything else
      return injections;
    } else {
      // User asked for someone they haven't met yet - handle gracefully without naming them
      injections.push(
        createHintInjection(
          'locked_wake_word',
          `[TEAM MEMBER NOT YET AVAILABLE]
The user asked for a team member they haven't met yet. Don't name this person.
Respond warmly: "I have a friend who'd be perfect for that, but we need to get to know each other a bit better first. In the meantime, I'm here - how can I help?"`
        )
      );
      return injections;
    }
  }

  // -----------------------------------------------
  // HANDOFF SUGGESTIONS (semantic + keyword detection)
  // Uses semantic matching first, falls back to keyword matching
  // -----------------------------------------------
  const userId = input.services?.userId || 'anonymous';
  const currentCanonicalId = legacyToCanonical(currentAgent);
  
  // Try semantic detection first (catches conceptual intent)
  const semanticHandoff = detectHandoffEnhanced(
    userId,
    userText,
    currentCanonicalId as import('../../../services/coaching/handoff-intelligence.js').PersonaId
  );
  
  if (semanticHandoff.shouldHandoff && semanticHandoff.candidate) {
    const candidateId = semanticHandoff.candidate.personaId;
    const canonicalId = legacyToCanonical(candidateId);
    const targetAgentInfo = getAgentInfo(canonicalId);
    const targetUnlocked = isTeamMemberUnlocked(canonicalId, userProfile, tier);
    
    if (targetAgentInfo && targetUnlocked && candidateId !== currentAgent) {
      const confidence = semanticHandoff.candidate.confidence;
      const warmIntro = semanticHandoff.candidate.warmIntro;
      
      // High confidence = stronger suggestion
      if (confidence >= 0.7) {
        injections.push(
          createHintInjection(
            'handoff_suggestion',
            `[🎯 STRONG HANDOFF MATCH: ${targetAgentInfo.name}]
The user's message strongly indicates ${targetAgentInfo.name}'s specialty.
Reason: ${semanticHandoff.candidate.reason}
Confidence: ${Math.round(confidence * 100)}%

Suggest naturally: "${warmIntro}"
Tool: ${targetAgentInfo.tool}`
          )
        );
      } else if (confidence >= 0.4) {
        injections.push(
          createHintInjection(
            'handoff_suggestion',
            `[HANDOFF OPPORTUNITY: ${targetAgentInfo.name}]
This might be a good fit for ${targetAgentInfo.name} (${targetAgentInfo.specialty}).
Reason: ${semanticHandoff.candidate.reason}
Consider mentioning: "${warmIntro}"`
          )
        );
      }
    }
  } else {
    // Fall back to original keyword-based suggestion
    const handoffSuggestion = suggestHandoff(userText);
    if (handoffSuggestion.suggest && handoffSuggestion.to !== currentAgent) {
      const canonicalId = legacyToCanonical(handoffSuggestion.to || '');
      const targetAgentInfo = getAgentInfo(canonicalId);
      const targetUnlocked = isTeamMemberUnlocked(canonicalId, userProfile, tier);

      if (targetAgentInfo && targetUnlocked) {
        injections.push(
          createHintInjection(
            'handoff_suggestion',
            `[HANDOFF SUGGESTION: User's request about "${handoffSuggestion.reason}" matches ${targetAgentInfo.name}'s specialty (${targetAgentInfo.specialty}).
Consider using the ${targetAgentInfo.tool} tool to bring them in.
Example: "That sounds like something ${targetAgentInfo.name} could help with better. Want me to bring them in?"]`
          )
        );
      }
    }
  }

  // -----------------------------------------------
  // RECENT HANDOFF CONTEXT
  // -----------------------------------------------
  const lastHandoff = getLastHandoff();
  if (lastHandoff && lastHandoff.timestamp > Date.now() - 60000) {
    // Within last minute
    const fromCanonical = legacyToCanonical(lastHandoff.from);
    const fromName = getPersonaDisplayName(fromCanonical);

    // Include preserved conversation context
    const preservedContext = formatHandoffContextForAgent();
    let handoffMessage = `[RECENT HANDOFF: You just took over from ${fromName}. Reason: ${lastHandoff.reason}.
Acknowledge the transition naturally and continue the conversation.]`;
    if (preservedContext) {
      handoffMessage += `\n\n${preservedContext}`;
    }

    // Include cognitive handoff context if available (user's thinking style, what worked, etc.)
    const handoffContext = getHandoffContext();
    if (handoffContext?.cognitiveContext) {
      const cognitiveContext = formatCognitiveHandoffForPrompt(handoffContext.cognitiveContext);
      if (cognitiveContext) {
        handoffMessage += `\n\n${cognitiveContext}`;
      }
    }

    // Include memory context from trust systems (boundaries, sensitivities, rapport builders)
    try {
      const { buildHandoffContext: buildTrustHandoff } =
        await import('../../../services/trust-systems/handoff-context.js');
      const userId = input.services?.userId;
      if (userId) {
        const toCanonical = getCurrentAgent();
        const trustContext = buildTrustHandoff(userId, fromCanonical, toCanonical);
        if (trustContext.contextSummary) {
          handoffMessage += `\n\n${trustContext.contextSummary}`;
        }
      }
    } catch (trustErr) {
      // Trust context is optional, continue without it
      if (DEBUG_HANDOFF) log.debug({ error: trustErr }, 'Trust handoff context unavailable');
    }

    injections.push(createHintInjection('recent_handoff', handoffMessage));
  }

  // -----------------------------------------------
  // TEAM AWARENESS FOR COACH
  // -----------------------------------------------
  const currentCanonical = legacyToCanonical(currentAgent);
  if (currentCanonical === 'ferni') {
    // Check if conversation is getting specialized
    const topics = analysis.topics?.detected || [];
    const specializedTopics = topics.filter((t) =>
      [
        'stocks',
        'stock',
        'picking',
        'budget',
        'spending',
        'saving',
        'email',
        'calendar',
        'vacation',
        'car',
        'purchase',
      ].includes(t.toLowerCase())
    );

    if (specializedTopics.length >= 2) {
      injections.push(
        createHintInjection(
          'team_awareness',
          `[TEAM AWARENESS: The conversation is getting into specialized territory (${specializedTopics.join(', ')}).
Your team members have deep expertise in their areas - consider if a handoff would serve the user better.]`
        )
      );
    }
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder('handoff', buildHandoffContext);

export { buildHandoffContext, detectWakeWord };
