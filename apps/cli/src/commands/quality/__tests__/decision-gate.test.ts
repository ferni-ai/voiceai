import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { gained, hits, isProductionSource, stripComments } from '../decision-gate.js';
import { DECISIONS, NOT_DECIDERS, type DomainDecision } from '../decisions.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const byId = (id: string): DomainDecision => DECISIONS.find((d) => d.id === id)!;
const ids = (file: string, text: string): string[] => hits(file, text).map((h) => `${h.decision}:${h.line}`);

describe('decision gate: what counts as a decider (the real registry)', () => {
  it('counts a crisis word list or regex outside the owners, not copy that mentions 988 or suicide', () => {
    const code = [
      "const WORDS = ['suicide', 'self-harm'];", // 1: word list
      'const RE = /suicidal|self.harm/i;', // 2: regex literal
      "const reply = 'If you are thinking about suicide, call or text 988.';", // 3: copy
      "return runs.some((run) => /911|988/.test(run));", // 4: a 988 regex is not crisis vocabulary
    ].join('\n');
    expect(ids('src/tools/coach.ts', code)).toEqual(['crisis-risk:1', 'crisis-risk:2']);
  });

  it('counts a crisis string passed to RegExp or a string-matching call', () => {
    const code = [
      "const a = new RegExp('suicidal', 'i');", // 1
      "const b = RegExp('self-harm');", // 2
      "if (text.includes('kill myself')) {}", // 3
      "if (t.startsWith('suicid') || t.endsWith('self harm')) {}", // 4
      "if (/x/.test(t) || t.match('suicide')) {}", // 5
      "log('suicide prevention resources');", // 6: an ordinary call is copy, not a decider
    ].join('\n');
    expect(ids('src/tools/coach.ts', code)).toEqual(['crisis-risk:1', 'crisis-risk:2', 'crisis-risk:3', 'crisis-risk:4', 'crisis-risk:5']);
  });

  it('counts a string that is a regex source (an alternation), as emergency-claim.ts builds one', () => {
    expect(ids('src/agents/personas/x.ts', "export const TALK = 'ambulance|911|suicid\\\\w*|end it all';")).toEqual(['crisis-risk:1']);
    expect(ids('src/agents/personas/x.ts', "const note = 'If you are thinking about suicide, call 988.';")).toEqual([]);
  });

  it('knows the wider crisis phrases: want to die, end my life, end it all', () => {
    const code = "const W = ['want to die', 'wants to die', 'end my life', 'ending my life', 'end it all'];";
    expect(ids('src/tools/coach.ts', code)).toEqual(['crisis-risk:1']);
    for (const phrase of ['want to die', 'wanted to die', 'end my life', 'ending my life', 'end it all']) {
      expect(ids('src/tools/coach.ts', `const W = ['${phrase}'];`), phrase).toEqual(['crisis-risk:1']);
    }
  });

  it('lets every crisis owner path keep its vocabulary', () => {
    const list = "const WORDS = ['suicidal'];";
    for (const p of [
      'src/services/safety/x.ts',
      'src/agents/safety/x.ts',
      'src/agents/personas/crisis-gate.ts',
      'src/agents/processors/turn-processor/turn-crisis.ts',
      'src/tools/domains/crisis/index.ts',
      'src/services/human-transfer/crisis-signals.ts',
      'src/intelligence/context-builders/safety/x.ts',
      'src/agents/personas/phrase-loops-safety.generated.ts',
    ]) {
      expect(ids(p, list), p).toEqual([]);
    }
  });

  it('counts a quiet-hours definition, not quiet as silence and not a flag name', () => {
    const code = [
      'export function inQuietHours(at: Date): boolean {', // 1
      'const QUIET_HOURS_START = 22;', // 2
      "const quiet = (): boolean => agent === 'listening';", // 3
      "QUIET_HOURS_UNIFIED: { default: 'off', owner: 'outreach', kind: 'experiment' },", // 4
      'const quietMs = Date.now() - turn.stoppedAt;', // 5
    ].join('\n');
    expect(ids('src/services/outreach/x.ts', code)).toEqual(['contact-permission:1', 'contact-permission:2']);
  });

  it("counts an assistant turn written, not a role type union", () => {
    expect(ids('src/a.ts', "push({ role: 'assistant', content })\ntype R = { role: 'assistant' | 'user' };")).toEqual([
      'spoken-reply:1',
    ]);
  });

  it('ignores comments, trailing ones included, but not // inside a string', () => {
    expect(ids('src/a.ts', "const x = 1; // VOICE: MAYA_SANTOS_VOICE_ID\n/* SPEND_SAVE_VOICE_ID */")).toEqual([]);
    expect(stripComments("const u = 'https://x.y'; // note")).toBe("const u = 'https://x.y'; " + ' '.repeat(7));
    expect(stripComments('const re = /https?:\\/\\//; // c')).toBe('const re = /https?:\\/\\//; ' + ' '.repeat(4));
    expect(stripComments('a\n/* x\ny */\nb').split('\n')).toEqual(['a', '    ', '    ', 'b']);
  });

  it('counts a direct Twilio REST send (Messages.json), not a call (Calls.json)', () => {
    const send = "const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, { method: 'POST' });";
    expect(ids('src/tools/domains/finance/plaid.ts', send)).toEqual(['sms-send:1']);
    expect(ids('src/x.ts', "await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`);")).toEqual([]);
  });

  it("recognises strings before comments: a '/*' inside a string blanks nothing", () => {
    const code = ["const glob = 'uploads/*';", "const WORDS = ['suicidal'];", "const tail = 'x*/';"].join('\n');
    expect(ids('src/tools/coach.ts', code)).toEqual(['crisis-risk:2']);
    expect(stripComments("const a = 'uploads/*'; // c\nconst b = 1; /* z */").split('\n')).toEqual([
      "const a = 'uploads/*'; " + ' '.repeat(4),
      'const b = 1; ' + ' '.repeat(7),
    ]);
  });

  it('applies onlyIn: a Twilio messages.create counts, an Anthropic one does not', () => {
    expect(ids('src/o.ts', "import twilio from 'twilio';\nawait client.messages.create({ to, body });")).toEqual(['sms-send:2']);
    expect(ids('src/l.ts', "import Anthropic from '@anthropic-ai/sdk';\nawait client.messages.create({ model });")).toEqual([]);
  });
});

