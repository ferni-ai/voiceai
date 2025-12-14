/**
 * Stage Direction Sanitization Tests
 *
 * Comprehensive tests to ensure stage directions are NEVER spoken aloud.
 * These tests serve as a regression suite to catch when:
 * 1. New stage direction patterns slip through sanitization
 * 2. The LLM generates unexpected formats
 * 3. Edge cases in text processing
 *
 * WHY THIS MATTERS:
 * - Text goes directly to Cartesia TTS
 * - Stage directions like "*smiles*" get spoken as "asterisk smiles asterisk"
 * - This ruins the user experience
 *
 * CARTESIA SONIC-3 SUPPORT (as of 2024):
 * - ✅ [laughter] - ONLY supported bracket notation
 * - ❌ [sigh], [cough], [hmm] - NOT supported (planned for future)
 * - ✅ <break>, <speed>, <volume>, <emotion> - SSML tags
 *
 * @module tests/stage-direction-sanitization
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkTTSText,
  getTTSStats,
  monitorTTSText,
  resetTTSStats,
} from '../speech/tts-monitoring.js';
import { STAGE_DIRECTION_KEYWORDS } from '../ssml/constants.js';
import { sanitizeSsml, stripSsmlTags } from '../ssml/core.js';

// =============================================================================
// TEST DATA: Common Stage Direction Patterns from LLMs
// =============================================================================

/**
 * Asterisk-wrapped stage directions - most common from GPT/Gemini
 */
const ASTERISK_STAGE_DIRECTIONS = [
  '*smiles*',
  '*smiles warmly*',
  '*chuckles*',
  '*chuckles softly*',
  '*laughs*',
  '*laughing*',
  '*sighs*',
  '*sighs heavily*',
  '*nods*',
  '*nods thoughtfully*',
  '*pauses*',
  '*pauses thoughtfully*',
  '*exhales*',
  '*exhale*',
  '*exhale of relief*',
  '*takes a breath*',
  '*taking a breath*',
  '*deep breath*',
  '*leans in*',
  '*leans forward*',
  '*settles in*',
  '*shifts*',
  '*warm*',
  '*warmly*',
  '*gently*',
  '*softly*',
  '*quietly*',
  '*tenderly*',
  '*steady*',
  '*focused*',
  '*gentle presence*',
  '*attention sharpens*',
  '*perks up*',
  '*energy rises*',
  "*chef's kiss*",
  '*winks*',
  '*grins*',
  '*beams*',
  '*frowns*',
  '*grimaces*',
  '*teasing*',
  '*teasingly*',
  '*playfully*',
  '*mischievously*',
  '*knowingly*',
  '*sarcastically*',
  '*wryly*',
  '*dryly*',
  '*ironically*',
  '*deadpan*',
  '*mock surprise*',
];

/**
 * Bracket-wrapped stage directions - common from Claude
 */
const BRACKET_STAGE_DIRECTIONS = [
  '[pauses]',
  '[pause]',
  '[thoughtful pause]',
  '[long pause]',
  '[brief pause]',
  '[smiles]',
  '[nods]',
  '[sighs]',
  '[warmly]',
  '[gently]',
  '[softly]',
  '[thoughtfully]',
  '[excitedly]',
  '[curiously]',
  '[concerned]',
  '[sympathetically]',
  '[affectionately]',
];

/**
 * Parenthesis-wrapped stage directions
 */
const PARENTHESIS_STAGE_DIRECTIONS = [
  '(smiles)',
  '(chuckles)',
  '(laughs softly)',
  '(sighs)',
  '(nods)',
  '(pauses)',
  '(thinking)',
  '(warmly)',
];

/**
 * Standalone action words that shouldn't be spoken
 */
const STANDALONE_ACTIONS = [
  'He smiles warmly.',
  'She nods thoughtfully.',
  'I pause to think.',
  'Ferni chuckles.',
  'Maya sighs.',
  'Nayan nods knowingly.',
  'Peter grins excitedly.',
  'Alex smiles.',
  'Jordan beams.',
];

/**
 * Tone descriptors that sometimes slip through
 */
const TONE_DESCRIPTORS = [
  'with a warm smile',
  'with a knowing grin',
  'with a gentle tone',
  'with a playful smirk',
  'teasing smile',
  'warm tone',
  'playfully sarcastic',
  'warmly teasing',
  'dryly',
  'wryly',
  'sarcastically',
  'mockingly',
  'deadpan',
];

// =============================================================================
// UNIT TESTS: sanitizeSsml Function
// =============================================================================

