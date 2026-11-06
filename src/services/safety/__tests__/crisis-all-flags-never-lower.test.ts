/**
 * A crisis flag may ADD a production crisis read; it may never remove one.
 *
 * Checked here: every flag the six production readers below actually read. That set is measured,
 * not listed: the readers run the corpus behind a process.env that records each name read, at
 * the defaults and with every crisis flag on. A flag a reader starts reading is checked the day
 * it does. Each checked flag is read from two baselines:
 *
 * - alone: the flag on, against every flag at its manifest default (what main runs);
 * - last: the flag on, against every other checked flag already on, so a flag that lowers only
 *   together with another one is caught too.
 *
 * "On" is checked as both 'on' and 'live', since some crisis modules read their own modes. A
 * flag in 'shadow' must change no read at all, and a flag that defaults on (a kill switch) must
 * lower nothing when turned off either.
 *
 * The rest of the crisis lane (every crisis-named flag plus every flag a crisis-lane source file
 * reads, crisis-lane-flags.ts) acts outside these readers. The guard at the bottom makes each of
 * those name a test that drives it (COVERED_ELSEWHERE) or sit on a list that may only shrink
 * (NOT_YET_COVERED).
 *
 * Why this exists: #3317 (CRISIS_WORD_BOUNDARIES, closed) made four #2645 warning lines lose
 * their only crisis read, and, with CRISIS_SIGHT_NEEDS_CUE on, seven stroke / sight-loss lines
 * lose their medical-emergency read. Every pinned crisis test stayed green, because those tests
 * call the whole-word helpers directly and the flag guarded a different path. This test reads
 * the production readers instead. All lines are fictional.
 *
 * A read also counts as lowered when it keeps its level but loses a resource: a crisis resource
 * the safety check or the life-coaching guard offered, a step down in the guard's recommended
 * action, or 988 / 911 gone from everything those readers hand the reply. The sixth reader is
 * the crisis script as the caller hears it (minorCrisisScript over crisis-guard's script): it
 * may gain a line, but never lose one of the script's, nor its 988 or 911.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import { assessSafety } from '../../../tools/domains/life-coaching-shared/safety-guards.js';
import { minorCrisisScript } from '../../../utils/minor-crisis-care.js';
import { detectCrisisSignals } from '../../human-transfer/escalation-classifier.js';
import { riskCorpus } from '../../wellbeing-tracking/__tests__/crisis-corpus.js';
import { checkWarnings } from '../../wellbeing-tracking/early-warning.js';
import { getWellbeingProfile } from '../../wellbeing-tracking/index.js';
import { detectCrisis } from '../crisis-guard.js';
import { performSafetyCheck } from '../index.js';
import {
  CRISIS_FLAGS,
  flagReadsIn,
  LANE_READS,
  ROOT,
  RUNNER_MARKERS,
} from './crisis-lane-flags.js';

type FlagValues = Readonly<Record<string, string>>;

/**
 * Flags known to lower a read today. Each must stay off by default, and the test below fails
 * once the flag stops lowering, so the entry is removed and the flag is checked like the rest.
 */
const KNOWN_LOWERS: Readonly<Record<string, string>> = {
  // Whole-word matching drops the early-warning crisis read on run-together and stretched
  // speech-to-text forms ("iwant to die", "tokill myself", "dieee") and the #2645 lines.
  EARLY_WARNING_WORD_BOUNDARY: 'warning crisis_risk',
};

/** #2645: a risk line whose only match sits inside an everyday word ("skill", "send", "spend"). */
const INSIDE_A_WORD = [
  "i'll skill myself",
  "lend it all out, i won't be here",
  "i'll send it all to my sister before i go",
  "i'm going to spend it all tonight, i won't need it after",
];

/** Stroke and sight-loss lines where a filler word ("somewhat") sits in a pattern's word slot. */
const SIGHT_WORD_SLOT = [
  'I can barely see and my arm feels somewhat weak',
  'I can hardly see, my face looks somewhat weird',
  "I couldn't see, my leg is somewhat heavy",
  'my right eye somewhat went gray',
  'my left eye somewhat turned black',
  'my eyes somewhat went dark',
  'I can barely see, my mouth feels somewhat funny',
];

