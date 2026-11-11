/**
 * Autonomy lanes: which lanes a PR touches under scripts/ci/autonomy-policy.json, and
 * whether it carries what each lane needs (an owner approval on the exact head, or an
 * evaluator author). main() runs as a subprocess on a fixture PR.
 */
import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  changedLinesOf,
  classify,
  importsOf,
  joinLine,
  diffInputs,
  evaluate,
  loadPolicy,
  matchesGlob,
  normalizeLogin,
  readCommits,
  loopOutsideAllowed,
  type CommitIdentity,
  type Policy,
  type PullInput,
} from '../autonomy-lanes.js';
import { FAKE_GH } from './fake-gh.js';

const policy = loadPolicy();
/**
 * The loop's content screens alone: every path allowed, so default-deny never fires and a
 * test of a line or import screen can't pass because of the path instead.
 */
const screens: Policy = { ...policy, loopAllowed: { paths: ['**'], screenContent: [] } };
const HEAD = 'bbb';
const PERSONA = 'src/personas/bundles/x/content.ts';
const SAFETY = 'src/services/safety/x.ts';
const EVAL = 'scripts/voice-eval/judge.mjs';
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};
const by = (author: string, committer = author, verified = false): CommitIdentity => ({
  author,
  committer,
  verified,
});
/** What the ferni-eval app gets by committing through the GitHub API: a verified commit. */
const EVAL_COMMIT = by('ferni-eval[bot]', 'ferni-eval[bot]', true);
const SETH = by('sethdford');
const AGENT = by('ferni-agent[bot]');
const LOOP = by('ferni-loop[bot]');
const approval = (commitId: string, state = 'APPROVED', login = 'sethdford') => ({
  login,
  state,
  commitId,
});
const pr = (over: Partial<PullInput> = {}): PullInput => ({
  head: HEAD,
  author: 'app/ferni-agent',
  files: [PERSONA],
  changedLines: ['+  greeting: "hi"'],
  reviews: [],
  ...over,
});

describe('classify', () => {
  it('crisis via changed line in a persona file fails for the loop', () => {
    const p = pr({ author: 'ferni-loop[bot]', changedLines: ['+  "call or text 988"'] });
    expect(classify(p.files, p.changedLines, p.author, screens)).toEqual(['crisis']);
    const r = evaluate(p, screens);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain('crisis lane: needs sethdford approval on bbb');
  });

  it('same content edit by ferni-agent has no crisis lane', () => {
    expect(classify([PERSONA], ['+  "call or text 988"'], 'app/ferni-agent', screens)).toEqual([]);
  });

  it('the loop is recognised in both login forms', () => {
    for (const author of ['ferni-loop[bot]', 'app/ferni-loop', 'FERNI-LOOP[bot]']) {
      expect(classify([PERSONA], ['+ MINOR_CARE'], author, screens)).toEqual(['crisis']);
    }
  });

  it('removed 988 line in a non-crisis file is still crisis', () => {
    const diff = [
      `diff --git a/${PERSONA} b/${PERSONA}`,
      `--- a/${PERSONA}`,
      `+++ b/${PERSONA}`,
      '@@ -3 +2,0 @@',
      '-  "or call 988 any time"',
    ].join('\n');
    const lines = changedLinesOf(diff);
    expect(lines).toEqual(['-  "or call 988 any time"']);
    expect(classify([PERSONA], lines, 'ferni-loop[bot]', screens)).toEqual(['crisis']);
  });

  it('diff headers are not changed lines', () => {
    const diff = [
      'diff --git a/src/x/988.ts b/src/x/988.ts',
      '--- a/src/x/988.ts',
      '+++ b/src/x/988.ts',
      '@@ -1 +1 @@',
      '+ok',
      '-gone',
      ' context',
      'diff --git a/src/y/988.ts b/src/y/988.ts',
      '--- a/src/y/988.ts',
      '+++ b/src/y/988.ts',
      '@@ -0,0 +1 @@',
      '+next',
    ].join('\n');
    expect(changedLinesOf(diff)).toEqual(['+ok', '-gone', '+next']);
  });

  it('crisis line disguised as a +++ header is still caught', () => {
    // An added line whose text is `++ call 988` renders as `+++ call 988`.
    const diff = [
      `diff --git a/${PERSONA} b/${PERSONA}`,
      `--- a/${PERSONA}`,
      `+++ b/${PERSONA}`,
      '@@ -0,0 +1,2 @@',
      '+++ call 988',
      '--- 988 removed',
    ].join('\n');
    const lines = changedLinesOf(diff);
    expect(lines).toEqual(['+++ call 988', '--- 988 removed']);
    expect(classify([PERSONA], lines, 'ferni-loop[bot]', screens)).toEqual(['crisis']);
  });

  it('plain persona change has no lane', () => {
    const p = pr({ author: 'ferni-loop[bot]' });
    expect(classify(p.files, p.changedLines, p.author, screens)).toEqual([]);
    expect(evaluate(p, screens)).toEqual({ ok: true, reasons: ['no autonomy lane'] });
  });

  it('privacy follows the arm gate: src or apps paths, markdown excluded', () => {
    expect(classify(['src/memory/forget-user.ts'], [], 'app/ferni-agent', screens)).toEqual([
      'privacy',
    ]);
    expect(classify(['src/memory/forget-user.md'], [], 'app/ferni-agent', screens)).toEqual([]);
    expect(classify(['docs/forget-user.ts'], [], 'app/ferni-agent', screens)).toEqual([]);
    const r = evaluate(pr({ files: ['src/memory/forget-user.ts'] }), screens);
    expect(r.ok).toBe(true);
    expect(r.reasons.join()).toMatch(/^privacy lane:/);
  });

  it('voice-eval scenarios are not evaluator code, but crisis scenarios are crisis', () => {
    expect(classify(['scripts/voice-eval/scenarios/x.txt'], [], 'a', screens)).toEqual([]);
    expect(classify(['scripts/voice-eval/scenarios/crisis-relay.txt'], [], 'a', screens)).toEqual([
      'crisis',
    ]);
    expect(classify(['scripts/voice-eval/release-check.mjs'], [], 'a', screens)).toEqual([
      'crisis',
      'evaluator',
    ]);
  });
});

