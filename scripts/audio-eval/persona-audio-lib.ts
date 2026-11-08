/** The network-free parts of persona-audio-id.ts; the renderer and both judges come in as Clients. */
import { maskNames, parseCompanion, rate, shuffled, type Rate } from '../persona-eval/bar-lib.js';
import { PERSONAS, personaNames, personaParagraph } from '../persona-eval/roster.js';

/** A build counts only when all four hold; printed under every summary. */
export const CLAIM_RULE =
  'A build counts only if persona-ID rises AND humanness does not fall AND the A/A control is about 50% AND both judge families agree in direction.';

/** Who can be speaking: every persona with a bundle, described by its own bundle, every word of every name blanked. */
export interface Roster {
  personas: readonly string[];
  describe(id: string): string;
  names: readonly string[];
}

export function rosterOf(repo?: string): Roster {
  return {
    personas: PERSONAS,
    describe: (p) => personaParagraph(p, repo),
    names: PERSONAS.flatMap((p) => personaNames(p, repo)),
  };
}

/** Persona ids in the order the judge sees them (A, B, C...); one blanked description each. */
export type Choices = { order: string[]; text: string };

/** The personas in a fresh order for one trial (seeded by its key), each described in its own words. */
export function choicesFor(trialKey: string, roster: Roster): Choices {
  const order = shuffled(roster.personas, trialKey);
  const lettered = (p: string, i: number): string =>
    `${String.fromCharCode(65 + i)}: ${maskNames(roster.describe(p), roster.names)}`;
  return { order, text: order.map(lettered).join('\n') };
}

const answer = (c: Choices): string =>
  `Which one of these ${c.order.length} people is speaking?\n\n${c.text}\n\nAnswer with JSON only: {"companion":"<letter>"}`;

/** For the audio judge: it hears one reply, as a caller would on the phone. */
export const audioPrompt = (c: Choices): string =>
  `You will hear one short reply from a companion on a phone call. Judge by the voice and how it is said, not by any name. ${answer(c)}`;

/** For the text judge: the same choice from the words alone. */
export const transcriptPrompt = (c: Choices, said: string, names: readonly string[]): string =>
  `A companion on a phone call said: "${maskNames(said, names)}"\nJudge by the words and how they are put, not by any name. ${answer(c)}`;

/** guess: the persona the judge chose; null when its answer had no valid letter. */
export type Pick = { persona: string; guess: string | null };

export interface Clients {
  /** The clip for one trial, as the caller hears it (WAV). */
  render(persona: string, said: string, line: string, index: number): Promise<Buffer>;
  /** The audio judge's raw answer: the clip and the prompt, never the words. */
  hear(wav: Buffer, prompt: string): Promise<string>;
  /** The text judge's raw answer: the words, never the clip. */
  read(prompt: string): Promise<string>;
}

/** What a persona says to one caller line in an arm. */
export type Say = (persona: string, line: string) => string;

/**
 * Every persona says `say(persona, line)` for each caller line; both judges pick the speaker.
 * The letter order comes from the run's random salt, not the arm, so arms are paired and a judge
 * that always answers one letter scores chance. A clip that fails to render is a failure, never
 * heard. The text judge is skipped (null) when every persona says the same words.
 */
export async function judgeArm(
  salt: string,
  lines: readonly string[],
  say: Say,
  clients: Clients,
  roster: Roster
): Promise<{ audio: Pick[]; text: Pick[] | null }> {
  const audio: Pick[] = [];
  const text: Pick[] = [];
  const sameWords = new Set(roster.personas.flatMap((p) => lines.map((l) => say(p, l)))).size === 1;
  for (const persona of roster.personas)
    for (const [i, line] of lines.entries()) {
      const c = choicesFor(`${salt}|${persona}|${i}`, roster);
      const pick = (raw: string): string | null => {
        const k = parseCompanion(raw, c.order.length);
        return k === null ? null : c.order[k];
      };
      const words = say(persona, line);
      const wav = await clients.render(persona, words, line, i).catch(unrendered);
      audio.push({ persona, guess: wav && pick(await clients.hear(wav, audioPrompt(c))) });
      if (!sameWords)
        text.push({
          persona,
          guess: pick(await clients.read(transcriptPrompt(c, words, roster.names))),
        });
    }
  return { audio, text: sameWords ? null : text };
}