/** Risk lines from a caller who sounds under 18, so the youth path of a crisis script is read. */
const SOUNDS_UNDER_18 = [
  "I'm 15 and I want to kill myself",
  "I'm 14 and in 9th grade and I took a bunch of pills just now",
  "I'm 16 and I keep thinking everyone would be better off without me",
];

const LINES = [
  ...new Set([...riskCorpus(), ...INSIDE_A_WORD, ...SIGHT_WORD_SLOT, ...SOUNDS_UNDER_18]),
];

const ASSESS = ['safe', 'concerning', 'urgent', 'crisis'];
const ESCALATION = [
  'none',
  'gentle_suggestion',
  'warm_recommendation',
  'urgent_referral',
  'emergency',
];

const ACTION = ['continue', 'check_in', 'resources', 'immediate_referral'];

let profiles = 0;

/** Sorted resource names, so a loss is named in the failure. */
const names = (resources: readonly { name: string }[] | undefined): string[] =>
  (resources ?? []).map((r) => r.name).sort();

/** Whether a number appears anywhere in what the readers hand the reply. */
const mentions = (text: string, number: string): boolean =>
  new RegExp(`(?<![0-9])${number}(?![0-9])`).test(text);

/** What each production reader makes of one line. */
function read(line: string) {
  const gate = detectCrisis(line);
  const transfer = detectCrisisSignals(line);
  const safety = performSafetyCheck(line, { userId: 'u-flag-gate', personaId: 'ferni' });
  const warnings = checkWarnings(getWellbeingProfile(`flag-gate-${++profiles}`), {
    recentMessages: [line],
  }).map((w) => w.type);
  const assess = assessSafety(line);
  // The crisis script the caller hears when the gate replaces the reply (crisis-gate.ts), as
  // spoken: a caller who sounds under 18 also gets a youth line (MINOR_CRISIS_CARE). A fresh
  // session per read, so one line's age never carries to another.
  const script = gate.suggestedResponse ?? '';
  const spoken = script ? minorCrisisScript(script, `flag-gate-call-${++profiles}`, line, []) : '';
  const handed = JSON.stringify([
    assess.resources ?? [],
    safety.response ?? null,
    safety.contextInjection ?? null,
  ]);
  return {
    gateCrisis: gate.isCrisis,
    gateSeverity: gate.severity,
    transferSeverity: transfer.severity,
    transferSignals: Object.entries(transfer)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
      .sort(),
    safetyDetected: safety.crisisDetected,
    safetyEscalation: ESCALATION.indexOf(safety.escalation.level),
    safetyInterrupt: safety.shouldInterrupt,
    warnings: [...warnings].sort(),
    assessLevel: ASSESS.indexOf(assess.level),
    assessAction: ACTION.indexOf(assess.recommendedAction),
    assessResources: names(assess.resources),
    safetyResources: names([
      ...(safety.response?.primaryResource ? [safety.response.primaryResource] : []),
      ...(safety.response?.additionalResources ?? []),
    ]),
    offers988: mentions(handed, '988'),
    offers911: mentions(handed, '911'),
    scriptWhole: spoken.includes(script),
    spokenAdded: spoken.length > script.length,
    script988: mentions(spoken, '988'),
    script911: mentions(spoken, '911'),
  };
}
type Reading = ReturnType<typeof read>;

