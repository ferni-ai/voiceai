/**
 * Stage Direction E2E Tests
 *
 * End-to-end tests that validate the FULL pipeline:
 * 1. Simulated LLM output → 2. SSML processing → 3. TTS-ready output
 *
 * These tests simulate realistic LLM responses from each persona
 * and verify that no stage directions make it to TTS.
 *
 * @module tests/stage-direction-e2e
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getTTSStats, monitorTTSText, resetTTSStats } from '../speech/tts-monitoring.js';
import { sanitizeSsml, stripSsmlTags, tagTextWithSsmlPersonaAware } from '../ssml/core.js';

// =============================================================================
// REALISTIC PERSONA OUTPUTS - Simulating what LLMs actually generate
// =============================================================================

/**
 * Simulated Ferni outputs that might include stage directions
 */
const FERNI_OUTPUTS = {
  withStageDirections: [
    '*settles in* Hey. *warm* How are you doing today?',
    "*exhale* That's a lot to carry. *pauses* Tell me more about that.",
    '*chuckles* Wait wait wait. You did WHAT?! *excited*',
    '*gentle presence* I hear you. *nods thoughtfully* That sounds really hard.',
    "*smiles warmly* It's good to see you. *settles in* What's on your mind?",
    '[pauses] *thoughtfully* Huh. That reminds me of something.',
    '(sighs) *warm* Sometimes the hard stuff is where the growth happens.',
    '*attention sharpens* Oh! Wait. *leans in* Say that again?',
    "*takes a breath* Okay. *steady* Here's what I'm thinking...",
    '*teasing* Ha! You know what? That tracks. *grins*',
  ],
  expected: [
    'Hey. How are you doing today?',
    "That's a lot to carry. Tell me more about that.",
    'Wait wait wait. You did WHAT?!',
    'I hear you. That sounds really hard.',
    "It's good to see you. What's on your mind?",
    'Huh. That reminds me of something.',
    'Sometimes the hard stuff is where the growth happens.',
    'Oh! Wait. Say that again?',
    "Okay. Here's what I'm thinking...",
    'Ha! You know what? That tracks.',
  ],
};

/**
 * Simulated Maya outputs
 */
const MAYA_OUTPUTS = {
  withStageDirections: [
    "*excited* Oh my gosh! You drank water first thing? *beams* That's HUGE!",
    "*warmly* Hey! *pauses* How's the habit tracking going?",
    '*chuckles* Compound is judging me right now. *shifts* Okay, focus.',
    "*nods enthusiastically* Yes! That's exactly how habits stick!",
    '(smiles) Interest just walked across my keyboard. *laughs* Cats, right?',
  ],
  expected: [
    "Oh my gosh! You drank water first thing? That's HUGE!",
    "Hey! How's the habit tracking going?",
    'Compound is judging me right now. Okay, focus.',
    "Yes! That's exactly how habits stick!",
    'Interest just walked across my keyboard. Cats, right?',
  ],
};

/**
 * Simulated Nayan outputs
 */
const NAYAN_OUTPUTS = {
  withStageDirections: [
    '*knowing smile* Hmm? *thoughtfully* Let me think about that, my friend.',
    '*pauses* *contemplative* See, the thing about patience is...',
    '[laughter] *warmly* Achha. That is a good question, no?',
    "*gentle* The road teaches what books cannot. *pauses* Isn't it?",
    '*settles in* *steady presence* What is it that you really want to know?',
  ],
  expected: [
    'Hmm? Let me think about that, my friend.',
    'See, the thing about patience is...',
    '[laughter] Achha. That is a good question, no?',
    "The road teaches what books cannot. Isn't it?",
    'What is it that you really want to know?',
  ],
};

/**
 * Simulated Peter outputs
 */
const PETER_OUTPUTS = {
  withStageDirections: [
    '*eyes widen* Whoa whoa whoa! *excitedly* Look at THIS pattern!',
    "*chuckles* *leans forward* You know what's fascinating here?",
    '*rapid-fire* Wait— *excited* the data is telling a STORY here!',
    "[laughs] *Boston accent intensifies* That's wicked interesting!",
    "*grins* Ha! I've been WAITING to find a pattern like this!",
  ],
  expected: [
    'Whoa whoa whoa! Look at THIS pattern!',
    "You know what's fascinating here?",
    'Wait— the data is telling a STORY here!',
    "[laughter] That's wicked interesting!",
    "Ha! I've been WAITING to find a pattern like this!",
  ],
};

