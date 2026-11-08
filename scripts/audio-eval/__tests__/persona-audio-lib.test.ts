import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { rate } from '../../persona-eval/bar-lib.js';
import { PERSONAS, personaNames, personaParagraph } from '../../persona-eval/roster.js';
import {
  audioPrompt,
  choicesFor,
  CLAIM_RULE,
  judgeArm,
  rosterOf,
  runArms,
  score,
  summary,
  transcriptPrompt,
  type Clients,
  type Roster,
} from '../persona-audio-lib.js';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const ROSTER = rosterOf();
const HENRY = PERSONAS.find((p) => personaNames(p)[0] === 'Henry') ?? 'missing';
const letterOf = (prompt: string, paragraph: string): string =>
  prompt.split('\n').find((l) => l.endsWith(paragraph))?.[0] ?? '?';
const lines = ['ugh. long day.', 'guess who got the job'];

// The fake clip carries who spoke; the fake audio judge finds that persona's paragraph and answers its letter.
function knowing(log: { rendered: string[]; heard: [Buffer, string][]; read: string[] }): Clients {
  return {
    render: async (persona, said) => {
      log.rendered.push(persona);
      return Buffer.from(`${persona}|${said}`);
    },
    hear: async (wav, prompt) => {
      log.heard.push([wav, prompt]);
      return `{"companion":"${letterOf(prompt, personaParagraph(wav.toString().split('|')[0]))}"}`;
    },
    read: async (prompt) => {
      log.read.push(prompt);
      return '{"companion":"A"}';
    },
  };
}
const newLog = () => ({
  rendered: [] as string[],
  heard: [] as [Buffer, string][],
  read: [] as string[],
});

describe('who is judged', () => {
  it('is exactly the roster import, in its order, for every arm', async () => {
    expect(ROSTER.personas).toBe(PERSONAS);
    const log = newLog();
    const arms = await runArms({ voice: () => 'okay.', clips: 'UNAVAILABLE: none' }, lines, () =>
      knowing(log)
    );
    expect(log.rendered).toEqual(PERSONAS.flatMap((p) => lines.map(() => p)));
    expect(arms.clips).toBe('UNAVAILABLE: none');
    expect(arms.voice).toMatchObject({ text: null, audio: { failures: 0 } });
  });
});

describe('the blind judge prompt', () => {
  it('reshuffles the letters every trial, and the same trial always gets the same order', () => {
    const orders = Array.from({ length: 12 }, (_, i) =>
      choicesFor(`reply|ferni|${i}`, ROSTER).order.join()
    );
    expect(new Set(orders).size).toBeGreaterThan(6);
    expect(choicesFor('reply|ferni|3', ROSTER).order.join()).toBe(orders[3]);
    for (const o of orders) expect(o.split(',').sort()).toEqual([...PERSONAS].sort());
  });

  it('never names a persona, in the descriptions or in what was said', async () => {
    const leaky: Roster = {
      ...ROSTER,
      describe: (p) => `${personaParagraph(p)} Ask for ${personaNames(p).join(' ')}.`,
    };
    const said = "it's Tom here, and Henry says hi, so does Ferni";
    const log = newLog();
    await judgeArm('reply', lines, () => said + '!', knowing(log), leaky);
    await judgeArm('reply', lines, (p) => `${said} (${p})`, knowing(log), leaky);
    const prompts = [...log.heard.map(([, p]) => p), ...log.read];
    expect(prompts.length).toBeGreaterThan(PERSONAS.length * lines.length * 2);
    const nameWords = ROSTER.names.flatMap((n) => n.split(/\s+/)).filter(Boolean);
    expect(nameWords).toEqual(expect.arrayContaining(['Tom', 'Henry']));
    for (const prompt of prompts)
      for (const w of nameWords) expect(prompt).not.toMatch(new RegExp(`\\b${w}\\b`, 'i'));
    expect(transcriptPrompt(choicesFor('t', ROSTER), said, ROSTER.names)).toContain(
      "it's ___ here"
    );
  });

  describe('describes each persona from its own bundle', () => {
    let copy = '';
    afterEach(() => copy && rmSync(copy, { recursive: true, force: true }));

    it('so editing a bundle paragraph changes the prompt', () => {
      copy = mkdtempSync(join(tmpdir(), 'persona-bundles-'));
      const bundles = join(copy, 'src/personas/bundles');
      cpSync(join(REPO, 'src/personas/bundles'), bundles, { recursive: true });
      const before = audioPrompt(choicesFor('t', rosterOf(copy)));
      expect(before).toContain(personaParagraph(HENRY));
      const md = join(bundles, HENRY, 'identity/character.md');
      const edited = 'Hums show tunes while thinking, and answers every question with a question.';
      writeFileSync(
        md,
        readFileSync(md, 'utf8').replace(personaParagraph(HENRY).slice(0, 40), edited)
      );
      const after = audioPrompt(choicesFor('t', rosterOf(copy)));
      expect(after).not.toBe(before);
      expect(after).toContain(edited);
    });
  });
});

