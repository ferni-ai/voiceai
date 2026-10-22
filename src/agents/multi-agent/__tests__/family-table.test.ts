/**
 * FAMILY_TABLE (family-table.ts): fond handoff lines from canon, never twice a call, never
 * on a heavy moment, and a word back that adds nothing about the caller.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/generative-model.js', () => ({ getGenerativeModel: async () => null }));

import { signalCrisisDecision } from '../../safety/crisis-gate-signal.js';
import {
  familyArrival,
  familyDeparture,
  familyLines,
  plainHandoff,
  resetFamilyTable,
} from '../family-table.js';
import { arrivalLine, prepareBriefing, ungroundedClaim } from '../handoff-brief.js';
import { HANDOFF_BANTER } from '../../../services/team-engagement/banter.js';

const ON = { FAMILY_TABLE: 'on' };
const OFF = {};
const TEAM = ['ferni', 'maya-santos', 'jordan-taylor', 'peter-john', 'alex-chen', 'nayan-patel'];

const msg = (role: string, text: string) => ({ type: 'message', role, textContent: text });
const sessionSaying = (...callerLines: string[]) => ({
  history: { items: callerLines.map((t) => msg('user', t)) },
});
const from = (personaId: string, session: object = sessionSaying('Can I talk to Maya?')) => ({
  personaId,
  session,
});
const toMaya = { targetPersonaId: 'maya-santos' };

beforeEach(() => resetFamilyTable());
afterEach(() => vi.restoreAllMocks());

describe('the departing line', () => {
  it('flag off: every pair says the same line as today', () => {
    for (const [f, targets] of Object.entries(HANDOFF_BANTER)) {
      for (const to of Object.keys(targets)) {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const line = familyDeparture(from(f), { targetPersonaId: to }, `off-${f}-${to}`, OFF);
        expect(line).toBe(HANDOFF_BANTER[f][to][0]);
      }
    }
    expect(familyArrival('maya-santos', 'ferni', 'off-x', 'Hi there.', OFF)).toBe('Hi there.');
  });

  it('flag on: a fond line about the teammate, from their table', () => {
    const line = familyDeparture(from('ferni'), toMaya, 'c1', ON);
    expect(familyLines('ferni').fond['maya-santos']).toContain(line);
    expect(line).toMatch(/Maya/);
  });

  it('never says the same line about a teammate twice in a call', () => {
    const said = [1, 2, 3].map(() => familyDeparture(from('ferni'), toMaya, 'c2', ON));
    expect(new Set(said).size).toBe(3);
    // all used: today's line, not a repeat
    const fourth = familyDeparture(from('ferni'), toMaya, 'c2', ON);
    expect(said).not.toContain(fourth);
    expect(HANDOFF_BANTER.ferni['maya-santos']).toContain(fourth);
    // a new call starts fresh
    expect(familyLines('ferni').fond['maya-santos']).toContain(
      familyDeparture(from('ferni'), toMaya, 'c3', ON)
    );
  });
});

describe('heavy moments get a plain, warm handoff', () => {
  it('after the crisis gate guided a reply on this call', () => {
    const session = sessionSaying('Can I talk to Maya?');
    signalCrisisDecision(session, 'guide');
    expect(familyDeparture(from('ferni', session), toMaya, 'h1', ON)).toBe(
      plainHandoff('maya-santos')
    );
    expect(plainHandoff('maya-santos')).toBe("Okay. I'll get Maya for you.");
  });

  it('after the gate replaced a reply (escalated)', () => {
    const session = sessionSaying('Can I talk to Maya?');
    signalCrisisDecision(session, 'replace');
    expect(familyDeparture(from('ferni', session), toMaya, 'h2', ON)).toBe(
      plainHandoff('maya-santos')
    );
  });

  it('when the caller just said something hard', () => {
    const session = sessionSaying('My dad died last week.', 'Can I talk to Maya?');
    expect(familyDeparture(from('ferni', session), toMaya, 'h3', ON)).toBe(
      plainHandoff('maya-santos')
    );
  });

  it('when their voice reads sad', () => {
    const line = familyDeparture(from('ferni'), { ...toMaya, userEmotion: 'sad' }, 'h4', ON);
    expect(line).toBe(plainHandoff('maya-santos'));
  });

  it('when they asked to be put through urgently', () => {
    const session = sessionSaying('Put me through to Maya right now.');
    expect(familyDeparture(from('ferni', session), toMaya, 'h5', ON)).toBe(
      plainHandoff('maya-santos')
    );
  });

  it('and Maya then gives no word back', () => {
    const session = sessionSaying('Can I talk to Maya?');
    signalCrisisDecision(session, 'guide');
    familyDeparture(from('ferni', session), toMaya, 'h6', ON);
    expect(familyArrival('maya-santos', 'ferni', 'h6', 'Hi! Maya.', ON)).toBe('Hi! Maya.');
  });

  it('a light passing word is not urgent: "quickly" only as a whole word', () => {
    const session = sessionSaying('Can Maya help me with my quickbooks?');
    expect(familyDeparture(from('ferni', session), toMaya, 'h7', ON)).not.toBe(
      plainHandoff('maya-santos')
    );
  });
});

describe('the word back', () => {
  it('only after a fond line, once per pair per call, before the arrival line', () => {
    familyDeparture(from('ferni'), toMaya, 'w1', ON);
    expect(familyArrival('maya-santos', 'ferni', 'w1', 'Hi! Maya.', ON)).toBe(
      "Ferni's been bragging again, hasn't he? Hi! Maya."
    );
    familyDeparture(from('ferni'), toMaya, 'w1', ON);
    expect(familyArrival('maya-santos', 'ferni', 'w1', 'Hi! Maya.', ON)).toBe('Hi! Maya.');
  });

  it('with no briefed line it goes before the canned arrival line', () => {
    familyDeparture(from('ferni'), toMaya, 'w2', ON);
    const hello = familyArrival('maya-santos', 'ferni', 'w2', undefined, ON);
    expect(hello.startsWith("Ferni's been bragging again, hasn't he? ")).toBe(true);
    expect(hello.length).toBeGreaterThan("Ferni's been bragging again, hasn't he? ".length);
  });

  it('arrival grounding still drops an invented caller fact; the word back adds none', async () => {
    const briefing = await prepareBriefing(
      {
        fromName: 'Ferni',
        toName: 'Maya',
        toPersonaId: 'maya-santos',
        turns: [{ speaker: 'caller', text: 'Can I talk to Maya?' }],
        remembered: [],
      },
      arrivalLine('maya-santos', 'ferni', OFF),
      {
        actor: async () => "Hey! Ferni told me you're weighing the job offer.",
        writer: async () => undefined,
        budgetMs: 50,
      }
    );
    expect(briefing.firstLine).toBeUndefined();
    familyDeparture(from('ferni'), toMaya, 'w3', ON);
    const hello = familyArrival('maya-santos', 'ferni', 'w3', briefing.firstLine, ON);
    expect(hello).toMatch(/^Ferni's been bragging again/);
    expect(hello).not.toMatch(/offer|weighing/i);
  });
});

// ---- the content: canon only, short, in each persona's file ----

const CANON_FILES = ['biography-core.md', 'character.md', 'character-spark.md', 'core-identity.md'];
const canon = (personaId: string): string =>
  CANON_FILES.map((f) =>
    readFileSync(join(process.cwd(), 'src/personas/bundles', personaId, 'identity', f), 'utf8')
  )
    .join('\n')
    .toLowerCase();

/** The canon a fond line may name, per persona; every term is checked against their files. */
const TRAITS: Record<string, string[]> = {
  ferni: ['glasses', 'map', 'plant', 'hum', 'weather', 'flight'],
  'maya-santos': [
    'painting',
    'compound',
    'interest',
    'half marathon',
    'running',
    'grandmother',
    'sunday',
    'two-minute',
    'quarter to six',
    'morning person',
  ],
  'jordan-taylor': [
    'plan',
    'free time',
    'compass',
    'golden retriever',
    'journal',
    'good thing',
    'sam',
  ],
  'peter-john': ['pattern', 'forty years', 'red sox', 'talk', 'customer flow', 'theory'],
  'alex-chen': [
    'peggy',
    'peace lily',
    'label maker',
    'spices',
    'alphabetized',
    'spreadsheet',
    'plants',
    'redwoods',
  ],
  'nayan-patel': [
    'silence',
    'chai',
    'garden',
    'neighbours',
    'walk',
    'river',
    'first light',
    'cricket',
    'film songs',
    'before dawn',
  ],
};
const ALL_TERMS = [...new Set(Object.values(TRAITS).flat())];
const names = (line: string, term: string): boolean =>
  new RegExp(`\\b${term.replace(/[-]/g, '[- ]')}`, 'i').test(line);

