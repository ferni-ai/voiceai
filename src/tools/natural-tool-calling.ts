/**
 * Natural Tool Calling
 *
 * Makes tool usage feel human, not robotic:
 *
 * 1. NATURAL FRAMING - "Let me think about this..." not "Executing query"
 * 2. THINKING SOUNDS - Authentic "hmm", "let's see" before tool calls
 * 3. RESULT WEAVING - Tool results woven into conversation, not dumped
 * 4. EMOTIONAL CONTEXT - Tool decisions based on emotional state
 * 5. PERSONA VOICE - Tool results expressed in Ferni's voice
 *
 * > "Better than human" means using superhuman capabilities
 * > while expressing them in deeply human ways.
 *
 * INTEGRATION: Uses ProcessingIntelligence for context-aware processing phrases
 * when available. Falls back to legacy PRE_CALL_PHRASES for compatibility.
 *
 * @module NaturalToolCalling
 */

import { createLogger } from '../utils/safe-logger.js';
import { loadPersonaBehaviors, getRandomPhraseClean } from '../services/persona-content-loader.js';
import {
  getToolCallProcessing,
  formatProcessingAsSSML,
  type ProcessingResult,
} from '../intelligence/processing-intelligence.js';

const log = createLogger({ module: 'NaturalToolCalling' });

// ============================================================================
// TYPES
// ============================================================================

export interface ToolContext {
  personaId: string;
  userMood?: string;
  relationshipStage?: 'new' | 'acquaintance' | 'familiar' | 'trusted';
  timeOfDay?: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
  isUserDistressed?: boolean;
  turnCount?: number;
}

export interface NaturalToolCall {
  /** What to say BEFORE calling the tool */
  preCallPhrase: string;

  /** Thinking sound/pause to add naturalness */
  thinkingSound: string;

  /** How to frame the tool result */
  resultFraming: 'data' | 'story' | 'insight' | 'action' | 'care';

  /** Post-call transition phrase */
  postCallTransition: string;

  /** Whether to show the tool was used at all */
  hideToolUsage: boolean;
}

// ============================================================================
// DEPRECATED: STATIC PHRASE POOLS
// ============================================================================
//
// These static phrase pools have been replaced by LLM behavioral guidance.
// See: src/intelligence/context-builders/dynamic-speech-guidance.ts
//
// The new approach:
// - Don't give the LLM phrases to repeat
// - Guide it on INTENT and let it generate naturally
// - Match energy and context, not templates
//
// The phrase pools below are kept for backward compatibility but return
// empty strings or minimal pauses. The LLM will generate natural speech
// based on the behavioral guidance in dynamic-speech-guidance.ts.
// ============================================================================

/**
 * @deprecated REMOVED - LLM generates natural speech from behavioral guidance
 * Kept for backward compatibility, returns empty or minimal values
 */
const PRE_CALL_PHRASES = {
  memory: [''], // Empty - LLM decides naturally
  calendar: [''],
  search: [''],
  goals: [''],
  context: [''],
  default: [''],
};

/**
 * @deprecated REMOVED - LLM generates natural pauses from behavioral guidance
 * Kept for backward compatibility, returns only SSML pauses (no speech)
 */
const THINKING_SOUNDS = {
  contemplative: ['<break time="200ms"/>'],
  curious: ['<break time="150ms"/>'],
  caring: ['<break time="250ms"/>'],
  energetic: ['<break time="100ms"/>'],
};

/**
 * @deprecated REMOVED - LLM weaves results naturally
 */
const RESULT_FRAMINGS = {
  data: [''],
  story: [''],
  insight: [''],
  action: [''],
  care: [''],
};

/**
 * @deprecated REMOVED - LLM handles transitions naturally
 */
const POST_CALL_TRANSITIONS = {
  toQuestion: [''],
  toInsight: [''],
  toAction: [''],
  toPause: [''],
};

// ============================================================================
// NATURAL TOOL CALLING LOGIC
// ============================================================================

/**
 * Get natural framing for a tool call
 *
 * @deprecated Use getContextAwareToolProcessing() for dynamic context-aware phrases
 */