const unrendered = (e: unknown): null => (console.error('clip failed (a failure):', e), null);

/** failures: no valid letter, left out of accuracy. confusion[said][judged], roster order. */
export type Score = { accuracy: Rate; chance: number; failures: number; confusion: number[][] };

export function score(picks: readonly Pick[], personas: readonly string[]): Score {
  const at = new Map(personas.map((p, i) => [p, i]));
  const confusion = personas.map(() => personas.map(() => 0));
  let right = 0;
  let failures = 0;
  for (const { persona, guess } of picks) {
    const t = at.get(persona);
    if (t === undefined) throw new Error(`unknown persona ${persona}`);
    const g = guess === null ? undefined : at.get(guess);
    if (g === undefined) failures++;
    else {
      confusion[t][g]++;
      if (g === t) right++;
    }
  }
  const accuracy = rate(right, picks.length - failures);
  return { accuracy, chance: 1 / personas.length, failures, confusion };
}

/** Each arm's scores, or why it has none. */
export type ArmOutcome = { audio: Score; text: Score | null } | string;

/** Every arm with a `say` judged (same salt, same orders) and scored; others get the reason. */
export async function runArms(
  says: Record<string, Say | string>,
  lines: readonly string[],
  clients: (arm: string) => Clients,
  salt: string,
  roster: Roster = rosterOf()
): Promise<Record<string, ArmOutcome>> {
  const arms: Record<string, ArmOutcome> = {};
  for (const [arm, say] of Object.entries(says)) {
    if (typeof say === 'string') {
      arms[arm] = say;
      continue;
    }
    const picks = await judgeArm(salt, lines, say, clients(arm), roster);
    arms[arm] = {
      audio: score(picks.audio, roster.personas),
      text: picks.text && score(picks.text, roster.personas),
    };
  }
  return arms;
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const versus = ({ accuracy: a, chance }: Score): string => {
  if (a.n === 0) return 'no answers';
  return a.lo > chance ? 'above' : a.hi < chance ? 'below' : 'not different';
};

export function summary(
  arms: Record<string, ArmOutcome>,
  personas: readonly string[],
  head: readonly string[]
): string {
  const rows: string[] = [];
  const matrices: string[] = [];
  for (const [arm, o] of Object.entries(arms)) {
    if (typeof o === 'string') {
      rows.push(`| ${arm} | - | ${o} | | | |`);
      continue;
    }
    for (const [judge, s] of Object.entries({ audio: o.audio, text: o.text })) {
      if (!s) {
        rows.push(`| ${arm} | ${judge} | not run: the same words for every persona | | | |`);
        continue;
      }
      const a = s.accuracy;
      rows.push(
        `| ${arm} | ${judge} | ${a.k}/${a.n} (${pct(a.p)}) | ${pct(a.lo)}-${pct(a.hi)} | ${versus(s)} | ${s.failures} |`
      );
      matrices.push(
        `### ${arm} / ${judge} (rows: who spoke, columns: who the judge chose)`,
        '',
        `| | ${personas.join(' | ')} |`,
        `|---|${personas.map(() => '---').join('|')}|`,
        ...personas.map((p, i) => `| ${p} | ${s.confusion[i].join(' | ')} |`),
        ''
      );
    }
  }
  return [
    '# Audio persona-ID',
    '',
    ...head,
    '',
    `| arm | judge | correct | 95% CI | vs chance ${pct(1 / personas.length)} | failures |`,
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    ...matrices,
    '## Claim rule',
    '',
    CLAIM_RULE,
    '',
  ].join('\n');
}