describe('evaluate', () => {
  it('crisis path without approval fails', () => {
    const r = evaluate(pr({ files: [SAFETY] }), policy);
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(['crisis lane: needs sethdford approval on bbb']);
  });

  it('crisis path edit by ferni-agent still needs approval', () => {
    const p = pr({ author: 'app/ferni-agent', files: [SAFETY] });
    expect(classify(p.files, p.changedLines, p.author, policy)).toEqual(['crisis']);
    expect(evaluate(p, policy).ok).toBe(false);
  });

  it('approval on old head does not count', () => {
    const r = evaluate(pr({ files: [SAFETY], reviews: [approval('aaa')] }), policy);
    expect(r.ok).toBe(false);
  });

  it('approval on head passes', () => {
    const r = evaluate(pr({ files: [SAFETY], reviews: [approval(HEAD)] }), policy);
    expect(r).toEqual({ ok: true, reasons: ['crisis lane: approved by sethdford on bbb'] });
  });

  it('approval by someone who is not an approver does not count', () => {
    const r = evaluate(pr({ files: [SAFETY], reviews: [approval(HEAD, 'APPROVED', 'x')] }), policy);
    expect(r.ok).toBe(false);
  });

  it('changes requested after an approval on head withdraws it', () => {
    const reviews = [
      approval(HEAD),
      approval(HEAD, 'COMMENTED'),
      approval(HEAD, 'CHANGES_REQUESTED'),
    ];
    expect(evaluate(pr({ files: [SAFETY], reviews }), policy).ok).toBe(false);
  });

  it('evaluator path by ferni-agent fails', () => {
    const r = evaluate(pr({ files: [EVAL] }), policy);
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toMatch(
      /^evaluator lane: ferni-agent\[bot\] is not an evaluator author with verified commits/
    );
  });

  it('evaluator path by ferni-eval[bot] passes', () => {
    for (const author of ['ferni-eval[bot]', 'app/ferni-eval']) {
      const commits = [EVAL_COMMIT];
      expect(evaluate(pr({ author, files: [EVAL], commits }), policy).ok).toBe(true);
    }
  });

  it('eval PR with verified ferni-eval commits passes', () => {
    const p = pr({ author: 'ferni-eval[bot]', files: [EVAL], commits: [EVAL_COMMIT, EVAL_COMMIT] });
    expect(evaluate(p, policy)).toEqual({
      ok: true,
      reasons: ['evaluator lane: verified commits by ferni-eval[bot]'],
    });
    // Verified commits by an opener who is not an evaluator author don't count.
    const agent = by('ferni-agent[bot]', 'ferni-agent[bot]', true);
    expect(evaluate(pr({ files: [EVAL], commits: [agent] }), policy).ok).toBe(false);
  });

  it('eval PR with an unverified commit needs approval', () => {
    // A git push claiming the app's identity: right logins, no GitHub signature.
    const pushed = by('ferni-eval[bot]', 'ferni-eval[bot]', false);
    const p = pr({ author: 'ferni-eval[bot]', files: [EVAL], commits: [EVAL_COMMIT, pushed] });
    expect(evaluate(p, policy).ok).toBe(false);
    expect(evaluate({ ...p, commits: [] }, policy).ok).toBe(false);
    expect(evaluate({ ...p, reviews: [approval(HEAD)] }, policy).ok).toBe(true);
  });

  it('evaluator PR opened by ferni-eval with a ferni-agent commit needs approval', () => {
    // Verified, but committed by another identity.
    const commits = [EVAL_COMMIT, by('ferni-agent[bot]', 'ferni-agent[bot]', true)];
    const p = pr({ author: 'ferni-eval[bot]', files: [EVAL], commits });
    expect(evaluate(p, policy).ok).toBe(false);
  });

  it('evaluator path by ferni-agent passes with an owner approval on head', () => {
    expect(evaluate(pr({ files: [EVAL], reviews: [approval(HEAD)] }), policy).ok).toBe(true);
  });

  it('crisis and evaluator are judged independently', () => {
    const files = [SAFETY, EVAL];
    expect(evaluate(pr({ author: 'ferni-eval[bot]', files }), policy).ok).toBe(false);
  });
});

