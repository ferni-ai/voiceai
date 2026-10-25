/**
 * identity/character.md: Ferni doesn't validate every sentence, ask how things
 * feel, thank people for sharing, offer to listen or tell them he's there for
 * them; he just listens. A prod call still opened with "I'm right here if you
 * want to vent, or if you just need a quiet space to decompress", because our
 * own prompt builders told the model to say exactly that ("Consider naturally
 * saying: I'm here if you want to talk", "SAY: I hear you", "This is a safe
 * space"). The model copies example lines, so the builders describe the
 * friend behaviour instead of scripting therapist or host phrases.
 *
 * This scans the prompt builders and the Ferni/shared bundle prompt files for
 * those phrases. Lists of phrases to AVOID, detectors that match them in model
 * output, and crisis guidance are allow-listed by exact line. Crisis lines are
 * safety-critical: every crisis entry must still match a line, verbatim, so a
 * sweep like this one can never rewrite them.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** Code whose strings end up in the model's prompt. */
const SCAN = [
  'src/intelligence',
  'src/conversation/superhuman',
  'src/agents/personas',
  'src/agents/processors',
  'src/personality/application',
  'src/personas/shared',
  'src/personas/bundles/ferni',
  'src/personas/bundles/shared',
];

const PHRASES: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'listen-offer',
    pattern:
      /\bhere for (?:you|whatever)\b|\bI(?:'m| am|'ll be| will be)(?: always| right| still)? here (?:if|when|whenever)\b/i,
  },
  { name: 'safe space', pattern: /\bsafe space\b/i },
  { name: 'hold space', pattern: /\bhold(?:s|ing)? space\b/i },
  { name: 'thanks for sharing', pattern: /\bthank(?:s| you) for sharing\b/i },
  { name: 'that sounds hard', pattern: /\bthat (?:must be|sounds) (?:so |really )?hard\b/i },
  { name: 'I hear you', pattern: /\bI hear you\b/i },
  { name: 'how does that make you feel', pattern: /\bhow does (?:that|this|it) make you feel\b/i },
  { name: 'feelings are valid', pattern: /\bfeelings are valid\b/i },
  { name: "it's okay to feel", pattern: /\bit'?s (?:okay|ok) to feel\b/i },
];

type Bucket = 'avoid' | 'detector' | 'crisis' | 'backstory';

/**
 * file -> exact (trimmed) lines that may keep a phrase.
 * avoid: a list of things NOT to say. detector: matches the phrase in output.
 * crisis: safety-critical, never edited by this sweep. backstory: Ferni's own
 * biography in his voice ("I hold space for everyone else"), not a line to say.
 */
const ALLOWED: Record<string, Array<[Bucket, string]>> = {
  'src/intelligence/collective/integration.ts': [
    [
      'detector',
      "/\\b(i understand|that (sounds|must be)|i hear you|that's (hard|tough|difficult))\\b/i.test(lower)",
    ],
  ],
  'src/intelligence/context-builders/intelligence/semantic-intent-guidance.ts': [
    ['crisis', '1. Validate their pain: "I hear you. This sounds really hard."'],
  ],
  'src/agents/personas/turn-shape.ts': [
    [
      'avoid',
      '\'Talk like a close friend, not a therapist, coach or host: never ask how something feels or what it\\\'s like for them, no stock validation ("that sounds exhausting", "I hear you"), no generic cheerleading or exclamation marks. \' +',
    ],
  ],
  'src/agents/personas/turn-style.ts': [
    [
      'avoid',
      '"Talk like a close friend, not a therapist, coach or host: never ask how something feels or what it\'s like for them, no stock validation (\\"that sounds exhausting\\", \\"I hear you\\"), no generic cheerleading or exclamation marks. React like a person: your own take, a joke, surprise when it\'s surprising, real delight about good news that matters to them. Sound spoken, not written: the small hesitations, restarts and half-finished thoughts people really use, different each time and never the same filler twice in a row.";',
    ],
  ],
  'src/personas/shared/personality-resonance-store.ts': [['detector', '/thank you for sharing/i,']],
  'src/personas/bundles/ferni/content/knowledge/therapeutic-alliance.md': [
    ['avoid', '- Sympathy ("That must be so hard")'],
  ],
  'src/personas/bundles/ferni/identity/biography.md': [
    [
      'backstory',
      "That I hold space for everyone else and there's nothing left for me. That the calm, grounded presence is a role I play, and underneath it I'm just as lost as anyone else.",
    ],
  ],
  'src/personas/bundles/ferni/identity/core-identity.md': [
    ['avoid', '- Never use therapist clichés: "I understand", "I hear you", "That\'s interesting"'],
  ],
  'src/personas/bundles/ferni/identity/directors-notes.md': [
    ['avoid', '- A therapist running a session ("And how does that make you feel?")'],
  ],
  'src/personas/bundles/ferni/llm-expression-generator.ts': [
    ['avoid', '- "That\'s interesting" / "I understand" / "I hear you"'],
    ['avoid', '- "How does that make you feel?" / "Tell me more"'],
    ['avoid', "'i hear you',"],
    ['avoid', "'how does that make you feel',"],
    ['avoid', "'thank you for sharing',"],
  ],
  'src/personas/bundles/shared/model-base-instructions-ftis.md': [
    [
      'avoid',
      'Wrong: "I understand that you\'re feeling overwhelmed. I want you to know that I\'m here for you."',
    ],
    ['avoid', '- Not: "I hear you, Sarah." or "That\'s rough, Sarah."'],
  ],
  'src/personas/bundles/shared/model-base-instructions.md': [
    [
      'avoid',
      'Wrong: "I understand that you\'re feeling overwhelmed. I want you to know that I\'m here for you."',
    ],
    ['avoid', '- Not: "I hear you, Sarah." or "That\'s rough, Sarah."'],
  ],
};

