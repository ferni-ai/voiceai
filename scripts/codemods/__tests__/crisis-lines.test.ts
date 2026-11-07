import { describe, expect, it } from 'vitest';

import { rewrite, strings } from '../crisis-lines.js';

const FILE = 'src/tools/domains/example/index.ts';
const run = (source: string) => rewrite(FILE, source)?.text ?? source;

describe('crisis-lines codemod', () => {
  it('moves a number inside a sentence onto the line, and imports it', () => {
    const out = run(
      "import { z } from 'zod';\nexport const CONTACT = 'Call or text 988 (24/7)';\n"
    );
    expect(out).toContain(
      'export const CONTACT = `Call or text ${crisisLines.LIFELINE_988.phone} (24/7)`;'
    );
    expect(out).toContain("import { crisisLines } from '../../../services/safety/index.js';");
  });

  it('replaces a literal that is exactly one value with the bare reference', () => {
    const out = run(
      "export const A = { line: '988 Suicide & Crisis Lifeline', name: 'Crisis Text Line', how: 'Text HOME to 741741', sos: '911' };\n"
    );
    expect(out).toContain(
      'line: crisisLines.LIFELINE_988.name, name: crisisLines.CRISIS_TEXT_LINE.name, how: crisisLines.CRISIS_TEXT_LINE.text, sos: EMERGENCY_NUMBER'
    );
    expect(out).toContain(
      "import { EMERGENCY_NUMBER, crisisLines } from '../../../services/safety/index.js';"
    );
  });

  it('leaves wording the kernel does not have, and numbers inside other numbers or words', () => {
    const source = [
      "export const A = ['HOME to 741741', 'https://988lifeline.org', '$988', 'room 9881', 'call 9-1-1'];",
      "export const B = 'Veterans Crisis Line';",
      "export const C = new RegExp('call 988');",
      "export type D = '988';",
      "export const E = { '988': 1 };",
    ].join('\n');
    expect(rewrite(FILE, source)).toBeNull();
  });

  it('rewrites inside templates without touching their substitutions', () => {
    const out = run('export const f = (n: string) => `Hi ${n}, call 911 or 988.`;\n');
    expect(out).toContain(
      '`Hi ${n}, call ${EMERGENCY_NUMBER} or ${crisisLines.LIFELINE_988.phone}.`'
    );
  });

  it('leaves tagged templates, since the tag would get the text split around a reference', () => {
    const source = [
      'declare function tag(s: TemplateStringsArray, ...v: unknown[]): string;',
      'export const A = tag`Call 988 or text HOME to 741741`;',
      'export const B = (n: string) => tag`Hi ${n}, call 911`;',
      'export const C = `Call 988`;',
    ].join('\n');
    const out = run(source);
    expect(out).toContain('export const A = tag`Call 988 or text HOME to 741741`;');
    expect(out).toContain('export const B = (n: string) => tag`Hi ${n}, call 911`;');
    expect(out).toContain('export const C = `Call ${crisisLines.LIFELINE_988.phone}`;');
  });

  it('keeps the value when a quoted string with backticks, ${ and escapes becomes a template', () => {
    const source = "export const A = 'It\\'s `988`, not ${x}:\\n988';\n";
    const out = run(source);
    expect(out).toContain(
      "`It's \\`${crisisLines.LIFELINE_988.phone}\\`, not \\${x}:\\n${crisisLines.LIFELINE_988.phone}`"
    );
    expect(strings(FILE, out)).toEqual(strings(FILE, source));
  });

  it('refuses a file that already has a name the rewrite would import', () => {
    expect(() => run("const crisisLines = 1;\nexport const A = 'Call 988';\n")).toThrow(
      /crisisLines/
    );
  });

  it('does not grow a file over 500 lines: the import takes a blank line between imports', () => {
    const body = Array.from({ length: 500 }, (_, i) => `export const L${i} = ${i};`);
    const source = ["import { a } from './a.js';", '', "import { b } from './b.js';", ...body];
    source.push("export const A = 'Call 988';", '');
    const out = run(source.join('\n'));
    expect(out.split('\n')).toHaveLength(source.length);
    expect(out).toMatch(/'\.\/a\.js';\nimport \{ crisisLines \} from .*\nimport \{ b \}/);
    const noBlank = source.filter((l, i) => i !== 1).join('\n');
    expect(() => run(noBlank)).toThrow(/no blank line between imports/);
  });

  describe('--prove', () => {
    const before = "export const A = ['Call or text 988', `If in danger call 911 ${'now'}`];\n";

    it('reads the same strings before and after the rewrite', () => {
      expect(strings(FILE, run(before))).toEqual(strings(FILE, before));
    });

    it('goes red when a reference points at the wrong line', () => {
      const wrong = run(before).replace(
        'crisisLines.LIFELINE_988.phone',
        'crisisLines.CRISIS_TEXT_LINE.text'
      );
      expect(strings(FILE, wrong)).not.toEqual(strings(FILE, before));
    });

    it('goes red when code inside a substitution changes', () => {
      const changed = run(before).replace("${'now'}", "${'now'.trim()}");
      expect(strings(FILE, changed)).not.toEqual(strings(FILE, before));
    });
  });
});