describe('fail closed', () => {
  it('control-character path is in every lane', () => {
    for (const odd of ['src/personas/a\u0001b.ts', 'docs/x\n.md', '"src/personas/q.ts"']) {
      expect(classify([odd], [], 'app/ferni-agent', policy)).toEqual([
        'crisis',
        'privacy',
        'evaluator',
      ]);
    }
  });

  it('binary file in a loop PR is crisis', () => {
    const image = 'src/personas/bundles/x/avatar.png';
    const extras = { binaryFiles: [image] };
    expect(classify([image], [], 'ferni-loop[bot]', policy, extras)).toEqual(['crisis']);
    expect(classify([image], [], 'app/ferni-agent', policy, extras)).toEqual([]);
  });

  it('the check itself and CODEOWNERS are evaluator code', () => {
    for (const f of ['.github/workflows/autonomy-lanes.yml', '.github/CODEOWNERS']) {
      expect(evaluate(pr({ files: [f] }), policy).ok).toBe(false);
    }
  });
});

describe('approver authorship', () => {
  it('seth-authored crisis PR still needs an approval review', () => {
    // Commit logins come from emails, so authorship never signs; Seth's own crisis PRs
    // merge with his ruleset admin bypass.
    for (const commits of [[SETH], [by('sethdford', 'sethdford', true)]]) {
      const p = pr({ author: 'sethdford', files: [SAFETY], commits });
      expect(evaluate(p, policy)).toEqual({
        ok: false,
        reasons: ['crisis lane: needs sethdford approval on bbb'],
      });
    }
  });

  it('seth-authored evaluator PR needs an approval review', () => {
    // Authorship never signs, even with his own verified commits: he uses admin bypass.
    const commits = [by('sethdford', 'sethdford', true)];
    const p = pr({ author: 'sethdford', files: [EVAL], commits });
    expect(evaluate(p, policy).ok).toBe(false);
  });

  it('commit spoofing sethdford email is not a sign-off', () => {
    // A loop push with Seth's email: GitHub attributes it to sethdford, unverified.
    for (const author of ['sethdford', 'ferni-loop[bot]', 'app/ferni-agent']) {
      const commits = [SETH, SETH];
      expect(evaluate(pr({ author, files: [SAFETY], commits }), policy).ok).toBe(false);
      expect(evaluate(pr({ author, files: [EVAL], commits }), policy).ok).toBe(false);
    }
  });

  it('crisis PR authored by ferni-agent with no approval fails', () => {
    expect(evaluate(pr({ author: 'app/ferni-agent', files: [SAFETY] }), policy).ok).toBe(false);
  });

  it('a bot or app form of the approver login is not a sign-off', () => {
    for (const login of ['app/sethdford', 'sethdford[bot]']) {
      const reviews = [approval(HEAD, 'APPROVED', login)];
      expect(evaluate(pr({ files: [SAFETY], reviews }), policy).ok).toBe(false);
    }
  });
});