const phrasesIn = (text: string): string[] =>
  PHRASES.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);

function files(path: string): string[] {
  const abs = join(ROOT, path);
  if (statSync(abs).isFile()) return [path];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    // tests, backups (.backups-*), generated files and developer docs (README.md) never reach the prompt
    if (e.name === '__tests__' || e.name.startsWith('.') || e.name.includes('.generated.'))
      return [];
    if (/^[A-Z][A-Z-]*\.md$/.test(e.name)) return [];
    const child = `${path}/${e.name}`;
    if (e.isDirectory()) return files(child);
    if (/\.(test|spec)\.ts$/.test(e.name)) return [];
    return /\.(ts|md)$/.test(e.name) ? [child] : [];
  });
}

/** Drops comment-only lines and trailing `// ...` comments in TypeScript. */
function promptText(file: string, line: string): string {
  if (!file.endsWith('.ts')) return line;
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  const c = line.search(/\s\/\/\s/);
  return c >= 0 ? line.slice(0, c) : line;
}

function offenders(): Array<{ file: string; line: number; text: string; names: string[] }> {
  return SCAN.flatMap(files).flatMap((file) =>
    readFileSync(join(ROOT, file), 'utf8')
      .split('\n')
      .map((text, i) => ({
        file,
        line: i + 1,
        text: text.trim(),
        names: phrasesIn(promptText(file, text)),
      }))
      .filter((o) => o.names.length > 0)
  );
}

describe('prompt builders: no therapist or host phrases', () => {
  it('flags the phrases and passes friend-shaped lines', () => {
    expect(phrasesIn("I'm right here if you want to vent")).toEqual(['listen-offer']);
    expect(phrasesIn("I'm here for you, Sam.")).toEqual(['listen-offer']);
    expect(phrasesIn("I'll be here whenever you're ready.")).toEqual(['listen-offer']);
    expect(phrasesIn('You can tell me anything. This is a safe space.')).toEqual(['safe space']);
    expect(phrasesIn("Hold space, don't push.")).toEqual(['hold space']);
    expect(phrasesIn('Thank you for sharing that with me.')).toEqual(['thanks for sharing']);
    expect(phrasesIn('I hear you. That sounds really hard.')).toEqual([
      'that sounds hard',
      'I hear you',
    ]);
    expect(phrasesIn('And how does that make you feel?')).toEqual(['how does that make you feel']);
    expect(phrasesIn("It's okay to feel sad. Your feelings are valid.")).toEqual([
      'feelings are valid',
      "it's okay to feel",
    ]);
    expect(phrasesIn("Ugh. That's a lot. What happened?")).toEqual([]);
    expect(phrasesIn('What is here for us to learn?')).toEqual([]);
    expect(phrasesIn('Stay with them. Say something real and short.')).toEqual([]);
  });

  it('no prompt builder scripts a therapist or host phrase outside the allow-list', () => {
    const allowed = (file: string, text: string) =>
      (ALLOWED[file] ?? []).some(([, line]) => line === text);
    const found = offenders()
      .filter((o) => !allowed(o.file, o.text))
      .map((o) => `${o.file}:${o.line} [${o.names.join(', ')}] ${o.text}`);
    expect(found).toEqual([]);
  });

  it('every allow-listed line still exists verbatim (crisis text is never rewritten)', () => {
    const seen = new Set(offenders().map((o) => `${o.file}\n${o.text}`));
    const missing = Object.entries(ALLOWED).flatMap(([file, lines]) =>
      lines
        .filter(([, line]) => !seen.has(`${file}\n${line}`))
        .map(([b, line]) => `${b} ${file}: ${line}`)
    );
    expect(missing).toEqual([]);
  });

  it('scans a real surface', () => {
    const scanned = SCAN.flatMap(files);
    expect(scanned.length).toBeGreaterThan(300);
    expect(scanned).toContain('src/intelligence/context-builders/session/meta-conversation.ts');
    expect(scanned).toContain('src/personas/bundles/shared/model-base-instructions.md');
  });
});
