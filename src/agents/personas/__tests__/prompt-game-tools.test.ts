/**
 * A game tool a persona's prompt names must be one a voice call has.
 *
 * The games audit (2026-10-18) found Ferni's tool-usage-guidance.md telling him
 * to call startGame or startTextGame, his manifest listing the music games, and
 * the function-calling prompts offering a startGame "trivia" game. None of those
 * tools reaches a call: the games domain is loaded at call start, so a topic
 * never adds it again, and the first agent's 64-slot cap drops every games tool
 * but the gameState scorekeeper. Told to play a game he couldn't start, Ferni
 * improvised it: he "hummed" a tune in text and scored wrong guesses.
 *
 * prompt-tool-names.test.ts checks that a named tool exists; this checks that a
 * named games tool is in the call's first tools (built and capped as
 * agent-setup.ts does, with GAME_STATE=on as in dev and prod). Prompts checked:
 * the live system prompt from the real loader, every manifest, and the
 * function-calling prompts that JSON-calling providers load.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '../../../personas/bundles');
const PERSONAS = readdirSync(BUNDLES).filter((d) =>
  existsSync(join(BUNDLES, d, 'persona.manifest.json'))
);
const FUNCTION_CALLING_PROMPTS = [
  join(BUNDLES, 'shared/function-calling-base.md'),
  ...PERSONAS.map((id) => join(BUNDLES, id, 'identity/function-calling-specialty.md')).filter(
    (path) => existsSync(path)
  ),
];

const gameTools = new Set<string>();
const callTools = new Set<string>();

/** The games tools a text names, as whole words. */
function gameToolsIn(text: string): string[] {
  return [...gameTools].filter((id) =>
    new RegExp(`(?<![A-Za-z0-9])${id}(?![A-Za-z0-9])`).test(text)
  );
}

beforeAll(async () => {
  vi.stubEnv('GAME_STATE', 'on');
  const games = await import('../../../tools/domains/games/index.js');
  for (const tool of await games.getToolDefinitions()) gameTools.add(tool.id);

  const { buildEssentialToolSet } = await import('../../multi-agent/essential-tool-set.js');
  const { resolveInitialToolLimit } = await import('../../multi-agent/initial-tools.js');
  const { capToolsToLimit, getMaxTools } = await import('../../../config/tool-config.js');
  const { tools } = await buildEssentialToolSet({
    personaId: 'ferni',
    userId: 'test-user',
    services: { userProfile: { subscription: { tier: 'free' } } } as never,
  });
  for (const name of Object.keys(capToolsToLimit(tools, resolveInitialToolLimit(getMaxTools()))))
    callTools.add(name);
}, 180_000);

afterAll(() => vi.unstubAllEnvs());

describe('game tools in persona prompts', () => {
  it('knows the games tools and which of them a call has', () => {
    expect(gameTools.has('startGame')).toBe(true);
    expect(callTools.has('gameState')).toBe(true);
    expect(callTools.has('startGame')).toBe(false);
  });

  it.each(PERSONAS)(
    '%s: the live prompt and manifest name no game tool a call lacks',
    async (id) => {
      const { loadSystemPrompt } = await import('../prompt-loader.js');
      process.env['PROMPT_MODE'] = 'character';
      try {
        const prompt = await loadSystemPrompt(id);
        const manifest = readFileSync(join(BUNDLES, id, 'persona.manifest.json'), 'utf8');
        const missing = gameToolsIn(`${prompt}\n${manifest}`).filter(
          (name) => !callTools.has(name)
        );
        expect(missing, `${id} names game tools a call doesn't have`).toEqual([]);
      } finally {
        delete process.env['PROMPT_MODE'];
      }
    }
  );

  it.each(FUNCTION_CALLING_PROMPTS.map((path) => [relative(BUNDLES, path), path]))(
    '%s names no game tool a call lacks',
    (_name, path) => {
      const text = readFileSync(path, 'utf8');
      expect(gameToolsIn(text).filter((name) => !callTools.has(name))).toEqual([]);
    }
  );

  it("ferni's live prompt says what he can't play, and keeps hints and points honest", async () => {
    const { loadSystemPrompt } = await import('../prompt-loader.js');
    process.env['PROMPT_MODE'] = 'character';
    try {
      const prompt = await loadSystemPrompt('ferni');
      expect(prompt).toContain(
        "You can't play song clips by voice; offer a game you can do by voice instead."
      );
      expect(prompt).toContain('Never hum or sing a tune in words');
      expect(prompt).toContain('A hint never gives the answer');
      expect(prompt).toContain('A wrong guess scores nothing');
    } finally {
      delete process.env['PROMPT_MODE'];
    }
  });
});
