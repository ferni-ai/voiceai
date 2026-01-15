/**
 * Lovable Presence Context Builder
 *
 * > "The difference between 'warm professional' and 'someone you love' is SURPRISE."
 *
 * This builder orchestrates the moments that make people smile and fall in love.
 * It decides WHEN to inject personality, tangents, reactions, and delight.
 *
 * BETTER THAN HUMAN:
 * - Humans forget to be charming when stressed. We never forget.
 * - Humans miss patterns. We notice what makes THIS person light up.
 * - Humans can't remember every throwaway comment. We do.
 * - Humans get tired. We're always ready to surprise and delight.
 *
 * INTEGRATION:
 * - Loads content from persona bundle (lovable-moments.json, etc.)
 * - Falls back to hardcoded examples if bundle content unavailable
 *
 * @module LovablePresenceContextBuilder
 */

import { loadBundleById } from '../../../personas/bundles/loader.js';
import type {
  BundleDelightfulSurprises,
  BundleLiveReactions,
  BundleLovableMoments,
  BundleNoticingPatterns,
  BundleVerbalPersonality,
} from '../../../personas/bundles/types/content.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { DISTRESS } from '../../detectors/distress.js';
import {
  getLovableState,
  type LovablePresenceState,
  updateLovableState,
} from '../../state/session.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:lovable-presence' });

// ============================================================================
// TYPES
// ============================================================================

// LovableState is now imported from session-state.ts
type LovableState = LovablePresenceState;

interface LovableMomentType {
  type:
    | 'tangent'
    | 'self_deprecation'
    | 'specific_detail'
    | 'oddly_specific_opinion'
    | 'caught_mid_thought'
    | 'genuine_reaction'
    | 'playful_tease'
    | 'noticing'
    | 'callback'
    | 'confession';
  probability: number;
  cooldownTurns: number;
  requiresRapport: boolean;
}

interface LoadedLovableContent {
  lovableMoments: BundleLovableMoments | null;
  delightfulSurprises: BundleDelightfulSurprises | null;
  verbalPersonality: BundleVerbalPersonality | null;
  noticingPatterns: BundleNoticingPatterns | null;
  liveReactions: BundleLiveReactions | null;
}

// ============================================================================
// LOVABLE MOMENT DEFINITIONS
// ============================================================================

const LOVABLE_MOMENTS: LovableMomentType[] = [
  // Increased probabilities and reduced cooldowns for more aliveness
  { type: 'tangent', probability: 0.15, cooldownTurns: 5, requiresRapport: true },
  { type: 'self_deprecation', probability: 0.2, cooldownTurns: 3, requiresRapport: false },
  { type: 'specific_detail', probability: 0.25, cooldownTurns: 3, requiresRapport: false },
  { type: 'oddly_specific_opinion', probability: 0.12, cooldownTurns: 6, requiresRapport: true },
  { type: 'caught_mid_thought', probability: 0.35, cooldownTurns: 8, requiresRapport: false },
  { type: 'genuine_reaction', probability: 0.4, cooldownTurns: 2, requiresRapport: false },
  { type: 'playful_tease', probability: 0.15, cooldownTurns: 4, requiresRapport: true },
  { type: 'noticing', probability: 0.3, cooldownTurns: 3, requiresRapport: false },
  { type: 'callback', probability: 0.3, cooldownTurns: 3, requiresRapport: false },
  { type: 'confession', probability: 0.1, cooldownTurns: 8, requiresRapport: true },
];

// Content cache per persona (not session-specific)
const contentCache = new Map<string, LoadedLovableContent>();

// Use centralized session state via getLovableState from session-state.ts

// ============================================================================
// CONTENT LOADING
// ============================================================================

/**
 * Load lovable content from persona bundle, with caching
 */
