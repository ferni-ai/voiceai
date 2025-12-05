/**
 * Cognitive Tool Result Interpretation
 *
 * Each persona interprets tool results through their cognitive lens.
 * Peter sees data patterns, Maya sees emotional implications,
 * Ferni sees narrative threads, etc.
 *
 * This makes tool results feel genuinely processed by each persona's mind.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { ReasoningStyle, CognitiveProfile } from '../personas/cognitive-types.js';
import { getCognitiveProfile } from '../personas/cognitive-profiles.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolResultContext {
  toolName: string;
  toolDomain: string;
  result: unknown;
  wasSuccessful: boolean;
  userQuestion?: string;
}

export interface CognitiveInterpretation {
  /** Opening phrase before presenting result */
  framingPhrase: string;
  /** How to highlight the key insight */
  keyInsightStyle: 'data_point' | 'emotional_implication' | 'story_element' | 'action_item' | 'pattern' | 'wisdom';
  /** Suggested follow-up angle */
  suggestedFollowUp: string;
  /** Whether to show uncertainty about interpretation */
  showInterpretiveUncertainty: boolean;
  /** Persona-specific lens description */
  interpretiveLens: string;
}

// ============================================================================
// INTERPRETATION TEMPLATES BY REASONING STYLE
// ============================================================================

const FRAMING_PHRASES: Record<ReasoningStyle, string[]> = {
  analytical: [
    "Looking at this data, what stands out is...",
    "The numbers tell an interesting story...",
    "Let me break down what this shows...",
    "Here's what the evidence suggests...",
    "Cross-referencing this with context...",
  ],
  empathetic: [
    "What this really means for you is...",
    "I notice this might bring up some feelings...",
    "Let's sit with what this reveals...",
    "How does this land for you?",
    "I want you to know that this shows...",
  ],
  narrative: [
    "Here's the story this tells...",
    "What I'm seeing in your journey is...",
    "This fits into a bigger picture...",
    "There's something meaningful here...",
    "Let me connect some dots...",
  ],
  systematic: [
    "Here's the process this reveals...",
    "Step by step, what this shows...",
    "Let me organize this for you...",
    "The workflow here is...",
    "Breaking this down systematically...",
  ],
  pragmatic: [
    "Here's what you can do with this...",
    "The action item here is...",
    "Practically speaking...",
    "Let's make this actionable...",
    "The bottom line is...",
  ],
  intuitive: [
    "What arises from this is...",
    "There's something deeper here...",
    "Beneath the surface...",
    "I sense that this reveals...",
    "Consider what this might mean...",
  ],
};

const KEY_INSIGHT_STYLES: Record<ReasoningStyle, CognitiveInterpretation['keyInsightStyle']> = {
  analytical: 'data_point',
  empathetic: 'emotional_implication',
  narrative: 'story_element',
  systematic: 'action_item',
  pragmatic: 'action_item',
  intuitive: 'wisdom',
};

const FOLLOW_UP_ANGLES: Record<ReasoningStyle, string[]> = {
  analytical: [
    "Want me to dig deeper into these patterns?",
    "Should we look at historical context?",
    "Would you like to compare this to other data?",
  ],
  empathetic: [
    "How does this sit with you?",
    "What feelings come up seeing this?",
    "Is there something else you need right now?",
  ],
  narrative: [
    "How does this fit with where you're heading?",
    "What chapter does this belong to in your story?",
    "Where do you want to go from here?",
  ],
  systematic: [
    "Should we map out next steps?",
    "Want me to outline a process for this?",
    "Shall we create a plan?",
  ],
  pragmatic: [
    "Ready to take action on this?",
    "What's the first thing you want to tackle?",
    "How can we make this happen?",
  ],
  intuitive: [
    "What does your gut tell you about this?",
    "Is there a deeper question here?",
    "What wisdom does this reveal?",
  ],
};

const INTERPRETIVE_LENSES: Record<ReasoningStyle, string> = {
  analytical: "I'm looking at patterns and evidence",
  empathetic: "I'm feeling into what this means for you personally",
  narrative: "I'm seeing the story thread here",
  systematic: "I'm organizing this into clear steps",
  pragmatic: "I'm focusing on what's actionable",
  intuitive: "I'm sensing the deeper significance",
};

// ============================================================================
// DOMAIN-SPECIFIC INTERPRETATION
// ============================================================================

interface DomainInterpretation {
  analyticalFocus: string;
  empatheticFocus: string;
  narrativeFocus: string;
  pragmaticFocus: string;
}

