/**
 * /demo-token: every id the prompt loader maps to a built-in persona goes to the
 * same one, and anything else (a key every object inherits, a real person's
 * name) gets Ferni with the 988 line. The route itself is covered in
 * token-custom-agent-persona.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERSONA_BUNDLES, loadSystemPrompt } from '../../../../agents/personas/prompt-loader.js';
import { demoPersonaFor } from '../token-persona-owner.js';

/** The 988 rule each core character sheet carries (character-lines-you-dont-cross.test.ts). */
const CRISIS_LINE = /might hurt themselves or says they don't want to be here[^.]*988/;
/** A real person's first name in the prompt loader's table: no persona answers to it (alias-resolution.test.ts). */
const REAL_NAME_KEYS = new Set(['joel']);

const demo = (id: string): Promise<unknown> =>
  demoPersonaFor(new URL(`http://localhost/demo-token?persona_id=${encodeURIComponent(id)}`));

afterEach(() => vi.unstubAllEnvs());

describe('/demo-token persona', () => {
  it.each(Object.keys(PERSONA_BUNDLES).flatMap((id) => [id, id.toUpperCase()]))(
    '%s gets the persona the prompt loader picks for it',
    async (id) => {
      const key = id.toLowerCase();
      expect(await demo(id)).toBe(REAL_NAME_KEYS.has(key) ? 'ferni' : PERSONA_BUNDLES[key]);
    }
  );

  it.each(['__proto__', '__PROTO__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    '%s is sent as Ferni, whose prompt carries the 988 line',
    async (id) => {
      const persona = await demo(id);
      expect(persona).toBe('ferni');
      vi.stubEnv('PROMPT_MODE', 'character');
      expect(await loadSystemPrompt(String(persona))).toMatch(CRISIS_LINE);
    }
  );
});
