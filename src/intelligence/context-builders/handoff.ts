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
} from './index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HandoffContext' });
const DEBUG_HANDOFF = process.env.DEBUG_HANDOFF === 'true';
import {
  getCurrentAgent,
  suggestHandoff,
  getAgentContext,
  getLastHandoff,
  formatHandoffContextForAgent,
} from '../../tools/handoff/index.js';
import type { AgentId } from '../../services/agent-bus.js';
import { getAllHandoffTriggers } from '../../personas/team/team-config.js';
import {
  getPersonaDisplayName,
  getCanonicalPersonaId,
  getFrontendPersonaId,
} from '../../personas/voice-registry.js';

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
function buildHandoffContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, analysis } = input;
  const injections: ContextInjection[] = [];
  const currentAgent = getCurrentAgent();

  // -----------------------------------------------
  // CURRENT AGENT CONTEXT
  // -----------------------------------------------
  const agentContext = getAgentContext();
  if (agentContext && agentContext.trim()) {
    injections.push(createHintInjection('agent_identity', agentContext));
  }

  // -----------------------------------------------
  // WAKE WORD DETECTION - IMMEDIATE MANDATORY HANDOFF
  // -----------------------------------------------
  const wakeWord = detectWakeWord(userText);
  if (DEBUG_HANDOFF) log.debug('Wake word check', {
    userText: userText.slice(0, 50),
    isWakeWord: wakeWord.isWakeWord,
    target: wakeWord.targetAgent,
    currentAgent,
  });

  if (wakeWord.isWakeWord && wakeWord.targetAgent !== currentAgent) {
    if (DEBUG_HANDOFF) log.debug('Wake word detected', {
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
  }

  // -----------------------------------------------
  // HANDOFF SUGGESTIONS (for topic-based handoffs)
  // -----------------------------------------------
  // Only suggest handoffs if not already the target agent
  const handoffSuggestion = suggestHandoff(userText);
  if (handoffSuggestion.suggest && handoffSuggestion.to !== currentAgent) {
    // Get agent info using canonical ID
    const canonicalId = legacyToCanonical(handoffSuggestion.to || '');
    const targetAgentInfo = getAgentInfo(canonicalId);

    if (targetAgentInfo) {
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