const DOMAIN_INTERPRETATIONS: Record<string, DomainInterpretation> = {
  stocks: {
    analyticalFocus: "the underlying trends and risk/reward ratio",
    empatheticFocus: "how this aligns with your financial peace of mind",
    narrativeFocus: "where this fits in your investment journey",
    pragmaticFocus: "what specific action to take",
  },
  calendar: {
    analyticalFocus: "the time allocation patterns",
    empatheticFocus: "how this affects your energy and wellbeing",
    narrativeFocus: "how this shapes your week's story",
    pragmaticFocus: "what to do next to stay on track",
  },
  memory: {
    analyticalFocus: "the connections between past and present",
    empatheticFocus: "what this memory means to you",
    narrativeFocus: "how this chapter connects to today",
    pragmaticFocus: "how to use this insight going forward",
  },
  budget: {
    analyticalFocus: "the spending patterns and opportunities",
    empatheticFocus: "how money connects to your values and stress",
    narrativeFocus: "the financial story you're writing",
    pragmaticFocus: "specific changes that would help",
  },
  goals: {
    analyticalFocus: "progress metrics and timeline",
    empatheticFocus: "how pursuing this goal makes you feel",
    narrativeFocus: "the transformation you're creating",
    pragmaticFocus: "the next concrete step",
  },
};

// ============================================================================
// MAIN INTERPRETATION FUNCTION
// ============================================================================

/**
 * Generate cognitive interpretation for a tool result
 */
export function interpretToolResult(
  personaId: string,
  context: ToolResultContext
): CognitiveInterpretation {
  const profile = getCognitiveProfile(personaId);

  if (!profile) {
    return getDefaultInterpretation();
  }

  const style = profile.reasoningStyle;

  // Select framing phrase
  const framingPhrases = FRAMING_PHRASES[style];
  const framingPhrase = framingPhrases[Math.floor(Math.random() * framingPhrases.length)];

  // Get key insight style
  const keyInsightStyle = KEY_INSIGHT_STYLES[style];

  // Select follow-up angle
  const followUpAngles = FOLLOW_UP_ANGLES[style];
  const suggestedFollowUp = followUpAngles[Math.floor(Math.random() * followUpAngles.length)];

  // Determine uncertainty
  const showInterpretiveUncertainty = shouldShowUncertainty(profile, context);

  // Get interpretive lens
  const interpretiveLens = INTERPRETIVE_LENSES[style];

  return {
    framingPhrase,
    keyInsightStyle,
    suggestedFollowUp,
    showInterpretiveUncertainty,
    interpretiveLens,
  };
}

/**
 * Get domain-specific interpretation guidance
 */
export function getDomainInterpretation(
  personaId: string,
  domain: string
): string | null {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return null;

  const domainInterp = DOMAIN_INTERPRETATIONS[domain];
  if (!domainInterp) return null;

  switch (profile.reasoningStyle) {
    case 'analytical':
      return domainInterp.analyticalFocus;
    case 'empathetic':
      return domainInterp.empatheticFocus;
    case 'narrative':
      return domainInterp.narrativeFocus;
    case 'pragmatic':
    case 'systematic':
      return domainInterp.pragmaticFocus;
    default:
      return domainInterp.narrativeFocus;
  }
}

/**
 * Format tool result with cognitive framing
 */
export function formatToolResultWithCognition(
  personaId: string,
  context: ToolResultContext,
  rawResultText: string
): string {
  const interpretation = interpretToolResult(personaId, context);

  let formattedResult = `${interpretation.framingPhrase}\n\n${rawResultText}`;

  if (interpretation.showInterpretiveUncertainty) {
    formattedResult += `\n\n(${interpretation.interpretiveLens} - but tell me if you see it differently)`;
  }

  formattedResult += `\n\n${interpretation.suggestedFollowUp}`;

  return formattedResult;
}

/**
 * Get thinking sound for processing a tool result
 */
export function getToolProcessingSound(personaId: string): string {
  const profile = getCognitiveProfile(personaId);
  if (!profile) return 'Hmm';

  const sounds: Record<ReasoningStyle, string[]> = {
    analytical: ['Let me see...', 'Interesting...', 'Looking at this...'],
    empathetic: ['I hear you...', 'Let me sit with this...', 'Mmm...'],
    narrative: ['So...', 'Here\'s what I\'m seeing...', 'The story here...'],
    systematic: ['Okay...', 'Let me organize this...', 'Step by step...'],
    pragmatic: ['Alright...', 'Okay so...', 'Here\'s the deal...'],
    intuitive: ['Hmm...', 'There\'s something here...', 'I sense...'],
  };

  const options = sounds[profile.reasoningStyle] || sounds.narrative;
  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// HELPERS
// ============================================================================

function shouldShowUncertainty(profile: CognitiveProfile, context: ToolResultContext): boolean {
  // Show uncertainty more often for complex domains
  const complexDomains = ['stocks', 'investment', 'health'];
  const isComplexDomain = complexDomains.some(d => context.toolDomain.includes(d));

  // And based on persona's metacognition
  const baseUncertaintyChance = 1 - profile.biases.biasIntensity;

  return Math.random() < (isComplexDomain ? baseUncertaintyChance * 1.5 : baseUncertaintyChance * 0.5);
}

function getDefaultInterpretation(): CognitiveInterpretation {
  return {
    framingPhrase: "Here's what I found...",
    keyInsightStyle: 'data_point',
    suggestedFollowUp: "What would you like to do with this?",
    showInterpretiveUncertainty: false,
    interpretiveLens: "Looking at this objectively",
  };
}

export default {
  interpretToolResult,
  getDomainInterpretation,
  formatToolResultWithCognition,
  getToolProcessingSound,
};