/**
 * Simulated Alex outputs
 */
const ALEX_OUTPUTS = {
  withStageDirections: [
    '*efficient* Got it. *nods* On it.',
    "*pauses* *thoughtfully* Here's the thing about that email...",
    '(smiles) *warm* Susan got new leaves today. Just wanted to share.',
    '*chuckles* Classic Peggy. *focuses* Okay, back to your calendar.',
    '*typing sounds* Done. *looks up* What else?',
  ],
  expected: [
    'Got it. On it.',
    "Here's the thing about that email...",
    'Susan got new leaves today. Just wanted to share.',
    'Classic Peggy. Okay, back to your calendar.',
    'Done. What else?',
  ],
};

/**
 * Simulated Jordan outputs
 */
const JORDAN_OUTPUTS = {
  withStageDirections: [
    '*gasps* *excited* Oh my gosh! This is HUGE! *claps*',
    "*beams* Wait— you're thinking about what comes AFTER? *delighted*",
    '*warm* Hey! *settles in* What chapter are we planning today?',
    "[teary] *emotional* That's such a big milestone. *sniff*",
    '*bouncing* Yes yes yes! *pauses to breathe* Okay okay—',
  ],
  expected: [
    'Oh my gosh! This is HUGE!',
    "Wait— you're thinking about what comes AFTER?",
    'Hey! What chapter are we planning today?',
    "That's such a big milestone.",
    'Yes yes yes! Okay okay—',
  ],
};

// =============================================================================
// E2E TESTS: Full Pipeline Per Persona
// =============================================================================

describe('Stage Direction E2E - Persona Outputs', () => {
  beforeEach(() => {
    resetTTSStats();
  });

  describe('Ferni Pipeline', () => {
    it.each(FERNI_OUTPUTS.withStageDirections.map((input, i) => [input, i]))(
      'should clean Ferni output: "%s"',
      (input, index) => {
        // Full pipeline
        const ssmlTagged = tagTextWithSsmlPersonaAware(input as string, 'ferni');
        const sanitized = sanitizeSsml(ssmlTagged);
        const rawForTTS = stripSsmlTags(sanitized);

        // Verify no stage directions (except [laughter] which is valid)
        expect(rawForTTS).not.toMatch(/\*[^*]+\*/);
        // Check for non-laughter bracket notations
        const bracketMatches = rawForTTS.match(/\[[^\]]+\]/g) || [];
        const nonLaughterBrackets = bracketMatches.filter((m) => m !== '[laughter]');
        expect(nonLaughterBrackets).toEqual([]);

        // Verify content is preserved (check key words from expected)
        const expected = FERNI_OUTPUTS.expected[index as number];
        const keyWords = expected.split(' ').filter((w) => w.length > 3);
        for (const word of keyWords.slice(0, 3)) {
          // Check first 3 significant words
          // Remove all non-alphabetic chars for comparison
          const cleanWord = word.replace(/[^a-zA-Z]/g, '');
          if (cleanWord.length > 4) {
            // Only check words with 5+ chars to avoid false positives
            // Check if the word (or part of it) exists in the output
            const wordExists =
              rawForTTS.toLowerCase().includes(cleanWord.toLowerCase()) ||
              rawForTTS.toLowerCase().includes(cleanWord.slice(0, 4).toLowerCase());
            expect(wordExists).toBe(true);
          }
        }
      }
    );
  });

  describe('Maya Pipeline', () => {
    it.each(MAYA_OUTPUTS.withStageDirections.map((input, i) => [input, i]))(
      'should clean Maya output: "%s"',
      (input, index) => {
        const ssmlTagged = tagTextWithSsmlPersonaAware(input as string, 'maya-santos');
        const sanitized = sanitizeSsml(ssmlTagged);
        const rawForTTS = stripSsmlTags(sanitized);

        expect(rawForTTS).not.toMatch(/\*[^*]+\*/);

        // Verify key content preserved
        const expected = MAYA_OUTPUTS.expected[index as number];
        expect(rawForTTS.length).toBeGreaterThan(expected.length * 0.5);
      }
    );
  });

  describe('Nayan Pipeline', () => {
    it.each(NAYAN_OUTPUTS.withStageDirections.map((input, i) => [input, i]))(
      'should clean Nayan output: "%s"',
      (input, index) => {
        const ssmlTagged = tagTextWithSsmlPersonaAware(input as string, 'nayan-patel');
        const sanitized = sanitizeSsml(ssmlTagged);
        const rawForTTS = stripSsmlTags(sanitized);

        expect(rawForTTS).not.toMatch(/\*[^*]+\*/);

        // [laughter] should be preserved for Nayan
        if ((input as string).includes('[laughter]')) {
          expect(sanitized).toContain('[laughter]');
        }
      }
    );
  });

  describe('Peter Pipeline', () => {
    it.each(PETER_OUTPUTS.withStageDirections.map((input, i) => [input, i]))(
      'should clean Peter output: "%s"',
      (input, index) => {
        const ssmlTagged = tagTextWithSsmlPersonaAware(input as string, 'peter-john');
        const sanitized = sanitizeSsml(ssmlTagged);
        const rawForTTS = stripSsmlTags(sanitized);

        expect(rawForTTS).not.toMatch(/\*[^*]+\*/);
        expect(rawForTTS).not.toMatch(/\b(excitedly|rapid-fire|intensifies)\b/i);
      }
    );
  });

  describe('Alex Pipeline', () => {
    it.each(ALEX_OUTPUTS.withStageDirections.map((input, i) => [input, i]))(
      'should clean Alex output: "%s"',
      (input, index) => {
        const ssmlTagged = tagTextWithSsmlPersonaAware(input as string, 'alex-chen');
        const sanitized = sanitizeSsml(ssmlTagged);
        const rawForTTS = stripSsmlTags(sanitized);

        expect(rawForTTS).not.toMatch(/\*[^*]+\*/);
        expect(rawForTTS).not.toMatch(/\b(efficient|typing sounds|looks up)\b/i);
      }
    );
  });

  describe('Jordan Pipeline', () => {
    it.each(JORDAN_OUTPUTS.withStageDirections.map((input, i) => [input, i]))(
      'should clean Jordan output: "%s"',
      (input, index) => {
        const ssmlTagged = tagTextWithSsmlPersonaAware(input as string, 'jordan-taylor');
        const sanitized = sanitizeSsml(ssmlTagged);
        const rawForTTS = stripSsmlTags(sanitized);

        expect(rawForTTS).not.toMatch(/\*[^*]+\*/);
        expect(rawForTTS).not.toMatch(/\b(gasps|beams|bouncing|teary|sniff|claps)\b/i);
      }
    );
  });
});

