/**
 * DEMO_TOKEN_CORE_PERSONAS_ONLY on: every id main's /demo-token sends to a built-in persona
 * goes to the same one, and a key every object inherits gets Ferni with the 988 line.
 * The route itself is covered in token-custom-agent-persona.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERSONA_BUNDLES, loadSystemPrompt } from '../../../../agents/personas/prompt-loader.js';
import { demoPersonaFor } from '../token-persona-owner.js';

/** The 988 rule each core character sheet carries (character-lines-you-dont-cross.test.ts). */
const CRISIS_LINE = /might hurt themselves or says they don't want to be here[^.]*988/;
const ON = { DEMO_TOKEN_CORE_PERSONAS_ONLY: 'on' };

const demo = (id: string, env: Record<string, string> = ON): Promise<unknown> =>
  demoPersonaFor(new URL(`http://localhost/demo-token?persona_id=${encodeURIComponent(id)}`), env);

afterEach(() => vi.unstubAllEnvs());

describe('/demo-token persona with DEMO_TOKEN_CORE_PERSONAS_ONLY on', () => {
  // Main sends the raw id; its prompt loader picks the bundle from the lower-cased id.
  it.each(Object.keys(PERSONA_BUNDLES).flatMap((id) => [id, id.toUpperCase()]))(
    '%s gets the same persona as on main',
    async (id) => {
      expect(await demo(id)).toBe(PERSONA_BUNDLES[id.toLowerCase()]);
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

  it('off: a key every object inherits is passed on as the same string as on main', async () => {
    expect(await demo('__proto__', {})).toBe('__proto__');
  });
});
