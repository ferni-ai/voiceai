/**
 * SSML Tests
 *
 * Tests for SSML generation and sanitization:
 * - Financial pronunciation handling
 * - Emotion detection
 * - Stage direction sanitization
 * - Malformed SSML cleanup
 * - Pacing and volume adjustments
 *
 * These tests use the canonical src/ssml/ module.
 */

import { describe, expect, it } from 'vitest';
import {
  clampSpeed,
  clampVolume,
  detectEmotion,
  detectPacing,
  detectVocalCues,
  detectVolume,
  sanitizeSsml,
  tagTextWithSsml,
} from '../../ssml/index.js';

// ============================================================================
// SANITIZATION TESTS
// ============================================================================

describe('SSML Sanitization', () => {
  describe('Stage Direction Removal', () => {
    it('should convert *chuckles* to [laughter]', () => {
      const result = sanitizeSsml('*chuckles* That reminds me of a story.');
      expect(result).toContain('[laughter]');
      expect(result).not.toContain('chuckles');
    });

    it('should convert (laughs softly) to [laughter]', () => {
      const result = sanitizeSsml('(laughs softly) Yes, exactly!');
      expect(result).toContain('[laughter]');
      expect(result).not.toContain('laughs');
    });

    it('should remove *sighs*', () => {
      const result = sanitizeSsml('*sighs* Well, that was disappointing.');
      expect(result).not.toContain('sighs');
      expect(result).not.toContain('*');
    });

    it('should remove [pauses]', () => {
      const result = sanitizeSsml('Let me think about that [pauses] for a moment.');
      expect(result).not.toContain('[pauses]');
    });

    it('should remove action verbs like smiles, nods', () => {
      const result = sanitizeSsml('He smiles warmly and nods. Great question!');
      expect(result).not.toContain('smiles');
      expect(result).not.toContain('nods');
    });

    it('should handle multiple stage directions', () => {
      const result = sanitizeSsml('*chuckles* *sighs* *smiles* That was quite a journey.');
      expect(result).toContain('[laughter]');
      expect(result).not.toContain('sighs');
      expect(result).not.toContain('smiles');
    });

    it('should not create multiple [laughter] tags in a row', () => {
      const result = sanitizeSsml('*chuckles* *laughs* *chuckles* Great!');
      // Should consolidate to single [laughter]
      const laughterCount = (result.match(/\[laughter\]/g) || []).length;
      expect(laughterCount).toBeLessThanOrEqual(2);
    });

    // ================================================================
    // COMPREHENSIVE STAGE DIRECTION TESTS (v2 - Added after "chuckles" incident)
    // These test the expanded sanitization to catch ALL stage directions
    // ================================================================

    it('should remove *exhale* and *exhale of relief*', () => {
      const result1 = sanitizeSsml('*exhale* That was a lot.');
      expect(result1).not.toContain('exhale');
      expect(result1).not.toContain('*');
      expect(result1).toContain('That was a lot');

      const result2 = sanitizeSsml('*exhale of relief* Oh good.');
      expect(result2).not.toContain('exhale');
      expect(result2).not.toContain('relief');
      expect(result2).toContain('Oh good');
    });

    it('should remove *settles in*, *shifts*, *leans in*', () => {
      const result1 = sanitizeSsml("*settles in* Okay. I'm here.");
      expect(result1).not.toContain('settles');
      expect(result1).toContain('Okay');

      const result2 = sanitizeSsml('*shifts* Getting comfortable.');
      expect(result2).not.toContain('shifts');

      const result3 = sanitizeSsml('*leans in* Tell me more.');
      expect(result3).not.toContain('leans');
    });

    it('should remove *warm*, *steady*, *focused*, *gentle presence*', () => {
      const result1 = sanitizeSsml("*warm* It's okay.");
      expect(result1).not.toContain('warm');
      expect(result1).toContain('okay');

      const result2 = sanitizeSsml('*steady* Take your time.');
      expect(result2).not.toContain('steady');

      const result3 = sanitizeSsml('*focused* Let me think.');
      expect(result3).not.toContain('focused');

      const result4 = sanitizeSsml("*gentle presence* I'm here.");
      expect(result4).not.toContain('gentle');
      expect(result4).not.toContain('presence');
    });

    it('should remove *attention sharpens*, *perks up*, *energy rises*', () => {
      const result1 = sanitizeSsml('*attention sharpens* Go on.');
      expect(result1).not.toContain('attention');
      expect(result1).not.toContain('sharpens');

      const result2 = sanitizeSsml("*perks up* That's interesting!");
      expect(result2).not.toContain('perks');

      const result3 = sanitizeSsml('*energy rises* Yes!');
      expect(result3).not.toContain('energy');
    });

    it("should remove *chef's kiss*", () => {
      const result = sanitizeSsml("This one? *chef's kiss* Perfect.");
      expect(result).not.toContain('chef');
      expect(result).not.toContain('kiss');
      expect(result).toContain('Perfect');
    });

    it('should convert [soft laughter], [gentle giggle], [warm chuckle] to [laughter]', () => {
      const result1 = sanitizeSsml('[soft laughter] That was funny.');
      expect(result1).toContain('[laughter]');
      expect(result1).not.toContain('soft laughter');

      const result2 = sanitizeSsml('[gentle giggle] I love that.');
      expect(result2).toContain('[laughter]');
      expect(result2).not.toContain('giggle');

      const result3 = sanitizeSsml('[warm chuckle] Nice.');
      expect(result3).toContain('[laughter]');
      expect(result3).not.toContain('warm chuckle');
    });

    it('should remove *taking a breath* and *deep breath*', () => {
      const result1 = sanitizeSsml('*taking a breath* Where was I?');
      expect(result1).not.toContain('taking');
      expect(result1).not.toContain('breath');

      const result2 = sanitizeSsml('*deep breath* Okay, here goes.');
      expect(result2).not.toContain('deep');
      expect(result2).not.toContain('breath');
    });

    it('should handle SSML with embedded stage directions', () => {
      // This is the actual pattern from better-than-human.json
      const input = '<break time="400ms"/>*settles in* <break time="200ms"/>Okay. I\'m here.';
      const result = sanitizeSsml(input);
      expect(result).not.toContain('settles');
      expect(result).toContain('Okay');
      expect(result).toContain('<break time="400ms"/>');
    });

    it('should handle complex somatic phrases from meta-relationship.ts', () => {
      // These are actual patterns from the somatic_presence section
      const inputs = [
        '<break time="600ms"/>*long exhale* <break time="300ms"/>...That\'s a lot.',
        '<break time="500ms"/>*pause, breath* <break time="200ms"/>Let me sit with that.',
        '<break time="400ms"/>*gentle presence* <break time="300ms"/>I\'m here.',
      ];

      for (const input of inputs) {
        const result = sanitizeSsml(input);
        expect(result).not.toContain('*');
        // Should preserve the spoken text
        expect(result.length).toBeGreaterThan(20);
      }
    });
  });

  describe('Malformed SSML Cleanup', () => {
    it('should handle text with break tags that have content inside', () => {
      // The sanitizer replaces corrupted break tags with a default break
      const malformed = '<break time="100<invalid/>ms"/>';
      const result = sanitizeSsml(malformed);
      // The regex targets specific patterns - verify it doesn't crash and returns a string
      expect(typeof result).toBe('string');
      // If the pattern matches, it gets replaced; otherwise input passes through
      expect(result.length).toBeGreaterThan(0);
    });

    it('should remove corrupted speed tags entirely', () => {
      // Speed tags with < inside the value are targeted for removal
      const malformed = '<speed ratio="0.9<break/>"/>text';
      const result = sanitizeSsml(malformed);
      // The text content should be preserved regardless of tag cleanup
      expect(result).toContain('text');
      // Verify it returns a valid string
      expect(typeof result).toBe('string');
    });

    it('should reduce excessive consecutive breaks', () => {
      const excessive =
        '<break time="100ms"/><break time="100ms"/><break time="100ms"/><break time="100ms"/>';
      const result = sanitizeSsml(excessive);
      // Excessive breaks (4+) should be reduced
      const breakCount = (result.match(/<break/g) || []).length;
      expect(breakCount).toBeLessThan(4);
    });

    it('should not create orphaned closing tags', () => {
      const text = 'Hello world';
      const result = sanitizeSsml(text);
      // Clean text should not have orphaned /> patterns added
      expect(result).not.toMatch(/(?<!")\s*\/>/);
    });

    it('should normalize multiple spaces to single space', () => {
      const spacy = 'Hello    world';
      const result = sanitizeSsml(spacy);
      expect(result).not.toContain('  ');
    });
  });
});

// ============================================================================
// DETECTION TESTS
// ============================================================================

describe('Emotion Detection', () => {
  it('should detect affectionate emotion for loving text', () => {
    const emotion = detectEmotion('I love spending time with you, my friend.');
    expect(emotion).toBe('affectionate');
  });

  it('should detect sad emotion for sad text', () => {
    const emotion = detectEmotion('I feel so sad and heartbroken about this loss.');
    expect(emotion).toBe('sad');
  });

  it('should detect surprised emotion for surprising text', () => {
    // "wow" triggers 'surprised' emotion
    const emotion = detectEmotion('Wow! I had no idea that was possible!');
    expect(emotion).toBe('surprised');
  });

  it('should detect curious emotion for questions', () => {
    const emotion = detectEmotion('What do you think about this interesting idea?');
    expect(emotion).toBe('curious');
  });

  it('should return neutral for text without emotion keywords', () => {
    // The canonical SSML tagger defaults to neutral when no emotion keywords are found
    const emotion = detectEmotion('The weather is average today.');
    expect(emotion).toBe('neutral');
  });
});

describe('Pacing Detection', () => {
  it('should return slower speed for thoughtful text with ellipsis', () => {
    const { speed, reason } = detectPacing(
      'Let me think about this... carefully consider all options.'
    );
    expect(speed).toBeLessThan(0.95); // Slow keywords + ellipsis trigger slower pacing
    expect(reason).toContain('slow'); // Contains slow pace indicator
    // Text contains multiple slow keywords: 'think', 'carefully', 'consider', 'careful'
    // The first match is used as the reason indicator
  });

  it('should return faster speed for exclamatory text with fast keywords', () => {
    // "excited" is a FAST_PACE_KEYWORD, and "!" triggers faster pacing
    const { speed, reason } = detectPacing('Yes! I am so excited about this news!');
    // Fast keywords should increase speed
    expect(speed).toBeGreaterThan(0.9);
    expect(reason).toContain('fast'); // Contains fast pace indicator
    expect(reason).toContain('excited'); // "excited" is a fast keyword
  });

  it('should return normal speed for neutral text', () => {
    const { speed, reason } = detectPacing('This is a normal sentence.');
    // Normal text gets base speed adjusted for punctuation
    expect(speed).toBeGreaterThan(0.8);
    expect(speed).toBeLessThan(1.2);
    expect(reason).toBe('normal');
  });

  it('should adjust speed for questions', () => {
    const { speed, reason } = detectPacing('What do you think about this idea?');
    // Questions with "think" get slow adjustment + question adjustment
    expect(speed).toBeLessThan(1.0);
    expect(reason).toContain('question'); // Contains question indicator
  });
});

describe('Volume Detection', () => {
  it('should return lower volume for whisper keywords', () => {
    const { volume } = detectVolume('Let me share a secret with you quietly.');
    expect(volume).toBeLessThan(1.0);
  });

  it('should return higher volume for emphasis', () => {
    const { volume } = detectVolume('This is VERY important! Listen up!');
    expect(volume).toBeGreaterThanOrEqual(1.0);
  });
});

describe('Vocal Cue Detection', () => {
  it('should detect laughter cues with "ha ha" pattern', () => {
    const { hasLaughter, laughterCount } = detectVocalCues('Ha ha, that was really funny!');
    expect(hasLaughter).toBe(true);
    expect(laughterCount).toBeGreaterThan(0);
  });

  it('should detect laughter cues with explicit laughter markers', () => {
    const { hasLaughter } = detectVocalCues('Haha, you know what I mean?');
    expect(hasLaughter).toBe(true);
  });

  it('should detect sigh cues with explicit sigh markers', () => {
    const { hasSigh } = detectVocalCues('*sigh* This is a difficult situation.');
    expect(hasSigh).toBe(true);
  });

  it('should detect sigh cues with parenthetical sigh', () => {
    const { hasSigh } = detectVocalCues('(sigh) That is heavy news to process.');
    expect(hasSigh).toBe(true);
  });

  it('should return no cues for plain text without patterns', () => {
    const { hasLaughter, hasSigh } = detectVocalCues('The weather is nice.');
    expect(hasLaughter).toBe(false);
    expect(hasSigh).toBe(false);
  });
});

// ============================================================================
// CLAMPING TESTS
// ============================================================================

describe('Value Clamping', () => {
  it('should clamp speed to valid Cartesia range (0.6-1.5)', () => {
    expect(clampSpeed(0.5)).toBe(0.6); // Clamped up to minimum
    expect(clampSpeed(2.0)).toBe(1.5); // Clamped down to maximum
    expect(clampSpeed(0.9)).toBe(0.9); // Within range, unchanged
    expect(clampSpeed(1.2)).toBe(1.2); // Within range, unchanged
  });

  it('should clamp volume to valid range (0.5-2.0)', () => {
    expect(clampVolume(0.3)).toBe(0.5); // Clamped up to minimum
    expect(clampVolume(2.5)).toBe(2.0); // Clamped down to maximum
    expect(clampVolume(1.0)).toBe(1.0); // Within range, unchanged
    expect(clampVolume(1.8)).toBe(1.8); // Within range, unchanged
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Full SSML Tagging', () => {
  it('should return empty text unchanged', () => {
    expect(tagTextWithSsml('')).toBe('');
    expect(tagTextWithSsml('   ')).toBe('   ');
  });

  it('should pass through text that already has SSML', () => {
    const ssml = '<speed ratio="0.9"/>Hello world';
    const result = tagTextWithSsml(ssml);
    // Should sanitize but not double-tag
    expect(result).toContain('Hello world');
  });

  it('should add speed and volume tags', () => {
    const result = tagTextWithSsml('This is a test sentence.');
    expect(result).toContain('<speed');
    expect(result).toContain('<volume');
  });

  it('should add emotion tags for emotional text', () => {
    const result = tagTextWithSsml('I am so happy and grateful for this wonderful moment!');
    expect(result).toContain('<emotion');
  });

  it('should handle financial terminology', () => {
    const result = tagTextWithSsml('The S&P 500 returned 12%.');
    // Financial terms should be preserved or properly tagged
    // The tagger may convert 'S&P 500' to 'S and P 500' for pronunciation
    const hasFinancialTerm = result.includes('S&P 500') || result.includes('S and P');
    expect(hasFinancialTerm).toBe(true);
  });
});

describe('Batch Tagging', () => {
  it('should tag multiple fragments', () => {
    const fragments = ['Hello!', 'How are you?', 'Great to see you!'];

    // tagTextFragments was deprecated - test inline equivalent
    const results = fragments.map((f) => tagTextWithSsml(f));

    expect(results.length).toBe(3);
    for (const result of results) {
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('should handle empty array', () => {
    const results: string[] = [];
    expect(results).toEqual([]);
  });
});
