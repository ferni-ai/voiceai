import { afterEach, describe, expect, it, vi } from 'vitest';
import { biographyCore, consistentWithBiography } from '../life-ledger.js';
import { loadDirectorsNotes, loadSystemPrompt, loadToolUsageGuidancePrompt } from '../prompt-loader.js';

/**
 * Peter and Nayan get their own character sheets and core biographies (Maya,
 * Alex and Jordan: teammate-character.test.ts). All five teammates get
 * tool-usage guidance, which only Ferni had, carrying the rule from #462 that a
 * look-up question is answered from a tool, never guessed. Nayan's
 * _assembly.json listed directors_notes, but the file didn't exist and the
 * loader skipped it without a word.
 */
const SHEETS = [
  { id: 'peter-john', name: 'Peter', line: 'worked the register after school', bio: 'Pawtucket' },
  { id: 'nayan-patel', name: 'Nayan', line: 'the last weeks of your grandmother', bio: 'Vadodara' },
] as const;

const TEAMMATES = ['maya-santos', 'alex-chen', 'jordan-taylor', 'peter-john', 'nayan-patel'] as const;

/**
 * Peter and Nayan were drawn from real people. Their sheets are fictional
 * lives now, so none of the real biography's markers may come back.
 */
const REAL_PERSON_MARKERS =
  /Lynch|Carolyn|Boston College|Magellan|Fidelity|caddy|Sadhguru|Jaggi|Isha|Adiyogi|Vijji|Mysore|Chamundi|motorcycle/i;

/** Ferni's own life: none of it belongs in a teammate's sheet. */
const FERNI_BIOGRAPHY = /Wyoming|Tanaka|tsunami|kintsugi|wabi-sabi|third of seven|\bJapan\b/i;

describe.each(SHEETS)('$name in character mode', ({ id, name, line, bio }) => {
  afterEach(() => {
    delete process.env['PROMPT_MODE'];
  });

  it("uses their own sheet plus their tool guidance, with none of Ferni's life", async () => {
    const full = await loadSystemPrompt(id);
    process.env['PROMPT_MODE'] = 'character';
    const character = await loadSystemPrompt(id);
    expect(character).toContain(`You are ${name}. This is who you are, not a script.`);
    expect(character).toContain(line);
    expect(character).toContain(`# ${name} Tool Usage`);
    expect(character.length).toBeLessThan(full.length / 2);
    expect(character).not.toMatch(FERNI_BIOGRAPHY);
    process.env['PROMPT_MODE'] = 'character';
    expect(await loadSystemPrompt(id)).not.toMatch(REAL_PERSON_MARKERS);
  });

  it('has a core biography, so the life-ledger fact check runs instead of being skipped', async () => {
    const core = await biographyCore(id);
    expect(core).toContain(bio);
    expect(core).not.toMatch(FERNI_BIOGRAPHY);
    expect(core).not.toMatch(REAL_PERSON_MARKERS);

    const ask = vi.fn(async () => 'NONE');
    const facts = [`${name} has a cousin in Denver`];
    expect(await consistentWithBiography(name, facts, core, ask)).toEqual(facts);
    expect(ask).toHaveBeenCalled();
  });
});

describe.each(TEAMMATES)('%s tool guidance', (id) => {
  it('says look-up questions are answered from a tool, never guessed', async () => {
    const guidance = (await loadToolUsageGuidancePrompt(id)) ?? '';
    expect(guidance).toContain('Look-up Questions - Call a Tool, Never Guess');
    expect(guidance).toMatch(/Never state a forecast, score, headline, price, opening hour or travel time/);
    expect(guidance).not.toMatch(FERNI_BIOGRAPHY);
  });
});

describe("Nayan's director's notes", () => {
  it('exist where _assembly.json points, and reach his full prompt', async () => {
    const notes = await loadDirectorsNotes('nayan-patel');
    expect(notes).toContain("# Director's Notes for Nayan");
    expect(await loadSystemPrompt('nayan-patel')).toContain('Silence is your instrument.');
  });
});
