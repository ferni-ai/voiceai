import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { corpusOutputs, type CorpusLine } from './name-push-corpus.js';

/**
 * 65 replies: 30 logged name lines and 22 logged lines without one
 * (voiceai-evidence E2E_TTS_OUTPUT), plus the leak shapes. `main` is what
 * origin/main 2979a9202 sent for each, recorded before NAME_FALLING_SPLIT
 * existed: through the name gate (hello and mid-call) and the continuation
 * path, whole and streamed a token at a time, with NAME_FALLING_INTONATION off
 * and on.
 */
const CORPUS = JSON.parse(
  readFileSync(new URL('./fixtures/name-push-corpus.json', import.meta.url), 'utf8')
) as Array<CorpusLine & { main: Record<string, string[]> }>;

const base = { CASCADE_SENTENCE_BREAK_MS: '0' };

describe('NAME_FALLING_SPLIT off', () => {
  it('pins enough of the corpus to mean something', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(CORPUS[0].main)).toHaveLength(20);
  });

  it.each(CORPUS.map((line) => [line.text, line] as const))(
    'sends exactly what main sent: %s',
    async (_, line) => {
      expect(await corpusOutputs(line, { ...base, NAME_FALLING_SPLIT: 'off' })).toEqual(line.main);
      expect(await corpusOutputs(line, base)).toEqual(line.main); // unset: the default
    }
  );

  it('on changes the leak shapes (the comparison can fail)', async () => {
    const changed = [];
    for (const line of CORPUS) {
      const on = await corpusOutputs(line, { ...base, NAME_FALLING_SPLIT: 'on' });
      if (JSON.stringify(on) !== JSON.stringify(line.main)) changed.push(line.text);
    }
    expect(changed).toEqual(
      expect.arrayContaining([
        "Seth, morning. How'd you sleep?",
        'Oh hey Seth, how was the run?',
        'See you later, Sam, have a good one.',
        'I hear you, Sam, and that sounds hard.',
      ])
    );
  });
});
