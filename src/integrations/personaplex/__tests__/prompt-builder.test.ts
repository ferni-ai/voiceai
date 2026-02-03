/**
 * PersonaPlex Prompt Builder Tests
 */

import { describe, it, expect } from 'vitest';
import {
  buildPersonaPlexPrompt,
  buildMemoryContext,
  buildSessionContext,
  buildTimeContext,
  getDefaultToolDescriptions,
} from '../prompt-builder.js';

describe('PersonaPlex Prompt Builder', () => {
  describe('buildPersonaPlexPrompt', () => {
    it('builds prompt for Ferni persona', async () => {
      const result = await buildPersonaPlexPrompt('ferni');

      expect(result.textPrompt).toContain('Ferni');
      expect(result.textPrompt).toContain('life coach');
      expect(result.textPrompt).toContain('conversation');
      expect(result.voicePrompt).toBe('ferni.pt');
      expect(result.estimatedTokens).toBeGreaterThan(0);
    });

    it('builds prompt for Maya persona', async () => {
      const result = await buildPersonaPlexPrompt('maya-santos');

      expect(result.textPrompt).toContain('Maya');
      expect(result.textPrompt).toContain('habits');
      expect(result.voicePrompt).toBe('maya.pt');
    });

    it('includes context when provided', async () => {
      const result = await buildPersonaPlexPrompt('ferni', {
        userId: 'user-123',
        memoryContext: "User's name is Sarah",
        sessionContext: 'User: Hi there!',
        emotionalState: 'feeling anxious',
      });

      expect(result.textPrompt).toContain('Sarah');
      expect(result.textPrompt).toContain('anxious');
    });

    it('includes tool descriptions when provided', async () => {
      const result = await buildPersonaPlexPrompt('ferni', {
        userId: 'user-123',
        availableTools: [
          {
            name: 'music',
            triggerPhrase: "I'll play some music",
            description: 'Play background music',
          },
        ],
      });

      expect(result.textPrompt).toContain("I'll play some music");
      expect(result.textPrompt).toContain('AVAILABLE ACTIONS');
    });

    it('falls back to Ferni for unknown persona', async () => {
      const result = await buildPersonaPlexPrompt('unknown-persona');

      expect(result.textPrompt).toContain('Ferni');
    });

    it('handles case-insensitive persona IDs', async () => {
      const result = await buildPersonaPlexPrompt('FERNI');

      expect(result.textPrompt).toContain('Ferni');
    });
  });

  describe('buildMemoryContext', () => {
    it('returns empty string for empty facts', () => {
      const result = buildMemoryContext([]);

      expect(result).toBe('');
    });

    it('formats facts as bullet points', () => {
      const result = buildMemoryContext(['Fact 1', 'Fact 2', 'Fact 3']);

      expect(result).toBe('- Fact 1\n- Fact 2\n- Fact 3');
    });
  });

  describe('buildSessionContext', () => {
    it('returns empty string for empty transcript', () => {
      const result = buildSessionContext([]);

      expect(result).toBe('');
    });

    it('formats transcript with roles', () => {
      const result = buildSessionContext([
        { role: 'user', text: 'Hello!' },
        { role: 'assistant', text: 'Hi there!' },
      ]);

      expect(result).toBe('User: Hello!\nYou: Hi there!');
    });

    it('limits to maxEntries', () => {
      const transcript = [
        { role: 'user' as const, text: 'Message 1' },
        { role: 'assistant' as const, text: 'Response 1' },
        { role: 'user' as const, text: 'Message 2' },
        { role: 'assistant' as const, text: 'Response 2' },
        { role: 'user' as const, text: 'Message 3' },
      ];

      const result = buildSessionContext(transcript, 3);

      expect(result).not.toContain('Message 1');
      expect(result).toContain('Message 3');
    });
  });

  describe('buildTimeContext', () => {
    it('returns string with time of day and day of week', () => {
      const result = buildTimeContext();

      expect(result).toMatch(/It's (morning|afternoon|evening|night|late night) on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/);
    });
  });

  describe('getDefaultToolDescriptions', () => {
    it('returns core tools for all personas', () => {
      const ferniTools = getDefaultToolDescriptions('ferni');

      expect(ferniTools.some((t) => t.name === 'music')).toBe(true);
      expect(ferniTools.some((t) => t.name === 'timer')).toBe(true);
    });

    it('returns persona-specific tools for Maya', () => {
      const mayaTools = getDefaultToolDescriptions('maya-santos');

      expect(mayaTools.some((t) => t.name === 'habit-check')).toBe(true);
    });

    it('returns persona-specific tools for Jordan', () => {
      const jordanTools = getDefaultToolDescriptions('jordan-taylor');

      expect(jordanTools.some((t) => t.name === 'calendar')).toBe(true);
    });

    it('returns persona-specific tools for Peter', () => {
      const peterTools = getDefaultToolDescriptions('peter-john');

      expect(peterTools.some((t) => t.name === 'research')).toBe(true);
    });
  });
});