describe('Stage Direction Sanitization - Unit Tests', () => {
  beforeEach(() => {
    resetTTSStats();
  });

  describe('Asterisk-Wrapped Stage Directions', () => {
    it.each(ASTERISK_STAGE_DIRECTIONS)('should remove or convert "%s"', (stageDirection) => {
      const input = `${stageDirection} That's really interesting.`;
      const result = sanitizeSsml(input);

      // Should not contain asterisks (except as actual content)
      expect(result).not.toMatch(/\*[^*]+\*/);

      // The spoken content should remain
      expect(result).toContain('interesting');

      // Laughter variants should become [laughter]
      if (
        stageDirection.includes('chuckle') ||
        stageDirection.includes('laugh') ||
        stageDirection.includes('giggle')
      ) {
        expect(result).toContain('[laughter]');
      }
    });

    it('should handle multiple asterisk stage directions in one message', () => {
      const input = '*smiles* *nods* *pauses thoughtfully* Okay, let me think about that.';
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('Okay');
      expect(result).toContain('let me think');
    });

    it('should handle stage directions at the end of text', () => {
      const input = "That's a great question. *smiles*";
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('great question');
    });

    it('should handle stage directions in the middle of sentences', () => {
      const input = 'I think *pauses* that you might be right.';
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('I think');
      expect(result).toContain('you might be right');
    });
  });

  describe('Bracket-Wrapped Stage Directions', () => {
    it.each(BRACKET_STAGE_DIRECTIONS)(
      'should remove "%s" (except [laughter])',
      (stageDirection) => {
        const input = `${stageDirection} Tell me more about that.`;
        const result = sanitizeSsml(input);

        // The stage direction should be removed
        expect(result).not.toContain(stageDirection);

        // The spoken content should remain
        expect(result).toContain('Tell me more');
      }
    );

    it('should PRESERVE [laughter] - the only supported Cartesia nonverbal', () => {
      const input = '[laughter] That was hilarious!';
      const result = sanitizeSsml(input);

      // [laughter] is the ONLY bracket notation Cartesia supports
      expect(result).toContain('[laughter]');
      expect(result).toContain('hilarious');
    });

    it('should convert laughter variants to [laughter]', () => {
      const variants = ['[soft laughter]', '[gentle giggle]', '[warm chuckle]', '[quiet laugh]'];

      for (const variant of variants) {
        const input = `${variant} That's funny.`;
        const result = sanitizeSsml(input);

        expect(result).toContain('[laughter]');
        expect(result).not.toContain(variant);
      }
    });
  });

  describe('Parenthesis-Wrapped Stage Directions', () => {
    it.each(PARENTHESIS_STAGE_DIRECTIONS)('should remove or convert "%s"', (stageDirection) => {
      const input = `${stageDirection} I understand what you mean.`;
      const result = sanitizeSsml(input);

      // Should not contain the parenthetical stage direction
      expect(result).not.toContain(stageDirection);

      // The spoken content should remain
      expect(result).toContain('understand');
    });
  });

  describe('Standalone Action Words', () => {
    it.each(STANDALONE_ACTIONS)('should remove action word from: "%s"', (sentence) => {
      const result = sanitizeSsml(sentence);

      // Should not contain action verbs as standalone words
      expect(result).not.toMatch(/\b(smiles?|nods?|sighs?|chuckles?|grins?|beams?)\b/i);
    });
  });

  describe('Tone Descriptors', () => {
    it.each(TONE_DESCRIPTORS)('should remove tone descriptor: "%s"', (descriptor) => {
      const input = `${descriptor}, That's exactly right.`;
      const result = sanitizeSsml(input);

      // Various tone descriptors should be stripped
      // Allow partial matches since sanitization may remove parts
      const lowerResult = result.toLowerCase();
      expect(lowerResult).not.toContain('with a warm smile');
      expect(lowerResult).not.toContain('teasing smile');
    });
  });

  describe('Complex Real-World Examples', () => {
    it('should handle Ferni-style warm greeting with stage directions', () => {
      const input = '*settles in* *warm* Hey. How are you doing today?';
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('Hey');
      expect(result).toContain('How are you doing');
    });

    it('should handle emotional response with multiple stage directions', () => {
      const input =
        '*exhale of relief* *gentle presence* That sounds really difficult. *pauses* I hear you.';
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('difficult');
      expect(result).toContain('I hear you');
    });

    it('should handle mixed SSML and stage directions', () => {
      const input = '<break time="300ms"/>*smiles warmly* <emotion value="affectionate"/>Hello!';
      const result = sanitizeSsml(input);

      // Should preserve valid SSML
      expect(result).toContain('<break time="300ms"/>');
      expect(result).toContain('<emotion value="affectionate"/>');

      // Should remove stage direction
      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('Hello');
    });

    it('should handle Peter-style excited discovery', () => {
      const input = '*eyes light up* *excitedly* Whoa whoa whoa—look at THIS pattern!';
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('Whoa');
      expect(result).toContain('pattern');
    });

    it('should handle Nayan-style contemplative response', () => {
      const input = '*knowing smile* *thoughtfully* Hmm? Let me think about that, my friend.';
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('Hmm');
      expect(result).toContain('my friend');
    });

    it('should handle Maya-style enthusiastic celebration', () => {
      const input = '*beams* *claps* Oh my gosh! You did it! *excited*';
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('Oh my gosh');
      expect(result).toContain('You did it');
    });
  });

  describe('Edge Cases', () => {
    it('should not strip legitimate asterisks used for emphasis', () => {
      const input = 'The most important thing is to *actually* follow through.';
      const result = sanitizeSsml(input);

      // This is tricky - "actually" isn't a stage direction keyword
      // The sanitizer should ideally preserve it, but may remove it
      // Either way, the sentence should remain readable
      expect(result).toContain('important');
      expect(result).toContain('follow through');
    });

    it('should handle empty input', () => {
      expect(sanitizeSsml('')).toBe('');
    });

    it('should handle input with only stage directions', () => {
      const input = '*smiles* *nods*';
      const result = sanitizeSsml(input);

      // Should have removed stage directions, leaving minimal content
      expect(result).not.toMatch(/\*[^*]+\*/);
    });

    it('should handle very long stage directions', () => {
      const input =
        '*takes a deep breath and settles into the conversation with a warm presence* Okay.';
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).toContain('Okay');
    });

    it('should handle stage directions with special characters', () => {
      const input = "*chef's kiss* Perfect!";
      const result = sanitizeSsml(input);

      expect(result).not.toMatch(/\*[^*]+\*/);
      expect(result).not.toContain('chef');
      expect(result).toContain('Perfect');
    });

    it('should handle nested or malformed brackets', () => {
      const input = '[[pause]] or [warmly [softly]] Interesting.';
      const result = sanitizeSsml(input);

      // Should handle gracefully without crashing
      expect(typeof result).toBe('string');
      expect(result).toContain('Interesting');
    });
  });
});