describe('who pushed, not only who opened', () => {
  const content988 = { files: [PERSONA], changedLines: ['+ "call or text 988"'] };

  it('PR from a loop/ branch is screened even with sethdford commits', () => {
    // Commit logins come from emails; only the loop's app can push to loop/ (ruleset).
    const p = pr({ ...content988, author: 'sethdford', commits: [SETH, SETH] });
    expect(evaluate({ ...p, headRef: 'loop/tune-greeting' }, screens)).toEqual({
      ok: false,
      reasons: ['crisis lane: needs sethdford approval on bbb'],
    });
    expect(evaluate({ ...p, headRef: 'feat/tune-greeting' }, screens).ok).toBe(true);
    expect(evaluate({ ...p, headRef: 'feat/loop/x' }, screens).ok).toBe(true);
  });

  it('loop commit pushed onto a ferni-agent PR is screened', () => {
    for (const loop of [LOOP, by('ferni-agent[bot]', 'ferni-loop[bot]')]) {
      const r = evaluate(pr({ ...content988, commits: [AGENT, loop] }), screens);
      expect(r).toEqual({ ok: false, reasons: ['crisis lane: needs sethdford approval on bbb'] });
    }
    expect(evaluate(pr({ ...content988, commits: [AGENT] }), screens).ok).toBe(true);
  });

  it('seth-authored PR with a ferni-agent commit needs approval', () => {
    for (const other of [AGENT, by('sethdford', 'web-flow'), by('', 'sethdford')]) {
      const p = pr({ author: 'sethdford', files: [SAFETY], commits: [SETH, other] });
      expect(evaluate(p, screens).ok).toBe(false);
    }
  });

  it('commit with no linked login is screened as loop', () => {
    for (const unlinked of [by('', 'ferni-agent[bot]'), by('ferni-agent[bot]', '')]) {
      const r = evaluate(pr({ ...content988, commits: [AGENT, unlinked] }), screens);
      expect(r).toEqual({ ok: false, reasons: ['crisis lane: needs sethdford approval on bbb'] });
    }
  });

  it('commits API error fails closed', () => {
    const ok = [
      {
        author: { login: 'sethdford' },
        committer: { login: 'sethdford' },
        commit: { verification: { verified: true } },
      },
    ];
    expect(readCommits(() => ok, 1)).toEqual([by('sethdford', 'sethdford', true)]);
    expect(readCommits(() => [{ author: null, committer: null }], 1)).toEqual([by('')]);
    const fail = () => {
      throw new Error('HTTP 502');
    };
    expect(readCommits(fail, 1)).toBeNull();
    // The REST list stops at 250 commits: a short read is not the whole PR.
    expect(readCommits(() => ok, 251)).toBeNull();
    // Unreadable commits: screened as the loop's.
    expect(evaluate(pr({ ...content988, commits: null }), screens).ok).toBe(false);
    const seth = evaluate(pr({ author: 'sethdford', files: [SAFETY], commits: null }), screens);
    expect(seth.ok).toBe(false);
    expect(seth.reasons).toContain('commits unreadable: screened as the loop');
  });
});

