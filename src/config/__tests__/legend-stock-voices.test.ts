/**
 * The financial legends speak in stock Cartesia library voices, never in the
 * private clones of the real people their ids are named for (Seth, 2026-10-11).
 * The clones stay in the Cartesia account; nothing may route a persona to one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVoiceIdForPersona, RETIRED_CLONE_VOICE_IDS, VOICE_IDS } from '../voice-ids.js';

const CLONES = [
  '3ebcd114-d280-4eed-a238-b9323a6b8e52',
  '85680374-8d94-43a1-bb15-5eea7a8bdbb8',
  '9c10dc48-8799-42f9-a72a-0c7dfe13a06d',
];

const LEGENDS = [
  { id: 'joel-dickson', env: 'JOEL_DICKSON_VOICE_ID', voice: VOICE_IDS.JOEL_DICKSON },
  { id: 'peter-lynch', env: 'PETER_LYNCH_VOICE_ID', voice: VOICE_IDS.PETER_LYNCH },
  { id: 'john-bogle', env: 'JOHN_BOGLE_VOICE_ID', voice: VOICE_IDS.JOHN_BOGLE },
] as const;

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf-8');

describe('legend voices', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retires exactly the three clones', () => {
    expect([...RETIRED_CLONE_VOICE_IDS].sort()).toEqual([...CLONES].sort());
  });

  it.each(LEGENDS)('$id uses a stock voice in VOICE_IDS and in its manifest', ({ id, voice }) => {
    expect(CLONES).not.toContain(voice);
    const manifest = JSON.parse(read(`src/personas/bundles/${id}/persona.manifest.json`));
    expect(manifest.voice.voice_id).toBe(voice);
    for (const env of [
      ...LEGENDS.map((l) => l.env),
      'JACK_BOGLE_VOICE_ID',
      'PETER_JOHN_VOICE_ID',
    ]) {
      vi.stubEnv(env, '');
    }
    expect(getVoiceIdForPersona(id)).toBe(voice);
  });

  it('gives each legend its own voice, distinct from every teammate', () => {
    const legendVoices = LEGENDS.map((l) => l.voice);
    expect(new Set(legendVoices).size).toBe(3);
    const others = Object.entries(VOICE_IDS)
      .filter(([key]) => !['JOEL_DICKSON', 'PETER_LYNCH', 'JOHN_BOGLE'].includes(key))
      .map(([, v]) => v);
    for (const v of legendVoices) expect(others).not.toContain(v);
  });

  it.each(LEGENDS)(
    'ignores an environment override that names a clone for $id',
    ({ id, env, voice }) => {
      vi.stubEnv(env, CLONES[0]);
      expect(getVoiceIdForPersona(id)).toBe(voice);
      // A legitimate override still wins.
      vi.stubEnv(env, '00000000-0000-4000-8000-000000000000');
      expect(getVoiceIdForPersona(id)).toBe('00000000-0000-4000-8000-000000000000');
    }
  );

  it("ignores the legacy JACK_BOGLE_VOICE_ID fallback for Peter John when it's a clone", () => {
    vi.stubEnv('PETER_JOHN_VOICE_ID', '');
    vi.stubEnv('JACK_BOGLE_VOICE_ID', CLONES[2]);
    expect(getVoiceIdForPersona('peter-john')).toBe(VOICE_IDS.PETER_JOHN);
  });

  it.each([
    'src/api/v1/developers/voice-routes.ts',
    'apps/cli/src/commands/agent/agent-init.ts',
    'tools/agent-starter-template/CUSTOMIZING.md',
  ])('is not offered to developers in %s', (path) => {
    const text = read(path);
    expect(text.length).toBeGreaterThan(500);
    for (const clone of CLONES) expect(text).not.toContain(clone);
  });
});
