/**
 * SSML Core Functions
 *
 * Main SSML tagging and sanitization functions.
 * These are the primary exports used throughout the application.
 *
 * This is the CANONICAL implementation for SSML processing.
 * Other modules should import from here or from the ssml index.
 *
 * @module ssml/core
 */

import {
  applyThinkingTimeSSML,
  calculateThinkingTime,
  type ThinkingContext,
  type ThinkingInjection,
} from '../conversation/thinking-time-injector.js';
import {
  addBreathGroupPauses,
  injectNaturalFillers,
  type BreathGroupConfig,
  type FillerConfig,
} from '../speech/advanced-humanization.js';
import { applyConsonantSmoothing } from '../speech/consonant-smoothing.js';
import { checkTTSText, trackTTSCheck } from '../speech/tts-monitoring.js';
import { FINANCIAL_END, FINANCIAL_START, STAGE_DIRECTION_KEYWORDS } from './constants.js';
import { detectEmotion, detectPacing, detectVocalCues, detectVolume } from './detection.js';
import { applyPronunciationsOptimized } from './pronunciation-processor.js';
import { clampSpeed, clampVolume } from './tags.js';

// =============================================================================
// XML/SSML SAFETY UTILITIES
// =============================================================================

/**
 * Escape special XML characters to prevent SSML parsing errors.
 * Critical for text that may contain user-generated content.
 */
function escapeXmlCharacters(text: string): string {
  return text
    .replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;') // Escape & but not already-escaped entities
    .replace(/<(?![a-z/!])/gi, '&lt;') // Escape < that aren't part of tags
    .replace(/(?<![a-z"'/])>/g, '&gt;'); // Escape > that aren't part of tags
}

/**
 * Remove or replace emoji with natural language alternatives.
 * TTS engines may read emoji as their Unicode names which sounds unnatural.
 */
function handleEmoji(text: string): string {
  // Common emoji replacements for natural speech
  const emojiReplacements: Record<string, string> = {
    '😊': '',
    '😄': '',
    '😃': '',
    '🙂': '',
    '😀': '',
    '😁': '',
    '🥰': '',
    '😍': '',
    '❤️': '',
    '💜': '',
    '💙': '',
    '💚': '',
    '🧡': '',
    '💛': '',
    '🤍': '',
    '🖤': '',
    '💕': '',
    '💖': '',
    '💗': '',
    '🤗': '',
    '🤔': 'hmm',
    '😢': '',
    '😭': '',
    '😔': '',
    '😞': '',
    '😟': '',
    '🥺': '',
    '👍': '',
    '👎': '',
    '👏': '',
    '🙏': '',
    '✨': '',
    '🎉': '',
    '🎊': '',
    '🔥': '',
    '💪': '',
    '🌟': '',
    '⭐': '',
    '💡': '',
    '📈': '',
    '📉': '',
    '💰': '',
    '💵': '',
    '💸': '',
    '🏠': '',
    '🏡': '',
    '✅': '',
    '❌': '',
    '⚠️': '',
    '🚨': '',
    '💯': '',
    '🤷': '',
    '🤷‍♀️': '',
    '🤷‍♂️': '',
    '😅': '',
    '😂': '[laughter]',
    '🤣': '[laughter]',
  };

  let result = text;

  // Replace known emoji
  for (const [emoji, replacement] of Object.entries(emojiReplacements)) {
    result = result.replace(new RegExp(emoji, 'g'), replacement);
  }

  // Remove any remaining emoji (Unicode ranges for emoji)
  result = result.replace(
    /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
    ''
  );

  return result;
}

/**
 * Handle URLs and emails to prevent letter-by-letter spelling.
 * Converts them to speakable descriptions.
 */
function handleUrlsAndEmails(text: string): string {
  let result = text;

  // Replace URLs with spoken description
  result = result.replace(
    /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)(?:\/[^\s)]*)?/gi,
    (_, domain: string) => {
      const cleanDomain = domain.replace(/\./g, ' dot ');
      return cleanDomain;
    }
  );

  // Replace email addresses
  result = result.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, (email) => {
    const [local, domain] = email.split('@');
    return `${local} at ${domain.replace(/\./g, ' dot ')}`;
  });

  return result;
}

