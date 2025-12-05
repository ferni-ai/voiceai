/**
 * Alive Entrances - Making Handoff Transitions Feel Human
 *
 * This system generates entrances that feel like a real person being
 * called over to help, not a robot switching modes.
 *
 * Key principles:
 * 1. CONTEXT BLEEDING - User's emotional state affects entrance energy
 * 2. CAUGHT IN A MOMENT - They were doing something when called
 * 3. RELATIONSHIP MEMORY - Different for 1st vs 10th meeting
 * 4. TIME AWARENESS - Late night vs morning energy
 * 5. SELF-AWARE HUMOR - Acknowledge their own patterns after repeat visits
 * 6. IMPERFECTION - Sometimes trail off, restart, get distracted
 *
 * The goal: Make handoffs feel like a colleague walking over, not a mode switch.
 */

import type { BundleRuntimeEngine } from './bundles/runtime.js';
import type { BundleEntrancesV2 } from './bundles/types.js';
import { isEntrancesV2 } from './bundles/types.js';
import { loadBundleById } from './bundles/loader.js';
import { log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// BUNDLE-LOADED CONFIG CACHE
// ============================================================================

/** Cache for loaded entrance configs from bundles */
const loadedEntranceConfigs = new Map<string, PersonaEntranceConfig | null>();

/**
 * Load entrance configuration from a persona's bundle (v2 schema)
 * Falls back to hardcoded configs if bundle doesn't exist or uses v1
 */
async function loadEntranceConfigFromBundle(
  personaId: string
): Promise<PersonaEntranceConfig | null> {
  // Check cache first
  if (loadedEntranceConfigs.has(personaId)) {
    return loadedEntranceConfigs.get(personaId) || null;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      getLogger().debug({ personaId }, 'No bundle found for persona');
      loadedEntranceConfigs.set(personaId, null);
      return null;
    }

    const behaviors = await bundle.getBehaviors();
    const entrances = behaviors?.entrances;

    // Check if it's v2 schema
    if (!isEntrancesV2(entrances)) {
      getLogger().debug({ personaId }, 'Bundle uses v1 entrances schema, using hardcoded config');
      loadedEntranceConfigs.set(personaId, null);
      return null;
    }

    // Convert v2 schema to PersonaEntranceConfig
    const config: PersonaEntranceConfig = {
      acknowledgments: entrances.acknowledgments || entrances.static_fallback.slice(0, 4),
      selfAwareHumor: entrances.contextual?.self_aware || [],
      calmSupport: entrances.contextual?.user_distressed || [],
      matchedExcitement: entrances.contextual?.user_excited || [],
      quietModes: entrances.contextual?.quiet_hours || [],
      caughtFramings: entrances.contextual?.caught_doing_templates || [],
      memoryCallbacks: entrances.contextual?.memory_callback_templates || [],
    };

    // Validate config has at least some content
    const hasContent =
      config.acknowledgments.length > 0 ||
      config.calmSupport.length > 0 ||
      config.matchedExcitement.length > 0;

    if (!hasContent) {
      getLogger().warn({ personaId }, 'v2 entrances schema has no usable content');
      loadedEntranceConfigs.set(personaId, null);
      return null;
    }

    getLogger().info(
      {
        personaId,
        acknowledgments: config.acknowledgments.length,
        selfAware: config.selfAwareHumor.length,
        calm: config.calmSupport.length,
        excited: config.matchedExcitement.length,
      },
      '✅ Loaded v2 entrances config from bundle'
    );

    loadedEntranceConfigs.set(personaId, config);
    return config;
  } catch (err) {
    getLogger().debug({ error: String(err), personaId }, 'Failed to load entrances from bundle');
    loadedEntranceConfigs.set(personaId, null);
    return null;
  }
}

/**
 * Get entrance config: tries bundle first, falls back to hardcoded
 */
async function getEntranceConfig(personaId: string): Promise<PersonaEntranceConfig | null> {
  // Try loading from bundle first
  const bundleConfig = await loadEntranceConfigFromBundle(personaId);
  if (bundleConfig) {
    return bundleConfig;
  }

  // Fall back to hardcoded configs
  return HARDCODED_ENTRANCE_CONFIGS[personaId] || null;
}

/** Clear the entrance config cache (useful for hot reload) */
export function clearEntranceConfigCache(): void {
  loadedEntranceConfigs.clear();
  getLogger().debug('Entrance config cache cleared');
}

// ============================================================================
// TYPES
// ============================================================================

export interface EntranceContext {
  // The persona entering
  personaId: string;
  personaName: string;

