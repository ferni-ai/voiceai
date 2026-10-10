/**
 * Stamped button label guard
 *
 * A bulk pass once put generic `aria-label="${t('accessibility.x')}"` labels on buttons
 * that already show their own text. The label wins, so a screen reader announces the
 * stamp instead of the button: "Save Moment" was "Submit", "You reached out" was "Move
 * up", "Log Moment" was "Add". It also breaks voice control, which matches what's on
 * screen: saying "click Save Moment" found nothing. A button that shows text is named by
 * that text; only an icon-only button needs a label.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = join(__dirname, '..', 'src');

const STAMPED_BUTTON =
  /<button\b[^>]*?\saria-label="\$\{t\('(accessibility\.[A-Za-z]+)'\)\}"[^>]*>([\s\S]*?)<\/button>/g;

/** Template expressions (`${...}`, braces balanced) and the text between them */
function splitTemplate(content: string): { text: string; expressions: string[] } {
  let text = '';
  const expressions: string[] = [];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '$' && content[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      for (; j < content.length && depth > 0; j++) {
        if (content[j] === '{') depth++;
        else if (content[j] === '}') depth--;
      }
      expressions.push(content.slice(i + 2, j - 1).trim());
      i = j - 1;
    } else {
      text += content[i];
    }
  }
  return { text, expressions };
}

/** Whether the button's content puts words on screen: literal text, or a t() call */
function showsText(content: string): boolean {
  const { text, expressions } = splitTemplate(content);
  // Tags and entities aren't words: `&times;` on a close button is a symbol
  const literal = text.replace(/<[^>]*>/g, ' ').replace(/&#?\w+;/g, ' ');
  return /\p{L}{2,}/u.test(literal) || expressions.some((e) => /^tp?\(/.test(e));
}

/** `line: key` for each button whose own text is hidden behind a generic label */
function findStampedLabels(source: string): string[] {
  const hits: string[] = [];
  for (const m of source.matchAll(STAMPED_BUTTON)) {
    if (showsText(m[2])) hits.push(`${source.slice(0, m.index).split('\n').length}: ${m[1]}`);
  }
  return hits;
}

const EN = JSON.parse(readFileSync(join(SRC, 'i18n', 'locales', 'en-US.json'), 'utf8')) as Record<string, unknown>;
const english = (key: string): string | undefined => {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], EN);
  return typeof value === 'string' ? value : undefined;
};
const LABELLED_BUTTON = /<button\b[^>]*?\saria-label="\$\{t\('([\w.]+)'\)\}"[^>]*>([\s\S]*?)<\/button>/g;

/**
 * Every string the button can show: its literal text, each t('key') in its content (both
 * sides of a `cond ? t('a') : t('b')`), and quoted words in a `?:` or `||` branch. Not
 * quoted arguments to a call, such as getIcon('close'): that's an icon.
 */
function shownStrings(content: string): string[] {
  const { text, expressions } = splitTemplate(content);
  const literal = text.replace(/<[^>]*>/g, ' ').replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
  const shown = /\p{L}{2,}/u.test(literal) ? [literal] : [];
  for (const expression of expressions) {
    for (const m of expression.matchAll(/\btp?\('([\w.]+)'/g)) shown.push(english(m[1]) ?? m[1]);
    for (const m of expression.matchAll(/(?:^|[?:]|\|\|)\s*'([^']*\p{L}{2,}[^']*)'/gu)) shown.push(m[1]);
  }
  return shown;
}

/** `line: key` for each button whose label names none of the things it shows */
function findMislabelled(source: string): string[] {
  const hits: string[] = [];
  const words = (s: string) => s.replace(/\{\w+\}/g, ' ').replace(/[.…]+$/, '').trim().toLowerCase();
  for (const m of source.matchAll(LABELLED_BUTTON)) {
    const shown = shownStrings(m[2]).map(words).filter(Boolean);
    const label = words(english(m[1]) ?? '');
    if (shown.length && !shown.some((s) => label.includes(s))) {
      hits.push(`${source.slice(0, m.index).split('\n').length}: ${m[1]}`);
    }
  }
  return hits;
}

describe('a button is named by what it shows', () => {
  it('flags a label that names something else, and leaves fitting labels alone (scanner sanity check)', () => {
    const fixture = [
      `<button aria-label="\${t('common.save')}">\${saving ? t('common.saving') : t('logMoment.saveMoment')}</button>`,
      `<button aria-label="\${t('common.delete')}">\${ICONS.trash} \${t('editPerson.removeFromPeople')}</button>`,
      `<button aria-label="\${t('accessibility.next')}">\${last ? 'Begin' : 'Next step'}</button>`,
      `<button aria-label="\${t('calendarView.practiceViewWithInsights')}">\${t('calendarView.practice')}</button>`,
      `<button aria-label="\${t('common.close')}">\${getIcon('close', 18)}</button>`,
      `<button aria-label="\${t('common.close')}">\${ICONS.close}</button>`,
    ].join('\n');
    expect(findMislabelled(fixture)).toEqual(['1: common.save', '2: common.delete', '3: accessibility.next']);
  });

  it("no button's label names something other than what it shows", () => {
    const offenders = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.includes('__tests__'))
      .flatMap((f) => {
        const file = join(SRC, f);
        return findMislabelled(readFileSync(file, 'utf8')).map((hit) => `${relative(SRC, file)}:${hit}`);
      });
    expect(offenders).toEqual([]);
  });
});

describe('stamped button labels', () => {
  it('finds a generic label over visible text, and leaves icon-only buttons alone (scanner sanity check)', () => {
    const fixture = [
      `<button aria-label="\${t('accessibility.submit')}" class="save">\${t('logMoment.save')}</button>`,
      `<button class="a" aria-label="\${t('accessibility.moveUp')}">\${ICONS.up} You reached out</button>`,
      `<button aria-label="\${t('accessibility.close')}" class="x">\${ICONS.close}</button>`,
      `<button aria-label="\${t('accessibility.add')}">\${count}</button>`,
      `<button aria-label="\${t('accessibility.close')}">&times;</button>`,
      `<button aria-label="\${t('a11y.custom')}">Words</button>`,
    ].join('\n');
    expect(findStampedLabels(fixture)).toEqual(['1: accessibility.submit', '2: accessibility.moveUp']);
  });

  it('no button that shows text is named by a generic label', () => {
    const offenders = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !f.includes('__tests__'))
      .flatMap((f) => {
        const file = join(SRC, f);
        return findStampedLabels(readFileSync(file, 'utf8')).map((hit) => `${relative(SRC, file)}:${hit}`);
      });
    expect(offenders).toEqual([]);
  });
});