/**
 * Clean up problematic punctuation patterns that TTS engines struggle with.
 */
function cleanPunctuation(text: string): string {
  let result = text;

  // Convert double/triple dashes to single em-dash pause
  result = result.replace(/--+/g, '—');

  // Convert ellipsis variations to standard
  result = result.replace(/\.{3,}/g, '...');

  // Remove multiple exclamation/question marks
  result = result.replace(/!{2,}/g, '!');
  result = result.replace(/\?{2,}/g, '?');
  result = result.replace(/[!?]{2,}/g, '?!');

  // Clean up slash usage (e.g., "and/or" → "and or")
  result = result.replace(/\b(\w+)\/(\w+)\b/g, '$1 or $2');

  return result;
}

// =============================================================================
// FINANCIAL PRONUNCIATION HANDLING
// =============================================================================

/**
 * Apply financial pronunciation dictionary to text.
 *
 * Uses the optimized processor which:
 * - Groups patterns by category (digits, uppercase, symbols, etc.)
 * - Skips entire categories when their required characters aren't present
 * - Reduces average-case complexity significantly for typical text
 *
 * @see pronunciation-processor.ts for implementation details
 */
function applyFinancialPronunciations(text: string): string {
  return applyPronunciationsOptimized(text);
}

/**
 * Remove protection markers from processed text
 */
function removeProtectionMarkers(text: string): string {
  return text
    .replace(new RegExp(FINANCIAL_START, 'g'), '')
    .replace(new RegExp(FINANCIAL_END, 'g'), '');
}

// =============================================================================
// SSML DETECTION
// =============================================================================

/**
 * Check if text already contains SSML tags
 */
export function hasSsmlTags(text: string): boolean {
  return (
    /<(speed|volume|emotion|break|spell)\b/.test(text) ||
    /<\/(speed|volume|emotion|spell)>/.test(text)
  );
}

/**
 * Strip all SSML tags from text, returning plain text
 */
