/**
 * Every VITE_* switch the web app reads reaches the prod web build, or is on a known
 * list with a reason.
 *
 * Vite inlines a VITE_* value at build time, so app.ferni.ai only sees one that
 * deploy-firebase.yml's "Build frontend" step passes in (the same step
 * prod-web-flags.mjs and the e2e walks mirror). A switch read in apps/web/src but
 * missing there can never be turned on (or, for an "on unless 'false'" switch, off) in
 * prod: setting its repo variable does nothing. In November 2026 about 30 switches were
 * in that state and nothing said so.
 *
 * This is a ratchet, not a decision. KNOWN_UNBUILT lists today's gaps, each with a
 * reason; a NEW gap fails, and so does an entry that is now built or no longer read,
 * so the list can only shrink. KNOWN_UNREAD is the reverse: built, but read by nothing.
 *
 * Reads are collected from the access shapes the app uses: `import.meta.env.VITE_X`,
 * `import.meta.env?.VITE_X`, `env.VITE_X` (a parameter defaulting to import.meta.env),
 * bracket access, and `%VITE_X%` in index.html. Tests, mocks, type declarations and
 * comment lines are not reads.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WEB_BUILD, WEB_BUILD_STEP, stepEnv } from './prod-web-flags.mjs';

const WEB_SRC = 'apps/web/src';
const WEB_HTML = 'apps/web/index.html';

/**
 * Read in apps/web/src but not passed by the prod web build, on main today.
 *
 * - `config`: a value that reaches prod some other way (the comment says how).
 * - `dev-only`: an emulator or debug switch; prod must not have it.
 * - `unwired`: a product switch (or config value) no prod build can set. Not a
 *   decision to wire it: wiring one is its own PR, which then deletes the entry.
 *
 * Remove an entry once the build passes it (the test tells you to).
 */
const KNOWN_UNBUILT = {
  // On unless "false": no kill switch in prod.
  VITE_AFTER_CALL_CARD: 'unwired',
  // Off in prod; one browser can turn it on with localStorage.
  VITE_AGENT_DROP_PROMPT: 'unwired',
  VITE_CALL_ROOM: 'unwired',
  // remove when #3641 merges
  VITE_CALM_IDLE: 'unwired',
  // Off in prod; one browser can turn it on with localStorage.
  VITE_CLIENT_TIMING_SEND: 'unwired',
  VITE_CUSTOM_AGENTS_UI: 'unwired',
  // Debug panel: dev and admin builds only. A key built into prod would ship in the
  // public bundle.
  VITE_DEV_PANEL_AUTO: 'dev-only',
  VITE_DEV_PANEL_KEY: 'dev-only',
  // The Firebase web config: when the build has none, config/firebase.ts
  // loadFirebaseConfig() reads it at startup from Firebase Hosting's
  // /__/firebase/init.json, so prod gets the real project without a build value.
  VITE_FIREBASE_API_KEY: 'config',
  VITE_FIREBASE_APP_ID: 'config',
  VITE_FIREBASE_AUTH_DOMAIN: 'config',
  VITE_FIREBASE_MESSAGING_SENDER_ID: 'config',
  VITE_FIREBASE_PROJECT_ID: 'config',
  VITE_FIREBASE_STORAGE_BUCKET: 'config',
  // A config value, but nothing delivers it to prod: Google One Tap never starts there.
  VITE_GOOGLE_CLIENT_ID: 'unwired',
  VITE_JOURNAL_CAPTURE: 'unwired',
  VITE_LEGACY_SHARING: 'unwired',
  // Also on whenever VITE_MEMORY_VIEW is, which the build does pass.
  VITE_MEMORY_CONTROL: 'unwired',
  // On unless "false": no kill switch in prod.
  VITE_NO_STREAKS: 'unwired',
  VITE_OVERLAY_HOST: 'unwired',
  VITE_PATTERN_INSIGHTS: 'unwired',
  VITE_PERSONALIZE_EXTRAS: 'unwired',
  VITE_PORCH_LIGHT: 'unwired',
  VITE_REACH_OUT_ACTIONS: 'unwired',
  // On unless "false": no kill switch in prod.
  VITE_REPORT_REPLY: 'unwired',
  VITE_ROSTER_STABLE: 'unwired',
  VITE_SANCTUARY_CHAT: 'unwired',
  VITE_SEEDS: 'unwired',
  VITE_SPEAKER_CUES: 'unwired',
  // A config value, but nothing delivers it to prod: loadStripe() resolves null there.
  VITE_STRIPE_PUBLISHABLE_KEY: 'unwired',
  // Only read when import.meta.env.DEV; the e2e walks set it for their emulator build.
  VITE_USE_FIREBASE_EMULATORS: 'dev-only',
  VITE_VOICE_CLONE_CREATION: 'unwired',
  VITE_WAITLIST_SCREEN: 'unwired',
};