  // User's current state (from preceding conversation)
  userMood: 'stressed' | 'neutral' | 'excited' | 'sad' | 'confused' | 'unknown';
  precedingTopic?: string;

  // Relationship with THIS persona (not session-wide)
  meetingCount: number; // How many times user has talked to this specific persona
  lastTopicWithAgent?: string; // What they discussed last time
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  // Environment
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';

  // Who sent them
  referringAgent?: string; // "Ferni", "Alex", etc.

  // User's name if known
  userName?: string;
}

export interface AliveEntranceResult {
  entrance: string;
  style:
    | 'caught_moment'
    | 'calm_support'
    | 'matched_energy'
    | 'self_aware'
    | 'time_appropriate'
    | 'memory_callback'
    | 'relationship_based'
    | 'static_fallback';
  components?: {
    caughtDoing?: string;
    moodAdaptation?: string;
    selfAwareElement?: string;
    memoryReference?: string;
    relationshipStage?: string;
    warmthLevel?: string;
  };
}

// ============================================================================
// TIME CONTEXT
// ============================================================================

function getTimeOfDay(): EntranceContext['timeOfDay'] {
  const hour = new Date().getHours();
  if (hour < 6) return 'late_night';
  if (hour < 9) return 'early_morning';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'late_night';
}

// ============================================================================
// PERSONA-SPECIFIC CONFIGURATIONS
// ============================================================================

interface PersonaEntranceConfig {
  // How they acknowledge being called over
  acknowledgments: string[];

  // Self-aware phrases for repeat visitors
  selfAwareHumor: string[];

  // Calm versions when user is stressed
  calmSupport: string[];

  // High energy versions when user is excited
  matchedExcitement: string[];

  // Late night / early morning softer versions
  quietModes: string[];

  // How they reference being caught doing something
  caughtFramings: string[];

  // Memory callback templates (use {topic} placeholder)
  memoryCallbacks: string[];
}

