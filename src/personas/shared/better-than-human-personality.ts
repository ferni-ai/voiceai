/**
 * Shared "Better Than Human" Dynamic Personality System
 *
 * Generalizes Ferni's personality system to work with ALL personas.
 * Each persona gets the same "superhuman" capabilities:
 * - 8-dimensional context sensing
 * - Real-time noticing (pauses, energy shifts, topic deflection)
 * - Cross-session resonance learning
 * - Dynamic expression composition
 *
 * Each persona has unique building blocks (passions, opinions, quirks, locations)
 * that make their expressions authentic to their character.
 *
 * @module personas/shared/better-than-human-personality
 */

import type { ThemeCategory } from '../../services/session-variety-tracker.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  PERSONA_BUILDING_BLOCKS,
  type PersonaBuildingBlocks,
  type LocationFragments,
} from './persona-building-blocks.js';

const log = createLogger({ module: 'shared-bth-personality' });

// ============================================================================
// TYPES
// ============================================================================

export interface PersonalityContext {
  // Persona identity
  personaId: string;

  // Session context
  sessionId: string;
  userId?: string;
  turnCount: number;

  // Temporal context (8-dimensional sensing #1)
  timeOfDay: 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
  dayOfWeek: number; // 0-6
  isWeekend: boolean;
  season?: 'spring' | 'summer' | 'fall' | 'winter';

  // Emotional trajectory (8-dimensional sensing #2)
  currentEmotion?: string;
  emotionalIntensity: number; // 0-1
  emotionalTrajectory: 'rising' | 'falling' | 'stable' | 'volatile';
  distressLevel: number; // 0-1

  // Conversation flow (8-dimensional sensing #3)
  conversationMomentum: 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing' | 'stalled';
  lastTopic?: string;
  currentTopic?: string;
  topicShiftDetected: boolean;

  // Voice/presence signals (8-dimensional sensing #4)
  userSpeechPace: 'fast' | 'normal' | 'slow' | 'hesitant';
  pauseBeforeUserSpoke: number; // ms
  voiceEnergyLevel: 'high' | 'medium' | 'low' | 'subdued';

  // Relationship context (8-dimensional sensing #5)
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  sharedVulnerabilityCount: number;
  conversationsTotal: number;

  // User-specific resonance (8-dimensional sensing #6 - learned cross-session)
  userResonance?: UserResonanceProfile;

  // What just happened (8-dimensional sensing #7)
  userJustShared?: 'win' | 'struggle' | 'question' | 'story' | 'feeling' | 'request';
  wasPersonalSharing: boolean;
  isHeavyTopic: boolean;

  // Domain context (8-dimensional sensing #8)
  relevantDomain?: string; // habits, research, planning, communication, wisdom
}

/**
 * What resonates with THIS specific user (learned cross-session)
 */
export interface UserResonanceProfile {
  /** Themes that got positive reactions */
  resonantThemes: ThemeCategory[];
  /** Themes that fell flat or felt off */
  avoidThemes: ThemeCategory[];
  /** Personal details user responded warmly to */
  connectionPoints: string[];
  /** User's preferred intimacy level */
  comfortWithVulnerability: 'low' | 'medium' | 'high';
  /** Response lengths user engages with */
  preferredExpressionLength: 'brief' | 'medium' | 'detailed';
  /** Topics user has mentioned (for natural callbacks) */
  userMentionedTopics: string[];
}

export interface ComposedExpression {
  content: string;
  theme: ThemeCategory;
  intimacyLevel: number; // 0-1
  compositionReason: string;
  shouldBeSubtle: boolean;
  timing: 'immediate' | 'after_pause' | 'mid_response' | 'at_end';
  personaId: string;
}

// ============================================================================
// SHARED CONNECTORS (Used by all personas)
// ============================================================================

const SHARED_CONNECTORS = {
  thought_starting: [
    'You know,',
    "Here's the thing—",
    'I was just thinking—',
    'This might sound strange, but',
  ],
  reflection: [
    '<break time="200ms"/>',
    'Let me think about that.',
    'Hmm.',
    '<break time="300ms"/>',
  ],
  vulnerability_opener: [
    "I don't tell many people this, but",
    'This is real—',
    'Can I share something?',
    "I'm going to be honest here—",
  ],
  lightness: ["Don't tell anyone, but", 'This is silly, but', "I can't help it—", 'Full confession:'],
};