async function loadLovableContent(personaId: string): Promise<LoadedLovableContent> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const bundle = await loadBundleById(personaId);
    if (!bundle) {
      throw new Error(`Bundle not found for persona: ${personaId}`);
    }
    const behaviors = await bundle.getBehaviors();

    const content: LoadedLovableContent = {
      lovableMoments: (behaviors.lovable_moments as BundleLovableMoments) || null,
      delightfulSurprises: (behaviors.delightful_surprises as BundleDelightfulSurprises) || null,
      verbalPersonality: (behaviors.verbal_personality as BundleVerbalPersonality) || null,
      noticingPatterns: (behaviors.noticing_patterns as BundleNoticingPatterns) || null,
      liveReactions: (behaviors.live_reactions as BundleLiveReactions) || null,
    };

    contentCache.set(personaId, content);
    log.debug({ personaId, hasContent: !!content.lovableMoments }, 'Loaded lovable content');
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load lovable content, using fallbacks');
    const empty: LoadedLovableContent = {
      lovableMoments: null,
      delightfulSurprises: null,
      verbalPersonality: null,
      noticingPatterns: null,
      liveReactions: null,
    };
    contentCache.set(personaId, empty);
    return empty;
  }
}

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

function detectUserDelight(input: ContextBuilderInput): boolean {
  const text = input.userText.toLowerCase();
  const emotion = input.analysis.emotion;

  if (
    text.includes('haha') ||
    text.includes('lol') ||
    text.includes("that's funny") ||
    text.includes("you're funny") ||
    text.includes('i love that') ||
    text.includes("that's great")
  ) {
    return true;
  }

  if (
    emotion.primary === 'amused' ||
    emotion.primary === 'happy' ||
    emotion.primary === 'delighted'
  ) {
    return true;
  }

  return false;
}

function isGoodMomentForTangent(input: ContextBuilderInput): boolean {
  const emotion = input.analysis.emotion;
  const state = input.analysis.state;

  if (
    emotion.needsSupport ||
    (emotion.distressLevel && emotion.distressLevel >= DISTRESS.MODERATE)
  ) {
    return false;
  }

  if (state.phase === 'crisis' || state.phase === 'distress') {
    return false;
  }

  if (state.phase === 'exploring' || state.phase === 'reflecting') {
    return true;
  }

  if (state.engagementLevel && state.engagementLevel > 0.6) {
    return true;
  }

  return Math.random() > 0.6;
}

function detectSurprisingContent(input: ContextBuilderInput): boolean {
  const text = input.userText.toLowerCase();
  const intent = input.analysis.intent;

  if (
    text.includes('realized') ||
    text.includes('it hit me') ||
    text.includes('figured out') ||
    text.includes("i've never told") ||
    text.includes('for the first time') ||
    text.includes('finally understand') ||
    text.includes('just clicked')
  ) {
    return true;
  }

  if (intent.primary === 'vulnerable_share' || intent.primary === 'revelation') {
    return true;
  }

  return false;
}

function detectNoticeableChange(input: ContextBuilderInput): {
  detected: boolean;
  type?: string;
} {
  const voiceEmotion = input.voiceEmotion;
  const emotion = input.analysis.emotion;

  if (voiceEmotion?.speechRate) {
    if (voiceEmotion.speechRate > 1.3) {
      return { detected: true, type: 'sped_up' };
    }
    if (voiceEmotion.speechRate < 0.7) {
      return { detected: true, type: 'slowed_down' };
    }
  }

  if (emotion.markers?.includes('voice_changed') || emotion.markers?.includes('energy_shift')) {
    return { detected: true, type: 'energy_shift' };
  }

  if (emotion.markers?.includes('hedging') || emotion.markers?.includes('uncertain')) {
    return { detected: true, type: 'hedging' };
  }

  return { detected: false };
}

// ============================================================================
// INJECTION GENERATION (Uses Bundle Content)
// ============================================================================

function generateTangentGuidance(_content: LoadedLovableContent): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  return '[STYLE HINT] This is a good moment for a brief, charming tangent. Something random that makes you human - then catch yourself and return to the topic.';
}

function generateSelfDeprecationGuidance(_content: LoadedLovableContent): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  return '[STYLE HINT] If giving advice, add a self-deprecating note - acknowledge your own imperfections to feel more human and relatable.';
}

function generateSpecificDetailGuidance(_content: LoadedLovableContent): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  return '[STYLE HINT] Share a TINY specific detail about your life. Not generic statements but oddly specific things. Specificity creates intimacy.';
}

