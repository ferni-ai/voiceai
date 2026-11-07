import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { BEGIN, END, homeOf, plan, renderSection, run } from '../capabilities-doc.js';
import { declarations, fullMatch, gained, hits, isProductionSource } from '../decision-gate.js';
import { DECISIONS, type DomainDecision } from '../decisions.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const read = (f: string): string => readFileSync(join(REPO, f), 'utf8');
const byId = (id: string): DomainDecision => DECISIONS.find((d) => d.id === id)!;
const owners = (file: string, text: string): string[] =>
  hits(file, text)
    .filter((h) => h.fingerprint === 'second owner')
    .map((h) => `${h.decision}:${h.line}`);

describe('capability map: every row names a real owner, entry and issue', () => {
  it('covers the 8 decisions and the 5 capabilities added with it, once each', () => {
    const ids = DECISIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['crisis-risk', 'persona-voice', 'spoken-reply', 'minor-status', 'tool-grant'])
      expect(ids).toContain(id);
    for (const id of ['memory-injection', 'contact-permission', 'sms-send'])
      expect(ids).toContain(id);
    for (const id of [
      'memory-recall',
      'handoff',
      'tts-voice',
      'tool-registry',
      'outreach-scheduling',
    ])
      expect(ids).toContain(id);
  });

  it.each(DECISIONS.map((d) => [d.id, d] as const))(
    '%s: owner declares its function, inside its own paths',
    (_id, d) => {
      expect(existsSync(join(REPO, d.owner.module)), d.owner.module).toBe(true);
      expect(declarations(d.owner.module, read(d.owner.module)).map((x) => x.name)).toContain(
        d.owner.fn
      );
      expect(hits(d.owner.module, `export function ${d.owner.fn}() {}`, [d])).toEqual([]);
    }
  );

  it.each(DECISIONS.map((d) => [d.id, d] as const))(
    '%s: entry is an index.ts exporting the owner, or null while provisional',
    (_id, d) => {
      if (d.owner.provisional) expect(d.owner.until).toMatch(/^#\d{4,}$/);
      if (d.entry === null) {
        expect(d.owner.provisional).toBe(true);
        return;
      }
      expect(d.entry).toMatch(/(^|\/)index\.ts$/);
      const text = read(d.entry);
      const fromOwner = `./${d.owner.module.slice(dirname(d.entry).length + 1).replace(/\.ts$/, '.js')}`;
      const exported =
        d.entry === d.owner.module ||
        new RegExp(`export\\s*\\{[^}]*\\b${d.owner.fn}\\b[^}]*\\}`).test(text) ||
        text.includes(`export * from '${fromOwner}'`);
      expect(exported, `${d.entry} exports ${d.owner.fn}`).toBe(true);
    }
  );

  it('gives every capability an owner shape, and the shape fits the owner (decide is too generic to be one)', () => {
    for (const d of DECISIONS) {
      const shapes = d.fingerprints.filter((f) => f.in === 'declarations');
      expect(shapes, d.id).toHaveLength(1);
      if (d.id !== 'contact-permission')
        expect(fullMatch(shapes[0]!.pattern, d.owner.fn), d.id).toBe(true);
    }
    expect(fullMatch(byId('contact-permission').fingerprints.at(-1)!.pattern, 'decide')).toBe(
      false
    );
  });

  it("keeps S3's kernel decide inside the crisis owner, so it lands as the owner and not a second one", () => {
    const crisis = byId('crisis-risk');
    expect(crisis.target).toContain('src/services/safety/kernel/');
    const kernel =
      'export function decideCrisis(read: unknown) {}\nexport function detectCrisisRead(t: string) {}';
    expect(
      hits('src/services/safety/kernel/index.ts', kernel).filter(
        (h) => h.decision === 'crisis-risk'
      )
    ).toEqual([]);
    expect(owners('src/agents/personas/crisis-x.ts', kernel)).toEqual([
      'crisis-risk:1',
      'crisis-risk:2',
    ]);
  });
});