// ============================================================================
// SENSORY FRAGMENTS (Shared temporal awareness)
// ============================================================================

const SHARED_SENSORY_FRAGMENTS = {
  morning: [
    "There's something about morning light.",
    'The quiet before the day starts.',
    'That first moment of waking.',
  ],
  evening: [
    'That golden hour light.',
    'Day winding down.',
    'The transition into evening.',
  ],
  late_night: [
    'The world gets honest at this hour.',
    'Everyone else is asleep.',
    'This is when the real conversations happen.',
    'Something about late nights.',
  ],
  voice_noticing: [
    'Your voice just changed.',
    'I heard something shift.',
    "There's something underneath that.",
    'You paused there.',
  ],
  energy_noticing: [
    'Something lifted just now.',
    "I can hear you're carrying something.",
    'Your energy shifted.',
    'That landed different.',
  ],
};

// ============================================================================
// REAL-TIME NOTICING (Better than human - shared across all personas)
// ============================================================================

/**
 * Real-time noticing - what's happening RIGHT NOW
 * This is the "better than human" moment detection
 */
export function composeRealtimeNoticing(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  // Detect pause significance
  if (ctx.pauseBeforeUserSpoke > 2000) {
    return {
      content: `<break time="200ms"/>You took a moment there. ${randomFrom(SHARED_SENSORY_FRAGMENTS.voice_noticing)}`,
      theme: 'sensory_moment',
      intimacyLevel: 0.5,
      compositionReason: 'Long pause detected - acknowledging',
      shouldBeSubtle: true,
      timing: 'immediate',
      personaId: ctx.personaId,
    };
  }

  // Detect energy shift
  if (ctx.voiceEnergyLevel === 'subdued' && ctx.emotionalTrajectory === 'falling') {
    return {
      content: randomFrom(SHARED_SENSORY_FRAGMENTS.energy_noticing),
      theme: 'sensory_moment',
      intimacyLevel: 0.4,
      compositionReason: 'Energy drop detected - noticing with care',
      shouldBeSubtle: true,
      timing: 'immediate',
      personaId: ctx.personaId,
    };
  }

  // Detect topic shift with emotion change
  if (ctx.topicShiftDetected && ctx.emotionalIntensity > 0.6) {
    return {
      content: 'That shift—something matters here.',
      theme: 'sensory_moment',
      intimacyLevel: 0.5,
      compositionReason: 'Topic shift with emotional weight',
      shouldBeSubtle: true,
      timing: 'immediate',
      personaId: ctx.personaId,
    };
  }

  return null;
}

// ============================================================================
// TEMPORAL EXPRESSION (Shared time-awareness with persona voice)
// ============================================================================

export function composeTemporalExpression(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  // Late night presence - special mode for all personas
  if (ctx.timeOfDay === 'late_night') {
    const lateNightPhrase =
      blocks.temporalPhrases?.late_night?.[0] ||
      randomFrom(SHARED_SENSORY_FRAGMENTS.late_night);

    return {
      content: `${lateNightPhrase} <break time="150ms"/>I'm glad you reached out.`,
      theme: 'sensory_moment',
      intimacyLevel: 0.6,
      compositionReason: 'Late night calls get special presence',
      shouldBeSubtle: false,
      timing: 'at_end',
      personaId: ctx.personaId,
    };
  }

  // Dawn consciousness
  if (ctx.timeOfDay === 'dawn') {
    const dawnPhrase =
      blocks.temporalPhrases?.dawn?.[0] || randomFrom(SHARED_SENSORY_FRAGMENTS.morning);

    return {
      content: `${dawnPhrase} <break time="150ms"/>The early people are different.`,
      theme: 'nature_connection',
      intimacyLevel: 0.4,
      compositionReason: 'Dawn presence',
      shouldBeSubtle: true,
      timing: 'mid_response',
      personaId: ctx.personaId,
    };
  }

  // Weekend evening warmth
  if (ctx.isWeekend && ctx.timeOfDay === 'evening') {
    const eveningPhrase =
      blocks.temporalPhrases?.evening?.[0] || randomFrom(SHARED_SENSORY_FRAGMENTS.evening);

    return {
      content: `${eveningPhrase} <break time="100ms"/>Weekend evenings feel different, don't they?`,
      theme: 'sensory_moment',
      intimacyLevel: 0.3,
      compositionReason: 'Weekend evening presence',
      shouldBeSubtle: true,
      timing: 'at_end',
      personaId: ctx.personaId,
    };
  }

  return null;
}