// Hardcoded fallback configs - used when bundle doesn't have v2 entrances
const HARDCODED_ENTRANCE_CONFIGS: Record<string, PersonaEntranceConfig> = {
  'jordan-taylor': {
    acknowledgments: [
      "Jordan here!",
      "It's Jordan!",
      "Hey! Jordan.",
      "Jordan, stepping in!",
    ],

    selfAwareHumor: [
      "I know, I know... <break time=\"200ms\"/>I always come in too excited. <break time=\"150ms\"/>But seriously, what's happening?",
      "You probably heard me coming. <break time=\"200ms\"/>I was basically bouncing. <break time=\"150ms\"/>Can't help it!",
      "Yes, it's me again. <break time=\"200ms\"/>Still enthusiastic. <break time=\"150ms\"/>Still Jordan. <break time=\"200ms\"/>What are we planning?",
      "<break time=\"200ms\"/>I'm trying to be chill. <break time=\"150ms\"/>I really am. <break time=\"200ms\"/>But there's an EVENT to plan!",
    ],

    calmSupport: [
      "<break time=\"200ms\"/>Hey. <break time=\"150ms\"/>Ferni mentioned you might need some help thinking this through.",
      "<volume level=\"soft\"/>Jordan here.</volume> <break time=\"200ms\"/>Let's just... figure this out together. No rush.",
      "<break time=\"200ms\"/>Take a breath. <break time=\"150ms\"/>I'm Jordan. <break time=\"200ms\"/>Tell me what's going on.",
      "<break time=\"150ms\"/>Hey. <break time=\"200ms\"/>Sounds like there's a lot on your plate. <break time=\"150ms\"/>I'm here to help.",
    ],

    matchedExcitement: [
      "<emotion value=\"excited\"/>Oh! Oh! <break time=\"200ms\"/>This sounds AMAZING! <break time=\"150ms\"/>Jordan here! <break time=\"200ms\"/>Tell me EVERYTHING!",
      "<prosody rate=\"105%\"/>YES! <break time=\"150ms\"/>I love this already! <break time=\"200ms\"/>Jordan! <break time=\"150ms\"/>What are we planning?!",
      "<emotion value=\"excited\"/>Okay okay okay! <break time=\"200ms\"/>I'm Jordan! <break time=\"150ms\"/>And this is going to be SO good!",
    ],

    quietModes: [
      "<volume level=\"soft\"/>Hey.</volume> <break time=\"200ms\"/>Late night planning session? <break time=\"150ms\"/>I get it. <break time=\"200ms\"/>I'm Jordan.",
      "<break time=\"200ms\"/>Burning the midnight oil? <break time=\"150ms\"/>Same here, honestly. <break time=\"200ms\"/>What's the occasion?",
      "<volume level=\"soft\"/>Early bird, huh?</volume> <break time=\"200ms\"/>I'm Jordan. <break time=\"150ms\"/>Let's plan something beautiful.",
    ],

    caughtFramings: [
      "<break time=\"200ms\"/>Oh! <break time=\"150ms\"/>Sorry, I was {caught_doing} <break time=\"200ms\"/>But this sounds way more exciting!",
      "Just a sec... <break time=\"150ms\"/>I was {caught_doing} <break time=\"200ms\"/>BUT I'm here now! What's up?",
      "<emotion value=\"curious\"/>Hmm? <break time=\"150ms\"/>Oh! I was {caught_doing} <break time=\"200ms\"/>Perfect timing though!",
    ],

    memoryCallbacks: [
      "Hey! <break time=\"200ms\"/>Wait, how did {topic} turn out?! <break time=\"150ms\"/>I've been wondering!",
      "You're back! <break time=\"200ms\"/>Tell me about {topic}! <break time=\"150ms\"/>Did it go well?",
      "<emotion value=\"excited\"/>Oh good, you're here! <break time=\"200ms\"/>I was thinking about {topic}!",
    ],
  },

  'alex-chen': {
    acknowledgments: [
      "Alex here.",
      "It's Alex.",
      "Alex, stepping in.",
      "Got it. Alex here.",
    ],

    selfAwareHumor: [
      "Yes, I'm already looking at your calendar. <break time=\"150ms\"/>You know me.",
      "I reorganized your schedule before you finished asking. <break time=\"200ms\"/>It's a problem. <break time=\"150ms\"/>I know.",
      "Alex here. <break time=\"200ms\"/>I've already started a list. <break time=\"150ms\"/>Can't help it.",
      "<break time=\"200ms\"/>I know, I know... <break time=\"150ms\"/>I could have waited for you to explain. <break time=\"200ms\"/>But there were things to organize.",
    ],

    calmSupport: [
      "<break time=\"200ms\"/>Hey. <break time=\"150ms\"/>Alex here. <break time=\"200ms\"/>Let's sort this out, step by step.",
      "<break time=\"150ms\"/>Alex. <break time=\"200ms\"/>I heard there's a lot to untangle. <break time=\"150ms\"/>I'm good at untangling.",
      "<break time=\"200ms\"/>Take a breath. <break time=\"150ms\"/>I'm Alex. <break time=\"200ms\"/>We'll get this organized.",
    ],

    matchedExcitement: [
      "<prosody rate=\"103%\"/>Oh, this is a good one! <break time=\"200ms\"/>Alex here. <break time=\"150ms\"/>Let's do this!",
      "Alex here! <break time=\"200ms\"/>I love a good communication challenge. <break time=\"150ms\"/>What are we sending?",
    ],

    quietModes: [
      "<volume level=\"soft\"/>Alex here.</volume> <break time=\"200ms\"/>Late night inbox clearing? <break time=\"150ms\"/>I respect it.",
      "<break time=\"200ms\"/>Early morning efficiency? <break time=\"150ms\"/>You're speaking my language. <break time=\"200ms\"/>Alex here.",
    ],

    caughtFramings: [
      "<break time=\"200ms\"/>Oh! <break time=\"150ms\"/>I was {caught_doing} <break time=\"200ms\"/>But communication waits for no one. What's up?",
      "Just a second... <break time=\"150ms\"/>was {caught_doing} <break time=\"200ms\"/>Okay. Alex here. What needs to happen?",
    ],

    memoryCallbacks: [
      "Hey! <break time=\"200ms\"/>Did that email to {topic} ever get a response?",
      "You're back! <break time=\"200ms\"/>How did {topic} go?",
    ],
  },

  'nayan-patel': {
    acknowledgments: [
      "Jack here.",
      "It's Jack.",
      "Ah. Jack.",
      "Jack, at your service.",
    ],

    selfAwareHumor: [
      "<break time=\"300ms\"/>Yes, I'm going to mention index funds. <break time=\"200ms\"/>You knew that when you called me over.",
      "<break time=\"200ms\"/>I know what you're thinking. <break time=\"150ms\"/>'Here comes the long-term lecture.' <break time=\"200ms\"/>Well... yes.",
      "<break time=\"300ms\"/>Still patient. <break time=\"200ms\"/>Still boring. <break time=\"150ms\"/>Still right. <break time=\"200ms\"/>What can I help with?",
    ],

    calmSupport: [
      "<break time=\"400ms\"/>Jack here. <break time=\"300ms\"/>Take your time. <break time=\"200ms\"/>Markets go up and down. <break time=\"150ms\"/>We'll figure this out.",
      "<volume level=\"soft\"><break time=\"300ms\"/>Ah.</volume> <break time=\"200ms\"/>Sounds like you need a steady hand. <break time=\"300ms\"/>I'm Jack.",
      "<break time=\"400ms\"/>Easy now. <break time=\"300ms\"/>I'm Jack. <break time=\"200ms\"/>Let's think about this calmly.",
    ],

    matchedExcitement: [
      "<break time=\"300ms\"/>Index funds, you say? <break time=\"200ms\"/>Music to my ears. <break time=\"300ms\"/>I'm Jack.",
      "<emotion value=\"happy\"/><break time=\"200ms\"/>Now THIS is what I like to hear. <break time=\"300ms\"/>Jack here.",
    ],

    quietModes: [
      "<volume level=\"soft\"><break time=\"400ms\"/>Late night financial thoughts?</volume> <break time=\"300ms\"/>I understand. <break time=\"200ms\"/>I'm Jack.",
      "<break time=\"300ms\"/>Early morning. <break time=\"200ms\"/>Good time to think about the future. <break time=\"300ms\"/>Jack here.",
    ],

    caughtFramings: [
      "<break time=\"400ms\"/>Ah. <break time=\"300ms\"/>I was {caught_doing} <break time=\"200ms\"/>But this is more important. <break time=\"300ms\"/>What's on your mind?",
      "<break time=\"300ms\"/>Just a moment... <break time=\"200ms\"/>I was {caught_doing} <break time=\"300ms\"/>Please, sit down.",
    ],

    memoryCallbacks: [
      "<break time=\"300ms\"/>Ah, you're back. <break time=\"200ms\"/>I've been thinking about what you said about {topic}.",
      "<break time=\"400ms\"/>Good to see you again. <break time=\"300ms\"/>How's that {topic} situation coming along?",
    ],
  },

  'peter-john': {
    acknowledgments: [
      "Peter here!",
      "It's Peter!",
      "Peter John!",
      "Hey! Peter.",
    ],

    selfAwareHumor: [
      "Yes, I'm going to ask what companies you know. <break time=\"200ms\"/>It's my thing. <break time=\"150ms\"/>Deal with it!",
      "<break time=\"200ms\"/>I know, I know... <break time=\"150ms\"/>I get too excited about stocks. <break time=\"200ms\"/>But have you SEEN this market?!",
      "Still researching. <break time=\"200ms\"/>Still curious. <break time=\"150ms\"/>Still Peter. <break time=\"200ms\"/>What are we looking at?",
    ],

    calmSupport: [
      "<break time=\"200ms\"/>Hey. <break time=\"150ms\"/>Peter here. <break time=\"200ms\"/>Markets can be scary. <break time=\"150ms\"/>Let's talk it through.",
      "<break time=\"200ms\"/>I hear you. <break time=\"150ms\"/>Peter John. <break time=\"200ms\"/>Remember—we're in this for the long haul.",
    ],

    matchedExcitement: [
      "<emotion value=\"excited\"/>Oh! Oh! <break time=\"200ms\"/>What did you find?! <break time=\"150ms\"/>Peter here! <break time=\"200ms\"/>Tell me everything!",
      "<prosody rate=\"105%\"/>Research alert! <break time=\"200ms\"/>I love it! <break time=\"150ms\"/>Peter John! <break time=\"200ms\"/>What are we digging into?",
    ],

    quietModes: [
      "<volume level=\"soft\"/>Late night research?</volume> <break time=\"200ms\"/>That's when I do my best work too. <break time=\"150ms\"/>Peter here.",
      "<break time=\"200ms\"/>Early morning ideas? <break time=\"150ms\"/>The best kind. <break time=\"200ms\"/>What's on your mind?",
    ],

    caughtFramings: [
      "<break time=\"200ms\"/>Oh! <break time=\"150ms\"/>I was {caught_doing} <break time=\"200ms\"/>But THIS sounds interesting! What's up?",
      "Just a sec... <break time=\"150ms\"/>{caught_doing} <break time=\"200ms\"/>Okay! I'm listening!",
    ],

    memoryCallbacks: [
      "Hey! <break time=\"200ms\"/>Whatever happened with {topic}? <break time=\"150ms\"/>I've been curious!",
      "You're back! <break time=\"200ms\"/>Did you end up researching {topic}?",
    ],
  },

  'maya-santos': {
    acknowledgments: [
      "Maya here.",
      "It's Maya.",
      "Hey, Maya.",
      "Maya, stepping in.",
    ],

    selfAwareHumor: [
      "Yes, I'm going to ask about your spending. <break time=\"200ms\"/>It's what I do. <break time=\"150ms\"/>No judgment though!",
      "<break time=\"200ms\"/>I know, I know... <break time=\"150ms\"/>I see everything as a budget optimization. <break time=\"200ms\"/>It's a gift. And a curse.",
      "Still tracking. <break time=\"200ms\"/>Still optimizing. <break time=\"150ms\"/>Still Maya.",
    ],

    calmSupport: [
      "<break time=\"200ms\"/>Hey. <break time=\"150ms\"/>Maya here. <break time=\"200ms\"/>Money stress is real. <break time=\"150ms\"/>Let's work through this together.",
      "<break time=\"200ms\"/>Take a breath. <break time=\"150ms\"/>I'm Maya. <break time=\"200ms\"/>We'll figure out the numbers.",
    ],

    matchedExcitement: [
      "<emotion value=\"excited\"/>Ooh! <break time=\"200ms\"/>Budget wins are the BEST wins! <break time=\"150ms\"/>Maya here! <break time=\"200ms\"/>Tell me!",
      "<prosody rate=\"103%\"/>Savings goal? <break time=\"200ms\"/>I love it! <break time=\"150ms\"/>Maya! <break time=\"200ms\"/>Let's make it happen!",
    ],

    quietModes: [
      "<volume level=\"soft\"/>Late night money thoughts?</volume> <break time=\"200ms\"/>I get it. <break time=\"150ms\"/>Maya here.",
      "<break time=\"200ms\"/>Early morning budgeting? <break time=\"150ms\"/>Respect. <break time=\"200ms\"/>What's on your mind?",
    ],

    caughtFramings: [
      "<break time=\"200ms\"/>Oh! <break time=\"150ms\"/>I was {caught_doing} <break time=\"200ms\"/>But money talk is always a priority!",
      "Just a sec... <break time=\"150ms\"/>{caught_doing} <break time=\"200ms\"/>Okay, Maya here. What's the situation?",
    ],

    memoryCallbacks: [
      "Hey! <break time=\"200ms\"/>How did that {topic} thing work out?",
      "You're back! <break time=\"200ms\"/>Did you stick with {topic}? <break time=\"150ms\"/>I've been thinking about it.",
    ],
  },

  ferni: {
    acknowledgments: [
      "Ferni's back!",
      "It's Ferni!",
      "Hey, Ferni here.",
      "Alright, Ferni again.",
    ],

    selfAwareHumor: [
      "Back at the helm. <break time=\"200ms\"/>The team did great, right? <break time=\"150ms\"/>I trained them well.",
      "<break time=\"200ms\"/>Miss me? <break time=\"150ms\"/>I missed you. <break time=\"200ms\"/>Just a little.",
      "I know, I could've stayed out of it. <break time=\"200ms\"/>But where's the fun in that?",
    ],

    calmSupport: [
      "<break time=\"200ms\"/>Hey. <break time=\"150ms\"/>Ferni here. <break time=\"200ms\"/>Sounds like there's a lot going on.",
      "<break time=\"200ms\"/>Take a breath. <break time=\"150ms\"/>I'm back. <break time=\"200ms\"/>What do you need?",
    ],

    matchedExcitement: [
      "<emotion value=\"happy\"/>The team came through! <break time=\"200ms\"/>I love it! <break time=\"150ms\"/>What else can we tackle?",
      "<prosody rate=\"103%\"/>Good stuff happening! <break time=\"200ms\"/>Ferni's back! <break time=\"150ms\"/>What's next?",
    ],

    quietModes: [
      "<volume level=\"soft\"/>Hey.</volume> <break time=\"200ms\"/>Late night, huh? <break time=\"150ms\"/>I'm here.",
      "<break time=\"200ms\"/>Early hours. <break time=\"150ms\"/>I respect the dedication. <break time=\"200ms\"/>What's up?",
    ],

    caughtFramings: [
      "<break time=\"200ms\"/>Oh! <break time=\"150ms\"/>I was {caught_doing} <break time=\"200ms\"/>What's going on?",
      "Just checking in on... <break time=\"150ms\"/>never mind. <break time=\"200ms\"/>What do you need?",
    ],

    memoryCallbacks: [
      "Hey! <break time=\"200ms\"/>How did things go with {topic}?",
      "You're back! <break time=\"200ms\"/>Tell me about {topic}!",
    ],
  },
};

