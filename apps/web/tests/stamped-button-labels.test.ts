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
