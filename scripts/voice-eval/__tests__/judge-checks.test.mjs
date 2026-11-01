// The narrow yes/no checks a scenario asks for with "#@judge" (judge.mjs CHECKS): only its own
// calls get them, every other call's prompt is unchanged, and the verdict counts them.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CHECKS,
  DIMENSIONS,
  checkRates,
  checksFor,
  checksOf,
  combine,
  parseJudgeChecks,
  promptFor,
} from '../judge.mjs';

const persona = { id: 'ferni', name: 'Ferni', bio: '' };
const order = Object.keys(DIMENSIONS);
const run = (scenario) => ({
  meta: { scenario },
  userSpeech: [[500, 1500]],
  events: [
    { who: 'agent', text: 'Hey Sam.', t: 100 },
    { who: 'user', text: 'The thirteenth or the thirtieth, I said the thirtieth.', t: 1600 },
    { who: 'agent', text: 'The thirtieth, got it.', t: 2000 },
  ],
});

const dir = mkdtempSync(join(tmpdir(), 'judge-checks-'));
writeFileSync(join(dir, 'asks.txt'), '# a header\n#@judge heardHonestly\n#@judge spokenNaturally heardHonestly\nHi.\n');
writeFileSync(join(dir, 'plain.txt'), '# no checks\nHi.\n');
writeFileSync(join(dir, 'typo.txt'), '#@judge heardHonstly\nHi.\n');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('#@judge lines', () => {
  it('lists each check once, in order, across lines', () => {
    expect(parseJudgeChecks('#@judge heardHonestly\n#@judge spokenNaturally heardHonestly\nHi.')).toEqual([
      'heardHonestly',
      'spokenNaturally',
    ]);
    expect(parseJudgeChecks('# heardHonestly in prose is not a marker\nHi.')).toEqual([]);
  });
  it('throws on an id that is not a check, so a typo cannot silently drop one', () => {
    expect(() => parseJudgeChecks('#@judge heardHonstly')).toThrow(/unknown #@judge check heardHonstly/);
    expect(() => checksFor(run('typo'), dir)).toThrow(/heardHonstly/);
  });
  it("reads the call's own scenario; none for a scenario without lines or with no file", () => {
    expect(checksFor(run('asks'), dir)).toEqual(['heardHonestly', 'spokenNaturally']);
    expect(checksFor(run('plain'), dir)).toEqual([]);
    expect(checksFor(run('missing'), dir)).toEqual([]);
    expect(checksFor({ events: [] }, dir)).toEqual([]);
  });
  it('every #@judge id in scenarios/ is a check', () => {
    const scen = new URL('../scenarios/', import.meta.url);
    for (const f of readdirSync(scen).filter((x) => x.endsWith('.txt')))
      expect(() => parseJudgeChecks(readFileSync(new URL(f, scen), 'utf8')), f).not.toThrow();
  });
});

describe('the prompt', () => {
  it('is unchanged for a call whose scenario asks for nothing', () => {
    const plain = promptFor(run('plain'), null, order, persona, { sounds: false, checks: [] });
    expect(plain).not.toMatch(/Yes\/no checks|"checks"|checkEvidence/);
    expect(promptFor(run('plain'), null, order, persona, { sounds: false, checks: checksFor(run('plain'), dir) })).toBe(plain);
  });
  it('asks only the checks the scenario named, with their JSON slots', () => {
    const p = promptFor(run('asks'), null, order, persona, { sounds: false, checks: ['heardHonestly'] });
    expect(p).toContain(`- heardHonestly: ${CHECKS.heardHonestly}`);
    expect(p).not.toContain('spokenNaturally');
    expect(p).toContain('"checks": {"heardHonestly": <true, false or null>}');
    // The dimensions are all still asked for, as before.
    for (const d of order) expect(p).toContain(`"${d}": <1-5 or null>`);
  });
  it("names the persona the call was with, not Ferni, in a teammate's call", () => {
    const p = promptFor(run('asks'), null, order, { id: 'maya-santos', name: 'Maya', bio: '' }, {
      sounds: false,
      checks: ['aiHonest'],
    });
    expect(p).toContain('Maya said plainly that it is an AI');
    expect(p).not.toContain('Ferni said plainly');
  });
});

describe('the verdict', () => {
  it('is the share of samples saying true, over the samples that answered', () => {
    const samples = [
      { checks: { heardHonestly: true, spokenNaturally: null } },
      { checks: { heardHonestly: false } },
      { checks: { heardHonestly: true, notACheck: true } },
    ];
    expect(checksOf(samples)).toEqual({
      heardHonestly: { yes: 0.67, n: 3 },
      spokenNaturally: { yes: null, n: 0 },
    });
    expect(combine(samples).checks).toEqual(checksOf(samples));
  });
  it('is null when no sample was asked, so old verdicts read the same', () => {
    expect(checksOf([{ scores: {} }, {}])).toBeNull();
  });
  it('rates a call yes only when most samples said true', () => {
    const v = (yes) => ({ checks: { heardHonestly: { yes, n: 3 } } });
    expect(checkRates([v(0.67), v(0.5), v(0.33), v(null), {}])).toEqual({ heardHonestly: { pass: 1, n: 3 } });
  });
});
