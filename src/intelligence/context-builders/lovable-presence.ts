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

import { loadBundleById } from '../../personas/bundles/loader.js';
import type {
  BundleDelightfulSurprises,
  BundleLiveReactions,
  BundleLovableMoments,
  BundleNoticingPatterns,
  BundleVerbalPersonality,
} from '../../personas/bundles/types/content.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'LovablePresence' });

// ============================================================================
// TYPES
// ============================================================================

interface LovableState {
  lastTangent?: number;
  lastSelfDeprecation?: number;
  lastSpecificDetail?: number;
  lastPlayfulMoment?: number;
  lastGenuineReaction?: number;
  tangentsThisSession: number;
  surprisesThisSession: number;
  userSmileSignals: number;
}

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
  { type: 'tangent', probability: 0.08, cooldownTurns: 8, requiresRapport: true },
  { type: 'self_deprecation', probability: 0.12, cooldownTurns: 5, requiresRapport: false },
  { type: 'specific_detail', probability: 0.15, cooldownTurns: 4, requiresRapport: false },
  { type: 'oddly_specific_opinion', probability: 0.06, cooldownTurns: 10, requiresRapport: true },
  { type: 'caught_mid_thought', probability: 0.2, cooldownTurns: 15, requiresRapport: false },
  { type: 'genuine_reaction', probability: 0.25, cooldownTurns: 3, requiresRapport: false },
  { type: 'playful_tease', probability: 0.1, cooldownTurns: 6, requiresRapport: true },
  { type: 'noticing', probability: 0.18, cooldownTurns: 4, requiresRapport: false },
  { type: 'callback', probability: 0.2, cooldownTurns: 5, requiresRapport: false },
  { type: 'confession', probability: 0.05, cooldownTurns: 12, requiresRapport: true },
];

// Per-session state
const sessionStates = new Map<string, LovableState>();

// Content cache per persona
const contentCache = new Map<string, LoadedLovableContent>();

function getSessionState(sessionId: string): LovableState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      tangentsThisSession: 0,
      surprisesThisSession: 0,
      userSmileSignals: 0,
    });
  }
  return sessionStates.get(sessionId)!;
}

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
// RANDOM SELECTION HELPERS
// ============================================================================

