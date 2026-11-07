/**
 * Every file this derivation finds is in the crisis lane and owned in CODEOWNERS. That is
 * the claim, and it is narrower than "the lane is complete": a derivation can only find
 * what it is told to follow. Three verifies in a row (2026-10-31) found crisis files this
 * set missed: 18 crisis-named ones, then 9 whose names didn't match, then importers of
 * roots it didn't follow and the dependencies crisis modules read.
 *
 * The guarantee for the builder is default-deny, not this list: a loop PR that changes
 * any file outside the policy's `loopAllowed` paths is in the crisis lane and needs the
 * crisis approval (autonomy-lanes.ts, `loopOutsideAllowed`), so a crisis file missing
 * here still can't merge autonomously. This test is the best-effort human-side net: it
 * keeps crisis.paths, and through it CODEOWNERS, covering what can be found. The set:
 *
 *   1. crisis-named files under src and apps;
 *   2. the crisis modules: src/services/safety/**, src/agents/safety/**, minor-care, the
 *      crisis agreement, gate, signals, filter, turn-crisis and SMS crisis screen, and the
 *      988 / crisis-line helpers (a module exporting a crisis-line, crisis-resource,
 *      lifeline or 988 name, plus the reviewed list below);
 *   3. every src module that imports one of those crisis modules (static, type-only,
 *      re-export, dynamic import() or require()), by the path the specifier resolves to;
 *   4. the pinned files: crisis content crisis modules depend on, which neither a name nor
 *      an import marks.
 *
 * Every file in that set must be in the policy's crisis paths AND owned by the owner in
 * CODEOWNERS, so any author's PR that edits one requests the owner's review.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { importTargets, inPaths, loadPolicy } from '../autonomy-lanes.js';
import { OWNER, ownersOf, ROOT } from './codeowners-rules.js';

// Crisis, 988 and referral, and minor protections (minor-care holds, the sexual-content boundary).
const CRISIS_NAME = /crisis|988|suicid|self[-_ ]?harm|minor-care|sexual/i;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const TEST = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * Crisis modules by place and name: the safety service and agent safety (crisis-guard,
 * crisis-shadow), minor-care's held-write guards, the crisis agreement and gate, the
 * human-transfer crisis signals (CRISIS_QUIET_DAYS), the world-model crisis filter,
 * turn-crisis and the SMS crisis screen.
 */
const CRISIS_MODULE_PATHS = [
  'src/services/safety/**',
  'src/agents/safety/**',
  'src/utils/minor-care.ts',
];
const CRISIS_MODULE_NAME =
  /^(?:crisis-(?:agreement|gate|signals|filter)|turn-crisis|sms-crisis-screen)(?:[-.]|$)/i;
/** A 988 / crisis-line helper by what it exports: getCrisisResources, offersCrisisLine... */
const CRISIS_LINE_EXPORT =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+\w*(?:crisis[-_]?line|crisis[-_]?resource|988|lifeline|nine[-_]?eight[-_]?eight)/im;
/** 988 / crisis-line helpers whose exports don't say so (EMERGENCY_LINE, referralResources). */
const CRISIS_LINE_HELPERS = [
  'src/agents/personas/emergency-claim.ts', // the "call 911 or 988 now" line (#1553)
  'src/agents/personas/emergency-correction.ts', // swaps a false "I called 911" for that line
  'src/services/principal-alignment/human-referral.ts', // picks the referral, 988 for a crisis
  'src/services/principal-alignment/referral-resources.ts', // the 988 crisis-line resources
];
/**
 * Crisis files neither their name nor their imports mark (2026-10-31 verifies): what
 * crisis modules read, not what reads them.
 */
