/**
 * The consented-clone records name each legend's voice setting and never hold a
 * voice id. The voice id here is invented.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configuredLegendVoiceIds } from '../index.js';

const INVENTED_VOICE = '0b0b0b0b-1111-4222-8333-444444444444';

describe('the consented-clone records', () => {
  it('never hold a voice id in source', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/personas/roster/voice-records.ts'),
      'utf-8'
    );
    expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe('configuredLegendVoiceIds', () => {
  it('lists a set voice setting, trimmed, and skips an unset or blank one', () => {
    expect(configuredLegendVoiceIds({ LEGEND_VOICE_JOHN_BOGLE: ` ${INVENTED_VOICE} ` })).toEqual([
      INVENTED_VOICE,
    ]);
    for (const value of [undefined, '', '   ']) {
      expect(configuredLegendVoiceIds({ LEGEND_VOICE_JOHN_BOGLE: value })).toEqual([]);
    }
  });
});