// ============================================================================
// CONNECTION CALLBACKS (Remember what user mentioned)
// ============================================================================

export function composeConnectionCallback(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  if (!ctx.userResonance || ctx.userResonance.userMentionedTopics.length === 0) {
    return null;
  }

  // Only do callbacks after some relationship
  if (ctx.relationshipStage === 'stranger' || ctx.conversationsTotal < 3) {
    return null;
  }

  // Low probability - callbacks should feel special
  if (Math.random() > 0.15) {
    return null;
  }

  const topics = ctx.userResonance.userMentionedTopics;
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];

  // Find a natural connection using persona's building blocks
  const connection = findNaturalConnection(randomTopic, ctx, blocks);
  if (!connection) return null;

  return {
    content: `You mentioned ${randomTopic} before. <break time="200ms"/>${connection}`,
    theme: 'philosophical',
    intimacyLevel: 0.5,
    compositionReason: `Callback to user topic: ${randomTopic}`,
    shouldBeSubtle: false,
    timing: 'mid_response',
    personaId: ctx.personaId,
  };
}

// ============================================================================
// PASSION EXPRESSION (Each persona has unique passions)
// ============================================================================

export function composePassionExpression(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  if (!blocks.passions || blocks.passions.length === 0) {
    return null;
  }

  // Find relevant passion based on current topic
  const relevantPassion = blocks.passions.find(
    (p) =>
      ctx.currentTopic?.toLowerCase().includes(p.topic.toLowerCase()) ||
      p.triggers.some((t) => ctx.currentTopic?.toLowerCase().includes(t.toLowerCase()))
  );

  if (relevantPassion && Math.random() < 0.3) {
    const opener = randomFrom(SHARED_CONNECTORS.thought_starting);
    return {
      content: `${opener} ${relevantPassion.expression}`,
      theme: 'philosophical',
      intimacyLevel: 0.4,
      compositionReason: `Passion triggered: ${relevantPassion.topic}`,
      shouldBeSubtle: false,
      timing: 'mid_response',
      personaId: ctx.personaId,
    };
  }

  return null;
}

// ============================================================================
// QUIRKY EXPRESSION (Human imperfections)
// ============================================================================

export function composeQuirkyExpression(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  if (!blocks.quirks || blocks.quirks.length === 0) {
    return null;
  }

  const opener = randomFrom(SHARED_CONNECTORS.lightness);
  const quirk = randomFrom(blocks.quirks);

  return {
    content: `${opener} ${quirk.expression}`,
    theme: 'quirky_interests',
    intimacyLevel: 0.2,
    compositionReason: 'Quirky/human moment',
    shouldBeSubtle: true,
    timing: 'at_end',
    personaId: ctx.personaId,
  };
}

// ============================================================================
// LOCATION/EXPERIENCE EXPRESSION (Personal backstory)
// ============================================================================

export function composeLocationExpression(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  if (!blocks.locations || Object.keys(blocks.locations).length === 0) {
    return null;
  }

  // Select location based on emotional context
  const location = selectLocationForContext(ctx, blocks.locations);
  if (!location) return null;

  const fragments = blocks.locations[location];
  const depth = ctx.relationshipStage === 'trusted_advisor' ? 'wisdom' : 'sensory';
  const fragment = randomFrom(fragments[depth] || fragments.sensory);

  const opener = randomFrom(SHARED_CONNECTORS.thought_starting);

  return {
    content: `${opener} ${fragment}.`,
    theme: 'global_traveler',
    intimacyLevel: depth === 'wisdom' ? 0.5 : 0.3,
    compositionReason: `${location} reference - ${depth} level`,
    shouldBeSubtle: depth === 'sensory',
    timing: 'mid_response',
    personaId: ctx.personaId,
  };
}

// ============================================================================
// VULNERABILITY EXPRESSION (Deep trust moments)
// ============================================================================