/** Every way `on` reads lower than `off`; empty when it never does. */
function lower(off: Reading, on: Reading): string[] {
  const out: string[] = [];
  if (off.gateCrisis && !on.gateCrisis) out.push('crisis-guard isCrisis');
  if (on.gateSeverity < off.gateSeverity) out.push('crisis-guard severity');
  if (on.transferSeverity < off.transferSeverity) out.push('transfer severity');
  for (const s of off.transferSignals)
    if (!on.transferSignals.includes(s)) out.push(`transfer ${s}`);
  if (off.safetyDetected && !on.safetyDetected) out.push('safety check detected');
  if (on.safetyEscalation < off.safetyEscalation) out.push('safety check escalation');
  if (off.safetyInterrupt && !on.safetyInterrupt) out.push('safety check interrupt');
  for (const w of off.warnings) if (!on.warnings.includes(w)) out.push(`warning ${w}`);
  if (on.assessLevel < off.assessLevel) out.push('life-coaching level');
  if (on.assessAction < off.assessAction) out.push('life-coaching action');
  for (const r of off.assessResources)
    if (!on.assessResources.includes(r)) out.push(`life-coaching resource ${r}`);
  for (const r of off.safetyResources)
    if (!on.safetyResources.includes(r)) out.push(`safety check resource ${r}`);
  if (off.offers988 && !on.offers988) out.push('988');
  if (off.offers911 && !on.offers911) out.push('911');
  if (off.scriptWhole && !on.scriptWhole) out.push('spoken crisis script cut');
  if (off.script988 && !on.script988) out.push('spoken script 988');
  if (off.script911 && !on.script911) out.push('spoken script 911');
  return out;
}

/** Every reading of every line with these flags set and every other crisis flag unset. */
const readings = new Map<string, Map<string, Reading>>();
function readUnder(flags: FlagValues): Map<string, Reading> {
  const key = JSON.stringify(Object.entries(flags).sort());
  let found = readings.get(key);
  if (!found) {
    for (const name of STUBBED) vi.stubEnv(name, flags[name]);
    found = new Map(LINES.map((line) => [line, read(line)]));
    vi.unstubAllEnvs();
    readings.set(key, found);
  }
  return found;
}

/**
 * Every manifest flag the six readers read on the corpus, at the defaults and with every crisis
 * flag on, recorded by a process.env that notes each name looked up.
 */
function flagsTheReadersRead(): string[] {
  const seen = new Set<string>();
  const note = (key: string | symbol): void => {
    if (typeof key === 'string') seen.add(key);
  };
  const pass = (flags: FlagValues): void => {
    for (const name of CRISIS_FLAGS) vi.stubEnv(name, flags[name]);
    const real = process.env;
    process.env = new Proxy(real, {
      get: (target, key) => (note(key), Reflect.get(target, key)),
      has: (target, key) => (note(key), Reflect.has(target, key)),
    });
    try {
      for (const line of LINES) read(line);
    } finally {
      process.env = real;
      vi.unstubAllEnvs();
    }
  };
  pass({});
  pass(Object.fromEntries(CRISIS_FLAGS.map((name) => [name, 'on'])));
  return [...seen].filter((name) => name in FLAG_MANIFEST && !(name in RUNNER_MARKERS)).sort();
}

const defaultOf = (name: string): string =>
  FLAG_MANIFEST[name as keyof typeof FLAG_MANIFEST].default;

/** The flags the six readers read, measured, so the set can't drift from what they do. */
const READ_BY_READERS = flagsTheReadersRead();
const CHECKED = READ_BY_READERS.filter((name) => !(name in KNOWN_LOWERS));
/** Unset (manifest default) unless a case sets it. */
const STUBBED = [...new Set([...CRISIS_FLAGS, ...READ_BY_READERS])];
const ON_VALUES = ['on', 'live'] as const;
const CASES = CHECKED.flatMap((name) => ON_VALUES.map((value) => [name, value] as const));
/** Checked flags that don't default off: turned off, they must lower nothing either. */
const DEFAULT_ON = CHECKED.filter((name) => defaultOf(name) !== 'off').map(
  (name) => [name, defaultOf(name)] as const
);

/** Every line some reader reads lower with `flags` than with `base`, with what it lost. */
function losses(base: FlagValues, flags: FlagValues): string[] {
  const off = readUnder(base);
  const on = readUnder(flags);
  return LINES.flatMap((line) => {
    const lost = lower(off.get(line)!, on.get(line)!);
    return lost.length ? [`${line} :: ${lost.join(', ')}`] : [];
  });
}

/** Every checked flag but `name`, at `value`. */
const allBut = (name: string, value: string): FlagValues =>
  Object.fromEntries(CHECKED.filter((other) => other !== name).map((other) => [other, value]));