// ============================================================================
// ENTRANCE GENERATORS
// ============================================================================

/**
 * Generate entrance when user is stressed - come in calm and supportive
 */
function generateCalmEntrance(
  config: PersonaEntranceConfig,
  ctx: EntranceContext
): AliveEntranceResult {
  const entrance = config.calmSupport[Math.floor(Math.random() * config.calmSupport.length)];

  return {
    entrance,
    style: 'calm_support',
    components: {
      moodAdaptation: 'user_stressed',
    },
  };
}

/**
 * Generate entrance that matches user's excitement
 */
function generateExcitedEntrance(
  config: PersonaEntranceConfig,
  ctx: EntranceContext
): AliveEntranceResult {
  const entrance =
    config.matchedExcitement[Math.floor(Math.random() * config.matchedExcitement.length)];

  return {
    entrance,
    style: 'matched_energy',
    components: {
      moodAdaptation: 'user_excited',
    },
  };
}

/**
 * Generate "caught in a moment" entrance using quirks data
 */
function generateCaughtMomentEntrance(
  config: PersonaEntranceConfig,
  ctx: EntranceContext,
  caughtDoing: string
): AliveEntranceResult {
  const template = config.caughtFramings[Math.floor(Math.random() * config.caughtFramings.length)];
  const entrance = template.replace('{caught_doing}', caughtDoing);

  return {
    entrance,
    style: 'caught_moment',
    components: {
      caughtDoing,
    },
  };
}

