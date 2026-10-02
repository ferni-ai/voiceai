/**
 * Preference tools: registration consistency across the four Gemini
 * JSON-workaround files, plus executor routing and argument coercion.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';

const setPreferenceFromVoice = vi.fn(async () => 'saved');
const describePreferencesForVoice = vi.fn(async () => 'described');
vi.mock('../../../../services/user-preferences/index.js', async () => {
  const voice = await vi.importActual<
    typeof import('../../../../services/user-preferences/voice.js')
  >('../../../../services/user-preferences/voice.js');
  return {
    setPreferenceFromVoice,
    describePreferencesForVoice,
    VOICE_PREFERENCE_TYPES: voice.VOICE_PREFERENCE_TYPES,
  };
});

const { REGISTERED_TOOLS } = await import('../../function-call-format.js');
const { routeToToolModular, getToolDomain } = await import('../index.js');
const { toSetPreferenceArgs } = await import('../preferences-executor.js');

const ROOT = join(__dirname, '../../../../..');
const TOOLS = ['setPreference', 'getPreferences'] as const;

describe('preference tools — four-file consistency (Gemini JSON workaround)', () => {
  it.each(TOOLS)('%s is in the prompt (function-calling-base.md)', (tool) => {
    const prompt = readFileSync(
      join(ROOT, 'src/personas/bundles/shared/function-calling-base.md'),
      'utf8'
    );
    expect(prompt).toContain(`| ${tool}`);
  });

  it.each(TOOLS)('%s is in the sanitizer patterns (tool-patterns.json)', (tool) => {
    const patterns = JSON.parse(
      readFileSync(join(ROOT, 'src/agents/shared/sanitizer/config/tool-patterns.json'), 'utf8')
    ) as { domains: Record<string, { patterns: string[] }> };
    const all = Object.values(patterns.domains).flatMap((d) => d.patterns);
    expect(all).toContain(tool);
  });

  it.each(TOOLS)('%s is routed by the executor registry', (tool) => {
    expect(getToolDomain(tool)).toBe('preferences');
  });

  it.each(TOOLS)('%s is in REGISTERED_TOOLS', (tool) => {
    expect(REGISTERED_TOOLS as readonly string[]).toContain(tool);
  });

  it('the native tool definitions use the same ids', async () => {
    vi.doMock('@livekit/agents', () => ({ llm: { tool: (c: unknown) => c } }));
    const { setPreferenceDef, getPreferencesDef } =
      await import('../../../../tools/domains/simple-utilities/preference-tools.js');
    expect([setPreferenceDef.id, getPreferencesDef.id]).toEqual([...TOOLS]);
  });
});

describe('preferences executor', () => {
  it('routes JSON calls to the shared voice service', async () => {
    const ctx = { userId: 'u1', sessionId: 's1' };
    expect(
      await routeToToolModular('setPreference', { type: 'avoid-topic', value: 'my dad' }, ctx)
    ).toBe('saved');
    expect(setPreferenceFromVoice).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ preferenceType: 'avoid-topic', value: 'my dad', action: 'set' })
    );
    expect(await routeToToolModular('getPreferences', {}, ctx)).toBe('described');
  });

  it('coerces untrusted args (unknown types and categories are dropped)', () => {
    expect(
      toSetPreferenceArgs({
        preferenceType: 'hack',
        type: 'like',
        value: ' jazz ',
        category: 'weird',
        action: 'forget',
        status: 'watching',
        detail: 5,
      })
    ).toEqual({
      preferenceType: 'like',
      value: ' jazz ',
      customKey: undefined,
      detail: undefined,
      status: 'watching',
      category: undefined,
      action: 'forget',
      statement: undefined,
    });
  });
});