describe('each judge family gets its own evidence', () => {
  it('the audio judge gets the rendered clip and no words; the text judge gets the words and no clip', async () => {
    const log = newLog();
    const say = (p: string, l: string) => `${p === HENRY ? 'well now' : 'sure thing'}: ${l}`;
    const r = await judgeArm('reply', lines, say, knowing(log), ROSTER);
    expect(log.heard).toHaveLength(PERSONAS.length * lines.length);
    expect(log.read).toHaveLength(PERSONAS.length * lines.length);
    for (const [i, [wav, prompt]] of log.heard.entries()) {
      const persona = PERSONAS[Math.floor(i / lines.length)];
      const line = lines[i % lines.length];
      expect(wav.toString()).toBe(`${persona}|${say(persona, line)}`);
      expect(prompt).not.toContain(line);
      expect(prompt).toMatch(/hear one short reply/);
    }
    for (const [i, prompt] of log.read.entries()) {
      const persona = PERSONAS[Math.floor(i / lines.length)];
      expect(prompt).toContain(`said: "${say(persona, lines[i % lines.length])}"`);
      expect(prompt).not.toMatch(/hear/);
    }
    // The letter the audio judge answers maps back to the persona it stood for.
    expect(score(r.audio, PERSONAS).accuracy).toEqual(rate(18, 18));
    // Always answering A spreads over the personas, since A is someone else each trial.
    expect(new Set(r.text?.map((p) => p.guess)).size).toBeGreaterThan(3);
  });

  it('skips the text judge when every persona says the same words', async () => {
    const log = newLog();
    const r = await judgeArm('voice', lines, () => 'okay.', knowing(log), ROSTER);
    expect(r.text).toBeNull();
    expect(log.read).toHaveLength(0);
    expect(r.audio).toHaveLength(18);
  });

  it('counts an answer without a valid letter as a failure, not a guess', async () => {
    const c = { ...knowing(newLog()), hear: async () => '{"companion":"Q"}' };
    const r = await judgeArm('voice', lines, () => 'okay.', c, ROSTER);
    expect(score(r.audio, PERSONAS)).toMatchObject({ failures: 18, accuracy: { k: 0, n: 0 } });
  });
});

describe('the score', () => {
  const ids = ['a', 'b', 'c'];
  const picks = [
    { persona: 'a', guess: 'a' },
    { persona: 'a', guess: 'b' },
    { persona: 'b', guess: 'b' },
    { persona: 'b', guess: 'b' },
    { persona: 'c', guess: 'a' },
    { persona: 'c', guess: null },
  ];

  it('is accuracy with a Wilson interval over the answered trials, and a confusion matrix', () => {
    const s = score(picks, ids);
    expect(s.accuracy).toEqual(rate(3, 5));
    expect(s.accuracy.lo).toBeCloseTo(0.2307, 3);
    expect(s.accuracy.hi).toBeCloseTo(0.8824, 3);
    expect(s.chance).toBeCloseTo(1 / 3);
    expect(s.failures).toBe(1);
    expect(s.confusion).toEqual([
      [1, 1, 0],
      [0, 2, 0],
      [1, 0, 0],
    ]);
  });

  it('rejects a persona outside the roster', () => {
    expect(() => score([{ persona: 'z', guess: 'a' }], ids)).toThrow(/unknown persona/);
  });

  it('writes the summary with chance, the matrices, the unavailable arm and the claim rule', () => {
    const md = summary(
      { reply: { audio: score(picks, ids), text: null }, clips: 'UNAVAILABLE: none' },
      ids,
      ['Flags: X=on.']
    );
    expect(md).toContain('| reply | audio | 3/5 (60.0%) | 23.1%-88.2% | not different | 1 |');
    expect(md).toContain('vs chance 33.3%');
    expect(md).toContain('| c | 1 | 0 | 0 |');
    expect(md).toContain('| clips | - | UNAVAILABLE: none |');
    expect(md).toContain('not run: the same words for every persona');
    expect(md).toContain(CLAIM_RULE);
    expect(CLAIM_RULE).toMatch(
      /persona-ID rises AND humanness does not fall AND the A\/A.*50%.*both judge families agree/
    );
  });

  it('says a judge that never answered has no verdict, not "below chance"', () => {
    const dead = score(
      ids.map((persona) => ({ persona, guess: null })),
      ids
    );
    const md = summary({ reply: { audio: dead, text: null } }, ids, []);
    expect(md).toContain('| reply | audio | 0/0 (0.0%) | 0.0%-0.0% | no answers | 3 |');
    expect(md).not.toContain('below');
  });
});
