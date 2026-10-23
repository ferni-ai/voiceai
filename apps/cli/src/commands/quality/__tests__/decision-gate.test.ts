import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';
import { DECISIONS, type DomainDecision } from '../../../../../../docs/architecture/decisions.js';
import {
  countHits,
  DECISION_BASELINE,
  lowered,
  regressions,
  scan,
  sourceFiles,
  stripComments,
  type DecisionCounts,
} from '../decision-gate.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const CRISIS: DomainDecision = {
  id: 'crisis-risk',
  question: 'crisis?',
  owner: { module: 'src/safety/guard.ts', fn: 'detect', provisional: true },
  ownerPaths: ['src/safety/'],
  target: 'judgment/risk',
  fingerprints: [{ name: 'crisis vocabulary', pattern: /suicid|\b988\b/i }],
};
const SMS: DomainDecision = {
  id: 'sms-send',
  question: 'twilio?',
  owner: { module: 'src/telephony/sms.ts', fn: 'send', provisional: true },
  ownerPaths: ['src/telephony/sms.ts'],
  target: 'platform/telephony',
  fingerprints: [{ name: 'messages.create', pattern: /\.messages\.create\(/, onlyIn: /twilio/i }],
};

let root: string;
function repo(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'decision-gate-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const counts = (files: Record<string, string>): DecisionCounts => {
  const r = repo(files);
  return countHits(scan(r, sourceFiles(r), [CRISIS, SMS]), [CRISIS, SMS]);
};

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('decision gate: what counts as a fingerprint hit', () => {
  it('counts lines outside the owner, not inside it, and skips tests', () => {
    expect(
      counts({
        'src/safety/guard.ts': "const WORDS = ['suicide', '988'];\n",
        'src/tools/coach.ts': "const a = 'call 988';\nconst b = 'suicidal';\nconst c = 1;\n",
        'src/tools/__tests__/coach.test.ts': "it('says 988', () => {});\n",
      })
    ).toEqual({ 'crisis-risk': { 'src/tools/coach.ts': 2 }, 'sms-send': {} });
  });

  it('ignores comment-only lines', () => {
    expect(
      counts({ 'src/a.ts': "/**\n * Mentions 988 in a doc comment.\n */\n// and suicide here\nexport const x = 1;\n" })['crisis-risk']
    ).toEqual({});
  });

  it('applies onlyIn: Twilio messages.create counts, an Anthropic one does not', () => {
    const c = counts({
      'src/outreach/send.ts': "import twilio from 'twilio';\nawait client.messages.create({ to, body });\n",
      'src/llm/claude.ts': "import Anthropic from '@anthropic-ai/sdk';\nawait client.messages.create({ model });\n",
      'src/telephony/sms.ts': "import twilio from 'twilio';\nawait client.messages.create({ to, body });\n",
    });
    expect(c['sms-send']).toEqual({ 'src/outreach/send.ts': 1 });
  });

  it('keeps line numbers when blanking comments', () => {
    expect(stripComments('a\n/* x\ny */\nb').split('\n')).toEqual(['a', '    ', '    ', 'b']);
  });
});

describe('decision gate: ratchet', () => {
  const base: DecisionCounts = { 'crisis-risk': { 'src/a.ts': 2 }, 'sms-send': {} };

  it('passes when nothing grew, and fails on a new file or a higher count', () => {
    expect(regressions(base, { 'crisis-risk': { 'src/a.ts': 1 }, 'sms-send': {} })).toEqual([]);
    expect(regressions(base, { 'crisis-risk': { 'src/a.ts': 3, 'src/b.ts': 1 }, 'sms-send': {} })).toEqual([
      { decision: 'crisis-risk', file: 'src/a.ts', before: 2, after: 3 },
      { decision: 'crisis-risk', file: 'src/b.ts', before: 0, after: 1 },
    ]);
  });

  it('lowers the baseline and drops files that reached zero, never raising', () => {
    expect(lowered(base, { 'crisis-risk': { 'src/b.ts': 9 }, 'sms-send': {} })).toEqual({ 'crisis-risk': {}, 'sms-send': {} });
    expect(lowered(base, { 'crisis-risk': { 'src/a.ts': 1 }, 'sms-send': {} })['crisis-risk']).toEqual({ 'src/a.ts': 1 });
  });
});

describe('decision gate: the real registry and tree', () => {
  it('names owners that exist and export the named function', () => {
    for (const d of DECISIONS) {
      const path = join(REPO, d.owner.module);
      expect(existsSync(path), d.owner.module).toBe(true);
      expect(readFileSync(path, 'utf8'), `${d.owner.module}#${d.owner.fn}`).toMatch(
        new RegExp(`export (async )?function ${d.owner.fn}\\b`)
      );
    }
  });

  it('has no new decider outside its owner (pnpm quality:decisions for detail)', () => {
    const base = JSON.parse(readFileSync(DECISION_BASELINE, 'utf8')) as DecisionCounts;
    const now = countHits(scan(REPO, sourceFiles(REPO)));
    expect(regressions(base, now)).toEqual([]);
  });
});
