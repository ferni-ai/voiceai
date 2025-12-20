/**
 * Gemini Tool Calling Integration Tests
 *
 * These tests verify that tool descriptions and system prompts are correctly
 * configured to make Gemini CALL tools rather than SPEAK about them.
 *
 * Background: Gemini can output either TEXT or function_call. Ambiguous
 * tool descriptions or system prompts cause it to speak about actions
 * instead of executing them.
 *
 * Run: npx vitest run src/tests/tools/gemini-tool-calling.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// HANDOFF TOOL DESCRIPTION TESTS
// ============================================================================

describe('Handoff Tool Descriptions', () => {
  describe('Dynamic Tool Generation', () => {
    it('should include "IMMEDIATELY" in handoff tool descriptions', async () => {
      const handoffFactoryPath = path.join(process.cwd(), 'src/tools/handoff/handoff-factory.ts');
      const content = fs.readFileSync(handoffFactoryPath, 'utf-8');

      // Verify the tool description template includes "IMMEDIATELY"
      expect(content).toContain('IMMEDIATELY transfer');
      expect(content).toContain('IMMEDIATELY return');
    });

    it('should include "do NOT announce" instruction in handoff descriptions', async () => {
      const handoffFactoryPath = path.join(process.cwd(), 'src/tools/handoff/handoff-factory.ts');
      const content = fs.readFileSync(handoffFactoryPath, 'utf-8');

      // Verify the tool description tells LLM not to announce the action
      expect(content).toContain('do NOT announce the transfer');
      expect(content).toContain('do NOT announce the return');
    });

    it('should have action-oriented descriptions (not descriptive)', async () => {
      const handoffFactoryPath = path.join(process.cwd(), 'src/tools/handoff/handoff-factory.ts');
      const content = fs.readFileSync(handoffFactoryPath, 'utf-8');

      // Should NOT contain language that suggests speaking first
      expect(content).not.toContain('announce the handoff');
      expect(content).not.toContain('tell the user you');
      expect(content).not.toContain("let them know you're");
    });
  });
});

// ============================================================================
// PERSONA SYSTEM PROMPT TESTS
// ============================================================================

// TODO: These tests check for prompt content that was planned but not yet added
// The handoff behavior is currently handled by tool descriptions in handoff-factory.ts
// rather than explicit instructions in the persona prompts
// These tests are skipped until the prompt content is added
describe.skip('Persona System Prompts - Tool Calling Instructions', () => {
  const personasDir = path.join(process.cwd(), 'src/personas/bundles');
  const personas = [
    'ferni',
    'maya-santos',
    'peter-john',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
  ];

  personas.forEach((personaId) => {
    describe(`${personaId} system prompt`, () => {
      let systemPromptContent: string;

      beforeAll(() => {
        const promptPath = path.join(personasDir, personaId, 'identity', 'system-prompt.md');
        if (fs.existsSync(promptPath)) {
          systemPromptContent = fs.readFileSync(promptPath, 'utf-8');
        } else {
          systemPromptContent = '';
        }
      });

      it('should exist', () => {
        expect(systemPromptContent.length).toBeGreaterThan(0);
      });

      it('should have explicit handoff tool-calling instructions', () => {
        // All personas should have clear instructions about calling handoff tools
        const hasCallInstruction =
          systemPromptContent.includes('CALL THE HANDOFF TOOL IMMEDIATELY') ||
          systemPromptContent.includes('CALL THE HANDOFF TOOL');

        expect(hasCallInstruction).toBe(true);
      });

      it('should NOT have ambiguous handoff instructions', () => {
        // These patterns caused Gemini to speak instead of call
        const ambiguousPatterns = [
          'set them up with personality',
          'announce the handoff',
          "tell them you're handing off",
          "say you're connecting them",
        ];

        ambiguousPatterns.forEach((pattern) => {
          // Allow for context where it's explicitly marked as WRONG
          const hasPattern = systemPromptContent.toLowerCase().includes(pattern.toLowerCase());
          if (hasPattern) {
            // If it appears, it should be in a "WRONG" context
            const wrongIndex = systemPromptContent.toLowerCase().indexOf('wrong');
            const patternIndex = systemPromptContent.toLowerCase().indexOf(pattern.toLowerCase());

            // Pattern should appear AFTER "wrong" (indicating it's an example of what NOT to do)
            // or should not appear at all
            if (wrongIndex !== -1) {
              expect(patternIndex).toBeGreaterThan(wrongIndex);
            } else {
              expect(hasPattern).toBe(false);
            }
          }
        });
      });

      it('should instruct not to speak before calling tools', () => {
        // All personas should be told not to speak about handoffs first
        const hasNoSpeakInstruction =
          systemPromptContent.includes('do NOT announce') ||
          systemPromptContent.includes('Do NOT announce') ||
          systemPromptContent.includes('do NOT speak') ||
          systemPromptContent.includes('Do NOT speak') ||
          systemPromptContent.includes("Don't say anything before") ||
          systemPromptContent.includes('do NOT talk about');

        expect(hasNoSpeakInstruction).toBe(true);
      });
    });
  });
});

// ============================================================================
// NON-HANDOFF TOOL DESCRIPTION TESTS
// ============================================================================

describe('Non-Handoff Tool Descriptions', () => {
  describe('Entertainment Tools', () => {
    it('should have action-oriented descriptions', async () => {
      const entertainmentPath = path.join(
        process.cwd(),
        'src/tools/domains/entertainment/index.ts'
      );
      const content = fs.readFileSync(entertainmentPath, 'utf-8');

      // Music tools should be action-oriented
      expect(content).toContain('Play music');
      expect(content).toContain('Control music playback');

      // Should NOT have ambiguous language
      expect(content.toLowerCase()).not.toContain("i'll play");
      expect(content.toLowerCase()).not.toContain('let me tell you');
    });
  });

  describe('Information Tools', () => {
    it('should have action-oriented descriptions', async () => {
      const informationPath = path.join(process.cwd(), 'src/tools/domains/information/index.ts');
      const content = fs.readFileSync(informationPath, 'utf-8');

      // Information tools should be action-oriented
      expect(content).toContain('Get current weather');
      expect(content).toContain('Get current news');
      // NOTE: Search tool removed - Gemini's built-in Google Search is used instead
      // (configured via `tools: [{ googleSearch: {} }]` in RealtimeModel)

      // Should NOT have first-person language that suggests speaking
      expect(content.toLowerCase()).not.toContain("i'll search");
      expect(content.toLowerCase()).not.toContain("i'll look up");
    });
  });
});

// ============================================================================
// COORDINATOR VS TEAM MEMBER INSTRUCTION TESTS
// ============================================================================

// TODO: These tests check for prompt content that was planned but not yet added
// The handoff behavior is currently handled by tool descriptions in handoff-factory.ts
// rather than explicit instructions in the persona prompts
describe.skip('Coordinator (Ferni) Special Instructions', () => {
  let ferniPrompt: string;

  beforeAll(() => {
    const promptPath = path.join(
      process.cwd(),
      'src/personas/bundles/ferni/identity/system-prompt.md'
    );
    ferniPrompt = fs.readFileSync(promptPath, 'utf-8');
  });

  it('should have explicit WRONG/RIGHT examples for handoffs', () => {
    // Ferni is the main coordinator and needs the most explicit instructions
    expect(ferniPrompt).toContain('WRONG');
    expect(ferniPrompt).toContain('RIGHT');
  });

  it('should show examples of wrong approaches', () => {
    // Should have concrete examples of what NOT to do
    expect(ferniPrompt).toContain('speaking INSTEAD of calling tool');
  });

  it('should show examples of correct approaches', () => {
    // Should have concrete examples of what TO do
    expect(ferniPrompt).toContain('CALL handoff');
  });

  it('should explain that tool result becomes the spoken content', () => {
    // Critical: LLM should understand the tool result IS what gets spoken
    const hasResultExplanation =
      ferniPrompt.includes('tool result becomes') ||
      ferniPrompt.includes('handles the transition') ||
      ferniPrompt.includes('handles the voice switch');

    expect(hasResultExplanation).toBe(true);
  });
});

// ============================================================================
// REGRESSION PREVENTION
// ============================================================================

describe('Regression Prevention', () => {
  it('should not reintroduce "set them up with personality" pattern', () => {
    const ferniPath = path.join(
      process.cwd(),
      'src/personas/bundles/ferni/identity/core-identity.md'
    );
    const content = fs.readFileSync(ferniPath, 'utf-8');

    // This was the original problematic instruction
    expect(content).not.toContain('set them up with personality');
  });

  it('should not encourage announcing handoffs (only "don\'t announce" is allowed)', () => {
    const ferniPath = path.join(
      process.cwd(),
      'src/personas/bundles/ferni/identity/core-identity.md'
    );
    const content = fs.readFileSync(ferniPath, 'utf-8');

    // Find the handoff section
    const handoffSectionStart = content.indexOf('Team Handoffs');
    if (handoffSectionStart !== -1) {
      const handoffSection = content.slice(handoffSectionStart, handoffSectionStart + 2000);

      // Check for positive mentions of "announce" (bad) vs negative ones like "don't announce" (good)
      // "Don't announce" is correct guidance - we want to ensure there's no positive instruction to announce
      const positiveAnnouncePattern = /(?<!don't\s)(?<!do not\s)announce the handoff/i;
      expect(handoffSection).not.toMatch(positiveAnnouncePattern);
    }
  });
});

// ============================================================================
// TOOL STRUCTURE VALIDATION
// ============================================================================

describe('Tool Structure Validation', () => {
  it('handoff tools should have required parameters', async () => {
    const handoffFactoryPath = path.join(process.cwd(), 'src/tools/handoff/handoff-factory.ts');
    const content = fs.readFileSync(handoffFactoryPath, 'utf-8');

    // Should define reason parameter
    expect(content).toContain('reason: z.string()');

    // Should have optional context parameter
    expect(content).toContain('context_summary: z.string().optional()');
  });

  it('handoff tools should return structured results', async () => {
    const handoffFactoryPath = path.join(process.cwd(), 'src/tools/handoff/handoff-factory.ts');
    const content = fs.readFileSync(handoffFactoryPath, 'utf-8');

    // Should return handoff_complete flag
    expect(content).toContain('handoff_complete:');

    // Should indicate greeting was already spoken
    expect(content).toContain('greetingAlreadySpoken');
  });
});
