/**
 * Tool Call Text Sanitizer
 *
 * Detects and filters out malformed function-call-like text that Gemini
 * sometimes outputs instead of making actual function calls.
 *
 * Examples of what we're catching:
 * - "Play music query christmas music" (should be a playMusic() call)
 * - "I'll call the playMusic function" (should just call it)
 * - "Let me transfer you to Maya" (should call handoffToMaya)
 * - "I'm going to use the getWeather tool" (should call the tool)
 * - "Calling handoffToMaya with target Maya" (function call as text)
 *
 * This is a defensive filter - the proper fix is in Gemini's function calling
 * configuration, but this catches any leakage.
 */

import { createLogger } from '../../utils/safe-logger.js';

// TransformStream is available globally in Node.js 18+
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTransformStream = any;

const log = createLogger({ module: 'tool-call-sanitizer' });

/**
 * Known tool names that might leak into spoken output.
 * Add new tool names here as they're created.
 *
 * NOTE: We use case-insensitive matching for most patterns, so only need
 * the camelCase version. Multiple casings only for common spoken forms.
 */
const TOOL_NAME_PATTERNS = [
  // Music tools
  'playMusic',
  'play music',
  'Play music',
  'Playing music', // Gerund form - "Playing music query"
  'playing music',
  'searchMusic',
  'search music',
  'Searching music',
  'searching music',
  'pauseMusic',
  'pause music',
  'Pausing music',
  'resumeMusic',
  'resume music',
  'stopMusic',
  'stop music',
  'whatsPlaying',
  'whats playing',

  // Memory tools
  'rememberAboutUser',
  'remember about user',
  'rememberName',
  'recallFromMemory',
  'recall from memory',
  'forgetMemory',
  'updateMemory',

  // Information tools
  'getWeather',
  'get weather',
  'getWeatherForecast',
  'searchNews',
  'search news',
  'getNews',
  'getCurrentTime',
  'get current time',
  'searchWeb',
  'search web',

  // Handoff tools
  'handoffTo',
  'handoff to',
  'transferTo',
  'transfer to',
  'handoffToMaya',
  'handoffToAlex',
  'handoffToPeter',
  'handoffToJordan',
  'handoffToNayan',
  'handoffToFerni',

  // Crisis/Wellness tools (CRITICAL - must not leak)
  'getCrisisResources',
  'get crisis resources',
  'groundingExercise',
  'grounding exercise',
  'performBreathingExercise',
  'breathing exercise',
  'getEmergencyServices',
  'getCrisisHotlines',
  'logMood',
  'getMoodHistory',

  // Habit/Productivity tools
  'addHabit',
  'add habit',
  'trackHabit',
  'completeHabit',
  'skipHabit',
  'deleteHabit',
  'updateHabit',
  'getHabitStats',
  'getHabitStreak',
  'setTimer',
  'set timer',
  'getTimer',
  'cancelTimer',
  'addTask',
  'getTasks',
  'completeTask',

  // Calendar/Scheduling tools
  'scheduleEvent',
  'schedule event',
  'getEvents',
  'cancelEvent',
  'updateEvent',
  'addGuests',

  // Communication tools
  'sendMessage',
  'send message',
  'sendEmail',
  'send email',
  'analyzeMessage',

  // Finance tools
  'getQuote',
  'getMarketStatus',
  'getBudgetSummary',
  'trackExpense',
  'payBill',
  'addBill',

  // Goal/Planning tools
  'addGoal',
  'updateGoal',
  'getGoals',
  'addGoalMilestone',
  'setFinancialGoal',

  // Conversation tools
  'noteEmotionalState',
  'shareStory',
  'endConversation',
  'gracefulExit',

  // Cameo tools
  'inviteCameo',
  'completeCameo',
];

/**
 * Parameter names that indicate function call leakage.
 */
const PARAM_PATTERNS = ['query', 'Query', 'search', 'Search', 'input', 'Input', 'text', 'Text'];

/**
 * Phrases that indicate Gemini is TALKING ABOUT calling a function
 * instead of actually calling it.
 */