export function getNaturalToolCall(toolName: string, context: ToolContext): NaturalToolCall {
  // Determine tool category
  const category = categorizeToolCall(toolName);

  // Get pre-call phrase based on category
  const preCallPhrases = PRE_CALL_PHRASES[category] || PRE_CALL_PHRASES.default;
  const preCallPhrase = preCallPhrases[Math.floor(Math.random() * preCallPhrases.length)];

  // Get thinking sound based on emotional context
  const thinkingSoundCategory = getThinkingSoundCategory(context);
  const thinkingSounds = THINKING_SOUNDS[thinkingSoundCategory];
  const thinkingSound = thinkingSounds[Math.floor(Math.random() * thinkingSounds.length)];

  // Determine result framing based on tool and context
  const resultFraming = getResultFraming(toolName, context);

  // Get post-call transition
  const postCallTransition = getPostCallTransition(toolName, context);

  // Some tools should be invisible
  const hideToolUsage = shouldHideToolUsage(toolName, context);

  return {
    preCallPhrase: hideToolUsage ? '' : preCallPhrase,
    thinkingSound: hideToolUsage ? '' : thinkingSound,
    resultFraming,
    postCallTransition,
    hideToolUsage,
  };
}

/**
 * Get context-aware tool call processing phrase
 *
 * Uses ProcessingIntelligence for dynamic phrase composition based on context.
 * This is the preferred method for new code.
 *
 * @param toolName - The tool being called
 * @param context - Tool call context
 * @returns SSML-formatted processing phrase with pauses
 */
export function getContextAwareToolProcessing(
  toolName: string,
  context: ToolContext
): { phrase: string; ssml: string; prePause: number; postPause: number } {
  // Determine weight based on tool complexity and context
  const weight = getToolComplexityWeight(toolName, context);

  try {
    const result = getToolCallProcessing(toolName, weight);
    const ssml = formatProcessingAsSSML(result);

    return {
      phrase: result.phrase,
      ssml,
      prePause: result.prePause,
      postPause: result.postPause,
    };
  } catch {
    // Fallback to legacy system
    const legacy = getNaturalToolCall(toolName, context);
    return {
      phrase: legacy.preCallPhrase,
      ssml: legacy.thinkingSound + legacy.preCallPhrase,
      prePause: 200,
      postPause: 200,
    };
  }
}

/**
 * Determine tool complexity weight
 */
function getToolComplexityWeight(
  toolName: string,
  context: ToolContext
): 'light' | 'medium' | 'heavy' {
  const name = toolName.toLowerCase();

  // Heavy operations
  if (
    name.includes('search') ||
    name.includes('analyze') ||
    name.includes('research') ||
    name.includes('complex')
  ) {
    return 'heavy';
  }

  // Light operations
  if (
    name.includes('get') ||
    name.includes('check') ||
    name.includes('status') ||
    name.includes('simple')
  ) {
    return 'light';
  }

  // Consider emotional context
  if (context.isUserDistressed) {
    return 'heavy'; // Take more visible time when user is distressed
  }

  return 'medium';
}

/**
 * Categorize a tool for natural framing
 */
function categorizeToolCall(toolName: string): keyof typeof PRE_CALL_PHRASES {
  const name = toolName.toLowerCase();

  if (name.includes('memory') || name.includes('remember') || name.includes('recall')) {
    return 'memory';
  }
  if (name.includes('calendar') || name.includes('schedule') || name.includes('event')) {
    return 'calendar';
  }
  if (name.includes('search') || name.includes('lookup') || name.includes('find')) {
    return 'search';
  }
  if (name.includes('goal') || name.includes('habit') || name.includes('track')) {
    return 'goals';
  }
  if (name.includes('weather') || name.includes('context') || name.includes('time')) {
    return 'context';
  }

  return 'default';
}

/**
 * Get thinking sound category based on context
 */
function getThinkingSoundCategory(context: ToolContext): keyof typeof THINKING_SOUNDS {
  if (context.isUserDistressed) {
    return 'caring';
  }
  if (context.userMood === 'excited' || context.userMood === 'happy') {
    return 'energetic';
  }
  if (context.userMood === 'curious' || context.userMood === 'interested') {
    return 'curious';
  }
  return 'contemplative';
}

/**
 * Determine how to frame the tool result
 */