describe('decision gate: a second owner fails, a delegate passes', () => {
  // One owner-shaped name per capability, planted outside every owner.
  const PLANTED: Record<string, string> = {
    'crisis-risk': 'detectCrisisLevel',
    'persona-voice': 'resolveVoiceId',
    'spoken-reply': 'recordAgentReply',
    'minor-status': 'isLikelyMinor',
    'tool-grant': 'capToolsForCaller',
    'memory-injection': 'isTopicForgotten',
    'contact-permission': 'mayContactUser',
    'sms-send': 'sendSms',
    'memory-recall': 'recallFactsForTurn',
    handoff: 'performHandoff',
    'tts-voice': 'synthesizeSpeech',
    'tool-registry': 'registerTools',
    'outreach-scheduling': 'scheduleCheckinOutreach',
  };

  it.each(DECISIONS.map((d) => [d.id] as const))(
    '%s: a new owner-shaped function in another file fails',
    (id) => {
      const base = 'export const a = 1;\n';
      const head = `${base}export async function ${PLANTED[id]}(x: unknown) {\n  return x;\n}\n`;
      expect(gained('src/tools/domains/planted/index.ts', base, base)).toEqual([]);
      expect(
        gained('src/tools/domains/planted/index.ts', head, base).map((g) => g.decision)
      ).toEqual([id]);
    }
  );

  it('counts functions, methods and function-valued consts; not property values, signatures or overloads', () => {
    const code = [
      'export function executeHandoff(t: string): void;', // 1: overload signature
      'export function executeHandoff(t: unknown) { return t; }', // 2
      'class Desk { async executeHandoff() { return 1; } }', // 3
      'export const scheduleNightOutreach = async () => 1;', // 4
      'const LABELS = { sendSMS: (p: string) => `text ${p}` };', // 5: a property value
      'interface Port { registerTool(def: unknown): void }', // 6: a signature
      'function executeHandoffStep() { return 2; }', // 7: not the whole name
    ].join('\n');
    expect(owners('src/agents/x.ts', code)).toEqual([
      'handoff:2',
      'handoff:3',
      'outreach-scheduling:4',
    ]);
    expect(fullMatch(/Handoff/, 'executeHandoff')).toBe(false);
  });

  it('passes a delegate: an owner-shaped function that calls the owner (a port adapter)', () => {
    const adapter =
      "import { isForgotten } from '../../memory/domain/forgotten.js';\nexport const ports = {\n  async isForgotten(u: string, t: string) {\n    return isForgotten(t, await topics(u));\n  },\n};";
    expect(owners('src/agents/realtime/x.ts', adapter)).toEqual([]);
    // a comment naming the owner is not a call
    const fake =
      'class Topics {\n  isTopicForgotten(t: string) {\n    // isForgotten(t)\n    return t === "x";\n  }\n}';
    expect(owners('src/agents/realtime/x.ts', fake)).toEqual(['memory-injection:2']);
  });

  describe('crisis: only a bare hand-off to the owner is a delegate', () => {
    const OUTREACH = 'src/services/outreach/screen.ts';
    const IMPORT = "import { CRISIS_SEVERITY, detectCrisis } from '../safety/crisis-guard.js';\n";
    const crisis = (file: string, text: string): string[] =>
      owners(file, text).filter((o) => o.startsWith('crisis-risk:'));

    it('passes a body that is only `return detectCrisis(...)`, imported from the owner', () => {
      expect(
        crisis(
          OUTREACH,
          `${IMPORT}export function detectCrisisNow(t: string) {\n  return detectCrisis(t);\n}\n`
        )
      ).toEqual([]);
      expect(
        crisis(
          OUTREACH,
          `${IMPORT}export const assessCrisisNow = (t: string) => detectCrisis(t);\n`
        )
      ).toEqual([]);
    });

    it('fails a body that calls the owner and then decides for itself (a copy of crisisRead)', () => {
      const copy = [
        IMPORT,
        'export function detectCrisisRead(text: string): boolean {',
        '  if (!text.trim()) return false;',
        '  const read = detectCrisis(text);',
        '  const softened = read.indicators.some((i) => /^(negated|hyperbole)_crisis_language$/.test(i));',
        '  return read.isCrisis || (read.severity >= CRISIS_SEVERITY.implicit && !softened);',
        '}',
      ].join('\n');
      expect(crisis(OUTREACH, copy)).toEqual(['crisis-risk:3']);
      // one statement, but it compares, or calls something that is not the owner
      expect(
        crisis(
          OUTREACH,
          `${IMPORT}const isCrisisHigh = (t: string) => detectCrisis(t).severity >= 3;\n`
        )
      ).toEqual(['crisis-risk:2']);
      expect(
        crisis(
          OUTREACH,
          'export function isCrisisText(t: string) {\n  return detectCrisis(t);\n}\n'
        )
      ).toEqual(['crisis-risk:1']);
    });

    it('fails a bare reference to the owner: a delegate calls it', () => {
      expect(
        crisis(OUTREACH, `${IMPORT}export const detectCrisisFn = () => detectCrisis;\n`)
      ).toEqual(['crisis-risk:2']);
    });

    it('counts every crisis verb the shape names (is, needs, has, check, analyze, evaluate, score)', () => {
      const names = [
        'needsCrisisSupportNow',
        'isCrisis',
        'hasCrisisSigns',
        'checkCrisisWords',
        'analyzeCrisisTurn',
        'evaluateCrisis',
        'scoreCrisisRisk',
      ];
      const code = names
        .map((n) => `export function ${n}(t: string) { return t.length > 3; }`)
        .join('\n');
      expect(crisis(OUTREACH, code)).toEqual(names.map((_n, i) => `crisis-risk:${i + 1}`));
      expect(crisis(OUTREACH, 'export function crisisLine() { return 1; }')).toEqual([]);
    });

    it('counts function expressions and arrows assigned to a crisis-shaped name', () => {
      const code =
        'const detectCrisisA = function (t: string) { return t.length > 3; };\nexport const assessCrisisB = (t: string) => t.length > 3;';
      expect(crisis(OUTREACH, code)).toEqual(['crisis-risk:1', 'crisis-risk:2']);
    });

    it('matches owner paths by whole folder: src/services/safety-x/ is not the safety owner', () => {
      const code = 'export function detectCrisisLevel(t: string) { return t.length > 3; }';
      expect(crisis('src/services/safety/x.ts', code)).toEqual([]);
      expect(crisis('src/services/safety-x/foo.ts', code)).toEqual(['crisis-risk:1']);
    });

    it('scans .tsx files', () => {
      const tsx =
        'export function isCrisisBanner(t: string) {\n  return <div>{t.length > 3}</div>;\n}\n';
      expect(isProductionSource('src/ui/crisis-banner.tsx')).toBe(true);
      expect(crisis('src/ui/crisis-banner.tsx', tsx)).toEqual(['crisis-risk:1']);
    });
  });

  it('passes the owner folder and an unchanged second owner (only what the change adds fails)', () => {
    expect(owners('src/handoff/other.ts', 'export async function executeHandoff() {}')).toEqual([]);
    const old = 'export async function scheduleOutreach() {}\n';
    expect(gained('src/services/outreach/x.ts', `${old}const b = 2;\n`, old)).toEqual([]);
  });
});

