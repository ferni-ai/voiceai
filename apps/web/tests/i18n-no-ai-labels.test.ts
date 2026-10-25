/**
 * No "AI" labels in Ferni's user-facing copy (Seth's standing rule: Ferni is
 * introduced as Ferni, a personal guide, never as "your AI life coach").
 *
 * On 2026-10-18 the copy still said "I'm Ferni, your AI life coach." on the
 * awakening screen (en-US and en-GB), "Your personal team of AI life coaches"
 * in en-GB onboarding, "Ferni — Your AI Life Coach" as the en-GB share title,
 * and the same in every translation (KI, IA, ИИ-style terms, AI in CJK copy,
 * בינה מלאכותית, الذكاء الاصطناعي).
 *
 * The one place "AI" is required, the disclosure Ferni gives third parties it
 * contacts for the user ("<user>'s AI friend"), lives in server code, not in
 * these locale files, so it is not affected.
 *
 * To allow a value, add its locale and key to ALLOWED with the reason it must
 * say AI. Allowed keys must still exist, so a stale entry fails too.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '..');
const LOCALES = join(WEB, 'src', 'i18n', 'locales');

/** "AI" as a word (not inside "J'AI" or "FAIS"), and its equivalents in our languages. */
const AI_LABEL = new RegExp(
  [
    "(?<![A-Za-z0-9'’])AI(?![A-Za-z0-9])", // en, ja/ko/zh/he copy that uses the Latin "AI"
    '(?<![A-Za-z0-9])(?:IA|KI)(?![A-Za-z0-9])', // fr/es IA (including "l'IA"), de KI
    'ИИ',
    '人工智能',
    '人工智慧',
    '인공지능',
    'בינה מלאכותית',
    'الذكاء الاصطناعي',
  ].join('|')
);

/** `locale:key` -> why this value must say AI. None today. */
const ALLOWED: Record<string, string> = {};

/** Source files whose "AI" text never reaches a user. */
const ALLOWED_UI_FILES: Record<string, string> = {
  'src/ui/dev-panel.ui.ts': 'developer-only panel ("AI & Voice" dashboard links), dev builds only',
};

function* strings(value: unknown, path = ''): Generator<[string, string]> {
  if (typeof value === 'string') yield [path, value];
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      yield* strings(child, path ? `${path}.${key}` : key);
    }
  }
}

const locales = readdirSync(LOCALES).filter((file) => file.endsWith('.json'));

function aiLabels(): string[] {
  const found: string[] = [];
  for (const file of locales) {
    const locale = file.replace(/\.json$/, '');
    const json: unknown = JSON.parse(readFileSync(join(LOCALES, file), 'utf8'));
    for (const [key, value] of strings(json)) {
      if (AI_LABEL.test(value) && !(`${locale}:${key}` in ALLOWED)) {
        found.push(`${locale}:${key} = ${value.slice(0, 80)}`);
      }
    }
  }
  return found;
}

function uiFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return uiFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('no "AI" labels in user-facing copy', () => {
  it('catches the label and its translations, not "J\'AI" or words that contain it', () => {
    for (const label of ["I'm Ferni, your AI life coach.", 'Dein KI-Team', 'coachs de vie IA', 'あなたのAIライフコーチ', 'AI 伴侣', 'ב-AI', 'צוות בינה מלאכותית', "Contexte de l'IA"]) {
      expect(AI_LABEL.test(label), label).toBe(true);
    }
    for (const fine of ["CE QUE J'AI TROUVÉ POUR TOI", 'FAIS CONNAISSANCE', 'AIDS', 'Kiosk', 'MAIL']) {
      expect(AI_LABEL.test(fine), fine).toBe(false);
    }
  });

  it(`finds none in the ${locales.length} locale files outside the allowlist`, () => {
    expect(locales.length).toBeGreaterThanOrEqual(11);
    expect(aiLabels()).toEqual([]);
  });

  it('allowlists only keys that exist', () => {
    for (const entry of Object.keys(ALLOWED)) {
      const [locale, key] = entry.split(':') as [string, string];
      const json = JSON.parse(readFileSync(join(LOCALES, `${locale}.json`), 'utf8')) as Record<string, unknown>;
      const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], json);
      expect(typeof value, entry).toBe('string');
    }
  });

  it('finds no hardcoded "AI" text in src/ui outside comments, logs and the allowlist', () => {
    const found: string[] = [];
    for (const path of uiFiles(join(WEB, 'src', 'ui'))) {
      const file = relative(WEB, path);
      if (file in ALLOWED_UI_FILES) continue;
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const code = line.trim();
          if (/^(\/\/|\*|\/\*)/.test(code) || /\b(log|console)\.\w+\(/.test(code)) return;
          if (AI_LABEL.test(code.replace(/\/\/.*$/, ''))) found.push(`${file}:${index + 1}: ${code.slice(0, 80)}`);
        });
    }
    expect(found).toEqual([]);
  });
});
