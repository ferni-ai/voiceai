import { describe, expect, it } from 'vitest';
import { allowedLink, linkTargets, unsafeOutput } from '../untrusted-text.js';

describe('allowedLink', () => {
  it.each([
    '#top',
    '/blog/the-loneliness-gap/',
    'https://ferni.ai/',
    'https://app.ferni.ai/settings',
    'http://developers.ferni.ai/x',
    'https://github.com/ferni-ai/voiceai/pull/1',
    'https://GitHub.com/Ferni-AI/voiceai',
  ])('allows %s', (target) => expect(allowedLink(target)).toBe(true));

  it.each([
    'https://evil.example/',
    'https://ferni.ai.evil.example/',
    'https://evilferni.ai/',
    'https://evil.example/ferni.ai',
    'https://ferni.ai@evil.example/',
    '//evil.example/x',
    '/\\evil.example',
    'javascript:alert(1)',
    'data:text/html,hi',
    'mailto:a@evil.example',
    'https://github.com/ferni-ai-evil/x',
    'https://github.com/someone/ferni-ai/',
    'https://gist.github.com/ferni-ai/x',
    'relative/path',
  ])('rejects %s', (target) => expect(allowedLink(target)).toBe(false));
});

describe('unsafeOutput', () => {
  it('finds links in every markdown and HTML form', () => {
    const markdown = [
      '[a](https://evil.example/1)',
      '![b](https://evil.example/2.png)',
      '[c]: https://evil.example/3',
      '<https://evil.example/4>',
      'plain https://evil.example/5 and www.evil.example/6 and evil.com/7',
    ].join('\n');
    const bad = unsafeOutput(markdown)
      .filter((i) => i.rule === 'unsafe-link')
      .map((i) => i.message)
      .join('\n');
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(bad).toContain(`/${n}`);
  });

  it('flags raw HTML, script schemes and template tags', () => {
    const rules = (s: string): string[] => unsafeOutput(s).map((i) => i.rule);
    expect(rules('hi <script>x</script>')).toContain('unsafe-html');
    expect(rules('[x](javascript:alert(1))')).toContain('unsafe-link');
    expect(rules('{{ secret }}')).toContain('unsafe-html');
    expect(rules('{% include "x" %}')).toContain('unsafe-html');
    expect(rules('an unclosed <iframe\nsrc=x')).toContain('unsafe-html');
    expect(rules('<!-- hidden -->')).toContain('unsafe-html');
  });

  it('allows angle brackets inside code and words like JavaScript: in prose', () => {
    const markdown =
      'Call `remember<T>()` in JavaScript: it returns\n```ts\nconst a: Array<string> = [];\n```\n';
    expect(unsafeOutput(markdown)).toEqual([]);
  });

  it('passes a clean draft with allowlisted links and no markup', () => {
    const markdown = [
      '---',
      'title: "x"',
      'sources:',
      '  - "PR #1: feat: y (https://github.com/ferni-ai/voiceai/pull/1)"',
      '---',
      '',
      'See [#1](https://github.com/ferni-ai/voiceai/pull/1) and [home](https://ferni.ai/).',
      'Built on Socket.io, a 3 < 4 kind of week.',
    ].join('\n');
    expect(unsafeOutput(markdown)).toEqual([]);
    expect(linkTargets(markdown)).toContain('https://ferni.ai/');
  });
});
