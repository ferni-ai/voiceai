/**
 * Dynamic Speech Guidance Context Builder
 *
 * REPLACES static phrase pools with LLM behavioral guidance.
 *
 * Philosophy:
 * - Don't give the LLM phrases to repeat
 * - Guide it on INTENT and let it generate naturally
 * - Match energy and context, not templates
 *
 * This replaces:
 * - natural-tool-calling.ts (PRE_CALL_PHRASES, THINKING_SOUNDS)
 * - tool-fillers.ts (TOOL_FILLERS)
 * - authentic-thinking.ts (personaThinkingPhrases)
 * - processing-intelligence.ts (PROCESSING_PHRASES)
 * - physical-presence.json (coffee_references)
 *
 * @module DynamicSpeechGuidance
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { registerContextBuilder, createStandardInjection } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'context:dynamic-speech-guidance' });

// ============================================================================
// BEHAVIORAL GUIDANCE (Not Phrases!)
// ============================================================================

/**
 * Core speech behavior guidance.
 * This tells the LLM HOW to behave, not WHAT to say.
 */
const SPEECH_BEHAVIOR_GUIDANCE = `
## Natural Speech (IMPORTANT)

You are having a real conversation. Never use stock phrases or verbal tics.

### When Processing or Thinking
- If you need a moment, just pause naturally (silence is fine)
- Don't announce that you're thinking ("let me think", "one moment", "let's see")
- If you genuinely need to express processing, make it contextual to what they said
- Brief acknowledgments are fine: "Yeah", "Mm", "Okay" - but vary them

### When Using Tools
- You don't need to announce tool usage
- Just seamlessly include the result in your response
- If there's a natural delay, a brief "oh" or pause is fine - not "checking that for you"

### Avoid These Patterns (They Sound Robotic)
- "One moment..." / "Let me check..." / "Let's see..."
- "That's a great question" / "Good question"
- Starting responses with "Well..." or "So..."
- Filler phrases that don't add meaning
- Repeating the same acknowledgment sounds

### Match Energy Instead
- If they're excited, respond with matching energy (not a template phrase)
- If they're sharing something heavy, respond with presence (not stock comfort phrases)
- If they're asking something simple, just answer (no preamble)
`;

/**
 * Tool-specific guidance
 */
const TOOL_BEHAVIOR_GUIDANCE = `
### Tool Usage Speech

When you call a tool (search, calendar, memory, etc.):
- Don't announce it: Skip "let me check your calendar" - just check it
- Weave results naturally: "You've got..." not "Looking at your calendar, I see..."
- If genuinely surprised by a result, express that naturally - don't fake surprise
- For memory/recall: Just reference it naturally, like you remember - you don't need to say "I recall" or "let me think back"
`;

/**
 * Physical presence guidance (replaces coffee_references, etc.)
 */
const PHYSICAL_PRESENCE_GUIDANCE = `
### Physical Grounding

You can occasionally reference physical sensations to feel present:
- Only if it genuinely fits the moment
- Maximum once per conversation (not repeatedly)
- Vary what you reference - don't repeat the same thing
- Skip entirely if it would feel forced

Examples of grounding (use sparingly, in your own words):
- A pause or breath when they share something heavy
- Settling in when the conversation gets real
- Brief sensory reference only if deeply relevant
`;

/**
 * Thinking and reflection guidance
 */
const THINKING_GUIDANCE = `
### Genuine Reflection

When you genuinely need to process something complex:
- Pause naturally (silence shows you're thinking)
- If you speak while thinking, make it relevant to THEIR words
- "Yeah..." or "Mm..." is fine occasionally, but don't overuse
- For complex questions, you can acknowledge the depth: "That's a big one" (but in your own words)

What NOT to do:
- Don't use "Hmm..." as a default opener
- Don't say "Let me think about that" - just think
- Don't perform thinking with stock phrases
`;

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const dynamicSpeechGuidanceBuilder: ContextBuilder = {
  name: 'dynamic-speech-guidance',
  description: 'Injects behavioral guidance for natural, dynamic speech instead of static phrases',
  priority: 85, // High priority - this is about core speech behavior
  category: BuilderCategory.HUMANIZING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { userData } = input;
    const injections: ContextInjection[] = [];

    // Always inject core speech behavior guidance
    injections.push(
      createStandardInjection('natural_speech_behavior', SPEECH_BEHAVIOR_GUIDANCE.trim(), {
        category: 'speech-behavior',
      })
    );

    // Add tool guidance if tools are likely to be used
    // (In practice, always include this since tools are common)
    injections.push(
      createStandardInjection('tool_speech_behavior', TOOL_BEHAVIOR_GUIDANCE.trim(), {
        category: 'speech-behavior',
      })
    );

    // Add thinking guidance
    injections.push(
      createStandardInjection('thinking_behavior', THINKING_GUIDANCE.trim(), {
        category: 'speech-behavior',
      })
    );

    // Physical presence - only early in conversation or occasionally
    const turnCount = userData?.turnCount ?? 0;
    if (turnCount < 3 || Math.random() < 0.1) {
      injections.push(
        createStandardInjection('physical_presence_behavior', PHYSICAL_PRESENCE_GUIDANCE.trim(), {
          category: 'speech-behavior',
        })
      );
    }

    log.debug(
      { injectionCount: injections.length, turnCount },
      'Built dynamic speech guidance injections'
    );

    return injections;
  },
};

// ============================================================================
// ANTI-REPETITION TRACKER
// ============================================================================

/**
 * Track recent speech patterns to prevent repetition.
 * This is used by the LLM to avoid repeating itself.
 */
const sessionPhraseHistory = new Map<string, string[]>();

/**
 * Record a phrase that was used (for anti-repetition)
 */
export function recordUsedPhrase(sessionId: string, phrase: string): void {
  const history = sessionPhraseHistory.get(sessionId) || [];
  history.push(phrase.toLowerCase().trim());

  // Keep last 10 phrases
  if (history.length > 10) {
    history.shift();
  }

  sessionPhraseHistory.set(sessionId, history);
}

/**
 * Check if a phrase was recently used
 */
export function wasRecentlyUsed(sessionId: string, phrase: string): boolean {
  const history = sessionPhraseHistory.get(sessionId) || [];
  return history.includes(phrase.toLowerCase().trim());
}

/**
 * Clear phrase history for a session
 */
export function clearPhraseHistory(sessionId: string): void {
  sessionPhraseHistory.delete(sessionId);
}

/**
 * Get anti-repetition guidance based on recent phrases
 */
export function getAntiRepetitionGuidance(sessionId: string): string | null {
  const history = sessionPhraseHistory.get(sessionId);
  if (!history || history.length === 0) return null;

  // Find patterns that have been repeated
  const counts = new Map<string, number>();
  for (const phrase of history) {
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }

  const repeated = Array.from(counts.entries())
    .filter(([_, count]) => count > 1)
    .map(([phrase]) => phrase);

  if (repeated.length === 0) return null;

  return `Avoid repeating: ${repeated
    .slice(0, 3)
    .map((p) => `"${p}"`)
    .join(', ')}`;
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(dynamicSpeechGuidanceBuilder);

export default dynamicSpeechGuidanceBuilder;
