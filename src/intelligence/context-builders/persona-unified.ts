/**
 * Unified Persona Context Builder
 *
 * Consolidates persona-related context builders into a single entry point:
 * - persona-identity.ts - Core identity and character
 * - persona-mood.ts - Current mood/energy
 * - persona-quirks.ts - Personality quirks
 * - persona-playful.ts - Playful moments
 * - persona-vulnerability.ts - Vulnerability sharing
 *
 * Benefits:
 * - Single registration instead of 5
 * - Internal decision logic for what to inject
 * - Prevents conflicting persona injections
 * - Easier to debug persona issues
 *
 * @module context-builders/persona-unified
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'PersonaUnified' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface PersonaUnifiedConfig {
  /** Enable identity injection (who the persona is) */
  enableIdentity: boolean;
  /** Enable mood injection (current emotional state) */
  enableMood: boolean;
  /** Enable quirks injection (personality traits) */
  enableQuirks: boolean;
  /** Enable playful moments */
  enablePlayful: boolean;
  /** Enable vulnerability sharing */
  enableVulnerability: boolean;
  /** Max injections per turn */
  maxInjectionsPerTurn: number;
}

const DEFAULT_CONFIG: PersonaUnifiedConfig = {
  enableIdentity: true,
  enableMood: true,
  enableQuirks: true,
  enablePlayful: true,
  enableVulnerability: true,
  maxInjectionsPerTurn: 3,
};

let config = { ...DEFAULT_CONFIG };

/**
 * Update unified persona config
 */
function updatePersonaUnifiedConfig(updates: Partial<PersonaUnifiedConfig>): void {
  config = { ...config, ...updates };
}

// ============================================================================
// SUB-BUILDER LOGIC
// ============================================================================

/**
 * Identity injection - who the persona is
 * Priority: Always on first turn, occasional reminder
 */
function buildIdentityContext(input: ContextBuilderInput): ContextInjection | null {
  const { persona, userData } = input;
  const turnCount = userData?.turnCount || 1;

  // Get persona name (from PersonaConfig.name or identity.selfReference)
  const personaName = persona.name || persona.identity?.selfReference || 'the persona';
  const description = persona.description || '';

  // First turn: always include identity reminder
  if (turnCount === 1) {
    return createStandardInjection(
      'persona_identity',
      `[PERSONA] You are ${personaName}. ${description}`,
      { category: 'persona', confidence: 1.0 }
    );
  }

  // Later turns: occasional identity reinforcement (10% chance)
  if (turnCount > 5 && Math.random() < 0.1) {
    return createHintInjection(
      'persona_identity_hint',
      `[VOICE] Stay in character as ${personaName}`,
      { category: 'persona', confidence: 0.7 }
    );
  }

  return null;
}

/**
 * Mood injection - persona's current emotional state
 * Based on time of day, conversation energy, etc.
 */
function buildMoodContext(input: ContextBuilderInput): ContextInjection | null {
  const { analysis, userData } = input;
  const turnCount = userData?.turnCount || 1;

  // Only inject mood occasionally (15% chance, not first turn)
  if (turnCount <= 2 || Math.random() > 0.15) {
    return null;
  }

  // Match user's energy
  const userEnergy = analysis?.emotion?.intensity || 0.5;
  let moodNote: string;

  if (userEnergy > 0.7) {
    moodNote = 'Match their high energy. Be animated and engaged.';
  } else if (userEnergy < 0.3) {
    moodNote = 'Keep energy calm and grounded. They seem reflective.';
  } else {
    moodNote = 'Natural conversational energy.';
  }

  return createHintInjection('persona_mood', `[ENERGY] ${moodNote}`, {
    category: 'persona',
    confidence: 0.6,
  });
}

/**
 * Quirks injection - small personality details
 * Triggered by topic relevance
 */
