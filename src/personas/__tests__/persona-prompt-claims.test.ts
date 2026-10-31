/**
 * Persona prompts don't promise a memory or a nature no one has (#1427), and
 * don't carry the example lines the model was caught saying word for word (#1428).
 *
 * Ferni's prompt said "You remember EVERYTHING... Your best friend forgets. You
 * don't."; Alex's said "You remember EVERY conversation" and quoted "You
 * apologize in 73% of your emails". With no room to forget, every gap gets
 * filled with an invented detail (#1406), and quoted numbers get said to
 * callers as if they were counted. The prompts now say he remembers what he was
 * told and what was saved, can be wrong, and asks.
 *
 * Checked: every prompt file a persona's _assembly.json names, the character
 * sheets and tool guidance (PROMPT_MODE=character), every shared module, and the
 * prompts the two builders actually assemble (prompt-loader, prompt-assembler).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSystemPrompt } from '../../agents/personas/prompt-loader.js';
import { getStaticPrompt } from '../bundles/prompt-assembler.js';

const BUNDLES = join(process.cwd(), 'src', 'personas', 'bundles');

const BANNED: Array<{ name: string; pattern: RegExp }> = [
  { name: 'perfect memory', pattern: /\bperfect memory\b|\bmemory is perfect\b/i },
  {
    name: 'remembers everything',
    pattern: /\bremembers? (?:everything|every (?:conversation|detail|promise))\b/i,
  },
  {
    name: 'never forgets',
    pattern: /\b(?:you|we) (?:never|don'?t) forget\b|\bforgets\. (?:you|we) don'?t\b/i,
  },
  { name: 'superhuman', pattern: /\bsuper-?human\b/i },
  { name: 'better than human', pattern: /\bbetter than (?:any )?humans?\b/i },
  {
    name: 'no human can match',
    pattern:
      /\b(?:capabilities|abilities|powers) (?:that )?no human\b|\bno human (?:friend |mentor |coach |therapist )?(?:can|could) (?:match|provide)\b/i,
  },
  {
    name: 'never tired',
    pattern: /\bnever (?:get )?tired\b|\bnever have a bad day\b|\bno bad days\b|\bhave bad days\b/i,
  },
  { name: 'sees what they cannot', pattern: /\bsee (?:patterns |what )they can'?t\b/i },
  {
    name: 'statistic claim',
    pattern:
      /\b\d+(?:\.\d+)?\s?% (?:lower|higher|more|less|fewer|better|worse|of (?:your|their|people|users)\b)/i,
  },
  {
    name: 'copied example line',
    pattern:
      /I'm sensing some pushback|\bapologize in \d+%|Grief and hope can coexist\. I know|You are not your thoughts\. You are the one who can observe/i,
  },
];

/** A percentage inside a quoted line: a number the model will say as if it counted it. */
const QUOTED_STAT = /"[^"\n]*\b\d+(?:\.\d+)?\s?%[^"\n]*"/;
/** Allowed: a labelled wrong example, and table rows of what a caller asks for (tool examples). */
const NOT_SPEECH = /^\s*(?:Wrong:|\|)/;

function bannedIn(text: string): string[] {
  const found = BANNED.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
  const stat = text.split('\n').some((line) => !NOT_SPEECH.test(line) && QUOTED_STAT.test(line));
  return stat ? [...found, 'quoted statistic'] : found;
}

const PERSONAS = readdirSync(BUNDLES).filter((d) =>
  existsSync(join(BUNDLES, d, 'content', 'prompts', '_assembly.json'))
);

/** Every file a persona prompt is built from. */
function promptFiles(): string[] {
  const files = new Set<string>();
  for (const persona of PERSONAS) {
    const assembly = JSON.parse(
      readFileSync(join(BUNDLES, persona, 'content', 'prompts', '_assembly.json'), 'utf8')
    ) as { prompt_modules: Record<string, string> };
    for (const path of Object.values(assembly.prompt_modules))
      if (!path.startsWith('shared:')) files.add(join(BUNDLES, persona, path));
    for (const name of readdirSync(join(BUNDLES, persona, 'identity')))
      if (/^(?:character|tool-usage-guidance).*\.md$/.test(name))
        files.add(join(BUNDLES, persona, 'identity', name));
  }
  for (const name of readdirSync(join(BUNDLES, 'shared')))
    if (name.endsWith('.md') && name !== 'README.md') files.add(join(BUNDLES, 'shared', name));
  return [...files].filter((f) => existsSync(f));
}

describe('persona prompts: no superhuman memory claims or copyable stats', () => {
  it('flags the old lines and passes the honest rewrites', () => {
    expect(bannedIn('You remember EVERYTHING. That thing they mentioned six months ago?')).toEqual([
      'remembers everything',
    ]);
    expect(bannedIn('🧠 **Perfect Memory**')).toEqual(['perfect memory']);
    expect(bannedIn("**The promise:** Your best friend forgets. You don't.")).toEqual([
      'never forgets',
    ]);
    expect(bannedIn('## YOUR SUPERHUMAN EDGE — What Makes You "Better Than Human"')).toEqual([
      'superhuman',
      'better than human',
    ]);
    expect(bannedIn('You have abilities no human friend can match.')).toEqual([
      'no human can match',
    ]);
    expect(bannedIn('You never have a bad day. Never distracted. Never tired.')).toEqual([
      'never tired',
    ]);
    expect(
      bannedIn('| Get tired, distracted, have bad days | Consistent presence, always |')
    ).toEqual(['never tired']);
    expect(bannedIn("| Miss patterns in themselves | See patterns they can't |")).toEqual([
      'sees what they cannot',
    ]);
    expect(
      bannedIn('"You apologize in 73% of your emails. Even when you didn\'t do anything wrong."')
    ).toEqual(['statistic claim', 'copied example line', 'quoted statistic']);
    expect(bannedIn('Meetings after 3 PM have 40% lower decision quality.')).toEqual([
      'statistic claim',
    ]);
    expect(bannedIn('Stay curious. "I\'m sensing some pushback. What\'s going on?"')).toEqual([
      'copied example line',
    ]);

    expect(
      bannedIn("Your memory isn't perfect. When you're not sure, say so and check with them.")
    ).toEqual([]);
    expect(bannedIn('Marty, who never forgets a birthday')).toEqual([]);
    expect(bannedIn('"Let me put this somewhere you won\'t forget."')).toEqual([]);
    expect(bannedIn('Wrong: "Your spending increased 23% in Q4."')).toEqual([]);
    expect(bannedIn('Primary (80%): warm, curious')).toEqual([]);
    expect(bannedIn('### Core Emotions (60% of time)')).toEqual([]);
    expect(bannedIn('A 1% improvement daily compounds to 37x in a year.')).toEqual([]);
  });

  it('no persona prompt file carries a banned claim', () => {
    const files = promptFiles();
    expect(files.length).toBeGreaterThan(40);
    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => bannedIn(line).length > 0)
        .map((line) => `${relative(BUNDLES, file)}: [${bannedIn(line).join(', ')}] ${line}`)
    );
    expect(offenders).toEqual([]);
  });

  describe('assembled prompts', () => {
    afterEach(() => {
      delete process.env['PROMPT_MODE'];
    });

    it.each(PERSONAS)('%s: none in what prompt-loader builds, full and character', async (id) => {
      const prompts = [await loadSystemPrompt(id), await loadSystemPrompt(id, 'full_context')];
      process.env['PROMPT_MODE'] = 'character';
      prompts.push(await loadSystemPrompt(id));
      for (const prompt of prompts) {
        expect(prompt.length).toBeGreaterThan(500);
        expect(bannedIn(prompt)).toEqual([]);
      }
    });

    it.each(PERSONAS)('%s: none in what prompt-assembler builds', async (id) => {
      expect(bannedIn(await getStaticPrompt(id))).toEqual([]);
    });

    it("prompt-assembler's role summary is in what it builds (so the check above reads it)", async () => {
      expect(await getStaticPrompt('maya-santos')).toContain('### What You Bring');
    });
  });
});