function randomFrom<T>(arr: T[] | undefined): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function stripSSML(text: string): string {
  // Remove SSML tags for cleaner guidance text
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

  if (emotion.needsSupport || (emotion.distressLevel && emotion.distressLevel > 0.5)) {
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

function generateTangentGuidance(content: LoadedLovableContent): string {
  const surprises = content.delightfulSurprises;

  // Try to get from bundle
  const tangent = randomFrom(surprises?.random_tangents?.tangents);
  if (tangent) {
    return `This is a good moment for a brief, charming tangent. Example from your persona: "${stripSSML(tangent)}"`;
  }

  // Fallback
  return 'This is a good moment for a brief, charming tangent. Something random that makes you human—then catch yourself and return. Example: "This is completely unrelated but— anyway. Where were we?"';
}

function generateSelfDeprecationGuidance(content: LoadedLovableContent): string {
  const lovable = content.lovableMoments;

  // Try bundle content
  const selfDep = randomFrom(lovable?.self_deprecating_humor?.about_himself);
  if (selfDep) {
    return `If giving advice, add a self-deprecating note. Example: "${stripSSML(selfDep)}"`;
  }

  // Fallback
  return 'If giving advice, consider adding a self-deprecating note: "I give great advice I never follow."';
}

function generateSpecificDetailGuidance(content: LoadedLovableContent): string {
  const lovable = content.lovableMoments;

  // Try bundle content
  const detail = randomFrom(lovable?.tiny_specific_details?.what_ferni_shares_unprompted);
  if (detail) {
    return `Share a TINY specific detail about your life. Example: "${stripSSML(detail)}"`;
  }

  // Fallback
  return `Share a TINY specific detail about your life. Not "I like music" but "I've listened to this one song maybe forty times this week." Specificity creates intimacy.`;
}

function generateReactionGuidance(content: LoadedLovableContent, surprising: boolean): string {
  const reactions = content.liveReactions;

  if (surprising) {
    // Try bundle content for positive surprise
    const reaction = randomFrom(reactions?.genuine_surprise?.positive_surprise);
    if (reaction) {
      return `They just shared something significant. React GENUINELY. Example: "${stripSSML(reaction)}"`;
    }

    // Try moved reactions
    const moved = randomFrom(reactions?.moved?.reactions);
    if (moved) {
      return `They just shared something significant. React GENUINELY. Example: "${stripSSML(moved)}"`;
    }

    // Fallback
    return `They just shared something significant. React GENUINELY, not with coached empathy. Examples: "Wait— what?! That's amazing!" or "That hit different. I need a second."`;
  }

  return `Stay alive and reactive. If something surprises you, show it. Don't flatten your reactions to sound "calm and professional."`;
}

function generateNoticingGuidance(content: LoadedLovableContent, changeType?: string): string {
  const noticing = content.noticingPatterns;

  // Try bundle content based on change type
  let observation: string | undefined;
  switch (changeType) {
    case 'sped_up':
    case 'slowed_down':
      observation = randomFrom(noticing?.voice_changes?.observations);
      break;
    case 'energy_shift':
      observation = randomFrom(noticing?.energy_shifts?.observations);
      break;
    case 'hedging':
      observation = randomFrom(noticing?.what_they_didnt_say?.observations);
      break;
  }

  if (observation) {
    return `You noticed something shift. Name it gently: "${stripSSML(observation)}"`;
  }

  // Fallback
  const examples: Record<string, string> = {
    sped_up: '"You sped up just now. Are you anxious about this?"',
    slowed_down: '"You got quieter there. What happened?"',
    energy_shift: '"Something shifted. I can hear it. Want to talk about it?"',
    hedging: "\"You're hedging. I noticed. What's the thing you're not saying?\"",
  };
  return `You noticed something shift. Name it gently. Example: ${examples[changeType || 'energy_shift'] || examples.energy_shift}`;
}

function generatePlayfulGuidance(content: LoadedLovableContent): string {
  const lovable = content.lovableMoments;

  const tease = randomFrom(lovable?.playful_moments?.gentle_teasing);
  if (tease) {
    return `This is a good moment for gentle, affectionate teasing. Example: "${stripSSML(tease)}"`;
  }

  // Fallback
  return `This is a good moment for gentle, affectionate teasing. You know them now. Example: "Oh, here we go. I knew you'd say that."`;
}

function generateCallbackGuidance(
  content: LoadedLovableContent,
  input: ContextBuilderInput
): string {
  const noticing = content.noticingPatterns;

  const callback = randomFrom(noticing?.remembering_the_small_things?.callbacks);
  if (callback) {
    return `Consider referencing something small from earlier. Template: "${stripSSML(callback)}"`;
  }

  const topics = input.userData.recentTopics || [];
  if (topics.length > 0) {
    return `Consider referencing something small from earlier—not the big topic, but a throwaway comment or specific phrasing they used.`;
  }
  return `Look for opportunities to callback to specific phrasings they've used, not just topics. "The way you said that— I keep thinking about it."`;
}

function generateOddlySpecificOpinionGuidance(content: LoadedLovableContent): string {
  const surprises = content.delightfulSurprises;

  const opinion = randomFrom(surprises?.oddly_specific_opinions?.opinions);
  if (opinion) {
    return `Share an oddly specific opinion as a palate cleanser. Example: "${stripSSML(opinion)}"`;
  }

  // Fallback
  return `Consider sharing an oddly specific opinion. Example: "I have strong feelings about toast. This is a hill I will die on."`;
}

function generateCaughtMidThoughtGuidance(content: LoadedLovableContent): string {
  const lovable = content.lovableMoments;

  // Try with specifics first (more interesting)
  const withSpecific = randomFrom(lovable?.caught_mid_thought?.with_specifics);
  if (withSpecific) {
    return `Open like you were mid-thought. Example: "${stripSSML(withSpecific)}"`;
  }

  // Try general examples
  const example = randomFrom(lovable?.caught_mid_thought?.examples);
  if (example) {
    return `Open like you were mid-thought. Example: "${stripSSML(example)}"`;
  }

  // Fallback
  return `Consider opening like you were mid-thought—"Oh! Hey. Sorry, I was just... actually, never mind. What's up?"`;
}

function generateConfessionGuidance(content: LoadedLovableContent): string {
  const surprises = content.delightfulSurprises;

  // Try "why am I telling you this"
  const share = randomFrom(surprises?.why_am_i_telling_you_this?.shares);
  if (share) {
    return `If natural, share something slightly confessional. Example: "${stripSSML(share)}"`;
  }

  // Try accidental reveals
  const reveal = randomFrom(surprises?.accidental_reveals?.reveals);
  if (reveal) {
    return `If natural, share something slightly confessional. Example: "${stripSSML(reveal)}"`;
  }

  // Fallback
  return `If natural, share something slightly confessional. "I should not be telling you this but—" then something harmless and human.`;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildLovablePresenceContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const sessionId = input.services.sessionId;
  const state = getSessionState(sessionId);
  const turnCount = input.userData.turnCount || 0;

  // Load persona-specific content
  const personaId = input.persona?.id || 'ferni';
  const content = await loadLovableContent(personaId);

  // Track user delight signals
  if (detectUserDelight(input)) {
    state.userSmileSignals++;
    log.debug('Detected user delight signal');
  }

  // Don't inject lovable moments during crisis/distress
  if (
    input.analysis.emotion.needsSupport ||
    input.analysis.state.phase === 'crisis' ||
    (input.analysis.emotion.distressLevel && input.analysis.emotion.distressLevel > 0.7)
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
    state.lastGenuineReaction = turnCount;
    state.surprisesThisSession++;
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
  // Cap surprises per session to avoid being manic
  if (state.surprisesThisSession > 5) {
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
          state.tangentsThisSession++;
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

      // Update state
      const stateKey = `last${capitalize(moment.type)}` as keyof LovableState;
      (state as unknown as Record<string, number>)[stateKey] = turnCount;
      state.surprisesThisSession++;

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

/** Clear session states (for testing) */
export function clearLovableSessionStates(): void {
  sessionStates.clear();
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