afterEach(() => vi.unstubAllEnvs());

describe('crisis flags never lower a production crisis read', () => {
  it('covers the crisis lane flags and a real corpus', () => {
    // Named here so a change that stops the readers reading one fails loudly.
    for (const name of [
      'CRISIS_SIGHT_NEEDS_CUE',
      'SAFETY_WHOLE_WORD_SITES',
      'EARLY_WARNING_STT_FORMS',
    ]) {
      expect(CHECKED).toContain(name);
    }
    expect(LINES.length).toBeGreaterThan(500);
    // The resource checks bite only if main hands the reply 988 and named resources.
    const defaults = [...readUnder({}).values()];
    expect(defaults.filter((r) => r.offers988).length).toBeGreaterThan(100);
    // No reader hands the reply 911 on main today, so the 911 check cannot fail yet (#3341).
    // When #3341 lands this goes red: change it to toBeGreaterThan(0).
    expect(defaults.filter((r) => r.offers911).length).toBe(0);
    expect(defaults.filter((r) => r.assessResources.length > 0).length).toBeGreaterThan(100);
    expect(defaults.filter((r) => r.safetyResources.length > 0).length).toBeGreaterThan(100);
  });

  it('reads the pinned lines as risk where main does', () => {
    const defaults = readUnder({});
    for (const line of INSIDE_A_WORD)
      expect(defaults.get(line)!.warnings, line).toContain('crisis_risk');
    const sight = readUnder({ CRISIS_SIGHT_NEEDS_CUE: 'on' });
    for (const line of SIGHT_WORD_SLOT) expect(sight.get(line)!.transferSeverity, line).toBe(10);
  });

  it('reads the spoken script with its youth line for a caller who sounds under 18', () => {
    const defaults = readUnder({});
    const youth = readUnder({ MINOR_CARE: 'on', MINOR_CRISIS_CARE: 'on' });
    for (const line of SOUNDS_UNDER_18) {
      expect(defaults.get(line)?.spokenAdded, line).toBe(false);
      expect(youth.get(line)).toMatchObject({
        spokenAdded: true,
        scriptWhole: true,
        script988: true,
      });
    }
  });

  it.each(CASES)('%s=%s alone lowers no read', (name, value) => {
    expect(losses({}, { [name]: value })).toEqual([]);
  });

  it.each(CASES)('%s=%s on top of every other checked flag lowers no read', (name, value) => {
    const base = allBut(name, value);
    expect(losses(base, { ...base, [name]: value })).toEqual([]);
  });

  it.each(DEFAULT_ON)('%s=off (default %s) lowers no read', (name) => {
    expect(losses({}, { [name]: 'off' })).toEqual([]);
  });

  it.each(CHECKED.filter((name) => defaultOf(name) === 'off'))(
    '%s=shadow changes no read',
    (name) => {
      expect(readUnder({ [name]: 'shadow' })).toEqual(readUnder({}));
    }
  );

  it.each(Object.entries(KNOWN_LOWERS))(
    '%s is off by default and still lowers %s',
    (name, what) => {
      expect(defaultOf(name)).toBe('off');
      const lost = losses({}, { [name]: 'on' });
      // Fixed? Delete the KNOWN_LOWERS entry so the flag is checked like every other.
      expect(lost.length).toBeGreaterThan(0);
      // ...and only that: a loss in any other reader fails here.
      for (const entry of lost) expect(entry.endsWith(` :: ${what}`), entry).toBe(true);
    }
  );
});

/**
 * Crisis-lane flags the six readers don't read, each with an existing test that drives it.
 * Picked as the unit test that sets the flag, named after the module that reads it where one is.
 */
