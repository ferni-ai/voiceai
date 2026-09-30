/**
 * The caller's own words for the people (and pets) in their life.
 *
 * Someone who calls their partner "my person", their dog "my fur baby" and
 * their grandmother "Nana" notices when a friend says "your partner", "your
 * dog", "your grandmother" back. A friend picks up their words. This hears
 * the caller's term for a role and asks replies to use it.
 *
 * Pure: detection and wording. Storage lives with the recorder.
 *
 * @module conversation/their-words
 */

export type Role =
  | 'partner'
  | 'best friend'
  | 'pet'
  | 'child'
  | 'mom'
  | 'dad'
  | 'grandmother'
  | 'grandfather';

/** Their words, by role ("partner" -> "my person"). */
export type TheirWords = Partial<Record<Role, string>>;

const TERMS: ReadonlyArray<{ role: Role; pattern: RegExp }> = [
  {
    role: 'partner',
    pattern:
      /\bmy (person|other half|better half|hubby|wifey|boo|sweetheart|significant other|love(?! (for|of|to|is|was|life)))\b/i,
  },
  { role: 'best friend', pattern: /\bmy (bestie|bff|best bud|ride or die)\b/i },
  { role: 'pet', pattern: /\bmy (fur ?baby|fur ?kid|pupper|doggo|kitty|furry friend)\b/i },
  { role: 'child', pattern: /\bmy (kiddo|little one|munchkin|littles)\b/i },
  { role: 'mom', pattern: /\bmy (mama|momma|mum|mommy|ma)\b/i },
  { role: 'dad', pattern: /\bmy (pops|papa|daddy|pa|old man)\b/i },
  { role: 'grandmother', pattern: /\bmy (nana|nan|gran|granny|grammy|abuela|oma|bubbe)\b/i },
  { role: 'grandfather', pattern: /\bmy (gramps|grandpa|papaw|pop-pop|abuelo|opa|zayde)\b/i },
];

/** The terms for roles in something the caller said ("my person" for partner). */
export function detectTheirWords(text: string): TheirWords {
  const found: TheirWords = {};
  for (const { role, pattern } of TERMS) {
    const m = pattern.exec(text);
    if (m) found[role] = `my ${m[1].toLowerCase()}`;
  }
  return found;
}

/** Newer words win; true when anything changed. */
export function mergeTheirWords(known: TheirWords, heard: TheirWords): boolean {
  let changed = false;
  for (const [role, word] of Object.entries(heard) as Array<[Role, string]>) {
    if (known[role] !== word) {
      known[role] = word;
      changed = true;
    }
  }
  return changed;
}

/** The note for replies, or null when none of their words are known. */
export function formatTheirWords(words: TheirWords): string | null {
  const entries = Object.entries(words) as Array<[Role, string]>;
  if (entries.length === 0) return null;
  const said = entries.map(([role, word]) => `"${word.replace(/^my /, '')}" for their ${role}`);
  return `[THEIR WORDS] They say ${said.join(', ')}. Use their words, not yours.`;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && TERMS.some((t) => t.role === value);
}