function getResultFraming(
  toolName: string,
  context: ToolContext
): NaturalToolCall['resultFraming'] {
  // Distressed users get care framing
  if (context.isUserDistressed) {
    return 'care';
  }

  // Memory tools → story framing
  if (toolName.toLowerCase().includes('memory')) {
    return 'story';
  }

  // Goal/habit tools → action framing
  if (toolName.toLowerCase().includes('goal') || toolName.toLowerCase().includes('habit')) {
    return 'action';
  }

  // Search/lookup → insight framing
  if (toolName.toLowerCase().includes('search') || toolName.toLowerCase().includes('find')) {
    return 'insight';
  }

  // Default to insight
  return 'insight';
}

/**
 * Get post-call transition phrase
 */
function getPostCallTransition(toolName: string, context: ToolContext): string {
  // Distressed users → pause
  if (context.isUserDistressed) {
    const phrases = POST_CALL_TRANSITIONS.toPause;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  // Early in relationship → question
  if (context.relationshipStage === 'new' || (context.turnCount && context.turnCount < 5)) {
    const phrases = POST_CALL_TRANSITIONS.toQuestion;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  // Action-oriented tools → action
  if (toolName.toLowerCase().includes('goal') || toolName.toLowerCase().includes('habit')) {
    const phrases = POST_CALL_TRANSITIONS.toAction;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  // Default → question
  const phrases = POST_CALL_TRANSITIONS.toQuestion;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Determine if tool usage should be hidden from user
 */
function shouldHideToolUsage(toolName: string, context: ToolContext): boolean {
  const name = toolName.toLowerCase();

  // Always hide internal tools
  if (name.includes('internal') || name.includes('system')) {
    return true;
  }

  // Hide context tools (user doesn't need to know we checked the time)
  if (name.includes('context') || name.includes('awareness')) {
    return true;
  }

  // Hide memory retrieval when it's seamless
  if (name.includes('memory') && context.relationshipStage === 'trusted') {
    return true; // Trusted relationships: memory should feel natural, not announced
  }

  return false;
}

// ============================================================================
// RESULT WEAVING
// ============================================================================

/**
 * Weave a tool result into natural conversation
 */
export function weaveToolResult(
  result: unknown,
  framing: NaturalToolCall['resultFraming'],
  context: ToolContext
): string {
  const framingPhrases = RESULT_FRAMINGS[framing];
  const framingPhrase = framingPhrases[Math.floor(Math.random() * framingPhrases.length)];

  // Convert result to string
  let resultText: string;
  if (typeof result === 'string') {
    resultText = result;
  } else if (result && typeof result === 'object') {
    // Extract key information
    const obj = result as Record<string, unknown>;
    if ('speech' in obj && typeof obj.speech === 'string') {
      resultText = obj.speech;
    } else if ('message' in obj && typeof obj.message === 'string') {
      resultText = obj.message;
    } else if ('summary' in obj && typeof obj.summary === 'string') {
      resultText = obj.summary;
    } else {
      resultText = JSON.stringify(result);
    }
  } else {
    resultText = String(result);
  }

  // Don't add framing to very short results
  if (resultText.length < 20) {
    return resultText;
  }

  return `${framingPhrase} ${resultText}`;
}

// ============================================================================
// TOOL DECISION GUIDANCE
// ============================================================================

/**
 * Should we even call this tool right now?
 */
export function shouldCallTool(
  toolName: string,
  context: ToolContext
): { should: boolean; reason: string } {
  // Late night: avoid productivity tools
  if (context.timeOfDay === 'late_night') {
    const name = toolName.toLowerCase();
    if (name.includes('task') || name.includes('productivity') || name.includes('calendar')) {
      return {
        should: false,
        reason: 'Late night - focus on presence, not productivity',
      };
    }
  }

  // New users: avoid complex tools
  if (context.relationshipStage === 'new') {
    const name = toolName.toLowerCase();
    if (name.includes('goal') || name.includes('habit') || name.includes('track')) {
      return {
        should: false,
        reason: 'New relationship - build connection first, tools later',
      };
    }
  }

  // Distressed users: only supportive tools
  if (context.isUserDistressed) {
    const name = toolName.toLowerCase();
    if (!name.includes('ground') && !name.includes('breath') && !name.includes('support')) {
      if (name.includes('task') || name.includes('goal') || name.includes('calendar')) {
        return {
          should: false,
          reason: 'User distressed - focus on support, not tasks',
        };
      }
    }
  }

  return { should: true, reason: 'Tool appropriate for context' };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getNaturalToolCall,
  weaveToolResult,
  shouldCallTool,
};
