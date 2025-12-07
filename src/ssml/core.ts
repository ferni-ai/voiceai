/**
 * SSML Core Functions
 * 
 * Main SSML tagging and sanitization functions.
 * These are the primary exports used throughout the application.
 */

import {
  FINANCIAL_PRONUNCIATIONS,
  FINANCIAL_START,
  FINANCIAL_END,
} from './constants.js';
import {
  detectEmotion,
  detectPacing,
  detectVolume,
  detectVocalCues,
} from './detection.js';
import { clampSpeed, clampVolume } from './tags.js';

// =============================================================================
// FINANCIAL PRONUNCIATION HANDLING
// =============================================================================

/**
 * Apply financial pronunciation dictionary to text
 */
function applyFinancialPronunciations(text: string): string {
  let result = text;
  
  for (const entry of FINANCIAL_PRONUNCIATIONS) {
    // Reset lastIndex for global regex
    entry.pattern.lastIndex = 0;
    result = result.replace(entry.pattern, (match) => {
      // Wrap replacement in protection markers
      return `${FINANCIAL_START}${entry.replacement}${FINANCIAL_END}`;
    });
  }
  
  return result;
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
// SANITIZATION
// =============================================================================

/**
 * Sanitize malformed SSML output
 * Fixes corrupted tags and removes stage directions like "*chuckles*"
 */
export function sanitizeSsml(text: string): string {
  let result = text;

  // ================================================
  // FIRST: CONVERT laugh/chuckle to [laughter]
  // Cartesia Sonic-3 supports [laughter] for actual laugh sounds
  // ================================================

  result = result.replace(/\*[^*]*(?:chuckle|laugh)[^*]*\*/gi, '[laughter]');
  result = result.replace(/\([^)]*(?:chuckle|laugh)[^)]*\)/gi, '[laughter]');
  result = result.replace(/\[chuckles?\]/gi, '[laughter]');
  result = result.replace(
    /(?<!\[)\b(chuckles?|laughs?)\s*(softly|gently|quietly|to himself|to herself|briefly|warmly)?\s*\.?\s*/gi,
    '[laughter] '
  );
  result = result.replace(
    /(?<!\[)\b(he|she|jack|i)\s+(chuckles?|laughs?)\s*(softly|gently|quietly|briefly|warmly)?\.?\s*/gi,
    '[laughter] '
  );
  result = result.replace(/(?<!\[)\bchuckles?\b[,.!?:;—–-]?\s*/gi, '[laughter] ');
  
  if (/chuckle/i.test(result)) {
    result = result.replace(/\bchuckles?\b/gi, '');
  }
  
  result = result.replace(/(\[laughter\]\s*){2,}/gi, '[laughter] ');

  // ================================================
  // THEN: Remove stage directions
  // ================================================

  // Remove parenthetical actions
  result = result.replace(/\([^)]*(?:sigh|breath|pause|smile|nod|think|clear|cough)[^)]*\)/gi, '');
  
  // Remove bracketed actions (except [laughter])
  result = result.replace(
    /\[[^\]]*(?:sigh|breath|pause|smile|nod|think|clear|cough)[^\]]*\]/gi,
    ''
  );
  
  // Remove asterisk actions
  result = result.replace(/\*[^*]*(?:sigh|breath|pause|smile|nod|think|clear|cough)[^*]*\*/gi, '');
  
  // Remove common standalone stage directions
  result = result.replace(
    /\b(deep breath|long pause|brief pause|sighs heavily|clears throat)\b/gi,
    ''
  );
  
  // Remove non-audio action verbs
  result = result.replace(
    /\b(sighs?|smiles?|grins?|nods?|pauses?|winks?)\s*(softly|gently|quietly|to himself|to herself|briefly|warmly)?\s*\.?\s*/gi,
    ''
  );
  result = result.replace(
    /\b(he|she|jack|i)\s+(sighs?|smiles?|grins?|pauses?|nods?)\s*(softly|gently|quietly|briefly|warmly)?\.?\s*/gi,
    ''
  );
  
  // Nuclear option for remaining action verbs
  result = result.replace(/\bsmiles?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bgrins?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bnods?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bwinks?\b[,.!?:;—–-]?\s*/gi, '');
  result = result.replace(/\bsighs?\b[,.!?:;—–-]?\s*/gi, '');

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
  
  // Clean up multiple spaces
  result = result.replace(/\s{2,}/g, ' ');

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
  // Extract personaId from either form
  const personaId = typeof optionsOrPersonaId === 'string'
    ? optionsOrPersonaId
    : optionsOrPersonaId?.personaId;

  if (!text || text.trim().length === 0) {
    return text;
  }

  // If already has SSML tags, just sanitize
  if (hasSsmlTags(text)) {
    return sanitizeSsml(text);
  }

  // Apply financial pronunciation dictionary FIRST
  let processedText = applyFinancialPronunciations(text);

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

  // Add natural pauses at sentence boundaries
  processedText = addBasicPauses(processedText);

  // Remove protection markers
  processedText = removeProtectionMarkers(processedText);

  // Sanitize malformed SSML
  processedText = sanitizeSsml(processedText);

  tagged += processedText;

  return tagged;
}

/**
 * Add basic pauses at natural break points
 */
function addBasicPauses(text: string): string {
  let result = text;
  
  // Pause after sentences
  result = result.replace(/\.(\s+)([A-Z])/g, '.<break time="200ms"/>$1$2');
  
  // Pause after questions
  result = result.replace(/\?(\s+)([A-Z])/g, '?<break time="250ms"/>$1$2');
  
  // Pause after exclamations
  result = result.replace(/!(\s+)([A-Z])/g, '!<break time="200ms"/>$1$2');
  
  // Brief pause at commas in longer clauses
  result = result.replace(/,(\s+)(\w{20,})/g, ',<break time="100ms"/>$1$2');
  
  return result;
}
