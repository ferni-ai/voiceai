import { describe, expect, it } from 'vitest';
import { rootAliases, roleTable, themeRoles, tokenize } from '../tokenize-colours.js';

const roles = themeRoles();
const table = roleTable(roles);
const css = (text: string) => tokenize(text, table, false);

describe('website colour codemod', () => {
  it('swaps a literal for the role with the same light value, matched by property', () => {
    const out = css('.a { color: #2C2520; background: #faf8f5; border: 1px solid #3D5A45; }');
    expect(out.text).toBe(
      '.a { color: var(--color-text-primary); background: var(--color-surface-base); border: 1px solid var(--color-accent); }'
    );
  });

  it('treats short hex, rgb() and named colours as the same colour', () => {
    expect(css('.a { background-color: #fff }').text).toBe(
      '.a { background-color: var(--color-surface-raised) }'
    );
    expect(css('.a { background: white }').text).toBe(
      '.a { background: var(--color-surface-raised) }'
    );
    expect(css('.a { color: rgb(44, 37, 32) }').text).toBe(
      '.a { color: var(--color-text-primary) }'
    );
    expect(css('.a { border-color: rgba(44,37,32,.18) }').text).toBe(
      '.a { border-color: var(--color-border-strong) }'
    );
  });

  it('never gives a property a role of another kind', () => {
    // #faf8f5 is a surface; as text it would be text-inverse or on-accent, which the codemod can't tell apart.
    const out = css('.a { color: #faf8f5 }');
    expect(out.text).toBe('.a { color: #faf8f5 }');
    expect(out.unmatched[0]?.reason).toBe('no text role is #faf8f5');
  });

  it('leaves dark-context rules, custom properties, fallbacks and gradients alone', () => {
    const input = [
      '@media (prefers-color-scheme: dark) { .a { color: #2c2520 } }',
      '.theme--dark .b { color: #2c2520 }',
      ':root { --ink: #2c2520 }',
      '.c { color: var(--page-ink, #2c2520) }',
      '.d { background: linear-gradient(#faf8f5, #fff) }',
      '.e { box-shadow: 0 0 1px #2c2520 }',
    ].join('\n');
    const out = css(input);
    expect(out.text).toBe(input);
    expect(out.unmatched.map((u) => u.reason)).toEqual([
      'dark context',
      'dark context',
      'custom property',
      'var() fallback',
      'gradient',
      'gradient',
      'property has no role',
    ]);
  });

  it('leaves comments and colours no role has alone', () => {
    const out = css('/* color: #2c2520 */ .a { color: #123456 }');
    expect(out.text).toBe('/* color: #2c2520 */ .a { color: #123456 }');
    expect(out.unmatched).toEqual([
      { line: 1, property: 'color', literal: '#123456', reason: 'no text role is #123456' },
    ]);
  });

  it('rewrites template <style> blocks and style attributes, and reports lines', () => {
    const njk =
      '<style>\n.a { color: #5c544a; }\n</style>\n<p style="background: #f5f2ed">{{ title }}</p>';
    const out = tokenize(njk, table, true);
    expect(out.text).toBe(
      '<style>\n.a { color: var(--color-text-secondary); }\n</style>\n<p style="background: var(--color-surface-sunken)">{{ title }}</p>'
    );
    expect(out.changes.map((c) => c.line)).toEqual([2, 4]);
  });

  describe('page aliases', () => {
    const aliases = rootAliases(
      '@media (prefers-color-scheme: dark) { :root:root { --page-ink: #f4efe6; --page-card: #2a241f; --page-peter: #8bc4cf; } }'
    );
    const page = (text: string) => tokenize(text, table, false, aliases);

    it('reads the aliases a stylesheet declares', () => {
      expect([...aliases]).toEqual([
        ['--page-ink', '#f4efe6'],
        ['--page-card', '#2a241f'],
        ['--page-peter', '#8bc4cf'],
      ]);
    });

    it('swaps the whole var() when the role matches the literal in light and the alias in dark', () => {
      const out = page(
        '.a { color: var(--page-ink, #2C2520); background: var(--page-card, white) }'
      );
      expect(out.text).toBe(
        '.a { color: var(--color-text-primary); background: var(--color-surface-raised) }'
      );
      expect(out.unmatched).toEqual([]);
    });

    it('keeps the var() when no role matches both themes', () => {
      // --color-text-primary matches #2c2520 in light, but its dark value is not #8bc4cf.
      const out = page('.a { color: var(--page-peter, #2c2520) }');
      expect(out.text).toBe('.a { color: var(--page-peter, #2c2520) }');
      expect(out.unmatched[0]?.reason).toBe('var() fallback');
    });

    it('swaps a page variable that matches a role in both themes', () => {
      const surfaces = rootAliases(
        '@media (prefers-color-scheme: dark) { :root:root { --ferni: #a5c99a; --peter: #8bc4cf; --ink: #f4efe6; --muted: #ffffff; } }'
      );
      const njk = [
        '<style>',
        ':root { --ferni: var(--color-ferni, #4a6741); --peter: #3a6b73; --ink: #2c2520; --muted: #5c544a; --soft: #6b635a; }',
        '.c { color: var(--muted); caret-color: var(--soft); }',
        '.a { color: var(--ferni); border-color: var(--peter); }',
        '.b { background: linear-gradient(var(--ink), white); color: var(--ink); }',
        '</style>',
      ].join('\n');
      const out = tokenize(njk, table, true, surfaces);
      expect(out.text.split('\n').slice(2, 5)).toEqual([
        // --muted is text-secondary in light but not in dark; --soft has no dark value.
        '.c { color: var(--muted); caret-color: var(--soft); }',
        // brand-text comes before ferni-text (same values); peter-text is a text role, so a border keeps var(--peter).
        '.a { color: var(--color-brand-text); border-color: var(--peter); }',
        '.b { background: linear-gradient(var(--ink), white); color: var(--color-text-primary); }',
      ]);
    });

    it('keeps an alias nobody declares, and one in a dark-context rule', () => {
      const input =
        '.a { color: var(--page-sand, #2c2520) }\n.theme--dark .b { color: var(--page-ink, #2c2520) }';
      expect(page(input).text).toBe(input);
    });
  });

  it('fails when a candidate role is missing from semantic-colors.json', () => {
    expect(() => roleTable(roles.filter((r) => r.name !== '--color-brand-text'))).toThrow(
      /no --color-brand-text role/
    );
  });
});
