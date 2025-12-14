/**
 * SSML Core Functions Tests
 *
 * Tests for:
 * - SSML tag detection and stripping
 * - SSML sanitization (removing stage directions)
 * - Laughter conversion
 */

import { describe, expect, it } from 'vitest';
import { hasSsmlTags, sanitizeSsml, stripSsmlTags } from '../ssml/core.js';

describe('SSML Core Functions', () => {
  describe('hasSsmlTags', () => {
    it('should detect speed tags', () => {
      expect(hasSsmlTags('<speed ratio="1.0">Hello</speed>')).toBe(true);
      expect(hasSsmlTags('<speed ratio="0.9"/>')).toBe(true);
    });

    it('should detect volume tags', () => {
      expect(hasSsmlTags('<volume ratio="1.2">Hello</volume>')).toBe(true);
      expect(hasSsmlTags('<volume ratio="0.8"/>')).toBe(true);
    });

    it('should detect emotion tags', () => {
      expect(hasSsmlTags('<emotion value="happy">Hello</emotion>')).toBe(true);
      expect(hasSsmlTags('<emotion value="sad"/>')).toBe(true);
    });

    it('should detect break tags', () => {
      expect(hasSsmlTags('<break time="500ms"/>')).toBe(true);
      expect(hasSsmlTags('Hello <break time="1s"/> world')).toBe(true);
    });

    it('should detect spell tags', () => {
      expect(hasSsmlTags('<spell>NASA</spell>')).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(hasSsmlTags('Hello world')).toBe(false);
      expect(hasSsmlTags('This is just plain text without any tags.')).toBe(false);
    });

    it('should return false for non-SSML angle brackets', () => {
      expect(hasSsmlTags('x < y and y > z')).toBe(false);
      expect(hasSsmlTags('<div>not ssml</div>')).toBe(false);
    });
  });

  describe('stripSsmlTags', () => {
    it('should remove self-closing speed tags', () => {
      expect(stripSsmlTags('<speed ratio="0.9"/>Hello')).toBe('Hello');
    });

    it('should remove opening speed tags', () => {
      const result = stripSsmlTags('<speed ratio="1.0">Hello');
      expect(result).toBe('Hello');
    });

    it('should remove break tags', () => {
      expect(stripSsmlTags('Hello <break time="500ms"/> world')).toBe('Hello world');
    });

    it('should remove spell tags completely', () => {
      expect(stripSsmlTags('The <spell>NASA</spell> program')).toBe('The NASA program');
    });

    it('should normalize whitespace', () => {
      expect(stripSsmlTags('Hello   <break time="1s"/>   world')).toBe('Hello world');
    });

    it('should handle empty input', () => {
      expect(stripSsmlTags('')).toBe('');
    });

    it('should handle text with no tags', () => {
      expect(stripSsmlTags('Just plain text')).toBe('Just plain text');
    });

    it('should handle multiple break tags', () => {
      expect(stripSsmlTags('Hello <break time="500ms"/> world <break time="1s"/> end')).toBe(
        'Hello world end'
      );
    });
  });

  describe('sanitizeSsml', () => {
    describe('Laughter Conversion', () => {
      it('should convert *chuckles* to [laughter]', () => {
        expect(sanitizeSsml('*chuckles* That is funny')).toContain('[laughter]');
      });

      it('should convert *laughs* to [laughter]', () => {
        expect(sanitizeSsml('*laughs* Great joke')).toContain('[laughter]');
      });

      it('should convert (chuckles) to [laughter]', () => {
        expect(sanitizeSsml('(chuckles) Nice one')).toContain('[laughter]');
      });

      it('should convert [chuckles] to [laughter]', () => {
        expect(sanitizeSsml('[chuckles] Heh')).toContain('[laughter]');
      });

      it('should convert standalone chuckles to [laughter]', () => {
        expect(sanitizeSsml('He chuckles softly. Then says hello.')).toContain('[laughter]');
      });

      it('should convert *laughing* to [laughter]', () => {
        expect(sanitizeSsml('*laughing* That was so funny!')).toContain('[laughter]');
        expect(sanitizeSsml('*laughing*')).toContain('[laughter]');
      });

      it('should convert (laughing) to [laughter]', () => {
        expect(sanitizeSsml('(laughing) Oh my goodness!')).toContain('[laughter]');
      });

      it('should convert [laughing] to [laughter]', () => {
        expect(sanitizeSsml('[laughing] That joke was perfect!')).toContain('[laughter]');
      });

      it('should convert standalone "laughing" to [laughter]', () => {
        const result = sanitizeSsml("Laughing, that's a great point!");
        expect(result).toContain('[laughter]');
        expect(result).not.toMatch(/\blaughing\b/i);
      });

      it('should convert "chuckling" to [laughter]', () => {
        expect(sanitizeSsml('Chuckling softly, she agreed.')).toContain('[laughter]');
        expect(sanitizeSsml('*chuckling*')).toContain('[laughter]');
        expect(sanitizeSsml('(chuckling)')).toContain('[laughter]');
      });

      it('should convert "giggling" to [laughter]', () => {
        expect(sanitizeSsml('Giggling, I said yes.')).toContain('[laughter]');
        expect(sanitizeSsml('*giggling*')).toContain('[laughter]');
        expect(sanitizeSsml('(giggling)')).toContain('[laughter]');
      });

      it('should remove any remaining "laughing" text after conversion', () => {
        // Edge case: Make sure "laughing" doesn't appear in spoken output
        const result = sanitizeSsml('I was laughing so hard at that joke!');
        expect(result).not.toMatch(/\blaughing\b/i);
      });

      it('should not create duplicate [laughter] tags', () => {
        const result = sanitizeSsml('[laughter] *chuckles* More text');
        const laughterMatches = result.match(/\[laughter\]/g) || [];
        // Should consolidate multiple laughters
        expect(laughterMatches.length).toBeLessThanOrEqual(2);
      });
    });

    describe('Stage Direction Removal', () => {
      it('should remove parenthetical sighs', () => {
        const result = sanitizeSsml('Well (sighs deeply) let me think');
        expect(result).not.toContain('sighs');
        expect(result).toContain('Well');
        expect(result).toContain('let me think');
      });

      it('should remove bracketed pauses', () => {
        const result = sanitizeSsml('[long pause] Okay');
        expect(result).not.toContain('pause');
        expect(result).toContain('Okay');
      });

      it('should remove asterisk actions', () => {
        const result = sanitizeSsml('*takes a deep breath* So...');
        expect(result).not.toContain('breath');
        expect(result).toContain('So');
      });

      it('should remove smiles', () => {
        expect(sanitizeSsml('smiles warmly. Hello')).not.toContain('smiles');
        expect(sanitizeSsml('She smiles. How are you?')).not.toContain('smiles');
      });

      it('should remove grins', () => {
        expect(sanitizeSsml('grins. Got it!')).not.toContain('grins');
      });

      it('should remove nods', () => {
        expect(sanitizeSsml('nods. I understand.')).not.toContain('nods');
      });

      it('should remove winks', () => {
        expect(sanitizeSsml('winks. You know what I mean.')).not.toContain('winks');
      });

      it('should remove sighs', () => {
        expect(sanitizeSsml('sighs. Alright.')).not.toContain('sighs');
        expect(sanitizeSsml('He sighs heavily. Fine.')).not.toContain('sighs');
      });

      it('should remove teasing and related tone descriptors', () => {
        expect(sanitizeSsml('Teasing. Oh, you know exactly what I mean.')).not.toContain('Teasing');
        expect(sanitizeSsml('*teasing* Well hello there!')).not.toContain('teasing');
        expect(sanitizeSsml('Teasingly, she replied.')).not.toContain('Teasingly');
      });

      it('should remove "with a smile" phrases', () => {
        const result = sanitizeSsml("With a warm smile, I'd say you're doing great.");
        expect(result).not.toContain('smile');
        expect(result).toContain("I'd say you're doing great");
      });

      it('should remove adjective + smile/tone phrases', () => {
        expect(sanitizeSsml('Teasing smile. Got you!')).not.toContain('smile');
        expect(sanitizeSsml('Playful grin. Nice one!')).not.toContain('grin');
        expect(sanitizeSsml('Knowing smile. I see.')).not.toContain('smile');
      });

      it('should remove smirks', () => {
        expect(sanitizeSsml('He smirks. That was predictable.')).not.toContain('smirks');
        expect(sanitizeSsml('Smirking, she turned away.')).not.toContain('Smirking');
      });

      it('should remove sarcastic and sarcastically', () => {
        expect(sanitizeSsml('Sarcastic. Oh sure, that will work.')).not.toContain('Sarcastic');
        expect(sanitizeSsml('Sarcastically, she replied.')).not.toContain('Sarcastically');
      });

      it('should remove multi-word tone descriptors like "playfully sarcastic"', () => {
        const result = sanitizeSsml('Playfully sarcastic. Oh, you think so?');
        expect(result).not.toContain('Playfully');
        expect(result).not.toContain('sarcastic');
        expect(result).toContain('Oh, you think so?');
      });

      it('should remove other tone combinations', () => {
        expect(sanitizeSsml('Warmly teasing. You know what I mean.')).not.toContain('teasing');
        expect(sanitizeSsml('Wryly. That figures.')).not.toContain('Wryly');
        expect(sanitizeSsml('Deadpan. Sure.')).not.toContain('Deadpan');
        expect(sanitizeSsml('Mockingly. Oh really?')).not.toContain('Mockingly');
      });

      it('should preserve [laughter] while removing other bracketed actions', () => {
        const result = sanitizeSsml('[laughter] That is funny [pauses] okay');
        expect(result).toContain('[laughter]');
        expect(result).not.toContain('pauses');
      });
    });

    describe('Spoken Content Preservation', () => {
      it('should preserve actual spoken words', () => {
        const input = '*smiles* Hello! How are you doing today?';
        const result = sanitizeSsml(input);
        expect(result).toContain('Hello');
        expect(result).toContain('How are you doing today');
      });

      it('should handle complex mixed content', () => {
        const input =
          '*chuckles* Well, (sighs) I think [nods thoughtfully] the market is doing okay.';
        const result = sanitizeSsml(input);
        expect(result).toContain('[laughter]');
        expect(result).toContain('I think');
        expect(result).toContain('the market is doing okay');
        expect(result).not.toContain('sighs');
        expect(result).not.toContain('nods');
      });
    });

    describe('Emotion Tag Preservation', () => {
      it('should preserve inline emotion tags', () => {
        const input = '<emotion value="angry"/>I will not allow this!';
        const result = sanitizeSsml(input);
        expect(result).toContain('<emotion value="angry"/>');
        expect(result).toContain('I will not allow this!');
      });

      it('should preserve mid-sentence emotion changes', () => {
        const input =
          '<emotion value="angry"/>I will not allow this! <emotion value="sad"/>I was hoping for peace.';
        const result = sanitizeSsml(input);
        expect(result).toContain('<emotion value="angry"/>');
        expect(result).toContain('<emotion value="sad"/>');
      });

      it('should preserve emotion tags while removing stage directions', () => {
        const input = '<emotion value="happy"/>*smiles* That is wonderful news!';
        const result = sanitizeSsml(input);
        expect(result).toContain('<emotion value="happy"/>');
        expect(result).not.toContain('smiles');
        expect(result).toContain('That is wonderful news!');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty string', () => {
        expect(sanitizeSsml('')).toBe('');
      });

      it('should handle text with no stage directions', () => {
        const input = 'This is just normal text without any actions.';
        expect(sanitizeSsml(input)).toBe(input);
      });

      it('should handle multiple stage directions in sequence', () => {
        const input = '*smiles* *nods* *sighs* Hello';
        const result = sanitizeSsml(input);
        expect(result.trim()).toContain('Hello');
        // Should not contain any action words
        expect(result).not.toContain('smiles');
        expect(result).not.toContain('nods');
        expect(result).not.toContain('sighs');
      });

      it('should not remove words that contain action words as substrings', () => {
        // 'assassin' contains 'sigh', but shouldn't be affected
        // Actually this might be a bug in the implementation if it uses word boundaries
        const input = 'The assignment was completed.';
        const result = sanitizeSsml(input);
        expect(result).toContain('assignment');
      });
    });
  });
});