const TOOL_CALL_ANNOUNCEMENT_PATTERNS = [
  // "I'll call/use the X function/tool"
  /i(?:'ll| will) (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)(?: function| tool)?/i,
  // "Let me call/use X"
  /let me (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  // "I'm going to call/use X"
  /i(?:'m| am) going to (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  // "I need to call/use X"
  /i need to (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  // "Calling X" or "Using X tool"
  /^(?:calling|using|invoking|executing|running|triggering) (?:the )?(\w+)/i,
  // "I'll transfer you to X" / "Let me transfer you to X"
  /(?:i(?:'ll| will)|let me) transfer (?:you )?to (\w+)/i,
  // "Transferring to X" / "Transferring you to X"
  /transferring (?:you )?to (\w+)/i,
  // "I'll connect you with X"
  /(?:i(?:'ll| will)|let me) connect you (?:with|to) (\w+)/i,
  // "Connecting you with/to X"
  /connecting you (?:with|to) (\w+)/i,
  // "I'll hand you off to X"
  /(?:i(?:'ll| will)|let me) hand (?:you )?off to (\w+)/i,
  // "I'll get X to help" (team member names)
  /(?:i(?:'ll| will)|let me) get (\w+) to help/i,
  // Function call syntax: "functionName(args)" or "functionName()"
  /(\w+)\s*\([^)]*\)/,
  // JSON-like: {"function": "X", ...} or {"name": "X", ...}
  /\{\s*"(?:function|name|tool)":\s*"(\w+)"/i,
  // "The X function" or "the X tool" when describing what to do
  /(?:use|call|invoke|execute) the (\w+) (?:function|tool)/i,
];

/**
 * Team member names that indicate handoff announcements
 */
const TEAM_MEMBER_NAMES = ['maya', 'alex', 'peter', 'jordan', 'nayan'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Result type for tool call detection */
interface LeakageDetection {
  detected: boolean;
  toolName?: string;
  parameter?: string;
  value?: string;
  pattern?: string;
}

/** Check if a name matches known tools or team members */
function isKnownToolOrTeamMember(name: string): boolean {
  const lowerName = name.toLowerCase();
  const isKnownTool = TOOL_NAME_PATTERNS.some(
    (t) => t.toLowerCase() === lowerName || t.toLowerCase().includes(lowerName)
  );
  return isKnownTool || TEAM_MEMBER_NAMES.includes(lowerName);
}

/** Check for announcement patterns like "I'll call the X function" */
function checkAnnouncementPatterns(text: string): LeakageDetection | null {
  for (const pattern of TOOL_CALL_ANNOUNCEMENT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] && isKnownToolOrTeamMember(match[1])) {
      return { detected: true, toolName: match[1], pattern: 'announcement' };
    }
  }
  return null;
}

/** Check for intention patterns like "I'll play jazz for you" */
function checkIntentionPatterns(text: string): LeakageDetection | null {
  const intentionPatterns = [
    /i(?:'ll| will) (?:play|find|search for|look up|get|fetch) (?:some )?(.+?) (?:for you|now)/i,
    /let me (?:play|find|search for|look up|get|fetch) (?:some )?(.+?) (?:for you)?/i,
  ];

  for (const pattern of intentionPatterns) {
    const match = text.match(pattern);
    if (match?.[1] && text.length < 80) {
      return {
        detected: true,
        toolName: 'implied_tool_call',
        value: match[1],
        pattern: 'intention',
      };
    }
  }
  return null;
}

/** Check for "toolName paramName value" pattern */
function checkToolParamPattern(lowerText: string): LeakageDetection | null {
  for (const toolPattern of TOOL_NAME_PATTERNS) {
    const lowerPattern = toolPattern.toLowerCase();
    if (!lowerText.startsWith(lowerPattern)) continue;

    const remainder = lowerText.slice(lowerPattern.length).trim();
    for (const paramPattern of PARAM_PATTERNS) {
      if (remainder.startsWith(paramPattern.toLowerCase())) {
        const value = remainder.slice(paramPattern.length).trim();
        return {
          detected: true,
          toolName: toolPattern,
          parameter: paramPattern,
          value: value || undefined,
          pattern: 'tool_param',
        };
      }
    }
  }
  return null;
}

/** Check for tool names with "function" or "tool" suffix */
function checkToolMentionPattern(text: string): LeakageDetection | null {
  for (const toolPattern of TOOL_NAME_PATTERNS) {
    const regex = new RegExp(
      `\\b${toolPattern.replace(/\s+/g, '\\s*')}\\s*(?:function|tool)\\b`,
      'i'
    );
    if (regex.test(text)) {
      return { detected: true, toolName: toolPattern, pattern: 'tool_mention' };
    }
  }
  return null;
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Check if text looks like a malformed function call.
 *
 * Patterns we detect:
 * - "functionName paramName value" (e.g., "playMusic query jazz")
 * - "I'll call the X function" announcements
 * - "Transferring you to Maya" handoff announcements
 * - Function call syntax like functionName() or JSON-like patterns
 * - [INTERNAL: ...] tool response markers that shouldn't be spoken
 */
export function detectsFunctionCallLeakage(text: string): LeakageDetection {
  const trimmed = text.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  // 0. CRITICAL: Check for [INTERNAL: ...] tool response markers
  // These are instructions from tools that should NEVER be spoken
  const internalMatch = trimmed.match(/\[INTERNAL:\s*([^\]]+)\]/i);
  if (internalMatch) {
    log.warn({ text: trimmed }, '🚨 INTERNAL MARKER DETECTED - Tool response leaked to output');
    return {
      detected: true,
      toolName: 'internal_marker',
      value: internalMatch[1],
      pattern: 'internal_marker',
    };
  }

  // 0b. Check for "do NOT read this" patterns that tools sometimes add
  if (
    lowerTrimmed.includes('do not read this') ||
    lowerTrimmed.includes("don't read this") ||
    lowerTrimmed.includes('do not speak this') ||
    lowerTrimmed.includes("don't speak this") ||
    lowerTrimmed.includes('respond naturally') ||
    lowerTrimmed.includes('for internal use only')
  ) {
    log.warn(
      { text: trimmed },
      '🚨 INTERNAL INSTRUCTION DETECTED - Tool response with speak instruction'
    );
    return {
      detected: true,
      toolName: 'internal_instruction',
      pattern: 'internal_instruction',
    };
  }

  // 1. Announcement patterns: "I'll call the playMusic function"
  const announcement = checkAnnouncementPatterns(trimmed);
  if (announcement) {
    log.warn({ text: trimmed, ...announcement }, '🚨 TOOL CALL ANNOUNCEMENT DETECTED');
    return announcement;
  }

  // 2. Intention patterns: "I'll play jazz for you"
  const intention = checkIntentionPatterns(trimmed);
  if (intention) return intention;

  // 3. Tool + param pattern: "playMusic query jazz"
  const toolParam = checkToolParamPattern(lowerTrimmed);
  if (toolParam) return toolParam;

  // 4. Tool mention: "the playMusic function"
  const toolMention = checkToolMentionPattern(trimmed);
  if (toolMention) return toolMention;

  // 5. Multi-word pattern: "Play music query christmas"
  const words = lowerTrimmed.split(/\s+/);
  if (words.length >= 3) {
    const possibleTool = words.slice(0, 2).join(' ');
    const possibleParam = words[2];

    const matchedTool = TOOL_NAME_PATTERNS.find((t) => t.toLowerCase() === possibleTool);
    if (matchedTool && PARAM_PATTERNS.some((p) => p.toLowerCase() === possibleParam)) {
      return {
        detected: true,
        toolName: matchedTool,
        parameter: possibleParam,
        value: words.slice(3).join(' ') || undefined,
        pattern: 'multi_word',
      };
    }
  }

  return { detected: false };
}

/** Helper to check if tool name matches a category */
function toolMatches(toolName: string, ...keywords: string[]): boolean {
  const lower = toolName.toLowerCase();
  return keywords.some((k) => lower.includes(k)) || TEAM_MEMBER_NAMES.includes(lower);
}

/** Get replacement text for a detected tool call leak */
function getReplacementText(detection: LeakageDetection): string {
  const toolNameLower = detection.toolName?.toLowerCase() || '';

  // CRITICAL: Internal markers and instructions - ALWAYS suppress silently
  // These are tool responses that should never be spoken
  if (detection.pattern === 'internal_marker' || detection.pattern === 'internal_instruction') {
    return '';
  }

  // Handoffs - suppress (tool handles transition)
  if (
    toolMatches(toolNameLower, 'handoff', 'transfer') ||
    TEAM_MEMBER_NAMES.includes(toolNameLower)
  ) {
    return '';
  }

  // Music - natural acknowledgment
  if (toolMatches(toolNameLower, 'music', 'play')) {
    return detection.value
      ? `Let me find ${detection.value} for you.`
      : 'Let me find that for you.';
  }

  // Information tools - acknowledgment
  if (toolMatches(toolNameLower, 'weather', 'search', 'news', 'time')) {
    return 'Let me check on that.';
  }

  // Memory tools - silent
  if (toolMatches(toolNameLower, 'remember', 'recall', 'memory', 'note')) {
    return '';
  }

  // Crisis/wellness tools - CRITICAL: suppress silently, don't draw attention
  if (toolMatches(toolNameLower, 'crisis', 'emergency', 'grounding', 'breathing', 'mood')) {
    return '';
  }

  // Habit/productivity tools - silent
  if (toolMatches(toolNameLower, 'habit', 'timer', 'task', 'goal')) {
    return '';
  }

  // Conversation management tools - silent
  if (toolMatches(toolNameLower, 'emotional', 'story', 'exit', 'conversation')) {
    return '';
  }

  // Intention patterns
  if (detection.pattern === 'intention' && detection.value) {
    return `Let me find ${detection.value} for you.`;
  }

  // Default: suppress to let tool result speak
  return '';
}

/**
 * Sanitize text by removing function-call-like content.
 *
 * @param text - Raw text from LLM
 * @returns Sanitized text safe for TTS
 */
export function sanitizeToolCallLeakage(text: string): string {
  const detection = detectsFunctionCallLeakage(text);

  if (detection.detected) {
    log.warn(
      {
        originalText: text,
        toolName: detection.toolName,
        parameter: detection.parameter,
        value: detection.value,
        pattern: detection.pattern,
      },
      '🚨 TOOL CALL LEAKAGE DETECTED - Gemini output function call text instead of calling function'
    );

    return getReplacementText(detection);
  }

  return text;
}

/**
 * Patterns that might be the start of a tool call (for partial matching)
 */
const PARTIAL_TOOL_PREFIXES = [
  'play', 'remember', 'recall', 'hand', 'get', 'set', 'add', 'update', 'create',
  'search', 'send', 'schedule', 'cancel', 'delete', 'track', 'log', 'stop',
  'pause', 'resume', 'crisis', 'grounding', 'breathing', 'invoke',
  '[INTERNAL', '[internal', 'Transferring', "I'll call", "Let me use",
  'rememberName', 'noteEmotional', 'gracefulExit', 'endConversation',
];

/**
 * Check if buffer might be the start of a tool call pattern
 */
function mightBePartialToolCall(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return PARTIAL_TOOL_PREFIXES.some(prefix =>
    trimmed.startsWith(prefix.toLowerCase()) ||
    prefix.toLowerCase().startsWith(trimmed)
  );
}

/**
 * Create a transform stream that filters function-call-like text.
 *
 * This can be used in the transcriptionNode to sanitize output before TTS.
 *
 * EDGE CASE FIX: The buffer now properly handles:
 * - Tool patterns that span chunks (e.g., "playMu" + "sic query jazz")
 * - Partial matches that need more context before deciding
 */
export function createSanitizerTransformStream(): AnyTransformStream {
  let buffer = '';
  let suppressMode = false;
  let waitForMoreContext = false;

  /** Check for sentence boundary to reset suppression */
  const isSentenceBoundary = (text: string): boolean =>
    text.includes('.') || text.includes('!') || text.includes('?');

  /** Check if we have a natural word boundary (space, punctuation) */
  const hasWordBoundary = (text: string): boolean =>
    /\s|[.,!?;:]/.test(text);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  return new (globalThis as any).TransformStream({
    transform(chunk: string, controller: { enqueue: (s: string) => void }) {
      buffer += chunk;

      // If in suppress mode, wait for sentence boundary then reset
      if (suppressMode) {
        if (isSentenceBoundary(chunk)) {
          suppressMode = false;
          buffer = '';
          waitForMoreContext = false;
        }
        return;
      }

      // Check for leakage in current buffer
      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        log.warn(
          { buffer, ...detection },
          '🚨 STREAMING TOOL CALL LEAKAGE - Filtering malformed output'
        );

        // Get and emit replacement text (may be empty)
        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(`${replacement} `);
        }

        suppressMode = true;
        buffer = '';
        waitForMoreContext = false;
        return;
      }

      // EDGE CASE: Check if buffer might be partial tool call
      // If buffer is short and looks like it could become a tool call, wait for more
      if (buffer.length < 50 && mightBePartialToolCall(buffer)) {
        waitForMoreContext = true;
        return; // Don't emit yet, need more context
      }

      // If we were waiting but now have a word boundary, we can safely emit
      // the safe prefix and continue checking the rest
      if (waitForMoreContext && hasWordBoundary(chunk) && buffer.length > 30) {
        // Recheck with more context
        const recheckDetection = detectsFunctionCallLeakage(buffer);
        if (recheckDetection.detected) {
          const replacement = getReplacementText(recheckDetection);
          if (replacement) {
            controller.enqueue(`${replacement} `);
          }
          suppressMode = true;
          buffer = '';
          waitForMoreContext = false;
          return;
        }
        waitForMoreContext = false;
      }

      // Pass through if buffer is long enough and no pattern detected
      // Increased threshold to give more context for detection
      if (buffer.length > 150 && !waitForMoreContext) {
        controller.enqueue(buffer);
        buffer = '';
      }
    },

    flush(controller: { enqueue: (s: string) => void }) {
      // Final check on remaining buffer
      if (buffer && !suppressMode) {
        const finalCheck = detectsFunctionCallLeakage(buffer);
        if (finalCheck.detected) {
          const replacement = getReplacementText(finalCheck);
          if (replacement) {
            controller.enqueue(replacement);
          }
        } else {
          controller.enqueue(buffer);
        }
      }
    },
  });
}

/**
 * Quick check for function call leakage in a complete string.
 * Use this for non-streaming contexts.
 */
export function containsToolCallLeakage(text: string): boolean {
  return detectsFunctionCallLeakage(text).detected;
}
