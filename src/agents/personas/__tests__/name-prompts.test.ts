import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Prompt text must not ask Ferni to say the caller's name. Friends say it at
 * hello and goodbye and in about 1 turn in 75 otherwise (SBCSAE, #1413); a
 * prod call said it in 16 of 24 replies after prompts like "Use their name
 * naturally". name-gate.ts limits what the model says; this keeps prompts
 * and few-shot examples from asking for it again.
 */
const ROOT = join(__dirname, '../../../..');
const SKIP = /(__tests__|\.backups-|\/tests\/|node_modules)/;
// Other personas' canon is theirs; Ferni and everything shared is checked.
const OTHER_PERSONA = /personas\/bundles\/(?!ferni\/|shared\/)/;
const NAME_VAR = String.raw`(?:\$\{(?:name|userName|firstName|preferredName|displayName)\}|\{name\})`;
/** Instructions to say the name, and few-shot replies that address the caller by it. */
const LEAD_IN = String.raw`(?:consider\w*|maybe(?: \w+){0,2}|say|e\.g\.|example|try)\s*:?\s*`;
const ASKS = [
  /\b(?:use|uses|using|say|says)\s+(?:their|the user'?s|the caller'?s)\s+(?:first\s+)?name\b/i,
  /\baddress(?:es)?\s+(?:them|the user|the caller)\s+by\s+name\b/i,
  /\bname\b.*\buse it (?:occasionally|naturally|often|now and then)\b/i,
  /\bcall them \$\{name\} (?:now and then|often|from now on)\b/i,
  // Few-shot replies that address the caller: Consider: "Sam, remember when..."
  new RegExp(`\\b${LEAD_IN}["\`]${NAME_VAR},\\s`, 'i'),
  new RegExp(`\\b${LEAD_IN}["\`][^"\`]*,\\s${NAME_VAR}[.?!]`, 'i'),
];
/** Where the name belongs: within the same clause as hello or goodbye. */
const NEAR_HELLO_OR_BYE = /\b(?:hello|hey|hi|goodbye|bye|greet\w*|talk soon|take care)\b/i;
const NEGATED = /\b(?:don'?t|do not|never|not|avoid|no need to|instead of)\b[^.;]*$/i;
const COMMENT = /^\s*(?:\/\/|\/\*|\*(?!\s*\*))/; // TS comments; markdown "* " bullets are checked

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (SKIP.test(p)) return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|md|json)$/.test(p) ? [p] : [];
  });
}

/** The prompt lines that ask for the caller's name outside hello and goodbye. */
export function nameAsks(text: string, markdown = false): number[] {
  const out: number[] = [];
  text.split('\n').forEach((line, i) => {
    if (!markdown && COMMENT.test(line)) return;
    for (const re of ASKS) {
      const m = re.exec(line);
      if (!m) continue;
      const clause = line.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40);
      if (NEAR_HELLO_OR_BYE.test(clause) || NEGATED.test(line.slice(0, m.index))) continue;
      out.push(i + 1);
      return;
    }
  });
  return out;
}

describe('prompt text about the caller name', () => {
  it('catches the shapes that made Ferni say it, and not their opposites', () => {
    for (const ask of [
      '- Use their name naturally',
      "User's name is ${userName}. Use it occasionally but naturally.",
      '`[NAME: Use their name "${userName}" naturally in this response.]`',
      'Call them ${name} now and then',
      '* Say their name a lot.',
      'Address them by name.',
      '`Consider: "${name}, remember when you won?"`',
      'Maybe check in: "Still holding it, ${name}?"',
    ]) {
      expect(nameAsks(ask, true), ask).toEqual([1]);
    }
    for (const fine of [
      "Don't use their name every reply.",
      '- Greeting: "Hey ${name}, good to hear you."',
      'Keep the goodbye short, by name if you know it: "Talk soon, ${name}."',
      "`User's name: ${userName}.`",
      'You have a memory callback available. Use it naturally if it fits:',
      "const nameStr = userName ? `${userName}, ` : '';",
    ]) {
      expect(nameAsks(fine, true), fine).toEqual([]);
    }
  });

  it('never asks Ferni to say their name outside hello and goodbye', () => {
    const hits: string[] = [];
    for (const file of files(join(ROOT, 'src'))) {
      if (OTHER_PERSONA.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      for (const n of nameAsks(text, file.endsWith('.md'))) {
        hits.push(`${file.slice(ROOT.length + 1)}:${n}: ${lines[n - 1].trim().slice(0, 90)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
