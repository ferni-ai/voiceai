/**
 * Leakage Detector
 *
 * Detects when LLM output contains function call patterns that should
 * have been actual tool calls. Multi-layered defense against various
 * leakage patterns.
 *
 * PERFORMANCE: Uses Rust native JSON parser when available for:
 * - SIMD-accelerated JSON function call detection (memchr)
 * - Aho-Corasick O(n) multi-pattern matching for tool names
 * - 2-5x faster than pure JS regex in the TTS hot path
 *
 * @module agents/shared/sanitizer/detectors/leakage-detector
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { LeakageDetection, LeakagePatternType } from '../types.js';
import { getAllToolPatterns, getParamPatterns, getTeamMemberNames } from './patterns-loader.js';
import {
  likelyContainsFunctionCall as nativeLikelyContains,
  containsAnyToolName,
  buildToolNameAutomaton,
  isNativeJsonParserAvailable,
  extractFunctionCalls,
} from '../../native-json-parser.js';

const log = createLogger({ module: 'leakage-detector' });

// ============================================================================
// NATIVE ACCELERATION STATE
// ============================================================================

let nativeInitialized = false;
let nativeAvailable = false;

/**
 * Initialize native acceleration for leakage detection.
 * Call this once at startup after tool patterns are loaded.
 *
 * Builds Aho-Corasick automaton for O(n) multi-pattern matching.
 */
export function initializeNativeAcceleration(): void {
  if (nativeInitialized) return;
  nativeInitialized = true;

  nativeAvailable = isNativeJsonParserAvailable();

  if (nativeAvailable) {
    // Build Aho-Corasick automaton with all tool patterns
    const toolPatterns = getAllToolPatterns();
    const teamMembers = getTeamMemberNames();

    // Combine tool patterns with team member names for comprehensive matching
    const allPatterns = [...new Set([...toolPatterns, ...teamMembers])];

    if (allPatterns.length > 0) {
      const success = buildToolNameAutomaton(allPatterns);
      if (success) {
        log.info(
          { patternCount: allPatterns.length, native: true },
          '🦀 Leakage detector using Rust Aho-Corasick (O(n) matching)'
        );
      } else {
        nativeAvailable = false;
        log.warn('Failed to build native automaton, falling back to JS');
      }
    }
  } else {
    log.debug('Native JSON parser not available, using JS fallback');
  }
}

/**
 * Check if native acceleration is active.
 */
