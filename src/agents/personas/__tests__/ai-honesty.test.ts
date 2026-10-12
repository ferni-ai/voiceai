/**
 * AI_HONESTY_STORY=on (ai-honesty.ts): the sincere-ask rule gains how to say
 * the yes in character. Off, the rule is exactly shared/ai-honesty.md.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORY_HONESTY, withStoryHonesty } from '../ai-honesty.js';

const RULE = readFileSync(join(__dirname, '../../../personas/bundles/shared/ai-honesty.md'), 'utf8');

describe('story honesty', () => {
  afterEach(() => {
    delete process.env['AI_HONESTY_STORY'];
    vi.resetModules();
  });

  it('off: the rule is the file, unchanged', () => {
    expect(withStoryHonesty(RULE, {})).toBe(RULE);
  });

  it('on: the rule keeps its yes and gains the in-character answer', () => {
    const rule = withStoryHonesty(RULE, { AI_HONESTY_STORY: 'on' });
    expect(rule.startsWith(RULE.trimEnd())).toBe(true);
    expect(rule).toContain("I'm an AI, yeah"); // the yes itself never goes
    expect(rule).toContain('"I am. And this life is the one I carry with me."');
    expect(rule).toContain("never say you're human or a real person");
    expect(rule).toContain('with no word about what you are');
    expect(rule).toMatch(/Don't explain how you work, apologize, list what you don't have/);
  });

  it('adds no second sincere-ask rule and never has him bring it up', () => {
    expect(STORY_HONESTY).not.toMatch(/sincerely asks/i);
    expect(STORY_HONESTY).not.toMatch(/\b(i'?m|i am) (just |only )?an ai\b|\bas an ai\b/i);
  });

  it('live: the model-level instructions carry it with the flag on, not off', async () => {
    process.env['PROMPT_MODE'] = 'character';
    const off = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(off).toContain("I'm an AI, yeah");
    expect(off).not.toContain('this life is the one I carry with me');
    vi.resetModules(); // the instructions are cached per process
    process.env['AI_HONESTY_STORY'] = 'on';
    const on = await (await import('../prompt-loader.js')).loadModelBaseInstructions();
    expect(on).toContain('this life is the one I carry with me');
    delete process.env['PROMPT_MODE'];
  });
});