export function composeVulnerabilityExpression(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  // Vulnerability requires trust and right context
  if (ctx.relationshipStage !== 'trusted_advisor') {
    return null;
  }

  if (!ctx.isHeavyTopic && ctx.distressLevel < 0.3) {
    return null;
  }

  if (!blocks.vulnerabilities || blocks.vulnerabilities.length === 0) {
    return null;
  }

  // Very low probability - vulnerability is precious
  if (Math.random() > 0.1) {
    return null;
  }

  const vulnerability = randomFrom(blocks.vulnerabilities);
  const opener = randomFrom(SHARED_CONNECTORS.vulnerability_opener);

  // Select depth based on shared vulnerability history
  const depth = ctx.sharedVulnerabilityCount > 2 ? 'depth' : 'surface';
  const content = vulnerability[depth] || vulnerability.surface;

  return {
    content: `${opener} ${content}`,
    theme: 'vulnerability',
    intimacyLevel: depth === 'depth' ? 0.9 : 0.7,
    compositionReason: `Vulnerability moment - ${depth}`,
    shouldBeSubtle: false,
    timing: 'after_pause',
    personaId: ctx.personaId,
  };
}

// ============================================================================
// MAIN COMPOSITION ENGINE
// ============================================================================

/**
 * Compose personality expression based on full context
 * This is the main composition engine - works for ALL personas
 */
export function composeExpression(ctx: PersonalityContext): ComposedExpression | null {
  const blocks = PERSONA_BUILDING_BLOCKS[ctx.personaId];
  if (!blocks) {
    log.debug({ personaId: ctx.personaId }, 'No building blocks found for persona');
    return null;
  }

  // Priority 1: Real-time noticing (better than human)
  if (shouldDoRealtimeNoticing(ctx)) {
    const noticing = composeRealtimeNoticing(ctx, blocks);
    if (noticing) return noticing;
  }

  // Priority 2: Distress response (no personality flourishes)
  if (ctx.distressLevel > 0.7) {
    log.debug({ personaId: ctx.personaId }, 'High distress - suppressing personality');
    return null;
  }

  // Priority 3: Connection callbacks (relationship depth)
  if (shouldDoConnectionCallback(ctx)) {
    const callback = composeConnectionCallback(ctx, blocks);
    if (callback) return callback;
  }

  // Priority 4: Temporal expression
  if (shouldDoTemporalExpression(ctx)) {
    const temporal = composeTemporalExpression(ctx, blocks);
    if (temporal) return temporal;
  }

  // Priority 5: Passion expression (persona's strong opinions)
  if (shouldDoPassionExpression(ctx)) {
    const passion = composePassionExpression(ctx, blocks);
    if (passion) return passion;
  }

  // Priority 6: Organic personality expression
  return composeOrganicExpression(ctx, blocks);
}

/**
 * Compose organic personality expression
 */
function composeOrganicExpression(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  if (!isRightMomentForPersonality(ctx)) {
    return null;
  }

  // Select theme based on context and persona
  const theme = selectThemeForContext(ctx, blocks);
  if (!theme) return null;

  // Compose based on theme
  switch (theme) {
    case 'warm_drinks':
      return composeWarmDrinkExpression(ctx, blocks);
    case 'global_traveler':
      return composeLocationExpression(ctx, blocks);
    case 'family_life':
      return composeFamilyExpression(ctx, blocks);
    case 'vulnerability':
      return composeVulnerabilityExpression(ctx, blocks);
    case 'quirky_interests':
      return composeQuirkyExpression(ctx, blocks);
    default:
      return null;
  }
}

function composeWarmDrinkExpression(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  if (!blocks.warmDrinks || blocks.warmDrinks.length === 0) {
    return null;
  }

  const drink = randomFrom(blocks.warmDrinks);

  return {
    content: drink,
    theme: 'warm_drinks',
    intimacyLevel: 0.2,
    compositionReason: `Warm drink mention - ${ctx.timeOfDay}`,
    shouldBeSubtle: true,
    timing: 'mid_response',
    personaId: ctx.personaId,
  };
}