function buildQuirksContext(input: ContextBuilderInput): ContextInjection | null {
  const { persona, userText, userData } = input;
  const turnCount = userData?.turnCount || 1;

  // Skip early turns
  if (turnCount < 3) return null;

  // Get persona quirks from bundle if available
  // Note: PersonaConfig type may not have quirks; check at runtime
  const personality = persona.personality as
    | { quirks?: Array<string | { trigger?: string; note?: string }> }
    | undefined;
  const quirks = personality?.quirks || [];
  if (quirks.length === 0) return null;

  // Check for topic relevance (simplified)
  const lowerText = userText.toLowerCase();
  const relevantQuirk = quirks.find((quirk) => {
    const trigger = typeof quirk === 'string' ? quirk.toLowerCase() : quirk.trigger?.toLowerCase();
    return trigger && lowerText.includes(trigger);
  });

  if (!relevantQuirk && Math.random() > 0.1) {
    return null;
  }

  // Random quirk if no relevant one found
  const quirkToUse = relevantQuirk || quirks[Math.floor(Math.random() * quirks.length)];
  const quirkText = typeof quirkToUse === 'string' ? quirkToUse : quirkToUse.note;

  if (!quirkText) return null;

  return createHintInjection('persona_quirk', `[QUIRK] ${quirkText}`, {
    category: 'persona',
    confidence: 0.5,
  });
}

/**
 * Playful injection - lighter moments
 * Only when appropriate (positive emotion, not serious topic)
 */
function buildPlayfulContext(input: ContextBuilderInput): ContextInjection | null {
  const { analysis, userData } = input;
  const turnCount = userData?.turnCount || 1;

  // Need established rapport
  if (turnCount < 5) return null;

  // Only when emotion is positive or neutral
  const emotion = analysis?.emotion?.primary;
  const isSerious = emotion && ['sadness', 'fear', 'anxiety', 'anger', 'grief'].includes(emotion);
  if (isSerious) return null;

  // 8% chance for playful moment
  if (Math.random() > 0.08) return null;

  const playfulNotes = [
    'Feel free to be playful if the moment feels right.',
    'A bit of gentle humor could work here.',
    'Light touch is okay if it fits.',
  ];

  return createHintInjection(
    'persona_playful',
    `[TONE] ${playfulNotes[Math.floor(Math.random() * playfulNotes.length)]}`,
    { category: 'persona', confidence: 0.4 }
  );
}

/**
 * Vulnerability injection - sharing personal moments
 * Only when user is also being vulnerable, and rarely
 */
function buildVulnerabilityContext(input: ContextBuilderInput): ContextInjection | null {
  const { analysis, userData } = input;
  const turnCount = userData?.turnCount || 1;

  // Need significant rapport
  if (turnCount < 8) return null;

  // Only when user is sharing something personal
  const isPersonalSharing = analysis?.emotion?.intensity && analysis.emotion.intensity > 0.6;
  if (!isPersonalSharing) return null;

  // 5% chance
  if (Math.random() > 0.05) return null;

  return createHintInjection(
    'persona_vulnerability',
    `[DEPTH] If it feels right, you can share something personal that relates. Keep it brief.`,
    { category: 'persona', confidence: 0.4 }
  );
}

// ============================================================================
// UNIFIED BUILDER
// ============================================================================

/**
 * Build unified persona context
 *
 * Runs all sub-builders and returns up to maxInjectionsPerTurn
 */
async function buildUnifiedPersonaContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const allInjections: ContextInjection[] = [];

  // Run enabled sub-builders
  if (config.enableIdentity) {
    const identity = buildIdentityContext(input);
    if (identity) allInjections.push(identity);
  }

  if (config.enableMood) {
    const mood = buildMoodContext(input);
    if (mood) allInjections.push(mood);
  }

  if (config.enableQuirks) {
    const quirks = buildQuirksContext(input);
    if (quirks) allInjections.push(quirks);
  }

  if (config.enablePlayful) {
    const playful = buildPlayfulContext(input);
    if (playful) allInjections.push(playful);
  }

  if (config.enableVulnerability) {
    const vulnerability = buildVulnerabilityContext(input);
    if (vulnerability) allInjections.push(vulnerability);
  }

  // Limit injections per turn
  const result = allInjections.slice(0, config.maxInjectionsPerTurn);

  if (result.length > 0) {
    log.debug(
      { injectionCount: result.length, sources: result.map((i) => i.source) },
      'Persona unified injections'
    );
  }

  return result;
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'persona_unified',
  description: 'Unified persona context (identity, mood, quirks, playful, vulnerability)',
  priority: 55, // Medium-high - persona consistency matters
  category: BuilderCategory.PERSONA,
  build: buildUnifiedPersonaContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  buildUnifiedPersonaContext,
  updatePersonaUnifiedConfig as setPersonaUnifiedConfig,
  type PersonaUnifiedConfig,
};

export default {
  buildUnifiedPersonaContext,
  setPersonaUnifiedConfig: updatePersonaUnifiedConfig,
};