export function isNativeAccelerationActive(): boolean {
  return nativeAvailable;
}

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
  // Handoff patterns - flexible word order for "hand you off" vs "hand off to you"
  /i(?:'ll| will) (?:transfer|handoff|hand off|connect) (?:you )?(?:to|over to|with) (\w+)/i,
  /i(?:'ll| will) (?:hand you off|connect you) (?:to|with) (\w+)/i,
  /i(?:'m| am) (?:transferring|handing off|connecting) (?:you )?(?:to|with) (\w+)/i,
  /let me (?:transfer|handoff|hand off|connect) (?:you )?(?:to|with) (\w+)/i,
  /let me (?:hand you off|connect you) (?:to|with) (\w+)/i,
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
 * Music announcement patterns - "I'll play X for you"
 * These are specific patterns for music-related tool call announcements
 */
const MUSIC_ANNOUNCEMENT_PATTERNS: RegExp[] = [
  /^i(?:'ll| will) play\b/i,          // "I'll play jazz for you"
  /^let me play\b/i,                  // "Let me play that song"
  /^i(?:'m| am) going to play\b/i,    // "I'm going to play some music"
  /^playing\b.*\bfor you/i,           // "Playing some jazz for you"
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
 * Also includes [INTERNAL:...] markers which should be suppressed
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
  // [INTERNAL:...] markers from tool responses that should NEVER be spoken
  /^\[INTERNAL:/i,
  /^\[INTERNAL\s*:/i,
];

/**
 * Internal instruction patterns - "do NOT read this" type messages
 * These are tool-generated instructions that should be suppressed
 */
const INTERNAL_INSTRUCTION_PATTERNS: RegExp[] = [
  /do NOT read this/i,
  /don't read this/i,
  /not to be spoken/i,
  /for internal use only/i,
  /respond naturally\s*[-–—]?\s*do NOT/i,
  /do NOT read this aloud/i,
  /do NOT read this message/i,
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

/**
 * Function call syntax patterns - toolName() or toolName(args)
 */
const FUNCTION_CALL_SYNTAX_PATTERNS: RegExp[] = [
  /^(\w+)\(\s*\)/,                          // playMusic()
  /^(\w+)\(\s*[^)]+\s*\)/,                  // playMusic(query: 'jazz')
  /^(\w+)\s*\(\s*(['"])[^'"]*\2\s*\)/,      // playMusic('jazz')
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
 * Check for music announcement patterns
 * These catch "I'll play jazz" type phrases that should trigger playMusic tool
 */
function detectMusicAnnouncement(text: string): LeakageDetection {
  for (const pattern of MUSIC_ANNOUNCEMENT_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        toolName: 'playMusic',
        pattern: 'announcement',
      };
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
 * Check for internal instruction patterns ("do NOT read this" etc.)
 */
function detectInternalInstruction(text: string): LeakageDetection {
  for (const pattern of INTERNAL_INSTRUCTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        pattern: 'internal_instruction',
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

/**
 * Check for function call syntax patterns like toolName() or toolName(args)
 */
function detectFunctionCallSyntax(text: string): LeakageDetection {
  const toolPatterns = getAllToolPatterns();

  for (const pattern of FUNCTION_CALL_SYNTAX_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const potentialTool = match[1];
      // Check if the captured name matches a known tool pattern
      if (toolPatterns.some((t) => t.toLowerCase() === potentialTool.toLowerCase())) {
        return {
          detected: true,
          toolName: potentialTool,
          pattern: 'fn_prefix_malformed', // Use same pattern type for function call syntax
        };
      }
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
 * PERFORMANCE: Uses native Rust acceleration when available:
 * - Aho-Corasick for O(n) tool name detection (vs O(n×p) regex)
 * - SIMD-accelerated JSON function call extraction
 * - 2-5x faster in the TTS streaming hot path
 *
 * @param text - Text to analyze for leakage
 * @returns Detection result with pattern information
 */
export function detectsFunctionCallLeakage(text: string): LeakageDetection {
  if (!text || text.length < 2) {
    return { detected: false };
  }

  const trimmed = text.trim();

  // =========================================================================
  // NATIVE FAST PATH: Use Rust simd-json for JSON function call detection
  // =========================================================================
  if (nativeAvailable) {
    // Check for JSON function calls using SIMD-accelerated parsing
    const scanResult = extractFunctionCalls(trimmed);
    if (scanResult.hasCalls && scanResult.calls.length > 0) {
      const call = scanResult.calls[0];
      return {
        detected: true,
        toolName: call.fnName,
        pattern: 'fn_prefix_malformed',
      };
    }
  }

  // =========================================================================
  // STANDARD DETECTION PIPELINE
  // =========================================================================

  // Run checks in order of specificity (most specific first)
  const checks = [
    detectFnPrefix,
    detectFunctionCallSyntax,   // Catches playMusic(), handoffToMaya() syntax
    detectToolParam,
    detectMultiWordTool,
    detectToolMention,
    detectAnnouncement,
    detectMusicAnnouncement,     // Catches "I'll play jazz" music announcements
    detectIntention,
    detectBehavioralMarker,      // Catches [INTERNAL:...] markers
    detectInternalInstruction,   // Catches "do NOT read this" patterns
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
    case 'internal_instruction':
      return ''; // Remove entirely - "do NOT read this" patterns
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
 *
 * PERFORMANCE: Uses Rust memchr for fast byte searching when available.
 * Native version is 2-5x faster than JS string operations.
 */
export function looksLikeJsonFunctionCall(text: string): boolean {
  // Use native SIMD-accelerated check when available
  if (nativeAvailable) {
    return nativeLikelyContains(text);
  }

  // JS fallback
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