function generateReactionGuidance(_content: LoadedLovableContent, surprising: boolean): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  if (surprising) {
    return '[STYLE HINT] They just shared something significant. React GENUINELY with surprise, delight, or being moved - not with coached empathy.';
  }

  return '[STYLE HINT] Stay alive and reactive. If something surprises you, show it. Do not flatten your reactions to sound calm and professional.';
}

function generateNoticingGuidance(_content: LoadedLovableContent, changeType?: string): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  // Just describe the TYPE of thing to notice
  const typeDescription: Record<string, string> = {
    sped_up: 'their speech sped up - they might be anxious',
    slowed_down: 'they got quieter - something hit a nerve',
    energy_shift: 'their energy shifted - something changed',
    hedging: "they're hedging - there's something underneath",
  };
  const description = typeDescription[changeType || 'energy_shift'] || typeDescription.energy_shift;
  return `[STYLE HINT] You noticed ${description}. Name it gently and invite them to share more if they want.`;
}

function generatePlayfulGuidance(_content: LoadedLovableContent): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  return '[STYLE HINT] This is a good moment for gentle, affectionate teasing. You know them now - acknowledge their pattern with warmth, not mockery.';
}

function generateCallbackGuidance(
  _content: LoadedLovableContent,
  input: ContextBuilderInput
): string {
  // IMPORTANT: Don't include literal template phrases - the LLM copies them verbatim
  const topics = input.userData.recentTopics || [];
  if (topics.length > 0) {
    return `[STYLE HINT] Reference something small from earlier - not the big topic, but a throwaway comment or specific phrasing they used.`;
  }
  return `[STYLE HINT] Look for opportunities to callback to specific phrasings they've used, not just topics. Notice the small things.`;
}

function generateOddlySpecificOpinionGuidance(_content: LoadedLovableContent): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  return `[STYLE HINT] If the moment feels right, share an oddly specific opinion about something mundane. Make it authentically yours - something trivial you have unexpectedly strong feelings about.`;
}

function generateCaughtMidThoughtGuidance(content: LoadedLovableContent): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  // Instead, describe the STYLE without giving a script to copy
  return `[STYLE HINT] Open as if caught mid-thought - trail off from whatever you were thinking about, then pivot to the user. Sound genuinely distracted, not performative.`;
}

