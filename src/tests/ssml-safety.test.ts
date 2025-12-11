/**
 * SSML Safety Tests
 *
 * Tests for XML escaping, emoji handling, URL/email handling,
 * and punctuation cleaning in SSML processing.
 */

import { describe, expect, it } from 'vitest';
import { sanitizeSsml, tagTextWithSsmlPersonaAware } from '../ssml/core.js';

describe('SSML Safety Tests', () => {
  describe('XML Character Escaping', () => {
    it('should escape ampersands in text', () => {
      const result = tagTextWithSsmlPersonaAware('I made $500 & invested it');
      expect(result).toContain('&amp;');
      expect(result).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    });

    it('should not double-escape already-escaped entities', () => {
      const result = tagTextWithSsmlPersonaAware('This &amp; that');
      // Should not become &amp;amp;
      expect(result).not.toContain('&amp;amp;');
    });

    it('should escape less-than signs that are not part of tags', () => {
      const result = tagTextWithSsmlPersonaAware('5 < 10 is true');
      expect(result).toContain('&lt;');
    });

    it('should preserve valid SSML tags', () => {
      // When text already has SSML, it should preserve tags
      const input = '<break time="100ms"/>Hello there';
      const result = tagTextWithSsmlPersonaAware(input);
      expect(result).toContain('<break');
    });
  });

  describe('Emoji Handling', () => {
    it('should remove common emoji', () => {
      const result = tagTextWithSsmlPersonaAware('Great job! 😊👍');
      expect(result).not.toContain('😊');
      expect(result).not.toContain('👍');
    });

    it('should convert laughing emoji to [laughter]', () => {
      const result = tagTextWithSsmlPersonaAware('That was funny 😂');
      expect(result).toContain('[laughter]');
      expect(result).not.toContain('😂');
    });

    it('should convert thinking emoji to hmm', () => {
      const result = tagTextWithSsmlPersonaAware('Let me think 🤔 about that');
      expect(result).toContain('hmm');
      expect(result).not.toContain('🤔');
    });

    it('should remove heart emoji', () => {
      const result = tagTextWithSsmlPersonaAware('I love that! ❤️💜💙');
      expect(result).not.toContain('❤️');
      expect(result).not.toContain('💜');
      expect(result).not.toContain('💙');
    });

    it('should handle text with multiple emoji', () => {
      const result = tagTextWithSsmlPersonaAware('Great! 🎉✨🔥💪');
      expect(result).not.toContain('🎉');
      expect(result).not.toContain('✨');
      expect(result).not.toContain('🔥');
      expect(result).not.toContain('💪');
    });
  });

  describe('URL and Email Handling', () => {
    it('should convert URLs to speakable form', () => {
      const result = tagTextWithSsmlPersonaAware('Check out https://www.example.com/page');
      expect(result).not.toContain('https://');
      expect(result).toContain('example dot com');
    });

    it('should handle URLs without www', () => {
      const result = tagTextWithSsmlPersonaAware('Visit https://ferni.ai today');
      expect(result).not.toContain('https://');
      expect(result).toContain('ferni dot ai');
    });

    it('should convert email addresses to speakable form', () => {
      const result = tagTextWithSsmlPersonaAware('Email me at hello@example.com');
      expect(result).toContain('hello at example dot com');
      expect(result).not.toContain('@');
    });
  });

  describe('Punctuation Cleaning', () => {
    it('should convert double dashes to em-dash', () => {
      const result = tagTextWithSsmlPersonaAware('I was thinking -- maybe we should');
      expect(result).not.toContain('--');
      expect(result).toContain('—');
    });

    it('should normalize multiple exclamation marks', () => {
      const result = tagTextWithSsmlPersonaAware('Amazing!!!');
      expect(result).not.toContain('!!!');
      expect(result).toContain('!');
    });

    it('should handle slash usage', () => {
      const result = tagTextWithSsmlPersonaAware('yes/no questions');
      expect(result).toContain('yes or no');
      // The text portion should not contain slash (SSML tags will have />)
      expect(result).not.toContain('yes/no');
    });

    it('should normalize multiple question marks', () => {
      const result = tagTextWithSsmlPersonaAware('Really???');
      expect(result).not.toContain('???');
      expect(result).toContain('?');
    });
  });

  describe('Stage Direction Sanitization', () => {
    it('should remove asterisk-wrapped stage directions', () => {
      const result = sanitizeSsml('*sighs* I understand');
      expect(result).not.toContain('*sighs*');
      expect(result).not.toContain('sighs');
    });

    it('should remove bracket-wrapped stage directions', () => {
      const result = sanitizeSsml('[pauses thoughtfully] Well...');
      expect(result).not.toContain('[pauses');
      expect(result).not.toContain('thoughtfully]');
    });

    it('should remove parenthesis-wrapped stage directions', () => {
      const result = sanitizeSsml('(takes a deep breath) Okay');
      expect(result).not.toContain('(takes');
      expect(result).not.toContain('breath)');
    });

    it('should convert laugh-related stage directions to [laughter]', () => {
      const result = sanitizeSsml('*chuckles softly* That reminds me');
      expect(result).toContain('[laughter]');
      expect(result).not.toContain('chuckles');
    });

    it('should remove newly added stage direction keywords', () => {
      // Test new keywords we added
      const result1 = sanitizeSsml('*smirks* Interesting');
      const result2 = sanitizeSsml('[trails off] And then...');
      const result3 = sanitizeSsml('(visibly excited) Wow!');

      expect(result1).not.toContain('smirks');
      expect(result2).not.toContain('trails off');
      expect(result3).not.toContain('visibly');
    });

    it('should preserve [laughter] tag', () => {
      const result = sanitizeSsml('[laughter] That was funny');
      expect(result).toContain('[laughter]');
    });
  });

  describe('Combined Safety Processing', () => {
    it('should handle text with multiple issues', () => {
      const input =
        "Great! 😊 Check https://example.com & tell me what you think -- I'm curious *smiles*";
      const result = tagTextWithSsmlPersonaAware(input);

      // No emoji
      expect(result).not.toContain('😊');
      // URL converted
      expect(result).toContain('example dot com');
      // Ampersand escaped
      expect(result).toContain('&amp;');
      // Double dash converted
      expect(result).toContain('—');
    });

    it('should produce valid SSML output', () => {
      const input = 'Test with special chars: & < > "quotes" and emoji 🎉';
      const result = tagTextWithSsmlPersonaAware(input);

      // Should have SSML tags
      expect(result).toContain('<speed');
      expect(result).toContain('<volume');

      // Should not have unescaped special chars breaking the XML
      expect(result).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    });
  });
});