describe('crisis wiring outside crisis paths', () => {
  const loopOnly = (lines: string[]) => {
    expect(classify([PERSONA], lines, 'ferni-loop[bot]', screens)).toEqual(['crisis']);
    expect(classify([PERSONA], lines, 'app/ferni-agent', screens)).toEqual([]);
  };

  it('turn-processor crisis wiring files are crisis paths', () => {
    for (const f of ['turn-crisis.ts', 'safety-note.ts']) {
      const path = `src/agents/processors/turn-processor/${f}`;
      expect(classify([path], [], 'app/ferni-agent', screens)).toEqual(['crisis']);
    }
  });

  it('deleting a crisis import in a non-crisis file is crisis for the loop', () => {
    loopOnly(["-import { screenTurn } from '../../services/safety/screen.js';"]);
    loopOnly(["-} from '../agents/safety/router.js';"]);
    loopOnly(['-const t = require("../tools/domains/crisis/index");']);
    loopOnly(["-  const m = await import('../../utils/minor-care.js');"]);
    loopOnly(["-export * from './shared/ai-notice.js';"]);
    loopOnly(["+import { transfer } from '../services/human-transfer/index.js';"]);
  });

  /** Lanes for a one-line change to `file` adding `line`, as the loop and as ferni-agent. */
  const importLanes = (file: string, line: string) => {
    const diff = [
      `diff --git a/${file} b/${file}`,
      `--- a/${file}`,
      `+++ b/${file}`,
      '@@ -0,0 +1 @@',
      `+${line}`,
    ].join('\n');
    const imports = importsOf(diff);
    const lines = changedLinesOf(diff);
    return [
      classify([file], lines, 'ferni-loop[bot]', screens, { imports }),
      classify([file], lines, 'app/ferni-agent', screens, { imports }),
    ];
  };

  it('relative import of a crisis module is crisis for the loop', () => {
    const file = 'src/agents/processors/turn-processor/x.ts';
    for (const spec of ['./turn-crisis', './turn-crisis.js', './safety-note']) {
      expect(importLanes(file, `import { a } from '${spec}';`)).toEqual([['crisis'], []]);
    }
    // The same name somewhere it doesn't resolve to a crisis module is not crisis. (A
    // crisis-named file is crisis wherever it lives, src/**/*crisis*, so this uses safety-note.)
    const elsewhere = 'src/agents/other/x.ts';
    expect(importLanes(elsewhere, "import { a } from './safety-note';")).toEqual([[], []]);
  });

  it('relative parent import into services/safety is crisis for the loop', () => {
    const file = 'src/services/memory/x.ts';
    // '../safety' names no crisis word: only resolving it (to safety/index.ts) catches it.
    expect(importLanes(file, "import { screen } from '../safety';")).toEqual([['crisis'], []]);
    expect(importLanes(file, "const g = require('../safety/crisis-guard');")).toEqual([
      ['crisis'],
      [],
    ]);
  });

  it('a specifier that cannot be resolved falls back to crisis name segments', () => {
    const file = 'src/agents/x.ts';
    expect(importLanes(file, "import { a } from '@ferni/turn-crisis';")).toEqual([['crisis'], []]);
    expect(importLanes(file, "import { a } from '@/services/safety/x';")).toEqual([['crisis'], []]);
    expect(importLanes(file, "import { a } from '@ferni/greetings';")).toEqual([[], []]);
  });

  it('spelled-out 988 is crisis for the loop', () => {
    loopOnly(['+  "call or text nine eight eight"']);
    loopOnly(['+  hotline: "Nine-Eight-Eight"']);
    loopOnly(["+  const n = '98' + '8';"]);
  });

  it('9-8-8 in a persona file is crisis for the loop', () => {
    loopOnly(['+  "call or text 9-8-8"']);
    loopOnly(['+  "dial 9 8 8 any time"']);
    loopOnly(['-  "9.8.8"']);
  });

  it('string-split 988 is crisis for the loop', () => {
    loopOnly(["+  const n = '9' + '88';"]);
    loopOnly(['+  const n = "9"+"8"+"8";']);
  });

  it('template-literal split 988 is crisis for the loop', () => {
    loopOnly(["+  const line = `9${'8'}8`;"]);
    expect(joinLine("+  `9${'8'}8`")).toBe('988');
    loopOnly(['+  const line = `call ${9}${8}${8} now`;']);
    // A year or a longer number that contains 988 is not the hotline.
    expect(classify([PERSONA], ['+  born: 1988, id: 49881'], 'ferni-loop[bot]', screens)).toEqual(
      []
    );
  });

  it('backtick concatenation 988 is crisis for the loop', () => {
    loopOnly(['+  const n = `9` + `88`;']);
    expect(joinLine('+  `9` + `88`')).toBe('988');
    loopOnly(['+  const n = `9` + `8` + `8`;']);
  });

  it('removing addSafetyNote from a barrel destructure is crisis for the loop', () => {
    // turn-handler.ts imports it from the processors barrel, which is not a crisis path.
    loopOnly(['-  addSafetyNote,']);
    loopOnly(['-      addSafetyNote(']);
  });

  it('neutralising scoreCrisisLanguage is crisis for the loop', () => {
    loopOnly([
      '-    if (scoreCrisisLanguage(text).isCrisis) {',
      '+    if (false && scoreCrisisLanguage(text).isCrisis) {',
    ]);
    // Whole words only: a longer identifier that contains one is not a mention.
    expect(
      classify([PERSONA], ['+ const myscoreCrisisLanguageX = 1;'], 'ferni-loop[bot]', screens)
    ).toEqual([]);
  });
});