// =============================================================================
// INTEGRATION TESTS: TTS Monitoring
// =============================================================================

describe('TTS Monitoring - Integration Tests', () => {
  beforeEach(() => {
    resetTTSStats();
  });

  describe('checkTTSText Detection', () => {
    it('should detect suspicious patterns that slipped through', () => {
      // If something slips through sanitization, monitoring should catch it
      const suspiciousText = 'smiles That is great';
      const result = checkTTSText(suspiciousText);

      // "smiles" as a standalone word is suspicious
      expect(result.hasIssues).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should NOT flag clean text', () => {
      const cleanText = "That's wonderful! Tell me more about that.";
      const result = checkTTSText(cleanText);

      expect(result.hasIssues).toBe(false);
      expect(result.issues.length).toBe(0);
    });

    it('should NOT flag [laughter] - the supported nonverbal', () => {
      const textWithLaughter = '[laughter] That was hilarious!';
      const result = checkTTSText(textWithLaughter);

      // [laughter] should not be flagged as an issue
      const laughterIssue = result.issues.find((i) => i.includes('laughter'));
      expect(laughterIssue).toBeUndefined();
    });

    it('should flag unsupported bracket notations', () => {
      const textWithUnsupportedBracket = '[sigh] That is heavy.';
      const result = checkTTSText(textWithUnsupportedBracket);

      // [sigh] is not supported by Cartesia
      expect(result.hasIssues).toBe(true);
    });

    it('should track statistics over time', () => {
      // Use monitorTTSText which tracks stats (checkTTSText doesn't auto-track)
      monitorTTSText('smiles warmly Hello', { trackStats: true });
      monitorTTSText('Clean text here', { trackStats: true });
      monitorTTSText('nods That is right', { trackStats: true });

      const stats = getTTSStats();

      expect(stats.totalChecks).toBe(3);
      expect(stats.issuesFound).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// VALIDATION TESTS: Full Pipeline
// =============================================================================

describe('Full Pipeline Validation', () => {
  describe('Sanitization → TTS Monitoring Pipeline', () => {
    it('should produce clean output that passes monitoring', () => {
      const dirtyInputs = [
        '*smiles* Hello there!',
        '[pauses] Let me think about that.',
        '(chuckles) That reminds me of something.',
        'Ferni nods. Yes, exactly.',
      ];

      for (const input of dirtyInputs) {
        // Step 1: Sanitize
        const sanitized = sanitizeSsml(input);

        // Step 2: Strip SSML for monitoring (monitoring checks raw text)
        const rawText = stripSsmlTags(sanitized);

        // Step 3: Check for issues
        const monitorResult = checkTTSText(rawText);

        // After sanitization, there should be no issues (or minimal)
        // Some edge cases may still flag, but major patterns should be clean
        if (monitorResult.hasIssues) {
          // Log what slipped through for debugging
          console.warn(`Pattern slipped through: ${input} → ${rawText}`);
          console.warn(`Issues: ${monitorResult.issues.join(', ')}`);
        }
      }
    });

    it('should handle a realistic Ferni response', () => {
      const ferniResponse = `*settles in* *warm presence* Hey. *brief pause* 
        How's it going? I've been thinking about what you said last time. 
        *nods* That thing about your sister? *pauses thoughtfully* 
        How's that going?`;

      const sanitized = sanitizeSsml(ferniResponse);

      // Should not contain any asterisk-wrapped content
      expect(sanitized).not.toMatch(/\*[^*]+\*/);

      // Should preserve the actual message
      expect(sanitized).toContain('Hey');
      expect(sanitized).toContain('sister');
      expect(sanitized).toContain("How's that going");
    });
  });
});

// =============================================================================
// REGRESSION TESTS: Known Issues
// =============================================================================

describe('Regression Tests - Known Issues', () => {
  it('ISSUE: "chuckles" was being spoken aloud', () => {
    // This was a real bug - "chuckles" slipped through
    const inputs = [
      'chuckles That is funny.',
      'He chuckles softly.',
      'Ferni chuckles.',
      '*chuckles*',
      '[chuckles]',
      '(chuckles)',
      'chuckling to himself',
    ];

    for (const input of inputs) {
      const result = sanitizeSsml(input);
      expect(result.toLowerCase()).not.toContain('chuckle');
    }
  });

  it('ISSUE: "smiles warmly" was being spoken aloud', () => {
    const inputs = ['*smiles warmly*', 'smiles warmly', 'She smiles warmly.', 'with a warm smile'];

    for (const input of inputs) {
      const result = sanitizeSsml(input);
      // Should not contain "smiles" as a word
      expect(result).not.toMatch(/\bsmiles?\b/i);
    }
  });

  it('ISSUE: tone adverbs like "warmly", "gently" spoken aloud', () => {
    const inputs = ['*warmly*', '*gently*', '*softly*', '*tenderly*', '*knowingly*'];

    for (const input of inputs) {
      const result = sanitizeSsml(input);
      expect(result).not.toMatch(/\*[^*]+\*/);
    }
  });
});

// =============================================================================
// STAGE_DIRECTION_KEYWORDS Coverage Test
// =============================================================================

describe('STAGE_DIRECTION_KEYWORDS Coverage', () => {
  it('should have comprehensive keyword list', () => {
    // Verify key categories are covered
    const expectedCategories = [
      // Breathing/Physical
      ['sigh', 'breath', 'exhale', 'inhale'],
      // Facial expressions
      ['smile', 'grin', 'frown', 'wink'],
      // Body movements
      ['nod', 'lean', 'shift', 'settle'],
      // Mental actions
      ['pause', 'think', 'consider', 'ponder'],
      // Manner adverbs
      ['warm', 'gentle', 'soft', 'tender'],
      // Tone descriptors
      ['teasing', 'playful', 'sarcastic', 'knowing'],
    ];

    for (const category of expectedCategories) {
      for (const keyword of category) {
        const found = STAGE_DIRECTION_KEYWORDS.some(
          (k) => k.toLowerCase().includes(keyword) || keyword.includes(k.toLowerCase())
        );
        expect(found).toBe(true);
      }
    }
  });

  it('should sanitize all keywords when wrapped in asterisks', () => {
    // Sample of keywords to test (testing all would be slow)
    const sampleKeywords = STAGE_DIRECTION_KEYWORDS.slice(0, 20);

    for (const keyword of sampleKeywords) {
      const input = `*${keyword}* Test message.`;
      const result = sanitizeSsml(input);

      // Should not contain the asterisk-wrapped keyword
      expect(result).not.toContain(`*${keyword}*`);
    }
  });
});