const COVERED_ELSEWHERE: Readonly<Record<string, string>> = {
  ABUSE_DISCLOSURE_PATTERNS:
    'src/agents/voice-agent/__tests__/turn-handler-abuse-disclosure.test.ts',
  ACTION_CLAIM_BARE_WILL: 'src/agents/personas/__tests__/action-claim-bare-will.test.ts',
  ACTION_CLAIM_GUARD: 'src/agents/personas/__tests__/action-claim-guard-spacing.test.ts',
  ACTION_CLAIM_PAST: 'src/agents/personas/__tests__/action-claim-past.test.ts',
  ACTION_CLAIM_STREAM: 'src/agents/personas/__tests__/action-claim-guard-spacing.test.ts',
  AI_NOTICE_SPOKEN: 'src/agents/multi-agent/__tests__/ai-notice-opening.test.ts',
  ALREADY_SAID_LEDGER: 'src/agents/personas/__tests__/already-said.test.ts',
  BOOKING_PREFS: 'src/services/stores/__tests__/booking-prefs-store.test.ts',
  CALLER_CARD: 'src/agents/multi-agent/__tests__/caller-card-setup.test.ts',
  CALLER_RECOGNITION: 'src/agents/voice-agent-entry/__tests__/caller-recognition.test.ts',
  CALL_CAPTURE_CONSENT: 'src/api/__tests__/call-capture-consent-routes.test.ts',
  // Dropped, never said later, on a call with crisis risk: 'crisis risk on the owner call'.
  CALL_LIVE_RELAY: 'src/services/outreach/__tests__/call-progress-relay.test.ts',
  CALL_NEWS_OPENER: 'src/agents/multi-agent/__tests__/greeting-call-news.test.ts',
  CALL_REPORT_REACHES_YOU: 'src/agents/multi-agent/__tests__/call-report-after-crisis.test.ts',
  CALL_RESULT_LIVE_REPORT: 'src/services/outreach/__tests__/call-result-cross-process.test.ts',
  CALL_STATUS_RECALL: 'src/tools/domains/telephony/__tests__/call-status-replay.test.ts',
  CALL_WRAP_UP: 'src/agents/shared/__tests__/call-farewell.test.ts',
  CLIENT_SIGNALS_V2: 'src/tools/domains/memory/__tests__/memory-saved.test.ts',
  COACH_WINS: 'src/services/superhuman/__tests__/wins.test.ts',
  CONTACT_SAVE_ON_YES: 'src/tools/domains/telephony/__tests__/owner-contact.test.ts',
  CRISIS_ADJUDICATOR: 'src/services/safety/__tests__/crisis-adjudicator-shadow.test.ts',
  CRISIS_AGREEMENT_GATE:
    'src/agents/processors/turn-processor/__tests__/crisis-agreement-replay.test.ts',
  CRISIS_CLASSIFIER_BLOCKED_SIGNAL:
    'src/services/safety/__tests__/crisis-classifier-blocked.test.ts',
  CRISIS_CLASSIFIER_EVERYDAY_RULES:
    'src/agents/personas/__tests__/crisis-classifier-only-shadow.test.ts',
  CRISIS_CLASSIFIER_ONLY_CHECKIN:
    'src/agents/personas/__tests__/crisis-classifier-only-shadow.test.ts',
  CRISIS_CLASSIFIER_SECOND_READ: 'src/services/safety/__tests__/crisis-classifier-v3.test.ts',
  CRISIS_CONFIRMED_CALL_RISK: 'src/agents/personas/__tests__/crisis-gate-confirmed-risk.test.ts',
  CRISIS_EVENT_RECORD: 'src/agents/safety/__tests__/crisis-event-record.test.ts',
  CRISIS_GROUNDED_RELEASE:
    'src/services/safety/__tests__/crisis-grounded-release-failclosed.test.ts',
  CRISIS_IMMINENT_NEEDS_AGREEMENT:
    'src/services/safety/__tests__/crisis-imminent-agreement.test.ts',
  // Changes only when the reply gate's classifier reads a held line, never what a reader decides,
  // so the six readers here can't see it. Its test drives the real gatedReply flag off and on,
  // under a classifier with and without a fragment false alarm, and checks it never lowers.
  CRISIS_READ_JOINED_TURN: 'src/agents/personas/__tests__/crisis-read-joined-turn.test.ts',
  CRISIS_SAME_CALL_NOTE_FADES: 'src/agents/multi-agent/__tests__/call-report-after-crisis.test.ts',
  CRISIS_TRANSFER_EVERYDAY: 'src/services/safety/__tests__/crisis-transfer-request.test.ts',
  DATES_IN_HELLO: 'src/agents/multi-agent/__tests__/greeting-date-arbiter.test.ts',
  EOT_CONTINUED_MERGE: 'src/agents/personas/__tests__/late-words.test.ts',
  // Read by deep-extraction-worker.ts: adds one subject rule to the fact prompt, nothing dropped.
  FACT_SUBJECT_GUARD: 'src/memory/dynamic/__tests__/fact-subject-deep.test.ts',
  FAMILY_TABLE: 'src/agents/multi-agent/__tests__/family-table-handoff.test.ts',
  FERNI_SELF_MEMORY: 'src/agents/personas/__tests__/self-memory.test.ts',
  FERNI_STATE: 'src/agents/personas/__tests__/ferni-state.test.ts',
  FIRST_TURN_DEFER_BACKGROUND: 'src/agents/multi-agent/__tests__/first-turn-defer.test.ts',
  // A forget re-check takes recall's own notes out, never a crisis note naming the topic.
  FORGET_EVERY_READER: 'src/memory/recall/__tests__/forget-every-reader.test.ts',
  FRIEND_REPAIR: 'src/agents/personas/__tests__/friend-repair.test.ts',
  GOODBYE_ENDS_CALL: 'src/agents/shared/__tests__/call-wrap-up-quiet.test.ts',
  GROUNDED_CLAIMS: 'src/agents/personas/__tests__/grounded-claims-verify.test.ts',
  HANDOFF_ASK_FIRST: 'src/tools/handoff/__tests__/handoff-consent.test.ts',
  HANDOFF_FAILED_SAY_SO: 'src/agents/multi-agent/__tests__/llm-handoff.test.ts',
  HANDOFF_HELD_TRUTHFUL: 'src/tools/handoff/__tests__/handoff-held-truthful.test.ts',
  HELD_GOODBYE_CHECK_IN: 'src/agents/shared/__tests__/call-wrap-up-held-goodbye.test.ts',
  LAUGH_CAP: 'src/agents/personas/__tests__/laugh-ledger.test.ts',
  LISTEN_OFFER_STRIP: 'src/agents/personas/__tests__/listen-offer.test.ts',
  MINOR_ABUSE_DISCLOSURE: 'src/services/safety/__tests__/minor-abuse-disclosure.test.ts',
  MINOR_CARE_SHARED_HOLD:
    'src/services/outreach/__tests__/minor-care-shared-hold-call-paths.test.ts',
  // A guided crisis reply loses only the caller's name: every other word, 988 and 911 stay.
  NAME_FALLING_SPLIT: 'src/agents/personas/__tests__/name-gate-crisis-reply.test.ts',
  NAME_GATE_V2: 'src/agents/personas/__tests__/name-gate-crisis-reply.test.ts',
  OPENER_GATE: 'src/agents/personas/__tests__/crisis-gate.test.ts',
  OPEN_PROMISE_TRIGGERS:
    'src/services/outreach/proactive-channels/__tests__/open-promise-triggers-path.test.ts',
  OUTREACH_PONDERED_NOTES:
    'src/services/outreach/proactive-channels/__tests__/grounded-path.test.ts',
  PERSONA_GROWTH: 'src/agents/multi-agent/__tests__/persona-growth-recall.test.ts',
  PHONE_GOODBYE: 'src/agents/shared/__tests__/phone-goodbye.test.ts',
  PHRASE_LOOP_GUARD: 'src/agents/personas/__tests__/phrase-loops.test.ts',
  // A crisis or safety note is pushed at once, never held behind a preemptive reply.
  PREEMPT_STABLE_CONTEXT: 'src/agents/multi-agent/__tests__/preempt-stable-context.sdk.test.ts',
  QUESTION_PACE: 'src/agents/personas/__tests__/question-pace-wiring.test.ts',
  QUIET_AFTER_QUESTION: 'src/agents/voice-agent/__tests__/quiet-presence.test.ts',
  REJECTED_TRANSCRIPT_KEEPS_SPEECH:
    'src/agents/voice-agent/__tests__/rejected-transcript-policy.test.ts',
  REPAIR_MODE: 'src/agents/personas/__tests__/repair-check.test.ts',
  REQUIRE_FIX_VOICE: 'src/agents/voice-agent/__tests__/echo-window-esm.test.ts',
  SEXUAL_TOPIC_BOUNDARY: 'src/agents/personas/__tests__/sexual-boundary-call-end.test.ts',
  SMS_CRISIS_SCREEN: 'src/services/outreach/__tests__/sms-crisis-screen.test.ts',
  SPEAK_988_DIGITS: 'src/services/safety/__tests__/crisis-line-speech.test.ts',
  TEAMMATE_TALK_FILTER: 'src/utils/__tests__/teammate-talk.test.ts',
  THIRD_PARTY_SELF_HARM: 'src/services/safety/__tests__/crisis-who.test.ts',
  TOLD_THIS_CALL: 'src/agents/personas/__tests__/told-this-call.test.ts',
  // No ack clip on a call with crisis risk noted or a crisis decision.
  TOOL_ACK_CLIP: 'src/agents/integrations/__tests__/tool-ack-clip.test.ts',
  // No look-up line or "On it." on a grave call: crisis risk noted or hard news.
  TOOL_ACK_WIDE: 'src/agents/personas/__tests__/tool-ack-coverage.test.ts',
  TOOL_HUM: 'src/agents/integrations/__tests__/tool-hum-crisis-pending.test.ts',
  TRANSFER_NAME_ALIASES: 'src/tools/handoff/__tests__/transfer-aliases.test.ts',
  TURN_INTELLIGENCE: 'src/agents/multi-agent/__tests__/turn-intelligence.test.ts',
  USE_SMART_CONTEXT_ROUTING: 'src/utils/__tests__/minor-care-cleanup.test.ts',
  WEEKLY_PREDICTION: 'src/agents/multi-agent/__tests__/prediction-check-in.test.ts',
  WELLBEING_AFTER_CALL: 'src/services/wellbeing-tracking/__tests__/after-call.test.ts',
};