describe('default-deny for the loop', () => {
  const PROCESS_TURN = 'src/agents/processors/turn-processor/process-turn.ts';
  const DOC = 'docs/ci/notes.md';
  const TEST_FILE = 'src/agents/personas/__tests__/greeting.test.ts';
  /** The policy as if a crisis file had been left out of crisis.paths (the gap it closes). */
  const missing: Policy = {
    ...policy,
    lanes: {
      ...policy.lanes,
      crisis: {
        ...policy.lanes.crisis,
        paths: policy.lanes.crisis.paths.filter((g) => g !== PROCESS_TURN),
      },
    },
  };
  const plain = ['+  const greeting = "hi";'];
  const outside = (file: string) => `outside the loop's allowed paths: ${file}`;

  it('a loop PR touching a file missing from crisis.paths is blocked', () => {
    expect(missing.lanes.crisis.paths).not.toContain(PROCESS_TURN);
    expect(classify([PROCESS_TURN], plain, 'ferni-loop[bot]', missing)).toEqual(['crisis']);
    const p = pr({ author: 'ferni-loop[bot]', files: [PROCESS_TURN], changedLines: plain });
    expect(evaluate(p, missing)).toEqual({
      ok: false,
      reasons: ['crisis lane: needs sethdford approval on bbb', outside(PROCESS_TURN)],
    });
    // Any non-allowed file, crisis or not: the persona file too.
    expect(classify([PERSONA], plain, 'ferni-loop[bot]', policy)).toEqual(['crisis']);
    // The crisis approval on the head passes it.
    const approved = { ...p, reviews: [approval(HEAD)] };
    expect(evaluate(approved, missing).ok).toBe(true);
  });

  it('a loop PR touching only docs passes', () => {
    const p = pr({ author: 'ferni-loop[bot]', files: [DOC], changedLines: plain });
    expect(evaluate(p, policy)).toEqual({ ok: true, reasons: ['no autonomy lane'] });
    expect(loopOutsideAllowed([DOC, 'docs/a/b/c.md'], policy)).toEqual([]);
    // Docs changes still get the line screen.
    const r = evaluate({ ...p, changedLines: ['+ call or text 988'] }, policy);
    expect(r.ok).toBe(false);
  });

  it('a loop PR touching a test file that imports services/safety is blocked', () => {
    const text = [
      "import { describe, it } from 'vitest';",
      "import { screenTurn } from '../../../services/safety/index.js';",
      "describe('greeting', () => it('says hi', () => {}));",
    ].join('\n');
    const p = pr({
      author: 'ferni-loop[bot]',
      files: [TEST_FILE],
      changedLines: ["+describe('greeting', () => it('says hi', () => {}));"],
      fileTexts: { [TEST_FILE]: text },
    });
    expect(evaluate(p, policy)).toEqual({
      ok: false,
      reasons: ['crisis lane: needs sethdford approval on bbb', outside(TEST_FILE)],
    });
    // The import sits on an unchanged line: the changed lines alone don't screen it.
    expect(classify(p.files, p.changedLines, p.author, screens, p)).toEqual([]);
    // An import only the resolver catches: no crisis word or name on the line, but
    // ../process-turn.js resolves to a crisis path.
    const resolved = 'src/agents/processors/turn-processor/__tests__/turn.test.ts';
    const viaPath = {
      [resolved]: "import * as turn from '../process-turn.js';\nit('x', () => {});",
    };
    expect(loopOutsideAllowed([resolved], policy, viaPath)).toEqual([resolved]);
    // A test that names a crisis symbol anywhere is blocked too.
    const named = { [TEST_FILE]: 'expect(scoreCrisisLanguage("x")).toBe(1);' };
    expect(loopOutsideAllowed([TEST_FILE], policy, named)).toEqual([TEST_FILE]);
    // A test with no crisis content passes; one whose content wasn't read fails closed.
    const clean = { [TEST_FILE]: "import { greet } from '../greet.js';\nit('hi', () => {});" };
    expect(evaluate({ ...p, fileTexts: clean }, policy)).toEqual({
      ok: true,
      reasons: ['no autonomy lane'],
    });
    expect(evaluate({ ...p, fileTexts: {} }, policy).reasons).toContain(outside(TEST_FILE));
    expect(loopOutsideAllowed(['src/a.test.ts'], policy, {})).toEqual(['src/a.test.ts']);
  });

  it('a human PR touching process-turn.ts is unchanged', () => {
    for (const author of ['sethdford', 'app/ferni-agent']) {
      expect(classify([PROCESS_TURN], plain, author, missing)).toEqual([]);
      const p = pr({ author, files: [PROCESS_TURN], changedLines: plain, commits: [SETH] });
      expect(evaluate(p, missing)).toEqual({ ok: true, reasons: ['no autonomy lane'] });
    }
    // With the real policy it is a crisis path for every author, as before.
    expect(classify([PROCESS_TURN], plain, 'sethdford', policy)).toEqual(['crisis']);
  });

  it('an unattributed or loop-branch PR is treated as the loop', () => {
    const human = pr({ author: 'sethdford', files: [PERSONA], changedLines: plain });
    expect(evaluate({ ...human, commits: [SETH] }, policy).ok).toBe(true);
    for (const p of [
      { ...human, commits: [SETH], headRef: 'loop/tune-greeting' },
      { ...human, commits: [SETH, by('', 'sethdford')] },
      { ...human, commits: [SETH, by('sethdford', '')] },
      { ...human, commits: null },
    ]) {
      const r = evaluate(p, policy);
      expect(r.ok).toBe(false);
      expect(r.reasons).toContain(outside(PERSONA));
    }
  });

  it('lists five outside files, then a count', () => {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => `src/${x}.ts`);
    const r = evaluate(pr({ author: 'ferni-loop[bot]', files, changedLines: plain }), policy);
    expect(r.reasons).toContain(
      "outside the loop's allowed paths: src/a.ts, src/b.ts, src/c.ts, src/d.ts, src/e.ts (+2 more)"
    );
  });
});