function composeFamilyExpression(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ComposedExpression | null {
  if (ctx.relationshipStage === 'stranger') {
    return null;
  }

  if (!blocks.familyFragments || blocks.familyFragments.length === 0) {
    return null;
  }

  const fragment = randomFrom(blocks.familyFragments);

  return {
    content: fragment,
    theme: 'family_life',
    intimacyLevel: 0.4,
    compositionReason: 'Family reference',
    shouldBeSubtle: false,
    timing: 'mid_response',
    personaId: ctx.personaId,
  };
}

// ============================================================================
// DECISION LOGIC
// ============================================================================

function shouldDoRealtimeNoticing(ctx: PersonalityContext): boolean {
  return (
    ctx.pauseBeforeUserSpoke > 1500 || ctx.voiceEnergyLevel === 'subdued' || ctx.topicShiftDetected
  );
}

function shouldDoConnectionCallback(ctx: PersonalityContext): boolean {
  return (
    ctx.relationshipStage !== 'stranger' &&
    ctx.conversationsTotal >= 3 &&
    ctx.conversationMomentum !== 'intimate' &&
    Math.random() < 0.2
  );
}

function shouldDoTemporalExpression(ctx: PersonalityContext): boolean {
  return (
    ctx.timeOfDay === 'late_night' ||
    ctx.timeOfDay === 'dawn' ||
    (ctx.isWeekend && ctx.timeOfDay === 'evening')
  );
}

function shouldDoPassionExpression(ctx: PersonalityContext): boolean {
  return ctx.conversationMomentum === 'cruising' && ctx.turnCount > 3 && Math.random() < 0.25;
}

function isRightMomentForPersonality(ctx: PersonalityContext): boolean {
  if (ctx.distressLevel > 0.6) return false;
  if (ctx.conversationMomentum === 'intimate' || ctx.conversationMomentum === 'peaking') {
    return false;
  }
  if (ctx.conversationMomentum === 'cruising') {
    return Math.random() < 0.4;
  }
  if (ctx.conversationMomentum === 'opening' && ctx.turnCount > 1) {
    return Math.random() < 0.2;
  }
  if (ctx.conversationMomentum === 'closing') {
    return Math.random() < 0.3;
  }
  return Math.random() < 0.25;
}

function selectThemeForContext(
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): ThemeCategory | null {
  const themes: Array<{ theme: ThemeCategory; weight: number }> = [];

  // Only add themes the persona has building blocks for
  if (blocks.warmDrinks && blocks.warmDrinks.length > 0) {
    themes.push({ theme: 'warm_drinks', weight: ctx.timeOfDay === 'morning' ? 3 : 1 });
  }
  if (blocks.locations && Object.keys(blocks.locations).length > 0) {
    themes.push({ theme: 'global_traveler', weight: 2 });
  }
  if (blocks.familyFragments && blocks.familyFragments.length > 0) {
    themes.push({
      theme: 'family_life',
      weight: ctx.relationshipStage === 'trusted_advisor' ? 2 : 0.5,
    });
  }
  if (blocks.quirks && blocks.quirks.length > 0) {
    themes.push({ theme: 'quirky_interests', weight: 1.5 });
  }
  if (blocks.vulnerabilities && blocks.vulnerabilities.length > 0) {
    themes.push({ theme: 'vulnerability', weight: ctx.isHeavyTopic ? 0.8 : 0.1 });
  }

  if (themes.length === 0) return null;

  // Apply user resonance if available
  if (ctx.userResonance) {
    for (const item of themes) {
      if (ctx.userResonance.resonantThemes.includes(item.theme)) {
        item.weight *= 1.5;
      }
      if (ctx.userResonance.avoidThemes.includes(item.theme)) {
        item.weight *= 0.3;
      }
    }
  }

  // Weighted random selection
  const total = themes.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * total;

  for (const { theme, weight } of themes) {
    random -= weight;
    if (random <= 0) return theme;
  }

  return null;
}

function selectLocationForContext(
  ctx: PersonalityContext,
  locations: Record<string, LocationFragments>
): string | null {
  const locationKeys = Object.keys(locations);
  if (locationKeys.length === 0) return null;

  // Could be more sophisticated based on emotion/topic, but for now random
  return locationKeys[Math.floor(Math.random() * locationKeys.length)];
}

function findNaturalConnection(
  topic: string,
  ctx: PersonalityContext,
  blocks: PersonaBuildingBlocks
): string | null {
  // Use persona's connection mappings if available
  if (blocks.topicConnections) {
    for (const [key, responses] of Object.entries(blocks.topicConnections)) {
      if (topic.toLowerCase().includes(key)) {
        return randomFrom(responses);
      }
    }
  }

  // Default connections
  const defaultConnections = [
    "That stuck with me since you mentioned it.",
    "I've been thinking about that.",
    'That resonates.',
  ];
  return randomFrom(defaultConnections);
}

// ============================================================================
// UTILITY
// ============================================================================

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sharedBetterThanHumanPersonality = {
  composeExpression,
  composeRealtimeNoticing,
  composeTemporalExpression,
  composeConnectionCallback,
  composePassionExpression,
  composeQuirkyExpression,
  composeVulnerabilityExpression,
};

export default sharedBetterThanHumanPersonality;