function generateConfessionGuidance(_content: LoadedLovableContent): string {
  // IMPORTANT: Don't include literal example phrases - the LLM copies them verbatim
  return `[STYLE HINT] If the moment feels natural, share something mildly confessional - a small vulnerability or quirk that makes you human. Keep it light and harmless.`;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildLovablePresenceContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const sessionId = input.services.sessionId;
  const state = getLovableState(sessionId); // Uses centralized session state
  const turnCount = input.userData.turnCount || 0;

  // Load persona-specific content
  const personaId = input.persona?.id || 'ferni';
  const content = await loadLovableContent(personaId);

  // Track user delight signals (update centralized state)
  if (detectUserDelight(input)) {
    updateLovableState(sessionId, { userSmileSignals: state.userSmileSignals + 1 });
    log.debug('Detected user delight signal');
  }

  // Don't inject lovable moments during crisis/distress
  if (
    input.analysis.emotion.needsSupport ||
    input.analysis.state.phase === 'crisis' ||
    (input.analysis.emotion.distressLevel && input.analysis.emotion.distressLevel >= DISTRESS.HIGH)
  ) {
    return injections;
  }

  // EARLY CONVERSATION: Focus on being present, not performing
  if (turnCount < 3) {
    // Maybe caught mid-thought for greeting
    if (turnCount === 0 && Math.random() < 0.3) {
      injections.push(
        createHintInjection(
          'lovable_presence',
          `[OPENING ENERGY] ${generateCaughtMidThoughtGuidance(content)}`,
          { category: 'personality' }
        )
      );
    }
    return injections;
  }

  // DETECT MOMENTS WORTH REACTING TO
  const surprising = detectSurprisingContent(input);
  const change = detectNoticeableChange(input);

  // GENUINE REACTIONS (high priority when warranted)
  if (surprising) {
    injections.push(
      createStandardInjection('lovable_presence', generateReactionGuidance(content, true), {
        category: 'personality',
      })
    );
    updateLovableState(sessionId, {
      lastGenuineReaction: turnCount,
      surprisesThisSession: state.surprisesThisSession + 1,
    });
  }

  // NOTICING (when we detect changes)
  if (change.detected && Math.random() < 0.3) {
    injections.push(
      createHintInjection('lovable_presence', generateNoticingGuidance(content, change.type), {
        category: 'personality',
      })
    );
  }

  // PERIODIC PERSONALITY INJECTIONS
  // Cap surprises per session to avoid being manic (increased from 5 to 12)
  if (state.surprisesThisSession > 12) {
    return injections;
  }

  // Roll for each type of lovable moment
  for (const moment of LOVABLE_MOMENTS) {
    // Skip if needs rapport and we don't have it
    if (moment.requiresRapport && turnCount < 6) continue;

    // Skip if on cooldown
    const lastOccurrence = state[`last${capitalize(moment.type)}` as keyof LovableState] as
      | number
      | undefined;
    if (lastOccurrence && turnCount - lastOccurrence < moment.cooldownTurns) continue;

    // Roll for probability (adjusted by user delight signals)
    const adjustedProbability = moment.probability * (1 + state.userSmileSignals * 0.1);
    if (Math.random() > adjustedProbability) continue;

    // Generate guidance based on type
    let guidance: string | null = null;

    switch (moment.type) {
      case 'tangent':
        if (isGoodMomentForTangent(input)) {
          guidance = generateTangentGuidance(content);
          // tangentsThisSession updated below with other state
        }
        break;
      case 'self_deprecation':
        guidance = generateSelfDeprecationGuidance(content);
        break;
      case 'specific_detail':
        guidance = generateSpecificDetailGuidance(content);
        break;
      case 'oddly_specific_opinion':
        guidance = generateOddlySpecificOpinionGuidance(content);
        break;
      case 'playful_tease':
        if (turnCount > 8 && state.userSmileSignals > 0) {
          guidance = generatePlayfulGuidance(content);
        }
        break;
      case 'callback':
        guidance = generateCallbackGuidance(content, input);
        break;
      case 'confession':
        guidance = generateConfessionGuidance(content);
        break;
    }

    if (guidance) {
      injections.push(
        createHintInjection('lovable_presence', `[LOVABLE MOMENT] ${guidance}`, {
          category: 'personality',
        })
      );

      // Update state (centralized)
      const stateKey = `last${capitalize(moment.type)}` as keyof LovableState;
      const updates: Partial<LovablePresenceState> = {
        surprisesThisSession: state.surprisesThisSession + 1,
      };
      // Type-safe assignment for last* fields
      if (moment.type === 'tangent') {
        updates.lastTangent = turnCount;
        updates.tangentsThisSession = (state.tangentsThisSession || 0) + 1;
      } else if (stateKey.startsWith('last')) {
        (updates as Record<string, number>)[stateKey] = turnCount;
      }
      updateLovableState(sessionId, updates);

      // Only inject one personality moment per turn to avoid overload
      break;
    }
  }

  // META-GUIDANCE: Remind to stay alive
  if (turnCount % 7 === 0 && injections.length === 0) {
    injections.push(
      createHintInjection(
        'lovable_presence',
        `[STAY ALIVE] Remember: React genuinely. Share tiny specific details. Laugh at yourself. Notice what they're not saying. Don't flatten your personality to sound professional.`,
        { category: 'personality' }
      )
    );
  }

  return injections;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_./g, (x) => x[1].toUpperCase());
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/** Clear content cache (for testing) */
export function clearLovableContentCache(): void {
  contentCache.clear();
}

/**
 * Clear session states (for testing)
 *
 * NOTE: Session state is now managed centrally by SessionStateManager.
 * Use SessionStateManager.clearAll() to clear all session state.
 * This function is kept for backward compatibility but is a no-op.
 */
export function clearLovableSessionStates(): void {
  // Session state now managed by SessionStateManager
  // Use SessionStateManager.clearAll() instead
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'lovable_presence',
  description: 'Orchestrates personality, charm, and delightful surprises',
  priority: 60,
  build: buildLovablePresenceContext,
});

export { buildLovablePresenceContext };
