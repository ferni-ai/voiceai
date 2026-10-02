/**
 * When Gemini Live speaks, the prompt must not teach Cartesia markup: a
 * native-audio model would read "[laughter]" or "<break time>" out loud or
 * mimic the syntax instead of the emotion.
 */
import { describe, expect, it } from 'vitest';
import { hasSpeechMarkup, stripSpeechMarkupGuidance } from '../strip-speech-markup.js';

const PROMPT = `# Base

## Voice Output

Keep it short.

### SSML Tags

Use <break time="300ms"/> for pauses.
Use <emotion value="curious"/> to lean in.

### SSML Examples

"Oh! [laughter] That's a good one!"

### Never Do

Never read a list aloud.

## Human Speech Patterns

Use contractions. You can laugh with [laughter] when it fits.
`;

describe('stripSpeechMarkupGuidance', () => {
  it('removes markup sections and stray tag lines, keeps everything else', () => {
    const out = stripSpeechMarkupGuidance(PROMPT);
    expect(hasSpeechMarkup(out)).toBe(false);
    expect(out).toContain('Keep it short.');
    expect(out).toContain('### Never Do');
    expect(out).toContain('Never read a list aloud.');
    expect(out).not.toContain('SSML');
  });

  it('drops examples whose whole body was markup, with their labels and empty heading', () => {
    const prompt = [
      '## Signature Moments',
      '',
      '**Heavy topic:**',
      '```',
      '<emotion value="sympathetic"/><speed ratio="0.9"/>',
      '```',
      '',
      '## Honesty',
      '',
      'Never invent memories.',
      '',
    ].join('\n');
    const out = stripSpeechMarkupGuidance(prompt);
    expect(out).not.toContain('```');
    expect(out).not.toContain('Heavy topic');
    expect(out).not.toContain('Signature Moments');
    expect(out).toContain('## Honesty');
    expect(out).toContain('Never invent memories.');
  });

  it('leaves a prompt without markup unchanged', () => {
    const clean = '# Base\n\n## Voice\n\nBe warm.\n';
    expect(stripSpeechMarkupGuidance(clean)).toBe(clean);
  });

  it('detects each markup form', () => {
    for (const s of [
      '<break time="1s"/>',
      '<emotion value="sad"/>',
      '<speed ratio="0.9"/>',
      '[laughter]',
      '<volume ratio="1.2"/>',
    ]) {
      expect(hasSpeechMarkup(`x ${s} y`)).toBe(true);
    }
    expect(hasSpeechMarkup('3 < 5 and [1-10]')).toBe(false);
  });
});