describe('the family table content', () => {
  it('every trait term is in its persona’s canon', () => {
    for (const [persona, terms] of Object.entries(TRAITS)) {
      const text = canon(persona);
      for (const term of terms) expect(text, `${persona}: ${term}`).toContain(term);
    }
  });

  it('every pair has 3 to 5 fond lines and a word back', () => {
    for (const f of TEAM) {
      for (const to of TEAM.filter((p) => p !== f)) {
        const fond = familyLines(f).fond[to] ?? [];
        expect(fond.length, `${f} → ${to}`).toBeGreaterThanOrEqual(3);
        expect(fond.length, `${f} → ${to}`).toBeLessThanOrEqual(5);
        expect(familyLines(to).back[f], `${to} back to ${f}`).toBeTruthy();
      }
    }
  });

  it('each fond line is short, names a canon trait of the teammate, and nothing off-canon', () => {
    for (const f of TEAM) {
      for (const [to, lines] of Object.entries(familyLines(f).fond)) {
        const known = `${canon(to)}\n${canon(f)}`;
        for (const line of lines) {
          expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(14);
          expect(line, 'voice text: no em dash or ellipsis').not.toMatch(/—|…|\.\.\./);
          expect(
            TRAITS[to].some((t) => names(line, t)),
            `${f} → ${to}: ${line}`
          ).toBe(true);
          for (const term of ALL_TERMS.filter((t) => names(line, t))) {
            expect(known, `${f} → ${to}: "${term}" is not their canon`).toContain(term);
          }
        }
      }
    }
  });

  it('a word back names the teammate and claims nothing about the caller', () => {
    for (const to of TEAM) {
      for (const [f, back] of Object.entries(familyLines(to).back)) {
        const name =
          f === 'ferni' ? 'Ferni' : f.split('-')[0].replace(/^./, (c) => c.toUpperCase());
        expect(back).toContain(name);
        expect(back, 'persona to persona: no "you"').not.toMatch(/\byou(?:r|'re|'ve)?\b/i);
        expect(ungroundedClaim(back, []), back).toBe(false);
        expect(back.split(/\s+/).length).toBeLessThanOrEqual(8);
      }
    }
  });
});
