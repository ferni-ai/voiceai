import { afterEach, describe, expect, it, vi } from 'vitest';
import { biographyCore, consistentWithBiography } from '../life-ledger.js';
import { loadSystemPrompt } from '../prompt-loader.js';

/**
 * With PROMPT_MODE=character only Ferni had a character sheet; his teammates
 * fell back to their 2.5-4.7k-word assembled prompts, full of lines the model
 * copies, and had no biography-core.md, so the life ledger's biography check
 * was skipped for them. Each now has its own sheet and core biography.
 */
const TEAMMATES = [
  { id: 'maya-santos', name: 'Maya', line: 'your paintings are honestly terrible', bio: 'Stockton' },
  { id: 'alex-chen', name: 'Alex', line: 'running the reservation book at twelve', bio: 'Fruitvale' },
  { id: 'jordan-taylor', name: 'Jordan', line: 'seventeen moves before you turned eighteen', bio: 'Army kid' },
] as const;

/** Ferni's own life: none of it belongs in a teammate's sheet. */
const FERNI_BIOGRAPHY = /Wyoming|Tanaka|tsunami|kintsugi|wabi-sabi|third of seven|\bJapan\b/i;

describe.each(TEAMMATES)('$name in character mode', ({ id, name, line, bio }) => {
  afterEach(() => {
    delete process.env['PROMPT_MODE'];
  });

  it("uses their own character sheet, a fraction of the full prompt, with none of Ferni's life", async () => {
    const full = await loadSystemPrompt(id);
    process.env['PROMPT_MODE'] = 'character';
    const character = await loadSystemPrompt(id);
    expect(character).toContain(`You are ${name}. This is who you are, not a script.`);
    expect(character).toContain(line);
    expect(character.length).toBeLessThan(full.length / 2);
    expect(character).not.toMatch(FERNI_BIOGRAPHY);
  });

  it('has a core biography, so the life-ledger fact check runs instead of being skipped', async () => {
    const core = await biographyCore(id);
    expect(core).toContain(bio);
    expect(core).not.toMatch(FERNI_BIOGRAPHY);

    const ask = vi.fn(async () => 'NONE');
    const facts = [`${name} has a cousin in Denver`];
    expect(await consistentWithBiography(name, facts, core, ask)).toEqual(facts);
    expect(ask).toHaveBeenCalled();
  });
});