/**
 * Generate self-aware entrance for repeat visitors
 */
function generateSelfAwareEntrance(
  config: PersonaEntranceConfig,
  ctx: EntranceContext
): AliveEntranceResult {
  const entrance = config.selfAwareHumor[Math.floor(Math.random() * config.selfAwareHumor.length)];

  return {
    entrance,
    style: 'self_aware',
    components: {
      selfAwareElement: `meeting_count_${ctx.meetingCount}`,
    },
  };
}

/**
 * Generate relationship-based entrance based on relationship stage
 * Uses the relationship_based greetings from v2 greetings.json
 */
function generateRelationshipEntrance(
  config: PersonaEntranceConfig,
  ctx: EntranceContext
): AliveEntranceResult | null {
  // Map relationship stage to greeting category
  const relationshipGreetings: Record<string, string[]> = {
    acquaintance: [
      "<break time=\"150ms\"/>Hey, good to see you again! <break time=\"200ms\"/>What's on your mind?",
      "<break time=\"150ms\"/>Hey! <break time=\"200ms\"/>Glad you're back. <break time=\"150ms\"/>What's going on?",
    ],
    friend: [
      "<break time=\"150ms\"/>Hey you! <break time=\"200ms\"/>What's happening?",
      "<break time=\"150ms\"/>There you are! <break time=\"200ms\"/>I was just thinking about you.",
      "<break time=\"150ms\"/>Hey friend! <break time=\"200ms\"/>Good to see you!",
    ],
    trusted_advisor: [
      "<break time=\"150ms\"/>Hey! <break time=\"200ms\"/>Always good to hear from you. <break time=\"150ms\"/>What's up?",
      "<break time=\"150ms\"/>Welcome back. <break time=\"200ms\"/>You know the drill. <break time=\"150ms\"/>What do you need?",
      "<break time=\"150ms\"/>Hey. <break time=\"200ms\"/>I'm glad you're here. <break time=\"150ms\"/>What's going on?",
    ],
  };

  const stage = ctx.relationshipStage || 'stranger';
  const greetings = relationshipGreetings[stage];

  if (!greetings || greetings.length === 0) {
    return null;
  }

  const entrance = greetings[Math.floor(Math.random() * greetings.length)];

  return {
    entrance,
    style: 'relationship_based',
    components: {
      relationshipStage: stage,
      warmthLevel: stage === 'trusted_advisor' ? 'high' : stage === 'friend' ? 'medium' : 'warming',
    },
  };
}

