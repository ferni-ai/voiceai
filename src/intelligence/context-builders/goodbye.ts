/**
 * Goodbye Context Builder
 *
 * Handles conversation endings:
 * - Goodbye detection and warm wrap-up
 * - Closing awareness
 * - Interruption and silence recovery
 *
 * Don't rush the ending - it matters.
 *
 * Extracted from jack-bogle.ts lines 669-687, 939-957, 1205-1211
 */
import { log } from '@livekit/agents';
import {
  registerContextBuilder,
  createCriticalInjection,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import { getTheatricalGoodbye } from '../../personas/theatrical.js';
import type { PersonaConfig } from '../../personas/types.js';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

interface ExtendedUserData {
  turnCount?: number;
  wasInterrupted?: boolean;
  userWentSilent?: boolean;
}

interface SilenceFillers {
  early?: string[];
  mid?: string[];
  late?: string[];
}

// Extended persona capabilities for goodbye handling
// Note: Does not extend PersonaConfig to avoid type conflicts with required communication field
interface GoodbyePersonaExtensions {
  communication?: {
    silenceFillers?: SilenceFillers;
    interruptionRecoveries?: string[];
  };
}

type ExtendedPersona = PersonaConfig & GoodbyePersonaExtensions;
// ============================================================================
// GOODBYE PATTERNS
// ============================================================================
const GOODBYE_PATTERNS =
  /\b(goodbye|bye|gotta go|have to go|need to go|talk later|catch you later|take care|see you|until next time|i'm out|signing off|heading out)\b/i;
// Default fillers (fallback when no persona provided)
// These should feel natural and human, not robotic "still there?" prompts
const DEFAULT_EARLY_FILLERS = [
  'Take your time... <break time="300ms"/>no rush at all.',
  '<break time="400ms"/>I\'m right here when you\'re ready.',
  'Thinking is good. <break time="300ms"/>I\'ll wait.',
  '<break time="300ms"/>Take a breath. <break time="200ms"/>We\'ve got time.',
];
const DEFAULT_MID_FILLERS = [
  '<break time="400ms"/>You know, <break time="200ms"/>sometimes the quiet is where the good stuff lives.',
  '<break time="300ms"/>Processing something? <break time="200ms"/>I get it.',
  '<break time="400ms"/>Some things need time to settle. <break time="200ms"/>I\'m here.',
  '<break time="300ms"/>The silence doesn\'t bother me. <break time="200ms"/>Take your time.',
];
const DEFAULT_LATE_FILLERS = [
  '<break time="400ms"/>Still here if you want to keep going... <break time="300ms"/>or not. Either\'s fine.',
  '<break time="300ms"/>Want to leave it here for now? <break time="200ms"/>We can always pick up later.',
  '<break time="400ms"/>No pressure. <break time="200ms"/>I\'m here if something comes to mind.',
  '<break time="300ms"/>Should we wrap up, or is there something else brewing?',
];
const DEFAULT_RECOVERY_PHRASES = [
  '<break time="100ms"/>Oh! <break time="150ms"/>Go ahead—',
  '<break time="100ms"/>Yes, sorry— <break time="100ms"/>what were you saying?',
  '<break time="150ms"/>No no, <break time="100ms"/>you first.',
  '<break time="100ms"/>I was rambling anyway. <break time="150ms"/>What\'s on your mind?',
  '<break time="100ms"/>Please, <break time="100ms"/>jump in—',
  '<break time="150ms"/>Ah, <break time="100ms"/>got carried away. <break time="150ms"/>What did you want to say?',
  '<break time="100ms"/>Wait— <break time="150ms"/>you were saying?',
  '<break time="150ms"/>Sorry! <break time="100ms"/>Didn\'t mean to talk over you.',
];
/**
 * Random element from array
 */
function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
/**
 * Get silence filler phrase - uses persona config if available
 */
function getSilenceFiller(turnCount: number, persona?: ExtendedPersona): string {
  const fillers = persona?.communication?.silenceFillers;
  if (fillers) {
    if (turnCount <= 3 && fillers.early?.length) {
      return randomFrom(fillers.early);
    } else if (turnCount <= 8 && fillers.mid?.length) {
      return randomFrom(fillers.mid);
    } else if (fillers.late?.length) {
      return randomFrom(fillers.late);
    }
  }
  // Fallback to defaults
  if (turnCount <= 3) {
    return randomFrom(DEFAULT_EARLY_FILLERS);
  } else if (turnCount <= 8) {
    return randomFrom(DEFAULT_MID_FILLERS);
  } else {
    return randomFrom(DEFAULT_LATE_FILLERS);
  }
}
/**
 * Get interruption recovery phrase - uses persona config if available
 */
function getInterruptionRecovery(persona?: ExtendedPersona): string {
  const recoveries = persona?.communication?.interruptionRecoveries;
  if (recoveries && recoveries.length > 0) {
    return randomFrom(recoveries);
  }
  return randomFrom(DEFAULT_RECOVERY_PHRASES);
}
/**
 * Get closing behavior suggestion
 */
function getClosingBehavior(turnCount: number, intent: string): string | null {
  // Only suggest closing in later turns
  if (turnCount < 10) return null;
  // If user seems to be wrapping up
  if (intent === 'ending_conversation' || intent === 'saying_goodbye') {
    return "Don't rush the goodbye. Summarize what you discussed and leave warmly.";
  }
  // If conversation is getting long
  if (turnCount > 15) {
    const closings = [
      "We've covered a lot of ground. Consider gently checking if they want to continue.",
      "Good conversation! Make sure they know you're available anytime.",
      "Consider wrapping up with a key takeaway from today's talk.",
    ];
    return closings[Math.floor(Math.random() * closings.length)];
  }
  return null;
}
// ============================================================================
// GOODBYE CONTEXT BUILDER
// ============================================================================
/**
 * Build goodbye-related context injections
 */
function buildGoodbyeContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, analysis, userData, persona } = input;
  const extUserData = userData as ExtendedUserData;
  const extPersona = persona as ExtendedPersona;
  const injections: ContextInjection[] = [];
  const turnCount = extUserData.turnCount || 0;
  // -----------------------------------------------
  // INTERRUPTION RECOVERY (uses persona phrases if available)
  // -----------------------------------------------
  if (extUserData.wasInterrupted) {
    const recovery = getInterruptionRecovery(extPersona);
    injections.unshift(
      createCriticalInjection(
        'interruption',
        `[INTERRUPTION: You were cut off. START with something like: "${recovery}" Then address what they said.]`
      )
    );
    extUserData.wasInterrupted = false; // Reset flag
    getLogger().info('Interruption recovery injected');
  }
  // -----------------------------------------------
  // SILENCE HANDLING (uses persona phrases if available)
  // -----------------------------------------------
  if (extUserData.userWentSilent) {
    const silenceFiller = getSilenceFiller(turnCount, extPersona);
    injections.push(
      createStandardInjection(
        'silence',
        `[SILENCE: User has been quiet. Consider gently checking in: "${silenceFiller}"]`
      )
    );
    extUserData.userWentSilent = false; // Reset flag
    getLogger().info('Silence filler injected');
  }
  // -----------------------------------------------
  // GOODBYE DETECTION (with persona-specific goodbye style)
  // -----------------------------------------------
  if (GOODBYE_PATTERNS.test(userText)) {
    const personaId = persona?.id;
    getLogger().info({ persona: personaId }, 'Goodbye detected');
    // Get persona-specific goodbye example
    let goodbyeExample = '';
    if (personaId) {
      try {
        const theatricalGoodbye = getTheatricalGoodbye(personaId);
        // Strip SSML tags for the example
        const cleanGoodbye = theatricalGoodbye.replace(/<[^>]*>/g, '');
        goodbyeExample = `\nEXAMPLE (use your own words, this style): "${cleanGoodbye}"`;
      } catch {
        // Fall through to default
      }
    }
    injections.push(
      createStandardInjection(
        'goodbye',
        `[GOODBYE DETECTED - WARM WRAP-UP]
Don't rush the ending. It matters.${goodbyeExample}
DO:
  1. Acknowledge what you discussed: "It was good talking about..."
  2. One key takeaway (if appropriate): "If you remember one thing..."
  3. Express warmth genuinely in YOUR style
  4. Leave door open: "I'm here whenever you want to talk."
  5. Use their name if you know it
DO NOT:
  - Add new information
  - End on a heavy note (unless necessary)
  - Rush through it`
      )
    );
  }
  // -----------------------------------------------
  // CLOSING AWARENESS
  // -----------------------------------------------
  const closingBehavior = getClosingBehavior(turnCount, analysis.intent.primary);
  if (closingBehavior) {
    injections.push(
      createHintInjection(
        'closing',
        `[CLOSING: The conversation seems to be winding down. Consider: "${closingBehavior}"]`
      )
    );
  }
  return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('goodbye', buildGoodbyeContext);
export {
  buildGoodbyeContext,
  getSilenceFiller,
  getInterruptionRecovery,
  getClosingBehavior,
  GOODBYE_PATTERNS,
};
