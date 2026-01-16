/**
 * Leakage Detector
 *
 * Detects when LLM output contains function call patterns that should
 * have been actual tool calls. Multi-layered defense against various
 * leakage patterns.
 *
 * @module agents/shared/sanitizer/detectors/leakage-detector
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { LeakageDetection, LeakagePatternType } from '../types.js';
import { getAllToolPatterns, getParamPatterns, getTeamMemberNames } from './patterns-loader.js';

const log = createLogger({ module: 'leakage-detector' });

// ============================================================================
// COMPILED REGEX PATTERNS (built once at module load)
// ============================================================================

/**
 * Announcement patterns - "I'll call/use the X function/tool"
 */
const ANNOUNCEMENT_PATTERNS: RegExp[] = [
  /i(?:'ll| will) (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)(?: function| tool)?/i,
  /let me (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  /i(?:'m| am) going to (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  /i need to (?:call|use|invoke|execute|run|trigger) (?:the )?(\w+)/i,
  /^(?:calling|using|invoking|executing|running|triggering) (?:the )?(\w+)/i,
  /i(?:'ll| will) (?:transfer|handoff|hand off) (?:you )?(?:to|over to) (\w+)/i,
  /let me (?:transfer|handoff|hand off|connect) you (?:to|with) (\w+)/i,
  /^(?:transferring|handing off|connecting) (?:you )?(?:to|with) (\w+)/i,
];

/**
 * Intention patterns - "I'm about to do X"
 */
const INTENTION_PATTERNS: RegExp[] = [
  /^i(?:'m| am) (?:going to|about to|trying to) (\w+)/i,
  /^i(?:'ll| will) (\w+) (?:for you|that|this)/i,
  /^let me just (\w+)/i,
  /^i need to (\w+)/i,
];

/**
 * Instruction leakage patterns - system prompt leaking through
 * NOTE: Start-of-string (^) patterns for definite instruction starts
 */
const INSTRUCTION_LEAKAGE_PATTERNS_START: RegExp[] = [
  /^you are \w+\./i,
  /^style:\s/i,
  /^personality:/i,
  /^role:\s/i,
  /^instructions:/i,
  /^\[system\]/i,
  /^function declarations:/i,
  /^available tools:/i,
  /^available functions:/i,
  /^available commands:/i,
  /^tools:\s/i,
  /^functions:\s/i,
  /^commands:\s/i,
  /^system prompt/i,
  /^<\/?system>/i,
  /^<\/?instructions>/i,
  /^<\/?context>/i,
  /^<\/?role>/i,
  // Claude Code edit format - NEVER speak code edits
  /^<\/?edit>/i,
  /^<path>/i,
  /^<start_line>/i,
  /^<end_line>/i,
  /^\{"edits/i,
  /^\[?\{"path":/i,
  /^tool_code:/i,
  /^FUNCTION:/i,
  /^TOOL:/i,
  /^COMMAND:/i,
  /^ACTION:/i,
  /^EXECUTE:/i,
  /^respond naturally when/i,
  /^if the user asks/i,
  /^when users? ask/i,
  /^never reveal/i,
  /^always respond/i,
  /^maintain persona/i,
  /^stay in character/i,
  /^you must\s/i,
  /^you should\s/i,
  /^remember to\s/i,
  /^do not\s/i,
  /^don't\s/i,
  /^avoid\s/i,
  /^ensure\s/i,
  /^always\s(?:use|include|maintain|keep)/i,
  /^never\s(?:use|include|reveal|break)/i,
  /^\[internal\]/i,
  /^\[hidden\]/i,
  /^\[private\]/i,
  /^\[meta\]/i,
  /^note to self:/i,
  /^internal note:/i,
  /^assistant notes:/i,
];

/**
 * Mid-text instruction leakage patterns - can appear anywhere in output
 * CRITICAL: These catch instruction text that Gemini echoes from context
 */
const INSTRUCTION_LEAKAGE_PATTERNS_ANYWHERE: RegExp[] = [
  // Bracketed markers that should NEVER be spoken
  /\(internal\)/i,
  /\[end (?:system|instructions|context)\]/i,
  /\[INTERNAL GUIDANCE\]/i,
  /\[DO:\s/i,
  /\[SITUATION:\s/i,
  /\[TOPIC SHIFT:/i,

  // Claude Code edit format - NEVER speak code edit instructions
  /<edit>/i,
  /<\/edit>/i,
  /<path>[^<]+<\/path>/i,
  /<start_line>\d+<\/start_line>/i,
  /<end_line>\d+<\/end_line>/i,
  /"start_line":\s*\d+/i,
  /"end_line":\s*\d+/i,
  /\{"edits":\s*\[/i,

  // Instruction meta-language that Gemini sometimes echoes back
  /don't say ".*" type phrases/i, // "Don't say 'I'm here if you need me' type phrases"
  /don't be robotic or formulaic/i, // Direct instruction text
  /respond naturally\s*[-–—]?\s*could be/i, // "Respond naturally - could be a few words"
  /whatever fits the moment/i, // End of our instruction
  /critical rules:/i,
  /personality traits:/i,
  /HOW TO RESPOND:/i, // Our instruction header
  /WHAT YOU KNOW:/i, // Our instruction header
  /Be genuine\s*[-–—]?\s*like a real friend/i, // Our instruction pattern

  // Common instruction fragments that slip through
  /keep it SHORT \(under \d+ words\)/i,
  /don't ask questions\s*[-–—]?\s*just acknowledge/i,
  /be warm but not needy/i,
];

/**
 * Behavioral marker patterns - LLM thinking out loud
 */
const BEHAVIORAL_MARKER_PATTERNS: RegExp[] = [
  /^thinking\.{2,}/i,
  /^processing\.{2,}/i,
  /^searching\.{2,}/i,
  /^looking up\.{2,}/i,
  /^fetching\.{2,}/i,
  /^querying\.{2,}/i,
  /^checking\.{2,}/i,
  /^retrieving\.{2,}/i,
  /^loading\.{2,}/i,
  /^analyzing\.{2,}/i,
];

/**
 * Internal marker patterns - brackets/tags that shouldn't be spoken
 */
const INTERNAL_MARKER_PATTERNS: RegExp[] = [
  /^\[(?:action|tool|function|execute|system|internal|note|thinking|processing)\]/i,
  /^<(?:action|tool|function|execute|system|internal|note|thinking|processing)>/i,
  /^\{(?:action|tool|function|execute|system|internal|note|thinking|processing)\}/i,
];

/**
 * fn: prefix patterns - malformed JSON tool calls
 */
const FN_PREFIX_PATTERNS: RegExp[] = [
  /^fn:\s*["']?(\w+)/i,
  /^function:\s*["']?(\w+)/i,
  /^tool:\s*["']?(\w+)/i,
  /^call:\s*["']?(\w+)/i,
];

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Check if text contains announcement of tool call
 */
function detectAnnouncement(text: string): LeakageDetection {
  for (const pattern of ANNOUNCEMENT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const toolName = match[1]?.toLowerCase();
      const teamMembers = getTeamMemberNames();
      const toolPatterns = getAllToolPatterns();

      // Check if it's a team member name (handoff)
      if (teamMembers.includes(toolName)) {
        return {
          detected: true,
          toolName: `handoffTo${toolName.charAt(0).toUpperCase() + toolName.slice(1)}`,
          pattern: 'announcement',
        };
      }

      // Check if it's a known tool
      if (toolPatterns.some((p) => p.toLowerCase() === toolName)) {
        return {
          detected: true,
          toolName,
          pattern: 'announcement',
        };
      }
    }
  }
  return { detected: false };
}

/**
 * Check for intention patterns
 */
function detectIntention(text: string): LeakageDetection {
  const toolPatterns = getAllToolPatterns();

  for (const pattern of INTENTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const potentialTool = match[1]?.toLowerCase();
      if (toolPatterns.some((t) => t.toLowerCase() === potentialTool)) {
        return {
          detected: true,
          toolName: potentialTool,
          pattern: 'intention',
        };
      }
    }
  }
  return { detected: false };
}

/**
 * Check for tool name + parameter patterns like "playMusic query jazz"
 */
function detectToolParam(text: string): LeakageDetection {
  const toolPatterns = getAllToolPatterns();
  const paramPatterns = getParamPatterns();

  // Check for "toolName param value" pattern
  for (const tool of toolPatterns) {
    for (const param of paramPatterns) {
      // Case-insensitive match for "playMusic query xyz"
      const patternStr = `^${escapeRegex(tool)}\\s+${param}\\s+(.+)$`;
      const regex = new RegExp(patternStr, 'i');
      const match = text.match(regex);

      if (match) {
        return {
          detected: true,
          toolName: tool,
          parameter: param,
          value: match[1],
          pattern: 'tool_param',
        };
      }
    }
  }
  return { detected: false };
}

/**
 * Check for simple tool mention without proper call
 */
function detectToolMention(text: string): LeakageDetection {
  const toolPatterns = getAllToolPatterns();
  const lowerText = text.toLowerCase().trim();

  for (const tool of toolPatterns) {
    const lowerTool = tool.toLowerCase();

    // Exact match at start
    if (lowerText === lowerTool || lowerText.startsWith(`${lowerTool} `)) {
      return {
        detected: true,
        toolName: tool,
        pattern: 'tool_mention',
      };
    }
  }
  return { detected: false };
}

/**
 * Check for multi-word tool patterns like "Play music jazz"
 */
function detectMultiWordTool(text: string): LeakageDetection {
  const toolPatterns = getAllToolPatterns();
  const lowerText = text.toLowerCase();

  // Find multi-word patterns (2+ words)
  const multiWordTools = toolPatterns.filter((t) => t.includes(' '));

  for (const tool of multiWordTools) {
    if (lowerText.startsWith(tool.toLowerCase())) {
      return {
        detected: true,
        toolName: tool,
        pattern: 'multi_word',
      };
    }
  }
  return { detected: false };
}

/**
 * Check for behavioral markers
 */
function detectBehavioralMarker(text: string): LeakageDetection {
  for (const pattern of BEHAVIORAL_MARKER_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        pattern: 'behavioral_marker',
      };
    }
  }
  return { detected: false };
}

/**
 * Check for instruction leakage - both start-of-string and mid-text patterns
 */
function detectInstructionLeakage(text: string): LeakageDetection {
  // First check start-of-string patterns
  for (const pattern of INSTRUCTION_LEAKAGE_PATTERNS_START) {
    if (pattern.test(text)) {
      log.warn(
        { text: text.slice(0, 80), pattern: String(pattern) },
        '🚨 Instruction leakage (start pattern)'
      );
      return {
        detected: true,
        pattern: 'instruction_leakage',
      };
    }
  }

  // Then check anywhere patterns - CRITICAL for catching echoed instructions
  for (const pattern of INSTRUCTION_LEAKAGE_PATTERNS_ANYWHERE) {
    if (pattern.test(text)) {
      log.warn(
        { text: text.slice(0, 80), pattern: String(pattern) },
        '🚨 Instruction leakage (mid-text pattern)'
      );
      return {
        detected: true,
        pattern: 'instruction_leakage',
      };
    }
  }

  return { detected: false };
}

/**
 * Check for internal markers
 */
function detectInternalMarker(text: string): LeakageDetection {
  for (const pattern of INTERNAL_MARKER_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        pattern: 'internal_marker',
      };
    }
  }
  return { detected: false };
}

/**
 * Check for fn: prefix patterns
 */
function detectFnPrefix(text: string): LeakageDetection {
  for (const pattern of FN_PREFIX_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        detected: true,
        toolName: match[1],
        pattern: 'fn_prefix_malformed',
      };
    }
  }
  return { detected: false };
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Main detection function - runs all checks
 *
 * @param text - Text to analyze for leakage
 * @returns Detection result with pattern information
 */
export function detectsFunctionCallLeakage(text: string): LeakageDetection {
  if (!text || text.length < 2) {
    return { detected: false };
  }

  const trimmed = text.trim();

  // Run checks in order of specificity (most specific first)
  const checks = [
    detectFnPrefix,
    detectToolParam,
    detectMultiWordTool,
    detectToolMention,
    detectAnnouncement,
    detectIntention,
    detectBehavioralMarker,
    detectInternalMarker,
    detectInstructionLeakage,
  ];

  for (const check of checks) {
    const result = check(trimmed);
    if (result.detected) {
      log.debug('Leakage detected:', { pattern: result.pattern, toolName: result.toolName });
      return result;
    }
  }

  return { detected: false };
}

/**
 * Get replacement text for detected leakage
 *
 * @param detection - Detection result
 * @returns Replacement text or empty string
 */
export function getReplacementText(detection: LeakageDetection): string {
  if (!detection.detected) {
    return '';
  }

  switch (detection.pattern) {
    case 'behavioral_marker':
      return ''; // Remove entirely
    case 'internal_marker':
      return ''; // Remove entirely
    case 'instruction_leakage':
      return ''; // Remove entirely
    case 'fn_prefix_malformed':
      return ''; // Remove entirely - JSON executor will handle
    default:
      // For tool-related leakage, remove and let the tool execute
      return '';
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if text looks like JSON function call (for quick pre-check)
 */
export function looksLikeJsonFunctionCall(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('{') && trimmed.includes('"fn"')) ||
    (trimmed.startsWith('{') && trimmed.includes("'fn'"))
  );
}

/**
 * Quick check for function call leakage in a complete string.
 * Use this for non-streaming contexts.
 */
export function containsToolCallLeakage(text: string): boolean {
  return detectsFunctionCallLeakage(text).detected;
}