/** Passed by the prod web build but read by nothing in apps/web/src, on main today. */
const KNOWN_UNREAD = ['VITE_IDLE_LIFE'];

const CATEGORIES = new Set(['config', 'dev-only', 'unwired']);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue)$/;
const NOT_A_READ_FILE = /\.(?:test|spec)\.[^.]+$|\.d\.[cm]?ts$/;
const NOT_A_READ_DIR = new Set(['__tests__', '__mocks__', 'node_modules']);
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;
const ACCESS = [
  /\benv\??\.(VITE_[A-Z0-9_]+)\b/g,
  /\benv\??\.?\[\s*['"`](VITE_[A-Z0-9_]+)['"`]\s*\]/g,
];
const HTML_ACCESS = /%(VITE_[A-Z0-9_]+)%/g;

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!NOT_A_READ_DIR.has(entry.name)) out.push(...sourceFiles(path));
    } else if (SOURCE_FILE.test(entry.name) && !NOT_A_READ_FILE.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/** Every VITE_* name the app reads: name -> the files that read it. */
function readSwitches(srcDir, htmlFile) {
  const reads = new Map();
  const add = (name, file) => reads.set(name, (reads.get(name) ?? new Set()).add(file));
  for (const file of sourceFiles(srcDir)) {
    const code = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !COMMENT_LINE.test(line))
      .join('\n');
    for (const pattern of ACCESS) for (const m of code.matchAll(pattern)) add(m[1], file);
  }
  if (htmlFile) {
    for (const m of readFileSync(htmlFile, 'utf8').matchAll(HTML_ACCESS)) add(m[1], htmlFile);
  }
  return reads;
}

function builtSwitches(workflow) {
  return new Set(Object.keys(stepEnv(workflow, WEB_BUILD_STEP)));
}

/** What breaks the ratchet, one line each; empty when the lists match the code. */
function ratchetErrors(reads, built, knownUnbuilt, knownUnread) {
  const where = `${WEB_BUILD} "${WEB_BUILD_STEP}"`;
  const unbuilt = new Set(Object.keys(knownUnbuilt));
  const unread = new Set(knownUnread);
  const errors = [];
  for (const [name, files] of reads) {
    if (!built.has(name) && !unbuilt.has(name)) {
      errors.push(
        `NEW gap: ${name} is read in ${[...files].sort().join(', ')} but ${where} never ` +
          'passes it, so no repo variable can set it in prod. Pass it in the build (and ' +
          'deploy-production.yml + docker/Dockerfile.ui), or add it to KNOWN_UNBUILT with a reason.'
      );
    }
  }
  for (const name of unbuilt) {
    if (built.has(name)) {
      errors.push(`stale: ${name} is now passed by ${where}: delete it from KNOWN_UNBUILT.`);
    } else if (!reads.has(name)) {
      errors.push(`stale: ${name} is no longer read in ${WEB_SRC}: delete it from KNOWN_UNBUILT.`);
    }
  }
  for (const name of built) {
    if (!reads.has(name) && !unread.has(name)) {
      errors.push(
        `NEW unread: ${where} passes ${name} but nothing in ${WEB_SRC} reads it. Drop it ` +
          'from the build, or add it to KNOWN_UNREAD.'
      );
    }
  }
  for (const name of unread) {
    if (!built.has(name)) {
      errors.push(`stale: ${name} is no longer passed by ${where}: delete it from KNOWN_UNREAD.`);
    } else if (reads.has(name)) {
      errors.push(`stale: ${name} is now read in ${WEB_SRC}: delete it from KNOWN_UNREAD.`);
    }
  }
  return errors;
}

const reads = readSwitches(WEB_SRC, WEB_HTML);
const built = builtSwitches(readFileSync(WEB_BUILD, 'utf8'));