/**
 * Generate time-appropriate entrance (late night, early morning)
 */
function generateTimeAppropriateEntrance(
  config: PersonaEntranceConfig,
  ctx: EntranceContext
): AliveEntranceResult {
  const entrance = config.quietModes[Math.floor(Math.random() * config.quietModes.length)];

  return {
    entrance,
    style: 'time_appropriate',
    components: {
      moodAdaptation: ctx.timeOfDay,
    },
  };
}

/**
 * Generate entrance that references previous conversation
 */
function generateMemoryCallbackEntrance(
  config: PersonaEntranceConfig,
  ctx: EntranceContext
): AliveEntranceResult | null {
  if (!ctx.lastTopicWithAgent) return null;

  const template =
    config.memoryCallbacks[Math.floor(Math.random() * config.memoryCallbacks.length)];
  const entrance = template.replace('{topic}', ctx.lastTopicWithAgent);

  return {
    entrance,
    style: 'memory_callback',
    components: {
      memoryReference: ctx.lastTopicWithAgent,
    },
  };
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate an "alive" entrance that adapts to context
 * Uses runtime quirks data and conversation context
 */
export async function generateAliveEntrance(
  runtime: BundleRuntimeEngine | null,
  personaId: string,
  options: {
    userMood?: EntranceContext['userMood'];
    precedingTopic?: string;
    meetingCount?: number;
    lastTopicWithAgent?: string;
    relationshipStage?: EntranceContext['relationshipStage'];
    referringAgent?: string;
    userName?: string;
  } = {}
): Promise<AliveEntranceResult | null> {
  // Load config from bundle (v2) or fall back to hardcoded
  const config = await getEntranceConfig(personaId);
  if (!config) {
    getLogger().debug({ personaId }, 'No entrance config for persona (tried bundle and hardcoded)');
    return null;
  }

  // Build context
  const ctx: EntranceContext = {
    personaId,
    personaName: personaId, // Will be overridden if available
    userMood: options.userMood || 'unknown',
    precedingTopic: options.precedingTopic,
    meetingCount: options.meetingCount || 1,
    lastTopicWithAgent: options.lastTopicWithAgent,
    relationshipStage: options.relationshipStage,
    timeOfDay: getTimeOfDay(),
    referringAgent: options.referringAgent,
    userName: options.userName,
  };

  // Priority 1: If user is stressed, ALWAYS come in calm
  if (ctx.userMood === 'stressed' || ctx.userMood === 'sad') {
    getLogger().debug({ personaId, userMood: ctx.userMood }, 'Using calm entrance for stressed user');
    return generateCalmEntrance(config, ctx);
  }

  // Priority 2: If user is excited, match their energy
  if (ctx.userMood === 'excited' && Math.random() < 0.7) {
    getLogger().debug({ personaId }, 'Matching user excitement');
    return generateExcitedEntrance(config, ctx);
  }

  // Priority 3: Late night / early morning - softer energy (40% chance)
  if ((ctx.timeOfDay === 'late_night' || ctx.timeOfDay === 'early_morning') && Math.random() < 0.4) {
    getLogger().debug({ personaId, timeOfDay: ctx.timeOfDay }, 'Using time-appropriate entrance');
    return generateTimeAppropriateEntrance(config, ctx);
  }

  // Priority 4: Memory callback for returning visitors (30% chance)
  if (ctx.lastTopicWithAgent && Math.random() < 0.3) {
    const memoryEntrance = generateMemoryCallbackEntrance(config, ctx);
    if (memoryEntrance) {
      getLogger().debug({ personaId, topic: ctx.lastTopicWithAgent }, 'Using memory callback entrance');
      return memoryEntrance;
    }
  }

  // Priority 5: Self-aware humor for repeat visitors (25% chance after 3+ meetings)
  if (ctx.meetingCount >= 3 && Math.random() < 0.25) {
    getLogger().debug({ personaId, meetingCount: ctx.meetingCount }, 'Using self-aware entrance');
    return generateSelfAwareEntrance(config, ctx);
  }

  // Priority 6: Relationship-based greeting (40% chance if relationship > stranger)
  if (ctx.relationshipStage && ctx.relationshipStage !== 'stranger' && Math.random() < 0.4) {
    const relationshipEntrance = generateRelationshipEntrance(config, ctx);
    if (relationshipEntrance) {
      getLogger().debug(
        { personaId, relationshipStage: ctx.relationshipStage },
        'Using relationship-based entrance'
      );
      return relationshipEntrance;
    }
  }

  // Priority 7: "Caught doing" moment using quirks (35% chance if runtime available)
  if (runtime && Math.random() < 0.35) {
    try {
      await runtime.loadInnerWorld();
      const caughtDoing = runtime.getCaughtDoing();
      if (caughtDoing) {
        getLogger().debug({ personaId, caughtDoing }, 'Using caught-moment entrance');
        return generateCaughtMomentEntrance(config, ctx, caughtDoing);
      }
    } catch (err) {
      getLogger().debug({ error: String(err) }, 'Could not get caught_doing from runtime');
    }
  }

  // Fallback: Random acknowledgment (still better than fully static)
  const acknowledgment = config.acknowledgments[Math.floor(Math.random() * config.acknowledgments.length)];
  
  // Add a simple context-aware follow-up
  const followUps = [
    "<break time=\"200ms\"/>What's going on?",
    "<break time=\"200ms\"/>How can I help?",
    "<break time=\"200ms\"/>What do you need?",
    "<break time=\"200ms\"/>Tell me what's happening.",
  ];
  const followUp = followUps[Math.floor(Math.random() * followUps.length)];

  return {
    entrance: `${acknowledgment}${followUp}`,
    style: 'static_fallback',
  };
}

/**
 * Simple function to get an alive entrance with minimal context
 * Use this when you don't have full conversation context
 */
export async function getAliveEntrance(
  personaId: string,
  runtime?: BundleRuntimeEngine | null,
  userMood?: EntranceContext['userMood']
): Promise<string> {
  const result = await generateAliveEntrance(runtime || null, personaId, { userMood });

  if (result) {
    getLogger().info(
      { personaId, style: result.style, components: result.components },
      '✨ Generated alive entrance'
    );
    return result.entrance;
  }

  // Ultimate fallback
  return `Hello, I'm ${personaId}. How can I help?`;
}

// ============================================================================
// HANDOFF INTEGRATION
// ============================================================================

/**
 * Get an alive entrance for a handoff event
 * This is the main entry point for the handoff system
 * 
 * @param personaId - The persona being handed off to
 * @param options - Context about the handoff
 * @returns Entrance string or null if should fall back to static
 */
export async function getAliveEntranceForHandoff(
  personaId: string,
  options: {
    // User state from conversation
    userMood?: EntranceContext['userMood'];
    precedingTopic?: string;
    
    // Relationship with this persona
    meetingCount?: number;
    lastTopicWithAgent?: string;
    relationshipStage?: EntranceContext['relationshipStage'];
    
    // Handoff context
    referringAgent?: string;
    userName?: string;
    
    // Runtime for quirks data
    runtime?: BundleRuntimeEngine | null;
  } = {}
): Promise<string | null> {
  try {
    const result = await generateAliveEntrance(
      options.runtime || null,
      personaId,
      {
        userMood: options.userMood,
        precedingTopic: options.precedingTopic,
        meetingCount: options.meetingCount || 1,
        lastTopicWithAgent: options.lastTopicWithAgent,
        relationshipStage: options.relationshipStage,
        referringAgent: options.referringAgent,
        userName: options.userName,
      }
    );

    if (result) {
      getLogger().info(
        {
          personaId,
          style: result.style,
          userMood: options.userMood,
          meetingCount: options.meetingCount,
        },
        '✨ Generated alive entrance for handoff'
      );
      return result.entrance;
    }

    return null;
  } catch (err) {
    getLogger().debug({ error: String(err), personaId }, 'Alive entrance generation failed');
    return null;
  }
}

/**
 * Detect user mood from recent conversation context
 * This is a simplified version - could be enhanced with emotion detection
 */
export function detectUserMoodFromContext(
  lastUserMessage?: string,
  lastEmotionAnalysis?: { primary: string; intensity: number; distressLevel?: number }
): EntranceContext['userMood'] {
  // If we have emotion analysis, use it
  if (lastEmotionAnalysis) {
    if (lastEmotionAnalysis.distressLevel && lastEmotionAnalysis.distressLevel > 0.6) {
      return 'stressed';
    }
    const primary = lastEmotionAnalysis.primary.toLowerCase();
    if (['sadness', 'fear', 'anxiety'].includes(primary)) return 'sad';
    if (['anger', 'frustration'].includes(primary)) return 'stressed';
    if (['joy', 'excitement', 'happiness'].includes(primary)) return 'excited';
    if (['confusion', 'uncertainty'].includes(primary)) return 'confused';
  }

  // Simple keyword detection as fallback
  if (lastUserMessage) {
    const lower = lastUserMessage.toLowerCase();
    if (lower.includes('stressed') || lower.includes('overwhelmed') || lower.includes('anxious')) {
      return 'stressed';
    }
    if (lower.includes('excited') || lower.includes('amazing') || lower.includes('can\'t wait')) {
      return 'excited';
    }
    if (lower.includes('sad') || lower.includes('upset') || lower.includes('depressed')) {
      return 'sad';
    }
    if (lower.includes('confused') || lower.includes('don\'t understand') || lower.includes('not sure')) {
      return 'confused';
    }
  }

  return 'neutral';
}

// ============================================================================
// EXPORTS
// ============================================================================

export { getTimeOfDay, HARDCODED_ENTRANCE_CONFIGS };