const PINNED = [
  'src/config/flags/THIRD_PARTY_SELF_HARM.ts', // the crisis-who reroute flag (#2635)
  'src/utils/safety-whole-word.ts', // the risk-phrase reader behind hasRiskContent
  'src/config/flags/SAFETY_WHOLE_WORD_SITES.ts', // its flag
  'src/utils/phrase-match.ts', // self-harm forms and the "not suicidal" negation
  'src/tools/domains/life-coaching-shared/helplines.ts', // NATIONAL_HELPLINES, 988
  'src/agents/personas/phrase-loops-safety.generated.ts', // SAFETY_WORDING never rewritten
  'src/tools/handoff/transfer-aliases.ts', // 911 / 988 transfer detection
  'src/services/superhuman/emotional-first-aid.ts', // passive-SI detection, 988
];
/**
 * Importers of a crisis module that aren't crisis logic, each with a one-line reason. Every
 * entry must still be in the derived set, so a stale exclusion fails. Exclude only a file
 * that clearly isn't crisis logic (a logger, a type re-export); never to shrink the lane.
 */
const EXCLUDED: Record<string, string> = {};

const lsFiles = (...dirs: string[]) =>
  execFileSync('git', ['ls-files', '-z', ...dirs], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
const text = (f: string) => readFileSync(join(ROOT, f), 'utf8');

function derive() {
  const sources = lsFiles('src').filter((f) => SOURCE.test(f) && !TEST.test(f));
  const known = new Set(sources);
  const helpers = new Set([
    ...sources.filter((f) => CRISIS_LINE_EXPORT.test(text(f))),
    ...CRISIS_LINE_HELPERS,
  ]);
  const isCrisisModule = (f: string) =>
    inPaths(f, CRISIS_MODULE_PATHS) ||
    CRISIS_MODULE_NAME.test(f.split('/').pop() ?? '') ||
    helpers.has(f);
  const modules = sources.filter(isCrisisModule);
  // preProcessFile lists import, import type, export-from, import() and require() specifiers.
  const importsCrisis = (f: string) =>
    ts
      .preProcessFile(text(f), true, true)
      .importedFiles.some((i) =>
        (importTargets({ file: f, specifier: i.fileName }) ?? []).some(
          (t) => known.has(t) && isCrisisModule(t)
        )
      );
  const importers = sources.filter((f) => !isCrisisModule(f) && importsCrisis(f));
  const named = lsFiles('src', 'apps').filter((f) => CRISIS_NAME.test(f.split('/').pop() ?? ''));
  const all = [...new Set([...named, ...modules, ...importers, ...PINNED])].sort();
  return { helpers, modules, importers, named, all };
}

const derived = derive();
const expected = derived.all.filter((f) => !(f in EXCLUDED));

describe('every file the crisis derivation finds is covered', () => {
  it('every crisis-named file, crisis module, crisis importer and pinned file is in the crisis lane', () => {
    const crisis = loadPolicy().lanes.crisis.paths;
    expect(expected.filter((f) => !inPaths(f, crisis))).toEqual([]);
  });

  it('CODEOWNERS gives every one of them to the owner', () => {
    expect(expected.filter((f) => !ownersOf(f).includes(OWNER))).toEqual([]);
  });

  it('every exclusion is still derived and has a reason', () => {
    for (const [file, reason] of Object.entries(EXCLUDED)) {
      expect(derived.all, file).toContain(file);
      expect(reason.trim().length, file).toBeGreaterThan(10);
    }
  });

  it('the derivation is not vacuous: each source finds the files it should', () => {
    expect(derived.named.length).toBeGreaterThan(20);
    expect(derived.importers.length).toBeGreaterThan(120);
    // By name, including the SELF_HARM spelling.
    expect(derived.named).toContain('src/config/flags/THIRD_PARTY_SELF_HARM.ts');
    // 988 helpers by export, and the reviewed ones.
    expect(derived.helpers).toContain('src/tools/domains/life-coaching-shared/safety-guards.ts');
    expect(derived.helpers).toContain('src/services/safety/crisis-line-speech.ts');
    expect(derived.modules).toContain('src/services/principal-alignment/referral-resources.ts');
    // Importers: of crisis-agreement, of a 988 helper, and by dynamic import().
    expect(derived.importers).toContain('src/agents/shared/farewell-risk.ts');
    expect(derived.importers).toContain('src/agents/personas/action-claim-guard.ts');
    expect(derived.importers).toContain('src/api/wellbeing.routes.ts');
    // Importers of the wider roots: agent safety, turn-crisis, crisis signals, the SMS
    // screen, the crisis filter and minor-care.
    expect(derived.importers).toContain('src/agents/personas/ferni-state.ts');
    expect(derived.importers).toContain('src/agents/processors/turn-processor/process-turn.ts');
    expect(derived.importers).toContain('src/services/outreach/proactive-channels/triggers.ts');
    expect(derived.importers).toContain('src/api/outreach-webhook-routes.ts');
    expect(derived.importers).toContain('src/agents/multi-agent/prediction-check-in.ts');
    expect(derived.importers).toContain('src/agents/voice-agent/transcript-handler.ts');
    for (const f of [...CRISIS_LINE_HELPERS, ...PINNED]) expect(derived.all, f).toContain(f);
  });

  it('a crisis file outside the lane is caught', () => {
    const crisis = loadPolicy().lanes.crisis.paths;
    expect(inPaths('src/agents/personas/crisis-gate.ts', crisis)).toBe(true);
    expect(inPaths('src/config/flags/CRISIS_NEW_FLAG.ts', crisis)).toBe(true);
    expect(inPaths('src/agents/personas/crisis-gate.ts', ['src/services/safety/**'])).toBe(false);
    expect(CRISIS_NAME.test('SELF_HARM_REROUTE.ts')).toBe(true);
    expect(CRISIS_NAME.test('selfharm.ts')).toBe(true);
  });
});

/**
 * Inbound free-text handlers: a route or service file that parses a request body and reads
 * a free-text field from it (a chat message, an SMS Body, a transcript). Every one must read
 * the crisis kernel, which here means it is a crisis module or imports one: the same
 * `derived` set the lane test uses, so there is no second list of crisis readers.
 *
 * An import does not prove ordering. The SMS route (outreach-webhook-routes.ts) imports the
 * kernel and still writes the thread, delivery and consent records before its crisis read.
 * Passing here means "this handler can reach the kernel", not "the kernel runs first", so
 * every row removed from KNOWN_UNGUARDED also needs its own spy-order test: the safety read
 * runs before the first side effect.
 *
 * Discovery is by pattern: a body parse plus one of the common free-text field names, read
 * as a property or destructured from the body (within one statement). A handler that names
 * its text field otherwise is not found; widen the pattern rather than trust the silence.
 */
const FREE_TEXT_FIELD =
  /(?:body|params|payload|data)\??\.(?:Body|message|text|content|transcript|userText|userMessage)\b|\{[^{};]*\b(?:message|text|Body|transcript)\b[^{};]*\}\s*=\s*(?:req\.)?body/;
const PARSES_BODY = /parseBody|req\.body|readBody|request\.body|getBody|JSON\.parse\((?:body|raw)/;
const HANDLER_DIRS = ['src/api', 'src/servers', 'src/services'];

/**
 * The scoreboard: inbound free-text handlers that import no crisis module today. It can
 * only shrink. A handler not listed here must read the kernel, and an entry whose file now
 * reads it, or is no longer a free-text handler, fails as stale. Whether a callee does the
 * read is unconfirmed for every row: triage each, then prove it covered (with a spy-order
 * test), add the read in the crisis lane, or unmount the route if nothing uses it.
 */
const KNOWN_UNGUARDED: Record<string, { since: string; reason: string }> = {
  'src/api/chat-routes.ts': {
    since: '2026-11-06',
    reason: 'web chat: POST /api/chat/message reads body.message',
  },
  'src/api/custom-agent-features.routes.ts': {
    since: '2026-11-06',
    reason: 'custom-agent coaching messages (body.content) and share invite notes (body.message)',
  },
  'src/api/custom-agent/memory-routes.ts': {
    since: '2026-11-06',
    reason: 'custom-agent memories, journal entries among them (body.content)',
  },
  'src/api/custom-agent/voice-routes.ts': {
    since: '2026-11-06',
    reason: 'custom-agent voice preview line (body.text)',
  },
  'src/api/journal-chronicle-entry.ts': {
    since: '2026-11-06',
    reason: 'edits a journal Chronicle entry (body.content)',
  },
  'src/api/journal-routes.ts': {
    since: '2026-11-06',
    reason: 'journal entries (body.content)',
  },
  'src/api/landing-intelligence.routes.ts': {
    since: '2026-11-06',
    reason: 'landing voice demo: visitor transcript and text (body.transcript, body.text)',
  },
  'src/api/life-automation-routes.ts': {
    since: '2026-11-06',
    reason: 'workflow speak_message action text (params.message)',
  },
  'src/api/practice-routes.ts': {
    since: '2026-11-06',
    reason: 'practice chat: POST /api/practice/chat reads body.userMessage',
  },
  'src/api/routes/creative-you-routes.ts': {
    since: '2026-11-06',
    reason: 'creative insights: POST /api/creative/insights (body.content)',
  },
  'src/api/routes/group-coaching.ts': {
    since: '2026-11-06',
    reason: 'group session insights (body.content)',
  },
  'src/api/routes/landing-ai.ts': {
    since: '2026-11-06',
    reason: 'landing AI chat: POST /api/landing/ai/chat reads body.message',
  },
  'src/api/routes/practice-view.ts': {
    since: '2026-11-06',
    reason: 'renders stored reminder text (data.text, data.message); may not be inbound',
  },
  'src/api/v1/developers/voice-routes.ts': {
    since: '2026-11-06',
    reason: 'developer API voice preview text (body.text, 500 chars max)',
  },
  'src/services/communication/slack-chatops.ts': {
    since: '2026-11-06',
    reason: 'Slack slash-command text (body.text), an ops channel',
  },
  'src/services/pubsub/cloud-run-worker.ts': {
    since: '2026-11-06',
    reason: 'Pub/Sub push envelope (req.body.message); may not carry user text',
  },
};

const freeTextHandlers = () =>
  lsFiles(...HANDLER_DIRS)
    .filter((f) => SOURCE.test(f) && !TEST.test(f))
    .filter((f) => {
      const src = text(f);
      return FREE_TEXT_FIELD.test(src) && PARSES_BODY.test(src);
    });
const handlers = freeTextHandlers();
const readsCrisis = new Set([...derived.modules, ...derived.importers]);
const unguarded = Object.keys(KNOWN_UNGUARDED).length;

describe(`every inbound free-text handler reads the crisis kernel (${unguarded} known unguarded)`, () => {
  it('discovery is not vacuous: it finds the SMS route (guarded) and the web chat', () => {
    expect(handlers).toContain('src/api/outreach-webhook-routes.ts');
    expect(readsCrisis.has('src/api/outreach-webhook-routes.ts')).toBe(true);
    expect(handlers).toContain('src/api/chat-routes.ts');
  });

  it('no free-text handler without a crisis import, outside KNOWN_UNGUARDED', () => {
    expect(handlers.filter((f) => !readsCrisis.has(f) && !(f in KNOWN_UNGUARDED))).toEqual([]);
  });

  it('the scoreboard only shrinks: every entry is still a free-text handler and still unguarded', () => {
    const stale = Object.keys(KNOWN_UNGUARDED).filter(
      (f) => !handlers.includes(f) || readsCrisis.has(f)
    );
    expect(stale, 'stale KNOWN_UNGUARDED entries: remove them').toEqual([]);
  });

  it('every scoreboard entry has a date and a reason', () => {
    for (const [file, { since, reason }] of Object.entries(KNOWN_UNGUARDED)) {
      expect(since, file).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(reason.trim().length, file).toBeGreaterThan(10);
    }
  });
});