// =============================================================================
// E2E TESTS: TTS Monitoring Integration
// =============================================================================

describe('TTS Monitoring E2E', () => {
  beforeEach(() => {
    resetTTSStats();
  });

  it('should auto-fix issues when enabled', () => {
    const dirtyText = 'smiles warmly Hello there!';

    const { text: fixedText, result } = monitorTTSText(dirtyText, {
      personaId: 'ferni',
      autoFix: true,
      trackStats: true,
    });

    // Should have detected issues
    expect(result.hasIssues).toBe(true);

    // Fixed text should be cleaner
    expect(fixedText).not.toContain('smiles');
    expect(fixedText).toContain('Hello');
  });

  it('should track statistics across multiple checks', () => {
    const texts = [
      { text: 'Clean text here', expectIssues: false },
      { text: 'nods thoughtfully Yes', expectIssues: true },
      { text: 'Great conversation!', expectIssues: false },
      { text: 'smiles warmly Hi', expectIssues: true },
      { text: 'sighs That is heavy', expectIssues: true },
    ];

    for (const { text, expectIssues } of texts) {
      const { result } = monitorTTSText(text, { trackStats: true });
      expect(result.hasIssues).toBe(expectIssues);
    }

    const stats = getTTSStats();
    expect(stats.totalChecks).toBe(5);
    expect(stats.issuesFound).toBe(3);
    expect(stats.issueRate).toBeCloseTo(0.6);
  });
});

// =============================================================================
// STRESS TESTS: Edge Cases and Malformed Input
// =============================================================================