export function stripSsmlTags(text: string): string {
  return text
    .replace(/<speed[^>]*\/?>/gi, '')
    .replace(/<volume[^>]*\/?>/gi, '')
    .replace(/<emotion[^>]*\/?>/gi, '')
    .replace(/<break[^>]*\/?>/gi, '')
    .replace(/<spell>/gi, '')
    .replace(/<\/spell>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// SANITIZATION - CANONICAL IMPLEMENTATION
// =============================================================================

/**
 * Sanitize malformed SSML output
 * Fixes corrupted tags and removes stage directions like "*chuckles*"
 *
 * CRITICAL: This is the safety net that prevents stage directions from being spoken.
 * Any text in *asterisks* or [brackets] that isn't valid SSML should be stripped.
 *
 * This is the CANONICAL implementation - other modules should use this.
 */
export function sanitizeSsml(text: string): string {
  let result = text;

  // ================================================
  // FIRST: CONVERT laugh/chuckle/giggle to [laughter]
  // Cartesia Sonic-3 supports [laughter] for actual laugh sounds
  // ================================================

  // Asterisk format: *chuckles*, *laughs softly*, *laughing*, etc.
  result = result.replace(/\*[^*]*(?:chuckl|laugh|giggl)[^*]*\*/gi, '[laughter]');
  // Parenthesis format: (laughs), (chuckles softly), (laughing), etc.
  result = result.replace(/\([^)]*(?:chuckl|laugh|giggl)[^)]*\)/gi, '[laughter]');
  // Bracket format: [chuckles], [laughs warmly], [laughing], [soft laughter], [gentle giggle], [warm chuckle]
  result = result.replace(/\[[^\]]*(?:chuckl|laugh|giggl|laughter)[^\]]*\]/gi, '[laughter]');
  // Standalone words with modifiers (including -ing forms: laughing, chuckling, giggling)
  result = result.replace(
    /(?<!\[)\b(chuckl(?:es?|ing)|laugh(?:s|ing)?|giggl(?:es?|ing))\s*(softly|gently|quietly|to himself|to herself|briefly|warmly)?\s*\.?\s*/gi,
    '[laughter] '
  );
  result = result.replace(
    /(?<!\[)\b(he|she|jack|ferni|i)\s+(chuckl(?:es?|ing)|laugh(?:s|ing)?|giggl(?:es?|ing))\s*(softly|gently|quietly|briefly|warmly)?\.?\s*/gi,
    '[laughter] '
  );
  // Catch any remaining standalone forms (chuckle, chuckles, chuckling, laugh, laughs, laughing, giggle, giggles, giggling)
  result = result.replace(
    /(?<!\[)\b(chuckl(?:es?|ing)|laugh(?:s|ing)?|giggl(?:es?|ing))\b[,.!?:;—–-]?\s*/gi,
    '[laughter] '
  );

  // Nuclear option: If "chuckle" or "laughing" still appears as stage direction, remove it
  if (/\b(chuckl|laughing|giggling)\b/i.test(result)) {
    result = result.replace(/\b(chuckl(?:es?|ing)?|laughing|giggling)\b/gi, '');
  }

  // Clean up multiple [laughter] tags in a row
  result = result.replace(/(\[laughter\]\s*){2,}/gi, '[laughter] ');

  // ================================================
  // COMPREHENSIVE STAGE DIRECTION REMOVAL
  // Remove ALL non-verbal actions that LLMs might generate
  // ================================================

  // Build regex pattern for stage directions
  const keywordPattern = STAGE_DIRECTION_KEYWORDS.join('|');

  // Remove asterisk-wrapped stage directions: *exhale*, *settles in*, *warm*, etc.
  result = result.replace(new RegExp(`\\*[^*]*(?:${keywordPattern})[^*]*\\*`, 'gi'), '');

  // Remove parenthesis-wrapped stage directions: (sighs), (takes a breath), etc.
  result = result.replace(new RegExp(`\\([^)]*(?:${keywordPattern})[^)]*\\)`, 'gi'), '');

  // Remove bracket-wrapped stage directions (except [laughter]): [pauses], [smiles], etc.
  result = result.replace(new RegExp(`\\[[^\\]]*(?:${keywordPattern})[^\\]]*\\]`, 'gi'), '');

  // Remove common standalone stage direction phrases
  result = result.replace(
    /\b(deep breath|long pause|brief pause|sighs heavily|clears throat|takes a breath|taking a breath)\b/gi,
    ''
  );

  // Remove non-audio action verbs with modifiers
  result = result.replace(
    /\b(sighs?|smiles?|grins?|nods?|pauses?|winks?|exhales?|inhales?|shifts?|leans?|settles?)\s*(softly|gently|quietly|to himself|to herself|briefly|warmly|in|down|up|back)?\s*\.?\s*/gi,
    ''
  );
  result = result.replace(
    /\b(he|she|jack|ferni|maya|jordan|alex|peter|i)\s+(sighs?|smiles?|grins?|pauses?|nods?|exhales?|shifts?|leans?|settles?)\s*(softly|gently|quietly|briefly|warmly)?\.?\s*/gi,
    ''
  );

  // Remove "with a [adjective] smile/tone/voice" phrases
  result = result.replace(
    /\bwith\s+a\s+(?:warm|gentle|soft|teasing|playful|knowing|mischievous|affectionate|slight|small|big|wide)?\s*(?:smile|grin|smirk|tone|voice|look|expression)\b[,.!?:;—–-]?\s*/gi,
    ''
  );

  // Remove "[adjective] smile/tone" at start of sentence or standalone
  result = result.replace(
    /\b(?:teasing|playful|knowing|mischievous|warm|gentle|affectionate)\s+(?:smile|grin|smirk|tone|voice)\b[,.!?:;—–-]?\s*/gi,
    ''
  );

  // Remove multi-word tone descriptors: "playfully sarcastic", "warmly teasing", etc.
  // Pattern: [adverb]? + [tone adjective] (when used as stage direction)
  result = result.replace(
    /\b(?:playfully|warmly|gently|softly|quietly|teasingly|knowingly|mockingly|dryly|wryly|ironically)?\s*(?:sarcastic|teasing|playful|mischievous|knowing|wry|dry|ironic|deadpan|mock)\b[,.!?:;—–-]?\s*/gi,
    ''
  );

  // Remove standalone tone descriptors that might slip through
  result = result.replace(/\bsarcastic(?:ally)?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bwry(?:ly)?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bironic(?:ally)?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bdeadpan\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bmock(?:ing(?:ly)?)?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bdry(?:ly)?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bplayful(?:ly)?\b[,.!?:;—–-]?\s*/gi, '');

  // Nuclear option for action verbs - standalone words
  result = result.replace(/\bsmiles?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bsmiling\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bgrins?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bgrinning\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bnods?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bnodding\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bwinks?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bwinking\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bsighs?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bexhales?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\binhales?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bteasing(ly)?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bsmirk(s|ing)?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bpauses?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bpausing\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bbeams?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bbeaming\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bclaps?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bclapping\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bgasps?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bgasping\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bfrowns?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bfrowning\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bbounces?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bbouncing\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bsniffs?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bsniffling\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bteary\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bemotional(?:ly)?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\btyping sounds?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\blooks? up\b[,.!?:;—–-]?\s*/gi, '');

  // ================================================
  // NUCLEAR: Remove ANY remaining asterisk-wrapped content
  // This catches creative stage directions we didn't anticipate
  // ================================================

  // Remove any remaining *anything* patterns that aren't single words used for emphasis
  // Pattern: asterisk + 2+ words OR asterisk + single word ending in -ly/-ing/-ed
  result = result.replace(/\*[^*]*\s+[^*]*\*/g, ''); // Multi-word asterisk patterns
  result = result.replace(/\*\w+(?:ly|ing|ed|s)\*/gi, ''); // Single word stage direction patterns

  // Final cleanup: any remaining asterisk pairs with stage-direction-like content
  result = result.replace(
    /\*(?:eyes?|accent|rapid|efficient|excitedly?|delighted|enthusiastic)[^*]*\*/gi,
    ''
  );

  // ================================================
  // THEN: Fix malformed SSML tags
  // ================================================

  // Fix malformed break tags
  result = result.replace(/<break\s+time="[^"<]*<[^"]*"\/>/g, '<break time="100ms"/>');

  // Fix malformed speed/volume/emotion tags
  result = result.replace(/<speed\s+ratio="[^"<]*<[^"]*"\/>/g, '');
  result = result.replace(/<volume\s+ratio="[^"<]*<[^"]*"\/>/g, '');
  result = result.replace(/<emotion\s+value="[^"<]*<[^"]*"\/>/g, '');

  // Clean up orphaned tag remnants
  result = result.replace(/(?<!")\s*\/>/g, '');

  // Clean up doubled tags
  result = result.replace(/(<\w+[^>]*\/>)\1+/g, '$1');

  // Clean up excessive breaks
  result = result.replace(/(<break time="[^"]*"\/>){3,}/g, '<break time="200ms"/>');

  // ================================================
  // CONSOLIDATE MULTIPLE SPEED/VOLUME TAGS
  // Multiple <speed> or <volume> tags can cause TTS glitches
  // Keep only the FIRST one (applied nearest to content start)
  // ================================================

  // Consolidate speed tags - keep only the first, remove extras
  const speedMatches = result.match(/<speed ratio="([\d.]+)"\/>/g);
  if (speedMatches && speedMatches.length > 1) {
    let firstKept = false;
    result = result.replace(/<speed ratio="([\d.]+)"\/>/g, (_match, ratio) => {
      if (!firstKept) {
        firstKept = true;
        const clamped = Math.max(0.6, Math.min(1.5, parseFloat(ratio)));
        return `<speed ratio="${clamped.toFixed(2)}"/>`;
      }
      return '';
    });
  }

  // Consolidate volume tags - keep only the first, remove extras
  const volumeMatches = result.match(/<volume ratio="([\d.]+)"\/>/g);
  if (volumeMatches && volumeMatches.length > 1) {
    let firstKept = false;
    result = result.replace(/<volume ratio="([\d.]+)"\/>/g, (_match, ratio) => {
      if (!firstKept) {
        firstKept = true;
        const clamped = Math.max(0.5, Math.min(2.0, parseFloat(ratio)));
        return `<volume ratio="${clamped.toFixed(2)}"/>`;
      }
      return '';
    });
  }

  // Clamp any remaining single speed/volume tags to valid ranges
  result = result.replace(/<speed ratio="([\d.]+)"\/>/g, (_match, ratio) => {
    const clamped = Math.max(0.6, Math.min(1.5, parseFloat(ratio)));
    return `<speed ratio="${clamped.toFixed(2)}"/>`;
  });
  result = result.replace(/<volume ratio="([\d.]+)"\/>/g, (_match, ratio) => {
    const clamped = Math.max(0.5, Math.min(2.0, parseFloat(ratio)));
    return `<volume ratio="${clamped.toFixed(2)}"/>`;
  });

  // Clean up multiple spaces
  result = result.replace(/\s{2,}/g, ' ');

  // ================================================
  // TTS MONITORING: Check for suspicious patterns that slipped through
  // ================================================
  const monitorResult = checkTTSText(result);
  if (monitorResult.hasIssues) {
    trackTTSCheck(monitorResult);
  }

  return result;
}

// =============================================================================
// MAIN TAGGING FUNCTION
// =============================================================================

/**
 * Options for persona-aware SSML tagging.
 */
interface SsmlTagOptions {
  personaId?: string;
  baseSpeed?: number;
  baseVolume?: number;
  humanize?: boolean;

  /** Enable natural filler injection ("um", "well", etc.) - default: true */
  naturalFillers?: boolean;

  /** Enable breath group pacing (pauses at phrase boundaries) - default: true */
  breathGroupPacing?: boolean;

  /** Filler injection config */
  fillerConfig?: FillerConfig;

  /** Breath group config */
  breathConfig?: BreathGroupConfig;

  /** Enable thinking time injection - default: false (must provide context) */
  thinkingTime?: boolean;

  /** Context for thinking time calculation (required if thinkingTime is true) */
  thinkingContext?: ThinkingContext;

  /** Pre-calculated thinking injection (if already computed by awareness system) */
  thinkingInjection?: ThinkingInjection;
}

/**
 * Tag text with SSML for natural speech
 *
 * This is the main function used throughout the application.
 * It applies persona-aware SSML tagging to text.
 *
 * @param text - The text to tag
 * @param optionsOrPersonaId - Either a personaId string or an options object
 * @returns Text with SSML tags applied
 */
export function tagTextWithSsmlPersonaAware(
  text: string,
  optionsOrPersonaId?: string | SsmlTagOptions
): string {
  // Extract options
  const options: SsmlTagOptions =
    typeof optionsOrPersonaId === 'string'
      ? { personaId: optionsOrPersonaId }
      : (optionsOrPersonaId ?? {});

  const {
    personaId,
    naturalFillers = true,
    breathGroupPacing = true,
    fillerConfig,
    breathConfig,
    thinkingTime = false,
    thinkingContext,
    thinkingInjection: providedThinkingInjection,
  } = options;

  if (!text || text.trim().length === 0) {
    return text;
  }

  // If already has SSML tags, just sanitize
  if (hasSsmlTags(text)) {
    return sanitizeSsml(text);
  }

  // ============================================================================
  // PRE-PROCESSING: Clean text before SSML tagging
  // ============================================================================

  // 1. Handle emoji (remove or convert to [laughter] etc.)
  let processedText = handleEmoji(text);

  // 2. Handle URLs and emails (prevent letter-by-letter spelling)
  processedText = handleUrlsAndEmails(processedText);

  // 3. Clean problematic punctuation
  processedText = cleanPunctuation(processedText);

  // 4. Apply financial pronunciation dictionary
  processedText = applyFinancialPronunciations(processedText);

  // 5. Apply consonant cluster smoothing for clearer articulation
  processedText = applyConsonantSmoothing(processedText);

  // 6. Escape XML special characters (must be LAST before SSML tagging)
  processedText = escapeXmlCharacters(processedText);

  // Analyze text
  const emotion = detectEmotion(processedText);
  const { speed: rawSpeed } = detectPacing(processedText);
  const { volume: rawVolume } = detectVolume(processedText);
  const { hasLaughter, hasSigh, laughterCount } = detectVocalCues(processedText);

  // Clamp values to Cartesia's valid ranges
  const speed = clampSpeed(rawSpeed);
  const volume = clampVolume(rawVolume);

  // Build opening tags
  let tagged = `<speed ratio="${speed.toFixed(2)}"/><volume ratio="${volume.toFixed(2)}"/>`;

  if (emotion && emotion !== 'neutral') {
    tagged += `<emotion value="${emotion}"/>`;
  }

  // Add pauses for emotional moments
  if (hasSigh) {
    tagged += '<volume ratio="0.85"/><break time="400ms"/><volume ratio="1.0"/>';
  }

  if (hasLaughter || (emotion === 'affectionate' && (laughterCount ?? 0) > 0)) {
    tagged += '<break time="200ms"/>';
  }

  // ============================================================================
  // THINKING TIME - Awareness-based contextual pauses
  // ============================================================================

  if (thinkingTime && (providedThinkingInjection || thinkingContext)) {
    const injection =
      providedThinkingInjection ||
      (thinkingContext ? calculateThinkingTime(thinkingContext) : null);

    if (injection) {
      processedText = applyThinkingTimeSSML(processedText, injection);
    }
  }

  // ============================================================================
  // ADVANCED HUMANIZATION - Research-backed natural speech
  // ============================================================================

  // Step 1: Inject natural fillers ("um", "well", "you know")
  if (naturalFillers) {
    processedText = injectNaturalFillers(processedText, fillerConfig, personaId);
  }

  // Step 2: Add breath group pacing (pauses at natural phrase boundaries)
  if (breathGroupPacing) {
    processedText = addBreathGroupPauses(processedText, breathConfig);
  }

  // Add natural pauses at sentence boundaries (basic pauses)
  processedText = addBasicPauses(processedText);

  // Remove protection markers
  processedText = removeProtectionMarkers(processedText);

  // Sanitize malformed SSML
  processedText = sanitizeSsml(processedText);

  tagged += processedText;

  return tagged;
}

/**
 * Add natural pauses at break points
 * Enhanced for longer content delivery - "Better than human" pacing
 */
function addBasicPauses(text: string): string {
  let result = text;

  // Count sentences for adaptive pacing
  const sentenceCount = (text.match(/[.!?]+/g) || []).length;
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  const isLongContent = wordCount > 60 || sentenceCount > 4;

  // Longer pauses for longer content - gives breathing room
  const sentencePause = isLongContent ? '300ms' : '200ms';
  const questionPause = isLongContent ? '350ms' : '250ms';
  const listItemPause = isLongContent ? '400ms' : '250ms';

  // Pause after sentences - longer for complex content
  result = result.replace(/\.(\s+)([A-Z])/g, `.<break time="${sentencePause}"/>$1$2`);

  // Pause after questions - thinking room
  result = result.replace(/\?(\s+)([A-Z])/g, `?<break time="${questionPause}"/>$1$2`);

  // Pause after exclamations
  result = result.replace(/!(\s+)([A-Z])/g, '!<break time="200ms"/>$1$2');

  // Brief pause at commas in longer clauses
  result = result.replace(/,(\s+)(\w{20,})/g, ',<break time="100ms"/>$1$2');

  // Pause after colons (often precede lists or explanations)
  result = result.replace(/:(\s+)([A-Z])/g, `:<break time="${listItemPause}"/>$1$2`);

  // Pause after semicolons (related but distinct thoughts)
  result = result.replace(/;(\s+)/g, `;<break time="250ms"/>$1`);

  // Pause before list indicators (first, second, also, another, etc.)
  result = result.replace(
    /(\.\s+)(First|Second|Third|Also|Another|Additionally|Furthermore|Moreover|Finally)\b/gi,
    `$1<break time="${listItemPause}"/>$2`
  );

  // Slow down slightly before important words
  result = result.replace(
    /\b(importantly|crucially|key|essential|main|critical)\b/gi,
    '<break time="150ms"/>$1'
  );

  // Add breathing room after parentheticals
  result = result.replace(/\)(\s+)([A-Z])/g, ')$1<break time="200ms"/>$2');

  return result;
}
