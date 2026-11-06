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

  it('keeps the value when a quoted string with backticks, ${ and escapes becomes a template', () => {
    const source = "export const A = 'It\\'s `988`, not ${x}:\\n988';\n";
    const out = run(source);
    expect(out).toContain(
      "`It's \\`${crisisLines.LIFELINE_988.phone}\\`, not \\${x}:\\n${crisisLines.LIFELINE_988.phone}`"
    );
    expect(strings(FILE, out)).toEqual(strings(FILE, source));
  });

  it('keeps a literal that would turn from a resource into a crisis word string', () => {
    // the crisis readers ratchet counts each kind per file; moving a site between kinds would fail it
    const reply = "export const R = 'If you think about suicide, call 988.';\n";
    expect(rewrite(FILE, reply)).toEqual({ text: reply, edits: [], kept: [1] });
    const template = 'export const T = `Thoughts of self-harm? Call 988, ${name}.`;\n';
    expect(rewrite(FILE, template)?.kept).toEqual([1]);
    const both = `${reply}export const C = 'Call or text 988';\n`;
    const out = rewrite(FILE, both)!;
    expect(out.kept).toEqual([1]);
    expect(out.text).toContain("'If you think about suicide, call 988.'");
    expect(out.text).toContain('`Call or text ${crisisLines.LIFELINE_988.phone}`');
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
    expect(() => run(noBlank)).toThrow(/no blank line around its imports/);
  });

  it('adds the name to an import from the safety barrel that is already there', () => {
    const spec = '../../../services/safety/index.js';
    const has = `import { IN_DANGER_NOW } from '${spec}';\nexport const A = 'Call 988';\n`;
    expect(run(has)).toBe(
      `import { IN_DANGER_NOW, crisisLines } from '${spec}';\nexport const A = \`Call \${crisisLines.LIFELINE_988.phone}\`;\n`
    );
    // a type-only import, or one that would pass the print width, keeps its own line
    const typeOnly = `import type { X } from '${spec}';\nexport const A = 'Call 988';\n`;
    expect(run(typeOnly).split('\n')).toHaveLength(4);
    const long = `import { ${Array.from({ length: 12 }, (_, i) => `NAME_${i}`).join(', ')} } from '${spec}';\nexport const A = 'Call 988';\n`;
    expect(run(long).split('\n')).toHaveLength(4);
  });

  it('takes a blank line that a comment follows, never one inside a comment', () => {
    const body = Array.from({ length: 500 }, (_, i) => `export const L${i} = ${i};`);
    const tail = ["export const A = 'Call 988';", ''];
    const commented = [
      "import { a } from './a.js'; // the a",
      '',
      '// b comes last',
      "import { b } from './b.js';",
      ...body,
      ...tail,
    ];
    const out = run(commented.join('\n'));
    expect(out.split('\n')).toHaveLength(commented.length);
    expect(out).toMatch(
      /the a\nimport \{ crisisLines \} from .*\n\/\/ b comes last\nimport \{ b \}/
    );
    expect(strings(FILE, out)).toEqual(strings(FILE, commented.join('\n')));
    const inBlock = [
      "import { a } from './a.js';",
      '/* one',
      '',
      '   two */',
      "import { b } from './b.js';",
      ...body,
      ...tail,
    ];
    expect(() => run(inBlock.join('\n'))).toThrow(/no blank line around its imports/);
    // with none between the imports, the blank line under the file header takes it
    const header = ['/**', ' * Example', '', ' */', '', ...inBlock.filter((_, i) => i !== 2)];
    const top = run(header.join('\n'));
    expect(top.split('\n')).toHaveLength(header.length);
    expect(top).toMatch(
      /^\/\*\*\n \* Example\n\n \*\/\nimport \{ crisisLines \} .*\nimport \{ a \}/
    );
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