describe('main() on a merge group', () => {
  const SCRIPT = join(__dirname, '../autonomy-lanes.ts');
  const R = 'ferni-ai/voiceai';
  const root = mkdtempSync(join(tmpdir(), 'autonomy-queue-'));
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  const bin = join(root, 'bin');
  const fixtures = join(root, 'fixtures.json');
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV }).trim();
  const commitOn = (from: string, file: string, msg: string) => {
    git(seed, 'checkout', '-q', '--detach', from);
    mkdirSync(join(seed, file, '..'), { recursive: true });
    writeFileSync(join(seed, file), `${msg}\n`);
    git(seed, 'add', '-A');
    git(seed, 'commit', '-q', '-m', msg);
    return git(seed, 'rev-parse', 'HEAD');
  };
  mkdirSync(seed, { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), FAKE_GH);
  chmodSync(join(bin, 'gh'), 0o755);
  git(seed, 'init', '-q', '-b', 'main');
  writeFileSync(join(seed, 'README.md'), 'base\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'base');
  const BASE = git(seed, 'rev-parse', 'HEAD');
  const HEAD7 = commitOn(BASE, SAFETY, 'pr 7 head');
  const QUEUED = commitOn(BASE, SAFETY, 'land the safety change (#7)');
  // The real shape: the ref names the commit the entry is built on, not the PR head
  // (gh-readonly-queue/main/pr-3038-66d4441c… was #3021's squash; #3038's head was 2efb419a).
  const QUEUE_REF = `gh-readonly-queue/main/pr-7-${BASE}`;
  const origin = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(seed, 'push', '-q', origin, `${BASE}:refs/heads/main`, `${HEAD7}:refs/pull/7/head`);
  git(seed, 'push', '-q', origin, `${QUEUED}:refs/heads/${QUEUE_REF}`);
  git(root, 'clone', '-q', origin, work);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const run = (reviews: unknown[]) => {
    const api = `repos/${R}/pulls/7`;
    const user = { login: 'ferni-agent[bot]' };
    const fx = {
      [api]: { pages: [{ number: 7, head: { sha: HEAD7 }, user, commits: 1 }] },
      [`${api}/commits`]: { pages: [[{ author: user, committer: user }]] },
      [`${api}/reviews`]: { pages: [reviews] },
    };
    writeFileSync(fixtures, JSON.stringify(fx));
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    for (const k of ['GITHUB_STEP_SUMMARY', 'PR_NUMBER', 'PR_HEAD', 'AUTONOMY_LANES_FIXTURE'])
      delete env[k];
    const r = spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT], {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...env,
        PATH: `${bin}:${process.env.PATH}`,
        FAKE_GH_FIXTURES: fixtures,
        REPO: R,
        QUEUE_REF,
        AUTONOMY_LANES_ENFORCE: '1',
      },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  it('a queued PR approved on its head passes although the ref names another commit', () => {
    expect(HEAD7).not.toBe(BASE);
    const r = run([{ user: { login: 'sethdford' }, state: 'APPROVED', commit_id: HEAD7 }]);
    expect(r.out).toContain(`PR #7 ${HEAD7.slice(0, 9)}: OK: crisis lane: approved by sethdford`);
    expect(r.code).toBe(0);
  });

  it('the same queued PR with no approval on its head fails', () => {
    const r = run([{ user: { login: 'sethdford' }, state: 'APPROVED', commit_id: BASE }]);
    expect(r.out).toContain(`needs sethdford approval on ${HEAD7.slice(0, 9)}`);
    expect(r.code).toBe(1);
  });
});