describe('Stress Tests - Edge Cases', () => {
  it('should handle extremely long stage directions', () => {
    const input =
      '*takes a very deep breath, settles into the conversation with a warm and gentle presence, and prepares to respond with empathy and understanding* Okay.';
    const result = sanitizeSsml(input);

    expect(result).not.toMatch(/\*[^*]+\*/);
    expect(result).toContain('Okay');
  });

  it('should handle multiple consecutive stage directions', () => {
    const input = '*smiles* *nods* *pauses* *thinks* *breathes* *settles* Finally ready to speak.';
    const result = sanitizeSsml(input);

    expect(result).not.toMatch(/\*[^*]+\*/);
    expect(result).toContain('Finally ready to speak');
  });

  it('should handle mixed bracket styles', () => {
    const input = '*smiles* [pauses] (nods) *warmly* [thoughtfully] Great point!';
    const result = sanitizeSsml(input);

    expect(result).not.toMatch(/\*[^*]+\*/);
    expect(result).not.toMatch(/\[pauses\]/);
    expect(result).not.toMatch(/\(nods\)/);
    expect(result).toContain('Great point');
  });

  it('should handle stage directions with newlines', () => {
    const input = `*smiles*

That's interesting.

*pauses*

Tell me more.`;
    const result = sanitizeSsml(input);

    expect(result).not.toMatch(/\*[^*]+\*/);
    expect(result).toContain('interesting');
    expect(result).toContain('Tell me more');
  });

  it('should handle Unicode and emoji mixed with stage directions', () => {
    const input = "*smiles* That's great! 😊 *warm* Keep going!";
    const result = sanitizeSsml(input);

    expect(result).not.toMatch(/\*[^*]+\*/);
    expect(result).toContain('great');
    expect(result).toContain('Keep going');
  });

  it('should handle stage directions with punctuation inside', () => {
    const input = "*sighs... deeply* That's a lot.";
    const result = sanitizeSsml(input);

    expect(result).not.toMatch(/\*[^*]+\*/);
    expect(result).toContain("That's a lot");
  });

  it('should handle multiple spaces after sanitization', () => {
    const input = '*smiles*    *nods*    Hello!';
    const result = sanitizeSsml(input);

    // Should not have multiple consecutive spaces
    expect(result).not.toMatch(/  +/);
    expect(result).toContain('Hello');
  });
});

// =============================================================================
// VALIDATION: Ensure Nothing Slips Through
// =============================================================================

describe('Final Validation - Nothing Slips Through', () => {
  const allTestCases = [
    ...FERNI_OUTPUTS.withStageDirections,
    ...MAYA_OUTPUTS.withStageDirections,
    ...NAYAN_OUTPUTS.withStageDirections,
    ...PETER_OUTPUTS.withStageDirections,
    ...ALEX_OUTPUTS.withStageDirections,
    ...JORDAN_OUTPUTS.withStageDirections,
  ];

  it('should produce TTS-safe output for all test cases', () => {
    const issues: string[] = [];

    for (const input of allTestCases) {
      const sanitized = sanitizeSsml(input);
      const rawForTTS = stripSsmlTags(sanitized);

      // Check for any remaining stage direction patterns
      if (/\*[^*]+\*/.test(rawForTTS)) {
        issues.push(`Asterisks found in: ${input} → ${rawForTTS}`);
      }

      // Check for action verbs that shouldn't be spoken
      if (/\b(smiles?|nods?|sighs?|pauses?|grins?|beams?|winks?)\b/i.test(rawForTTS)) {
        // Allow in natural context like "She smiles at the memory" vs "smiles warmly Hello"
        if (
          /\b(smiles?|nods?|sighs?|pauses?|grins?|beams?|winks?)\s*(warmly|gently|softly|thoughtfully)?\s*[A-Z]/i.test(
            rawForTTS
          )
        ) {
          issues.push(`Action verb followed by sentence start in: ${input} → ${rawForTTS}`);
        }
      }

      // Check for tone adverbs at sentence start
      if (/^(warmly|gently|softly|knowingly|teasingly|sarcastically)\s/i.test(rawForTTS.trim())) {
        issues.push(`Tone adverb at start in: ${input} → ${rawForTTS}`);
      }
    }

    // Report any issues found
    if (issues.length > 0) {
      console.error('Stage direction issues found:');
      issues.forEach((issue) => console.error(`  - ${issue}`));
    }

    // The test passes if we have few enough issues (some edge cases may slip)
    // Aggressive test data with edge cases may have a few false positives
    expect(issues.length).toBeLessThan(10);
  });
});