/**
 * Crisis-lane flags with no test that names them yet. A ratchet: it may only shrink. A new
 * crisis-lane flag gets a real test and a COVERED_ELSEWHERE entry, never a name here.
 */
const NOT_YET_COVERED: readonly string[] = [
  'DEBUG_GEMINI_ALL',
  'DEBUG_GEMINI_MESSAGES',
  'DEBUG_GEMINI_TRANSCRIPTS',
  'DEBUG_INJECTIONS',
  'DEBUG_ROUTING',
  'DEBUG_TTS_PIPELINE',
  'DEBUG_TURN_TIMING',
  'DEBUG_VOICE_AGENT',
  'DEV_TELEMETRY',
  'DISABLE_INTERRUPT_TRANSFORM',
  'DISABLE_LINGUISTIC_MIRRORING',
  'DISABLE_NOISE_FILTER',
  'LIFE_LEDGER',
  'LOG_CONTEXT_BUILDS',
  'USE_TOOL_GATEWAY',
];
/** NOT_YET_COVERED as of 2026-11-02. Never add to it; delete a name once its flag has a test. */
const NOT_YET_COVERED_CEILING: readonly string[] = [
  'DEBUG_GEMINI_ALL',
  'DEBUG_GEMINI_MESSAGES',
  'DEBUG_GEMINI_TRANSCRIPTS',
  'DEBUG_INJECTIONS',
  'DEBUG_ROUTING',
  'DEBUG_TTS_PIPELINE',
  'DEBUG_TURN_TIMING',
  'DEBUG_VOICE_AGENT',
  'DEV_TELEMETRY',
  'DISABLE_INTERRUPT_TRANSFORM',
  'DISABLE_LINGUISTIC_MIRRORING',
  'DISABLE_NOISE_FILTER',
  'LIFE_LEDGER',
  'LOG_CONTEXT_BUILDS',
  'USE_TOOL_GATEWAY',
];

