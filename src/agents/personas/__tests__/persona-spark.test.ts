/**
 * PERSONA_SPARK: the words that forbid fun, loosened for genuinely bright
 * moments only. Off (the default) every prompt and turn reminder is what it
 * was; on, a persona's identity/character-spark.md rides after its character
 * sheet, a bright turn may carry one "!" and one reaction word, and the base
 * prompt's "don't open with Ha!/Oh!" becomes "rarely, and only when it's real".
 * Careful and crisis turns never change.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { llm } from '@livekit/agents';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadSystemPrompt, PERSONA_BUNDLES } from '../prompt-loader.js';
import { SPARSE_MARKUP_NOTE, sparseMarkupNote, SPARK_OPENER } from '../speech-markup-notes.js';
import { callerBright, modelSignals, regexSignals, type TurnSignals } from '../turn-extras.js';
import { callerMove, rngFor, SPARK_BRIGHT, turnShapeFor } from '../turn-shape.js';
import { withTurnReminder } from '../turn-request.js';
import type { Understanding } from '../turn-understanding.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

// A bundle of our own, outside the real ones, so no real persona's prose is pinned here.
const BUNDLES = join(dirname(fileURLToPath(import.meta.url)), '../../../personas/bundles');
let fixtureDir = '';
let fixtureId = '';
const SHEET = '# Pip\n\nYou are Pip. This is who you are, not a script.\n';
const SPARK = '## When something is genuinely good\n\nPip lights up, audibly.\n';

beforeAll(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), 'persona-spark-'));
  mkdirSync(join(fixtureDir, 'identity'));
  writeFileSync(join(fixtureDir, 'identity/character.md'), SHEET);
  writeFileSync(join(fixtureDir, 'identity/character-spark.md'), SPARK);
  // The loader resolves an unknown id as a bundle directory under bundles/.
  fixtureId = relative(BUNDLES, fixtureDir);
});
afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('PERSONA_SPARK character sheet (prompt-loader)', () => {
  it('off: the character prompt has no spark section, the same unset or off', async () => {
    vi.stubEnv('PROMPT_MODE', 'character');
    const unset = await loadSystemPrompt(fixtureId);
    vi.stubEnv('PERSONA_SPARK', 'off');
    const off = await loadSystemPrompt(fixtureId);
    expect(unset).toContain('You are Pip.');
    expect(unset).not.toContain('Pip lights up');
    expect(off).toBe(unset);
  });

  it('on: the spark file rides right after the character sheet, and adds nothing else', async () => {
    vi.stubEnv('PROMPT_MODE', 'character');
    const off = await loadSystemPrompt(fixtureId);
    vi.stubEnv('PERSONA_SPARK', 'on');
    const on = await loadSystemPrompt(fixtureId);
    expect(on).toContain('Pip lights up, audibly.');
    expect(on.indexOf('Pip lights up')).toBeGreaterThan(on.indexOf('You are Pip.'));
    expect(on.replace(`\n\n${SPARK.trim()}`, '')).toBe(off);
  });

  it('on: a persona with no spark file gets its prompt unchanged', async () => {
    vi.stubEnv('PROMPT_MODE', 'character');
    rmSync(join(fixtureDir, 'identity/character-spark.md'));
    try {
      const off = await loadSystemPrompt(fixtureId);
      vi.stubEnv('PERSONA_SPARK', 'on');
      expect(await loadSystemPrompt(fixtureId)).toBe(off);
    } finally {
      writeFileSync(join(fixtureDir, 'identity/character-spark.md'), SPARK);
    }
  });

  it('every real persona: the prompt with the flag off is the prompt with it unset', async () => {
    for (const mode of ['character', 'full']) {
      vi.stubEnv('PROMPT_MODE', mode);
      for (const id of new Set(Object.values(PERSONA_BUNDLES))) {
        vi.stubEnv('PERSONA_SPARK', '');
        const unset = await loadSystemPrompt(id);
        vi.stubEnv('PERSONA_SPARK', 'off');
        expect(await loadSystemPrompt(id), `${mode}/${id}`).toBe(unset);
      }
    }
  }, 60_000);
});

describe('PERSONA_SPARK opener rule (speech-markup-notes)', () => {
  it('off: the base note is exactly as before', () => {
    expect(sparseMarkupNote({})).toBe(SPARSE_MARKUP_NOTE);
    expect(sparseMarkupNote({ PERSONA_SPARK: 'off' })).toBe(SPARSE_MARKUP_NOTE);
    expect(SPARSE_MARKUP_NOTE).toContain(
      'Don\'t open with a stock reaction ("Ha!", "Oh!", "Hmm.") out of habit, and vary how you begin.'
    );
  });

  it('on: the Ha!/Oh! ban becomes "rarely, and only when it\'s real", and nothing else changes', () => {
    const on = sparseMarkupNote({ PERSONA_SPARK: 'on' });
    expect(on).toContain(SPARK_OPENER);
    expect(on).toMatch(/rarely, and only when it's real/);
    expect(on).not.toContain('out of habit, and vary how you begin.');
    // Same note line for line, but the one opener line.
    const a = SPARSE_MARKUP_NOTE.split('\n');
    const b = on.split('\n');
    expect(b.length).toBe(a.length);
    expect(a.filter((line, i) => line !== b[i])).toHaveLength(1);
  });

  it('reaches the model-level base under the Cartesia cascade only when on', async () => {
    vi.stubEnv('CARTESIA_API_KEY', process.env.CARTESIA_API_KEY || 'test-key');
    const base = async (): Promise<string> => {
      vi.resetModules();
      const factory = await import('../../model-provider/factory.js');
      const { CartesiaCascadeProvider } = await import('../../model-provider/cartesia-cascade.js');
      factory.setModelProvider(new CartesiaCascadeProvider() as never);
      const loader = await import('../prompt-loader.js');
      return loader.loadModelBaseInstructions();
    };
    const off = await base();
    vi.stubEnv('PERSONA_SPARK', 'on');
    const on = await base();
    expect(off).not.toContain(SPARK_OPENER);
    expect(on).toContain(SPARK_OPENER);
    expect(on.replace(SPARK_OPENER, '')).toBe(
      off.replace('out of habit, and vary how you begin.', '')
    );
  }, 60_000);
});

const understood = (over: Partial<Understanding> = {}): Understanding => ({
  move: 'share',
  needsTool: false,
  mood: 'neutral',
  laughed: false,
  laughFits: false,
  adviceFits: false,
  wantsToEnd: false,
  reaction: null,
  ...over,
});
const MODES = ['model', 'dice'] as const;
const BRIGHT = [
  'I got the job!',
  'We won the league final last night',
  'Guess what, I passed my bar exam',
];
const NOT_BRIGHT = ['We went to the lake this weekend', 'My cat knocked water onto my keyboard.'];
const CAREFUL = [
  'I got the job but honestly I am so stressed about moving',
  'My dad passed away last week',
  "I'm exhausted, it's been a long day",
];

const reminder = (text: string, mode: (typeof MODES)[number], sig?: TurnSignals): string =>
  turnShapeFor(text, rngFor(`spark:${text}`), mode, sig).reminder;

describe('PERSONA_SPARK bright-turn register (turn-shape)', () => {
  it('reads good news, a joke or a win as bright, and never a careful turn', () => {
    for (const t of BRIGHT) expect(callerBright(t), t).toBe(true);
    for (const t of [...NOT_BRIGHT, ...CAREFUL]) expect(callerBright(t), t).toBe(false);
    expect(regexSignals('I got the job!', callerMove('I got the job!')).bright).toBe(true);
    expect(modelSignals(understood({ mood: 'excited' })).bright).toBe(true);
    expect(modelSignals(understood({ mood: 'funny' })).bright).toBe(true);
    for (const mood of ['venting', 'tender', 'bad_news', 'neutral'] as const)
      expect(modelSignals(understood({ mood })).bright, mood).toBe(false);
  });

  it('off: every reminder is the same unset or off, bright turn or not', () => {
    for (const mode of MODES)
      for (const t of [...BRIGHT, ...NOT_BRIGHT, ...CAREFUL]) {
        const unset = reminder(t, mode);
        vi.stubEnv('PERSONA_SPARK', 'off');
        expect(reminder(t, mode), `${mode}: ${t}`).toBe(unset);
        expect(unset).not.toContain(SPARK_BRIGHT);
        expect(unset).toContain('no generic cheerleading or exclamation marks');
        vi.unstubAllEnvs();
      }
  });

  it('on: a bright turn may carry one "!" and one reaction word; generic cheerleading is still out', () => {
    vi.stubEnv('PERSONA_SPARK', 'on');
    for (const mode of MODES)
      for (const t of BRIGHT) {
        const r = reminder(t, mode);
        expect(r, `${mode}: ${t}`).toContain(SPARK_BRIGHT);
        expect(r).toMatch(/at most one exclamation mark/);
        expect(r).toMatch(/one reaction word/);
        expect(r).not.toContain('cheerleading or exclamation marks');
        expect(r).toContain('no generic cheerleading');
      }
    // The model's reading counts too, with no keyword for it.
    const said = 'my dog stole the sandwich right off the counter while I watched';
    expect(reminder(said, 'model', modelSignals(understood({ mood: 'funny' })))).toContain(
      SPARK_BRIGHT
    );
  });

  it('on: everything that is not a bright turn is exactly as before', () => {
    const off = (t: string, mode: (typeof MODES)[number], sig?: TurnSignals): string => {
      vi.stubEnv('PERSONA_SPARK', 'off');
      const r = reminder(t, mode, sig);
      vi.stubEnv('PERSONA_SPARK', 'on');
      return r;
    };
    vi.stubEnv('PERSONA_SPARK', 'on');
    for (const mode of MODES) {
      for (const t of [...NOT_BRIGHT, ...CAREFUL])
        expect(reminder(t, mode), `${mode}: ${t}`).toBe(off(t, mode));
      // A look-up keeps its plain register.
      const look = "What's the weather tomorrow?";
      expect(reminder(look, mode)).toBe(off(look, mode));
      // Bright words, but the model hears them as tender or bad news: careful wins.
      for (const mood of ['tender', 'bad_news', 'venting'] as const) {
        const sig = modelSignals(understood({ mood }));
        expect(reminder('I got the job!', mode, sig)).toBe(off('I got the job!', mode, sig));
      }
      // Support still held after hard news earlier in the call (CANDOR).
      const held = { ...regexSignals('I got the job!', 'share'), supportFirst: true };
      expect(reminder('I got the job!', mode, held)).not.toContain(SPARK_BRIGHT);
    }
  });

  it('on: no spark line when crisis guidance rides the turn', () => {
    vi.stubEnv('PERSONA_SPARK', 'on');
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'I got the job!' });
    const last = (c: llm.ChatContext): string =>
      (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';
    expect(last(withTurnReminder(ctx, {}))).toContain(SPARK_BRIGHT);
    expect(last(withTurnReminder(ctx, {}, { shape: false }))).not.toContain(SPARK_BRIGHT);
  });
});
