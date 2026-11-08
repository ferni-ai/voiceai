/**
 * Every tool a persona's live prompt names must be a tool that exists.
 *
 * The 2026-10-17 persona audit found Ferni's tool-usage-guidance.md naming
 * `understandProcrastination` (no such tool) and a "trivia" game (startGame
 * has none), and Nate's prompt teaching `pauseMusic`, `whatsPlaying` and
 * `getMarketSummary`, none of which the agent is ever offered. A model told to
 * call a missing tool either fails the call or says it did something it didn't.
 *
 * The prompt is assembled by the real loader in PROMPT_MODE=character with the
 * own-life addendum on, so whatever reaches a call is what gets checked:
 * character.md + character-own-life.md + tool-usage-guidance.md +
 * shared-capabilities.md, or the legends' system prompts, which they fall back
 * to without a character sheet. Real tools are the registry with every domain
 * loaded, plus the extra tools buildHandoffTools adds (meetTheTeam and the
 * like). DOMAIN_TOOL_IDS is not used: it was generated in January and lacks
 * playMusic, musicControl and startGame.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildHandoffTools } from '../../../tools/handoff/index.js';
import { toolRegistry } from '../../../tools/registry/index.js';
import { autoRegisterAllDomains, loadToolDomainsLazy } from '../../../tools/registry/loader.js';
import { ALL_TOOL_DOMAINS } from '../../../tools/registry/types.js';
import { loadSystemPrompt } from '../prompt-loader.js';

const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '../../../personas/bundles');
const PERSONAS = readdirSync(BUNDLES).filter((d) =>
  existsSync(join(BUNDLES, d, 'persona.manifest.json'))
);

/** `camelCaseName` in backticks, and the {"fn":"name"} text-call examples. */
function toolNamesIn(prompt: string): string[] {
  const ticked = [...prompt.matchAll(/`([a-z][a-z0-9]*[A-Z][A-Za-z0-9]*)`/g)].map((m) => m[1]!);
  const fnCalls = [...prompt.matchAll(/"fn"\s*:\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]!);
  return [...new Set([...ticked, ...fnCalls])];
}

type Manifest = {
  tools?: { domains?: string[]; required?: string[]; optional?: string[] };
  llm_context?: { tool_guidance?: Record<string, unknown> };
};

/**
 * Tool names a manifest hands to the tool builder (required, optional) or to
 * the LLM context (llm_context.tool_guidance lists and handoff targets).
 * `forbidden` is left out: banning a tool that doesn't exist is harmless.
 */
function manifestToolNames(manifest: Manifest): string[] {
  const names: unknown[] = [...(manifest.tools?.required ?? []), ...(manifest.tools?.optional ?? [])];
  for (const [key, value] of Object.entries(manifest.llm_context?.tool_guidance ?? {})) {
    if (Array.isArray(value)) names.push(...value);
    else if (key === 'handoffs' && value && typeof value === 'object') {
      names.push(...Object.values(value));
    }
  }
  // Entries may carry a note: "saveHabitThesis - When someone commits...", "handoffToPeter (Peter John)"
  return names.map((entry) => String(entry).split(' ')[0]!);
}

const realTools = new Set<string>();
const realDomains = new Set<string>();

beforeAll(async () => {
  // Switchable tools count as real (domain-bridge-real-tools.test.ts does the same).
  vi.stubEnv('FERNI_DEVELOPER_TOOLS', 'on');
  vi.stubEnv('GMAIL_READ_TOOLS', 'on');
  vi.stubEnv('LINKEDIN_ENABLED', 'true');
  vi.stubEnv('LINKEDIN_CLIENT_ID', 'li-id');
  vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'li-secret');
  vi.stubEnv('TMDB_API_KEY', 'tmdb');
  vi.stubEnv('SONOS_CLIENT_ID', 'sonos-id');
  vi.stubEnv('SONOS_CLIENT_SECRET', 'sonos-secret');
  await autoRegisterAllDomains();
  await loadToolDomainsLazy([...ALL_TOOL_DOMAINS]);
  for (const tool of toolRegistry.getAll()) {
    realTools.add(tool.id);
    realDomains.add(tool.domain);
  }
  const handoff = await buildHandoffTools({
    services: { devMode: { enabled: true, bypassUnlocks: true } },
  });
  for (const name of Object.keys(handoff.tools)) realTools.add(name);
}, 180_000);

afterAll(() => vi.unstubAllEnvs());

describe('tool names in persona prompts', () => {
  it('finds names in backticks and in {"fn":...} examples, not plain words', () => {
    expect(toolNamesIn('call `playMusic`, then {"fn":"musicInfo","args":{}}; `ferni` `[laughter]`')).toEqual(
      ['playMusic', 'musicInfo']
    );
  });

  it('loaded the registry', () => {
    expect(realTools.has('playMusic')).toBe(true);
    expect(realTools.has('callOnBehalf')).toBe(true);
    expect(realTools.has('understandProcrastination')).toBe(false);
  });

  it.each(PERSONAS)('%s: every tool the live prompt names exists', async (id) => {
    process.env['PROMPT_MODE'] = 'character';
    process.env['FERNI_PERSONA_SLIP_GUARD'] = 'on';
    try {
      const prompt = await loadSystemPrompt(id);
      const missing = toolNamesIn(prompt).filter((name) => !realTools.has(name));
      expect(missing, `${id} prompt names tools that don't exist`).toEqual([]);
    } finally {
      delete process.env['PROMPT_MODE'];
      delete process.env['FERNI_PERSONA_SLIP_GUARD'];
    }
  });

  it.each(PERSONAS)('%s: every tool and domain its manifest names exists', (id) => {
    const manifest = JSON.parse(
      readFileSync(join(BUNDLES, id, 'persona.manifest.json'), 'utf8')
    ) as Manifest;
    const missing = manifestToolNames(manifest).filter((name) => !realTools.has(name));
    const badDomains = (manifest.tools?.domains ?? []).filter((d) => !realDomains.has(d));
    expect(missing, `${id} manifest names tools that don't exist`).toEqual([]);
    expect(badDomains, `${id} manifest names domains that don't exist`).toEqual([]);
  });
});