/** Crisis flags no crisis name marks, so only the lane read finds them. */
const READ_NOT_NAMED = [
  'MINOR_ABUSE_DISCLOSURE', // a caller under 18 telling of sexual harm (turn path)
  'ABUSE_DISCLOSURE_PATTERNS', // someone hurting the caller (turn path)
  'THIRD_PARTY_SELF_HARM', // who is at risk on a third-party crisis read
  'SEXUAL_TOPIC_BOUNDARY', // the sexual-content hold for a caller under 18
  'SPEAK_988_DIGITS', // 988 spoken as digits
  'AI_NOTICE_SPOKEN', // the spoken AI notice
];

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

describe('every flag a crisis module reads is checked or covered elsewhere', () => {
  it('finds crisis flags by what crisis modules read, not by name', () => {
    for (const name of READ_NOT_NAMED) {
      expect(LANE_READS.has(name), `${name} is read by no crisis-lane file`).toBe(true);
      expect(CRISIS_FLAGS, name).toContain(name);
    }
  });

  it('counts a read, never a mention in a comment', () => {
    const source = [
      "// `SPEAK_988_DIGITS` and 'AI_NOTICE_SPOKEN' are only mentioned here",
      "/* THIRD_PARTY_SELF_HARM: 'MINOR_ABUSE_DISCLOSURE' */",
      "const site = 'https://example.test/'; // `SEXUAL_TOPIC_BOUNDARY`",
      "if (flagOn('CRISIS_SIGHT_NEEDS_CUE', env)) mark();",
      'const who = env?.CRISIS_MEANS_IN_HAND ?? process.env.EARLY_WARNING_STT_FORMS;',
    ].join('\n');
    expect([...flagReadsIn(source)].sort()).toEqual([
      'CRISIS_MEANS_IN_HAND',
      'CRISIS_SIGHT_NEEDS_CUE',
      'EARLY_WARNING_STT_FORMS',
    ]);
  });

  it('accounts for each lane flag exactly once', () => {
    const unaccounted: string[] = [];
    for (const name of new Set([...CRISIS_FLAGS, ...LANE_READS.keys(), ...READ_BY_READERS])) {
      const homes = [
        CHECKED.includes(name) && 'checked',
        name in KNOWN_LOWERS && 'KNOWN_LOWERS',
        name in COVERED_ELSEWHERE && 'COVERED_ELSEWHERE',
        NOT_YET_COVERED.includes(name) && 'NOT_YET_COVERED',
        name in RUNNER_MARKERS && 'RUNNER_MARKERS',
      ].filter(Boolean);
      if (homes.length !== 1) unaccounted.push(`${name}: ${homes.join(', ') || 'nowhere'}`);
    }
    // A flag the readers start reading is checked: delete its other entry.
    expect(unaccounted).toEqual([]);
  });

  it('points each COVERED_ELSEWHERE flag at an existing test that names it', () => {
    for (const [name, test] of Object.entries(COVERED_ELSEWHERE)) {
      expect(CRISIS_FLAGS, `${name} is no longer a crisis-lane flag`).toContain(name);
      expect(test, `${name}: ${test} is not a test file`).toMatch(TEST_FILE);
      expect(existsSync(join(ROOT, test)), `${name}: ${test} does not exist`).toBe(true);
      const text = readFileSync(join(ROOT, test), 'utf8');
      expect(text.includes(name), `${test} never names ${name}`).toBe(true);
    }
  });

  it('only shrinks NOT_YET_COVERED', () => {
    for (const name of NOT_YET_COVERED) {
      expect(NOT_YET_COVERED_CEILING, `${name} was added to NOT_YET_COVERED`).toContain(name);
      expect(CRISIS_FLAGS, `${name} is no longer a crisis-lane flag`).toContain(name);
    }
  });

  it('skips only runner markers a crisis module still reads', () => {
    for (const name of Object.keys(RUNNER_MARKERS)) {
      expect(name in FLAG_MANIFEST, name).toBe(true);
      expect(LANE_READS.has(name), `${name}: stale RUNNER_MARKERS entry`).toBe(true);
    }
  });
});
