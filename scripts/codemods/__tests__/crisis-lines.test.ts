import { describe, expect, it } from 'vitest';

import { rewrite, strings } from '../crisis-lines.js';

const FILE = 'src/tools/domains/example/index.ts';
const run = (source: string) => rewrite(FILE, source)?.text ?? source;

describe('crisis-lines codemod', () => {
  it('moves a number inside a sentence onto the line, and imports it', () => {
    const out = run(
      "import { z } from 'zod';\nexport const CONTACT = 'Call or text 988 (24/7)';\n"
    );
    expect(out).toContain('export const CONTACT = `Call or text ${LIFELINE_988.phone} (24/7)`;');
    expect(out).toContain(
      "import { LIFELINE_988 } from '../../../services/safety/crisis-lines.js';"
    );
  });

  it('replaces a literal that is exactly one value with the bare reference', () => {
    const out = run(
      "export const A = { line: '988 Suicide & Crisis Lifeline', name: 'Crisis Text Line', how: 'Text HOME to 741741', sos: '911' };\n"
    );
    expect(out).toContain(
      'line: LIFELINE_988.name, name: CRISIS_TEXT_LINE.name, how: CRISIS_TEXT_LINE.text, sos: EMERGENCY_NUMBER'
    );
    expect(out).toContain(
      "import { EMERGENCY_NUMBER } from '../../../services/safety/emergency-number.js';"
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
    expect(out).toContain('`Hi ${n}, call ${EMERGENCY_NUMBER} or ${LIFELINE_988.phone}.`');
  });

  it('keeps the value when a quoted string with backticks, ${ and escapes becomes a template', () => {
    const source = "export const A = 'It\\'s `988`, not ${x}:\\n988';\n";
    const out = run(source);
    expect(out).toContain(
      "`It's \\`${LIFELINE_988.phone}\\`, not \\${x}:\\n${LIFELINE_988.phone}`"
    );
    expect(strings(FILE, out)).toEqual(strings(FILE, source));
  });

  it('refuses a file that already has a name the rewrite would import', () => {
    expect(() => run("const LIFELINE_988 = 1;\nexport const A = 'Call 988';\n")).toThrow(
      /LIFELINE_988/
    );
  });

  describe('--prove', () => {
    const before = "export const A = ['Call or text 988', `If in danger call 911 ${'now'}`];\n";

    it('reads the same strings before and after the rewrite', () => {
      expect(strings(FILE, run(before))).toEqual(strings(FILE, before));
    });

    it('goes red when a reference points at the wrong line', () => {
      const wrong = run(before).replace('LIFELINE_988.phone', 'CRISIS_TEXT_LINE.text');
      expect(strings(FILE, wrong)).not.toEqual(strings(FILE, before));
    });

    it('goes red when code inside a substitution changes', () => {
      const changed = run(before).replace("${'now'}", "${'now'.trim()}");
      expect(strings(FILE, changed)).not.toEqual(strings(FILE, before));
    });
  });
});
