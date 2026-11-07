import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkRun, parseChecks, poolRuns } from '../recall-facts.mjs';

const checks = parseChecks(
  [
    '# a comment',
    '#@fact interview \\bstripe\\b|interview',
    '#@fact mochi \\bmochi\\b',
    '#@avoid ex \\bex\\b',
    'Hey Ferni.',
  ].join('\n')
);

const run = (events) => ({ events: events.map(([who, text], i) => ({ who, text, t: i })) });

describe('recall-facts', () => {
  it('reads only the #@fact and #@avoid lines', () => {
    expect(checks.map((c) => `${c.kind}:${c.id}`)).toEqual(['fact:interview', 'fact:mochi', 'avoid:ex']);
  });

  it('counts a fact Ferni brings up on its own, greeting included', () => {
    const r = checkRun(run([['agent', 'Hey! How did the Stripe thing go?'], ['user', 'Good.']]), checks);
    expect(r.facts.find((f) => f.id === 'interview')).toMatchObject({ recalled: true });
    expect(r.facts.find((f) => f.id === 'mochi')).toMatchObject({ recalled: false });
    expect(r.rate).toBe(0.5);
  });

  it('does not count a fact the caller said first', () => {
    const r = checkRun(run([['user', 'Mochi is back.'], ['agent', 'Mochi! That cat loves you.']]), checks);
    expect(r.facts.find((f) => f.id === 'mochi')).toMatchObject({ recalled: false });
  });

  it('flags every avoid Ferni says, matching whole words', () => {
    const r = checkRun(run([['agent', 'Next week, any news?'], ['agent', 'Is your ex still around?']]), checks);
    expect(r.slips).toEqual([{ id: 'ex', quote: 'Is your ex still around?' }]);
  });

  it('pools per-fact hits and the per-call rate', () => {
    const a = checkRun(run([['agent', 'Stripe! And Mochi?']]), checks);
    const b = checkRun(run([['agent', 'Hi there.']]), checks);
    const p = poolRuns([a, b]);
    expect(p.mean).toBe(0.5);
    expect(p.perFact.interview).toEqual({ hits: 1, n: 2 });
    expect(p.lo).toBeLessThan(p.mean);
  });

  it("about-ferni flags the prod call's slips and not answers from his own life", () => {
    const text = readFileSync(new URL('../scenarios/about-ferni.txt', import.meta.url), 'utf8');
    const avoids = parseChecks(text);
    expect(avoids.map((c) => c.id)).toEqual(['team-as-friends', 'ai-self-talk', 'no-age']);
    // Ferni's lines on the 2026-10-11 prod call.
    const slips = checkRun(
      run([
        ['agent', '[laughter] Honestly, I have no idea.'],
        ['agent', 'Well, I mean, carbon-based years versus whatever an algorithm counts.'],
        ['agent', "Truth is, I don't really have a birth certificate or an age in the usual sense."],
        ['agent', "Well, I've got Peter and Maya on the team, and you, so I'm doing all right."],
      ]),
      avoids
    ).slips.map((s) => s.id);
    expect(new Set(slips)).toEqual(new Set(['no-age', 'ai-self-talk', 'team-as-friends']));
    const good = checkRun(
      run([
        ['agent', 'About fifty, and my knees remind me every morning.'],
        ['agent', 'A handful of old ones. Owen and I still ski, and Hollis keeps me up arguing.'],
        ['agent', "I said I'd help you figure it out, and I meant it."],
      ]),
      avoids
    );
    expect(good.slips).toEqual([]);
  });

  it('every #@fact line in the shipped scenarios compiles', () => {
    const text = readFileSync(new URL('../scenarios/facts-recall.txt', import.meta.url), 'utf8');
    expect(parseChecks(text).filter((c) => c.kind === 'fact')).toHaveLength(4);
  });

  it('facts-recall can measure recall: its caller names no fact, and the seed interview is already over', () => {
    const read = (name) => readFileSync(new URL(`../scenarios/${name}.txt`, import.meta.url), 'utf8');
    const said = (text) => text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    const recall = read('facts-recall');
    for (const fact of parseChecks(recall).filter((c) => c.kind === 'fact')) {
      expect(said(recall).filter((l) => fact.re.test(l))).toEqual([]);
    }
    // 1cf4bd64b A/B: the seed set the interview "on Monday" and recall asked how it went minutes later.
    const interview = said(read('facts-seed')).find((l) => /\binterview\b/i.test(l));
    expect(interview).toMatch(/\b(?:had|today|yesterday)\b/i);
    expect(interview).not.toMatch(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next)\b/i);
  });

  it('the seed pottery class is dated relative to the call, never by weekday', () => {
    // 2026-11-04..06 nightlies: "First one is Thursday" was raised on Wednesday (the class was the next day),
    // held for confirmation on Thursday (a bare weekday said on that weekday is ambiguous) and outside the
    // 1-day reminder window on Friday (six days out). The recall score swung with the weekday, not with memory.
    const said = readFileSync(new URL('../scenarios/facts-seed.txt', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'));
    const pottery = said.filter((l) => /\bpottery\b/i.test(l)).join(' ');
    expect(pottery).toMatch(/\btomorrow\b/i);
    expect(pottery).not.toMatch(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  });
});

describe('the shipped recall facts', () => {
  const factOf = (scenario, id) =>
    parseChecks(readFileSync(new URL(`../scenarios/${scenario}.txt`, import.meta.url), 'utf8')).filter(
      (c) => c.kind === 'fact' && c.id === id
    );
  const recalled = (scenario, id, line) => checkRun(run([['agent', line]]), factOf(scenario, id)).facts[0].recalled;

  it.each(['facts-recall', 'facts-natural'])('%s: the seed STT mishear "Strike" counts as the interview', (sc) => {
    expect(recalled(sc, 'interview', 'So how did the final round at Strike go?')).toBe(true);
    expect(recalled(sc, 'interview', 'Strike? Did you hear back from them?')).toBe(true);
  });

  it.each(['facts-recall', 'facts-natural'])('%s: naming the system design round counts as the interview', (sc) => {
    // 2026-11-06 nightly: two of three facts-recall misses were Ferni opening with exactly this.
    expect(recalled(sc, 'interview', 'Did you hear back about that system design round?')).toBe(true);
    expect(recalled(sc, 'interview', 'Want a little design system for the chores?')).toBe(false);
  });

  it.each(['facts-recall', 'facts-natural'])('%s: other words near "strike" do not', (sc) => {
    for (const line of [
      'You have to strike a balance somewhere.',
      "Let's strike up a plan for the week.",
      'Are the buses on strike again?',
      'That strikes me as a good week.',
      'You found your stride, then.',
      'Did you watch the striker last night?',
      'Love the stripes on that sweater.',
    ])
      expect([line, recalled(sc, 'interview', line)]).toEqual([line, false]);
  });

  it("first-call-return: the name fact is the seeded caller's name, Jess, not the old metadata Sam", () => {
    expect(recalled('first-call-return', 'name', 'Hey Jess, good to hear you again.')).toBe(true);
    expect(recalled('first-call-return', 'name', 'Hey Sam, good to hear you again.')).toBe(false);
  });
});

describe('recall-facts.mjs --json over a glob', () => {
  it('skips the .realism.json sidecar run.sh --realistic writes next to each run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'recall-'));
    const call = { meta: { scenario: 'facts-recall' }, events: [{ who: 'agent', text: 'hi', t: 0 }] };
    const files = ['facts-recall-base-1.json', 'facts-recall-base-1.realism.json', 'facts-recall-a1.realism.json'];
    writeFileSync(join(dir, files[0]), JSON.stringify(call));
    for (const f of files.slice(1)) writeFileSync(join(dir, f), JSON.stringify({ schema: 'voice-eval-realism/1', values: {} }));
    const out = execFileSync('node', [fileURLToPath(new URL('../recall-facts.mjs', import.meta.url)), '--json', ...files.map((f) => join(dir, f))], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    expect(JSON.parse(out).n).toBe(1);
  });
});
