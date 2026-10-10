import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Ferni should come across as a friend, so the persona prompts never have
 * them volunteer what they are ("as an AI", "your AI life coach") or talk
 * like an assistant. Quoting those phrases as things not to say also put the
 * words in the model's mouth, so they go too.
 *
 * One rule stays, in shared/ai-honesty.md: when someone sincerely asks
 * whether they're talking to a person or an AI, Ferni says so and carries on.
 */
const SRC = join(__dirname, '../../..');
const BUNDLES = join(SRC, 'personas/bundles');

/** Prompt text written in code rather than in a bundle. */
const CODE_PROMPTS = [
  'agents/gce/fast-join.ts',
  'agents/model-provider/cartesia-cascade.ts',
  'agents/model-provider/gemini-live.ts',
  'agents/model-provider/gemini-native-audio.ts',
  'agents/model-provider/openai-realtime.ts',
  'agents/personas/turn-shape.ts',
  'agents/shared/owned-stack-context.ts',
  'agents/shared/tool-executors/information-executor.ts',
  'intelligence/context-builders/safety/principal-alignment.ts',
  'intelligence/tracking/humor.ts',
  'personas/base-identity.ts',
  'personas/greetings.ts',
];

const VOLUNTEERED_AI = [
  /\bas an ai\b/i,
  /\b(i'?m|i am) (just |only )?an ai\b/i,
  /\blanguage model\b/i,
  /\bai assistant\b/i,
  /\bvirtual assistant\b/i,
  /\bai (life )?coach\b/i,
  /\bai companion\b/i,
  /\b(i'?m|i am) (just|only) a program\b/i,
];

/** The honesty rule, the only place the persona is told to say it. */
const ALLOWED = [{ file: 'personas/bundles/shared/ai-honesty.md', text: "I'm an AI, yeah" }];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    // Backups and docs for developers never reach the model.
    if (name.startsWith('.') || name === 'CLAUDE.md' || name === 'README.md') return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(md|json)$/.test(name) ? [p] : [];
  });
}

function hits(file: string, text: string): string[] {
  const rel = relative(SRC, file);
  return text.split('\n').flatMap((line, i) => {
    const allowed = ALLOWED.some((a) => a.file === rel && line.includes(a.text));
    return !allowed && VOLUNTEERED_AI.some((re) => re.test(line)) ? [`${rel}:${i + 1}: ${line.trim()}`] : [];
  });
}

describe('persona prompts never volunteer being an AI', () => {
  it('no bundle file says "as an AI", "AI assistant", "language model" and the like', () => {
    const found = files(BUNDLES).flatMap((f) => hits(f, readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });

  it('no prompt written in code does either', () => {
    const found = CODE_PROMPTS.flatMap((f) => hits(join(SRC, f), readFileSync(join(SRC, f), 'utf8')));
    expect(found).toEqual([]);
  });

  it('keeps exactly one honesty rule for a sincere ask', () => {
    const rules = files(BUNDLES).filter((f) => /sincerely asks/i.test(readFileSync(f, 'utf8')));
    expect(rules.map((f) => relative(SRC, f))).toEqual([ALLOWED[0].file]);
    expect(readFileSync(join(SRC, ALLOWED[0].file), 'utf8')).toContain(ALLOWED[0].text);
  });
});

describe('the assembled prompt', () => {
  beforeAll(() => {
    process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
  });

  afterEach(() => {
    delete process.env.PROMPT_MODE;
  });

  async function prompts(mode: 'character' | 'full', persona: string): Promise<[string, string]> {
    if (mode === 'character') process.env.PROMPT_MODE = 'character';
    vi.resetModules();
    const factory = await import('../../model-provider/factory.js');
    const { CartesiaCascadeProvider } = await import('../../model-provider/cartesia-cascade.js');
    factory.setModelProvider(new CartesiaCascadeProvider() as never);
    const loader = await import('../prompt-loader.js');
    return [await loader.loadModelBaseInstructions(), await loader.loadSystemPrompt(persona)];
  }

  it.each([
    ['character', 'ferni'],
    ['full', 'ferni'],
    ['full', 'maya'],
    ['full', 'joel'],
  ] as const)('%s mode, %s: carries the honesty rule once and nothing volunteered', async (mode, persona) => {
    const [base, system] = await prompts(mode, persona);
    expect(system.length).toBeGreaterThan(1000); // the persona's own prompt, not a fallback
    const all = `${base}\n${system}`;
    expect(all.split('sincerely asks whether').length - 1).toBe(1);
    const volunteered = all
      .split('\n')
      .filter((l) => !l.includes(ALLOWED[0].text) && VOLUNTEERED_AI.some((re) => re.test(l)));
    expect(volunteered).toEqual([]);
  }, 60_000);
});
