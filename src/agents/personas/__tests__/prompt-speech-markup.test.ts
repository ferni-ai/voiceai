/**
 * The live prompts for Ferni teach Cartesia markup. Under the cascade that is
 * right (Cartesia renders it); under Gemini native audio the same prompts must
 * arrive with no markup at all. Loads the real prompt files both ways.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { hasSpeechMarkup } from '../strip-speech-markup.js';

beforeAll(() => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
});

async function promptsUnder(providerModule: string, className: string): Promise<[string, string]> {
  vi.resetModules();
  const factory = await import('../../model-provider/factory.js');
  const mod = (await import(providerModule)) as Record<string, new () => unknown>;
  factory.setModelProvider(new mod[className]() as never);
  const loader = await import('../prompt-loader.js');
  return [await loader.loadModelBaseInstructions(), await loader.loadSystemPrompt('ferni')];
}

describe('speech markup in the live Ferni prompts', () => {
  it('is reduced to one opening emotion tag under the Cartesia cascade', async () => {
    const [base, system] = await promptsUnder(
      '../../model-provider/cartesia-cascade.js',
      'CartesiaCascadeProvider'
    );
    const both = `${base}\n${system}`;
    // Sonic paces itself from punctuation; stacked breaks make it hallucinate.
    expect(both).not.toMatch(/<break|<speed|<volume/);
    // The persona files' tag tables and templated openers are gone...
    expect(system).not.toMatch(/<emotion/);
    expect(system).not.toContain('Natural reactions: "Ha!"');
    // ...replaced by one contract in the model-level block.
    expect(base).toContain('ONE emotion tag');
    expect(base.match(/<emotion value=/g)?.length).toBe(1);
    expect(system.length).toBeGreaterThan(1000);
  }, 60_000);

  it('teaches spoken rather than read writing under the cascade', async () => {
    const [base, system] = await promptsUnder(
      '../../model-provider/cartesia-cascade.js',
      'CartesiaCascadeProvider'
    );
    // A live call read as a string of full stops: "Yeah. The ups and downs of it all. It is like..."
    expect(base).toContain('contractions');
    expect(base).toMatch(/and.*so.*but/);
    expect(base).toContain("it's just, uh, frustrating");
    // Big emotions swung Ferni's pitch range from 6.4 to 10.9 semitones between turns.
    expect(base).not.toMatch(/excited|surprised|enthusiastic/);
    expect(`${base}\n${system}`).not.toContain('Short sentences — Creates natural pauses');
  }, 60_000);

  it('is absent under Gemini native audio, which speaks for itself', async () => {
    const [base, system] = await promptsUnder(
      '../../model-provider/gemini-native-audio.js',
      'GeminiNativeAudioProvider'
    );
    expect(hasSpeechMarkup(base)).toBe(false);
    expect(hasSpeechMarkup(system)).toBe(false);
    expect(base).toContain('You speak in your own voice');
    expect(system.length).toBeGreaterThan(1000);
  }, 60_000);
});