describe('prod web build args', () => {
  it('collects real sets: an empty parse fails rather than passing', () => {
    expect(reads.size).toBeGreaterThan(40);
    expect(built.size).toBeGreaterThanOrEqual(25);
    // A motion switch from #3023, read in config/motion-flags.ts and passed by the build.
    expect(built.has('VITE_NATURAL_BLINK')).toBe(true);
    expect(reads.has('VITE_NATURAL_BLINK')).toBe(true);
    // index.html reads, and the default-parameter shape in ui/dev-panel-gate.ts.
    expect(reads.get('VITE_TRY_FIRST')?.has(WEB_HTML)).toBe(true);
    expect(reads.has('VITE_DEV_PANEL_KEY')).toBe(true);
  });

  it('every switch the web app reads is built, or known unbuilt with a reason', () => {
    expect(ratchetErrors(reads, built, KNOWN_UNBUILT, KNOWN_UNREAD)).toEqual([]);
  });

  it('keeps both lists sorted, and each reason one of config | dev-only | unwired', () => {
    const names = Object.keys(KNOWN_UNBUILT);
    expect(names).toEqual([...names].sort());
    expect(KNOWN_UNREAD).toEqual([...KNOWN_UNREAD].sort());
    for (const [name, reason] of Object.entries(KNOWN_UNBUILT)) {
      expect(CATEGORIES.has(reason), `${name}: "${reason}"`).toBe(true);
    }
  });

  it('fails on a new unbuilt read, a stale entry, and a new or stale unread name', () => {
    // Made-up sets, so this checks the ratchet itself and not today's lists.
    const read = (...names) => new Map(names.map((name) => [name, new Set(['x.ts'])]));
    const where = `${WEB_BUILD} "${WEB_BUILD_STEP}"`;
    const r = read('VITE_A', 'VITE_B');
    const b = new Set(['VITE_A', 'VITE_C']);
    const unbuilt = { VITE_B: 'unwired' };
    const unread = ['VITE_C'];
    expect(ratchetErrors(r, b, unbuilt, unread)).toEqual([]);

    expect(ratchetErrors(read('VITE_A', 'VITE_B', 'VITE_NEW'), b, unbuilt, unread)).toEqual([
      expect.stringMatching(/^NEW gap: VITE_NEW is read in x\.ts but .* never passes it/),
    ]);
    expect(ratchetErrors(r, b, {}, unread)).toEqual([expect.stringMatching(/^NEW gap: VITE_B /)]);
    expect(ratchetErrors(r, new Set([...b, 'VITE_B']), unbuilt, unread)).toEqual([
      `stale: VITE_B is now passed by ${where}: delete it from KNOWN_UNBUILT.`,
    ]);
    expect(ratchetErrors(read('VITE_A'), b, unbuilt, unread)).toEqual([
      `stale: VITE_B is no longer read in ${WEB_SRC}: delete it from KNOWN_UNBUILT.`,
    ]);

    expect(ratchetErrors(r, b, unbuilt, [])).toEqual([
      expect.stringMatching(/^NEW unread: .* passes VITE_C but nothing/),
    ]);
    expect(ratchetErrors(r, new Set(['VITE_A']), unbuilt, unread)).toEqual([
      `stale: VITE_C is no longer passed by ${where}: delete it from KNOWN_UNREAD.`,
    ]);
    expect(ratchetErrors(read('VITE_A', 'VITE_B', 'VITE_C'), b, unbuilt, unread)).toEqual([
      `stale: VITE_C is now read in ${WEB_SRC}: delete it from KNOWN_UNREAD.`,
    ]);
  });

  describe('the read collector', () => {
    const dir = mkdtempSync(join(tmpdir(), 'web-build-args-'));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('finds each access shape, and skips tests, mocks, declarations and comments', () => {
      const write = (path, text) => {
        mkdirSync(join(dir, path, '..'), { recursive: true });
        writeFileSync(join(dir, path), text);
      };
      write('a.ts', "export const on = import.meta.env.VITE_ZZ_FAKE_SWITCH === 'true';\n");
      write(
        'b.tsx',
        "const v = import.meta.env?.VITE_ZZ_OPTIONAL;\nimport.meta.env['VITE_ZZ_BRACKET'];\n"
      );
      write('c.ts', 'function f(env = import.meta.env) {\n  return env.VITE_ZZ_PARAM;\n}\n');
      write('d.ts', '// import.meta.env.VITE_ZZ_LINE_COMMENT\n/**\n * env.VITE_ZZ_DOC\n */\n');
      write('__tests__/e.ts', 'import.meta.env.VITE_ZZ_TESTS_DIR;\n');
      write('__mocks__/f.ts', 'import.meta.env.VITE_ZZ_MOCKS_DIR;\n');
      write('g.test.ts', 'import.meta.env.VITE_ZZ_TEST_FILE;\n');
      write('h.d.ts', 'interface E { readonly VITE_ZZ_DECL?: string }\nenv.VITE_ZZ_DECL_READ;\n');
      write('i.css', 'a { --x: env.VITE_ZZ_CSS; }\n');
      write('index.html', '<script>var t = "%VITE_ZZ_HTML%";</script>\n');

      const found = readSwitches(dir, join(dir, 'index.html'));
      expect([...found.keys()].sort()).toEqual([
        'VITE_ZZ_BRACKET',
        'VITE_ZZ_FAKE_SWITCH',
        'VITE_ZZ_HTML',
        'VITE_ZZ_OPTIONAL',
        'VITE_ZZ_PARAM',
      ]);
      expect([...found.get('VITE_ZZ_FAKE_SWITCH')]).toEqual([join(dir, 'a.ts')]);

      // Each fixture read is a NEW gap against the real build and lists.
      const withFixture = new Map([...reads, ...found]);
      const errors = ratchetErrors(withFixture, built, KNOWN_UNBUILT, KNOWN_UNREAD);
      expect(errors.filter((e) => /^NEW gap: VITE_ZZ_/.test(e))).toHaveLength(5);
    });
  });
});