describe('diffInputs against a real repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'autonomy-diff-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV }).trim();
  const write = (path: string, data: string | Buffer) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), data);
  };
  git('init', '-q', '-b', 'main');
  write('README.md', 'base\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  write('src/services/safety/caf\u00e9-gate.ts', 'export const x = 1;\n');
  write('src/services/safety/model.bin', Buffer.from('\u0000\u0001\u0000MINOR_CARE\n'));
  write(PERSONA, '++ call 988\n');
  write('src/services/memory/with space.ts', "import { screen } from '../safety';\n");
  write(
    'src/x/__tests__/a.test.ts',
    "import { screen } from '../../services/safety';\nit('a', () => {});\n"
  );
  // A textconv driver that blanks the content must not hide it from the diff.
  write('.gitattributes', '*.ts diff=blank\n');
  git('config', 'diff.blank.textconv', 'true');
  git('add', '-A');
  git('commit', '-q', '-m', 'change');
  const inputs = diffInputs('main~1...main', root, policy.loopAllowed.screenContent);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('reads the head content of changed test files, for the loop screen', () => {
    const file = 'src/x/__tests__/a.test.ts';
    expect(Object.keys(inputs.fileTexts ?? {})).toEqual([file]);
    expect(inputs.fileTexts?.[file]).toContain('services/safety');
    expect(loopOutsideAllowed([file], policy, inputs.fileTexts)).toEqual([file]);
  });

  it('non-ASCII path under src/services/safety/ classifies crisis', () => {
    expect(inputs.files).toContain('src/services/safety/caf\u00e9-gate.ts');
    const safety = inputs.files.filter((f) => f.startsWith('src/services/safety/caf'));
    expect(classify(safety, [], 'app/ferni-agent', policy)).toEqual(['crisis']);
  });

  it('imports carry the file they were changed in', () => {
    const ref = { file: 'src/services/memory/with space.ts', specifier: '../safety' };
    expect(inputs.imports).toContainEqual(ref);
    const extras = { imports: inputs.imports };
    expect(classify([ref.file], [], 'ferni-loop[bot]', policy, extras)).toEqual(['crisis']);
  });

  it('binary file in a crisis path is crisis', () => {
    expect(inputs.binaryFiles).toEqual(['src/services/safety/model.bin']);
    const extras = { binaryFiles: inputs.binaryFiles };
    expect(classify([], [], 'app/ferni-agent', policy, extras)).toEqual(['crisis']);
    // --text: a binary file's content is still screened.
    expect(inputs.changedLines.some((l) => l.includes('MINOR_CARE'))).toBe(true);
  });

  it('a +++-looking added line and textconv-hidden content still reach the loop screen', () => {
    expect(inputs.changedLines).toContain('+++ call 988');
    expect(inputs.changedLines).toContain('+export const x = 1;');
    expect(classify([PERSONA], inputs.changedLines, 'ferni-loop[bot]', policy)).toEqual(['crisis']);
  });
});

describe('helpers', () => {
  it('normalizeLogin maps the gh app form to the REST bot login', () => {
    expect(normalizeLogin('app/ferni-loop')).toBe('ferni-loop[bot]');
    expect(normalizeLogin('Ferni-Loop[bot]')).toBe('ferni-loop[bot]');
    expect(normalizeLogin(' SethDford ')).toBe('sethdford');
  });

  it('matchesGlob: * stays in one directory, ** crosses them', () => {
    expect(matchesGlob('src/utils/minor-care-gate.ts', 'src/utils/minor-care*.ts')).toBe(true);
    expect(matchesGlob('src/utils/minor-care/x.ts', 'src/utils/minor-care*.ts')).toBe(false);
    expect(matchesGlob('src/services/safety/a/b.ts', 'src/services/safety/**')).toBe(true);
    expect(matchesGlob('src/services/safety-net.ts', 'src/services/safety/**')).toBe(false);
    expect(matchesGlob('README.md', '**/*.md')).toBe(true);
    expect(matchesGlob('scripts/ci/autonomy-policy.json', 'scripts/ci/autonomy-policy.json')).toBe(
      true
    );
    expect(matchesGlob('scripts/ci/autonomy-policyXjson', 'scripts/ci/autonomy-policy.json')).toBe(
      false
    );
  });
});

describe('main()', () => {
  const SCRIPT = join(__dirname, '../autonomy-lanes.ts');
  const root = mkdtempSync(join(tmpdir(), 'autonomy-lanes-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const run = (input: PullInput, enforce: boolean) => {
    const fixture = join(root, 'pr.json');
    writeFileSync(fixture, JSON.stringify(input));
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    for (const k of ['GITHUB_STEP_SUMMARY', 'PR_NUMBER', 'PR_HEAD', 'QUEUE_REF']) delete env[k];
    const r = spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT], {
      encoding: 'utf8',
      env: {
        ...env,
        AUTONOMY_LANES_FIXTURE: fixture,
        AUTONOMY_LANES_ENFORCE: enforce ? '1' : '',
      },
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  it('enforced: a crisis file with no approval exits 1', () => {
    const r = run(pr({ files: [SAFETY] }), true);
    expect(r.code).toBe(1);
    expect(r.out).toContain('crisis lane: needs sethdford approval on bbb');
  });

  it('report-only: the same PR exits 0 and still says what it needs', () => {
    const r = run(pr({ files: [SAFETY] }), false);
    expect(r.code).toBe(0);
    expect(r.out).toContain('crisis lane: needs sethdford approval on bbb');
  });

  it('enforced: approved on head exits 0', () => {
    expect(run(pr({ files: [SAFETY], reviews: [approval(HEAD)] }), true).code).toBe(0);
  });
});