describe('decision gate: the two false positives from the #2563 verify (2026-10-26)', () => {
  it("counts the generated safety wording as the crisis owner's: a crisis copy edit + regenerate passes", () => {
    const real = readFileSync(join(REPO, 'src/agents/personas/phrase-loops-safety.generated.ts'), 'utf8');
    const regenerated = real.replace(
      "export const SAFETY_WORDING: readonly string[] = [\n",
      "export const SAFETY_WORDING: readonly string[] = [\n  'If you are having suicidal thoughts, you are not alone.',\n"
    );
    expect(regenerated).not.toBe(real);
    expect(gained('src/agents/personas/phrase-loops-safety.generated.ts', regenerated, real)).toEqual([]);
    // the same list anywhere else in personas/ is still a second crisis detector
    expect(gained('src/agents/personas/other-wording.ts', regenerated, null).map((g) => g.decision)).toEqual([
      'crisis-risk',
    ]);
  });

  it('does not scan flag specs: a new QUIET_HOURS_* flag file is not a quiet-hours decider', () => {
    expect(NOT_DECIDERS).toEqual(['src/config/flags/']);
    expect(isProductionSource('src/config/flags/QUIET_HOURS_PLANTED_V2.ts')).toBe(false);
    expect(isProductionSource('src/config/flags/index.generated.ts')).toBe(false);
    // the same text outside flags/ still counts, and flag readers elsewhere are still scanned
    expect(isProductionSource('src/config/quiet-hours-config.ts')).toBe(true);
    const flagFile = "export const QUIET_HOURS_PLANTED_V2 = {\n  default: 'off',\n  owner: 'outreach',\n  kind: 'experiment',\n} as const;\n";
    expect(ids('src/services/outreach/x.ts', flagFile)).toEqual(['contact-permission:1']);
  });
});

describe('decision gate: only what the change adds fails', () => {
  const before = "const a = 1;\nconst WORDS = ['suicidal'];\n";

  it('passes an unchanged count, and fails a new decider line', () => {
    expect(gained('src/tools/x.ts', before + 'const b = 2;\n', before)).toEqual([]);
    const g = gained('src/tools/x.ts', before + "const RE = /self-harm/i;\n", before);
    expect(g.map((x) => `${x.decision} ${x.before}→${x.after}`)).toEqual(['crisis-risk 1→2']);
    expect(g[0]!.lines.map((l) => l.line)).toEqual([2, 3]);
    expect(g[0]!.fresh.map((l) => l.line)).toEqual([3]); // the failure shows the new line, not the old one
  });

  it('counts a new file from zero, and judges a moved file at its new path (a move is free)', () => {
    expect(gained('src/tools/new.ts', before, null).map((x) => x.decision)).toEqual(['crisis-risk']);
    expect(gained('src/tools/moved.ts', before, before)).toEqual([]);
  });
});

describe('decision gate: the registry itself', () => {
  it('names owners that exist and export the named function', () => {
    for (const d of DECISIONS) {
      const path = join(REPO, d.owner.module);
      expect(existsSync(path), d.owner.module).toBe(true);
      expect(readFileSync(path, 'utf8'), `${d.owner.module}#${d.owner.fn}`).toMatch(new RegExp(`export (async )?function ${d.owner.fn}\\b`));
      for (const p of d.ownerPaths) expect(existsSync(join(REPO, p)), p).toBe(true);
    }
  });

  it('uses no g or y regex flag (test() would carry state from one line to the next)', () => {
    for (const d of DECISIONS) {
      for (const fp of [...d.fingerprints, ...d.fingerprints.flatMap((f) => (f.onlyIn ? [{ ...f, pattern: f.onlyIn }] : []))]) {
        expect(fp.pattern.flags, `${d.id}: ${fp.name}`).not.toMatch(/[gy]/);
      }
    }
  });

  it('has the decisions the audit named', () => {
    expect(DECISIONS.map((d) => d.id)).toEqual([
      'crisis-risk',
      'persona-voice',
      'spoken-reply',
      'minor-status',
      'tool-grant',
      'memory-injection',
      'contact-permission',
      'sms-send',
    ]);
    expect(byId('crisis-risk').fingerprints[0]!.in).toBe('word-lists');
  });
});