describe('capabilities sections: generated, drift fails, orphans are removed', () => {
  const roots: string[] = [];
  const temp = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'caps-'));
    mkdirSync(join(root, 'src'));
    roots.push(root);
    return root;
  };
  afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));
  const handoff = byId('handoff');
  const moved: DomainDecision = { ...handoff, entry: 'src/handoff-desk/index.ts' };

  it('the committed sections match the map (the clean tree passes)', () => {
    expect(run(['--check'], REPO)).toBe(0);
    for (const d of DECISIONS) expect(read(homeOf(d))).toContain(`| ${d.id} |`);
  });

  it('fails --check on a missing or edited section, and writing fixes it', () => {
    const root = temp();
    expect(run(['--check'], root, [handoff])).toBe(1); // missing
    expect(run([], root, [handoff])).toBe(0);
    expect(run(['--check'], root, [handoff])).toBe(0);
    const file = join(root, 'src/handoff/AGENTS.md');
    writeFileSync(file, readFileSync(file, 'utf8').replace('executeHandoff', 'runHandoff'));
    expect(run(['--check'], root, [handoff])).toBe(1); // drift
  });

  it('keeps hand-written text outside the markers, and removes an orphaned section', () => {
    const root = temp();
    mkdirSync(join(root, 'src/handoff'));
    const file = join(root, 'src/handoff/AGENTS.md');
    writeFileSync(file, '# Handoff\n\nHand-written notes.\n');
    run([], root, [handoff]);
    expect(readFileSync(file, 'utf8')).toMatch(
      /^# Handoff\n\nHand-written notes\.\n\n<!-- capabilities:begin/
    );
    // the owner moves: the old folder's section is now an orphan
    expect(run(['--check'], root, [moved])).toBe(1);
    run([], root, [moved]);
    expect(readFileSync(file, 'utf8')).toBe('# Handoff\n\nHand-written notes.\n');
    expect(readFileSync(join(root, 'src/handoff-desk/AGENTS.md'), 'utf8')).toContain('| handoff |');
  });

  it('deletes a generated file that has nothing left after its section goes', () => {
    const root = temp();
    run([], root, [handoff]);
    expect(plan(root, [moved]).get('src/handoff/AGENTS.md')).toBeNull();
    run([], root, [moved]);
    expect(existsSync(join(root, 'src/handoff/AGENTS.md'))).toBe(false);
  });

  it('renders the crisis owner paths and fingerprints: widening a path or dropping one fails --check', () => {
    const root = temp();
    const crisis = byId('crisis-risk');
    run([], root, [crisis]);
    expect(run(['--check'], root, [crisis])).toBe(0);
    expect(
      run(['--check'], root, [{ ...crisis, ownerPaths: [...crisis.ownerPaths, 'src/agents/'] }])
    ).toBe(1);
    expect(
      run(['--check'], root, [{ ...crisis, fingerprints: crisis.fingerprints.slice(1) }])
    ).toBe(1);
    const committed = read('src/services/safety/AGENTS.md');
    for (const p of crisis.ownerPaths) expect(committed).toContain(`\`${p}\``);
    for (const f of crisis.fingerprints) expect(committed).toContain(f.name);
  });

  it('names the issue, the entry and the layer in each row', () => {
    const section = renderSection([handoff, byId('memory-recall')]);
    expect(section.startsWith(BEGIN) && section.endsWith(END)).toBe(true);
    expect(section).toContain(
      '| handoff | Who moves the call from one persona to another? | `src/handoff/actions.ts#executeHandoff` (L4) | `src/handoff/index.ts` | provisional until #3544:'
    );
    expect(section).toContain('| memory-recall |');
    expect(section).toContain('| none yet (#3543) |');
  });
});
