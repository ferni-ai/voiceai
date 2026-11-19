/**
 * Crisis-lane flags no never-lower check drives yet. A ratchet: it may only shrink. A flag
 * leaves when the six readers read it (crisis-all-flags-never-lower.test.ts) or a call shows it
 * at the reply (SHOWN_ON, agents/personas/__tests__/crisis-reply.never-lower.ts), or, for a
 * flag that by design never changes a reply, a MEMORY_ONLY row (below). A new crisis-lane flag
 * gets one of those, never a name here.
 *
 * 2026-11-13: the rows of the old COVERED_ELSEWHERE table moved here. That table named a test
 * file per flag and checked only that the file contained the flag's name.
 */
export const NOT_YET_COVERED: readonly string[] = [
  'ABUSE_DISCLOSURE_PATTERNS',
  'ACTION_CLAIM_BARE_WILL',
  'ACTION_CLAIM_GUARD',
  'ACTION_CLAIM_PAST',
  'ACTION_CLAIM_STREAM',
  'AI_NOTICE_SPOKEN',
  'BOOKING_PREFS',
  'CALLER_CARD',
  'CALLER_RECOGNITION',
  'CALL_CAPTURE_CONSENT',
  'CALL_LIVE_RELAY',
  'CALL_NEWS_OPENER',
  'CALL_REPORT_REACHES_YOU',
  'CALL_RESULT_LIVE_REPORT',
  'CALL_STATUS_RECALL',
  'CALL_WRAP_UP',
  'CLIENT_SIGNALS_V2',
  'COACH_WINS',
  'CONTACT_SAVE_ON_YES',
  'CRISIS_ADJUDICATOR',
  'CRISIS_AGREEMENT_GATE',
  'CRISIS_CLASSIFIER_BLOCKED_SIGNAL',
  'CRISIS_CLASSIFIER_EVERYDAY_RULES',
  'CRISIS_CLASSIFIER_ONLY_CHECKIN',
  'CRISIS_CLASSIFIER_SECOND_READ',
  'CRISIS_CONFIRMED_CALL_RISK',
  'CRISIS_EVENT_RECORD',
  'CRISIS_GRADED_RESPONSE',
  'CRISIS_GROUNDED_RELEASE',
  'CRISIS_IMMINENT_NEEDS_AGREEMENT',
  'CRISIS_SAME_CALL_NOTE_FADES',
  'CRISIS_TRANSFER_EVERYDAY',
  'CRISIS_WORDS_NEVER_RESURFACE',
  'CUSTOM_AGENT_CHAT_HONESTY',
  'DATES_IN_HELLO',
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
  'EOT_CONTINUED_MERGE',
  'FACT_SUBJECT_GUARD',
  'FAMILY_TABLE',
  'FERNI_SELF_MEMORY',
  'FIRST_TURN_DEFER_BACKGROUND',
  'FORGET_EVERY_READER',
  'FRIEND_REPAIR',
  'GOODBYE_ENDS_CALL',
  'GROUNDED_CLAIMS',
  'HANDOFF_ARRIVAL_ONCE',
  'HANDOFF_ASK_FIRST',
  'HANDOFF_FAILED_SAY_SO',
  'HANDOFF_HELD_TRUTHFUL',
  'HELD_GOODBYE_CHECK_IN',
  'LAUGH_CAP',
  'LIFE_LEDGER',
  'LISTEN_OFFER_STRIP',
  'LOG_CONTEXT_BUILDS',
  'MINOR_ABUSE_DISCLOSURE',
  'MINOR_CARE_SHARED_HOLD',
  'NAME_FALLING_SPLIT',
  'NAME_GATE_V2',
  'OPENER_GATE',
  'OPEN_PROMISE_TRIGGERS',
  'OUTREACH_NO_ANSWERS_READBACK',
  'OUTREACH_PONDERED_NOTES',
  'PERSONA_GROWTH',
  'PHONE_GOODBYE',
  'PHRASE_LOOP_GUARD',
  'PREEMPT_STABLE_CONTEXT',
  'PROACTIVE_BUDGET',
  'QUESTION_PACE',
  'QUIET_AFTER_QUESTION',
  'REJECTED_TRANSCRIPT_KEEPS_SPEECH',
  'REPAIR_MODE',
  'REQUIRE_FIX_VOICE',
  'SMART_HOME_LIFX',
  'SMS_CRISIS_SCREEN',
  'SPEAK_988_DIGITS',
  'TEAMMATE_TALK_FILTER',
  'TOLD_THIS_CALL',
  'TOOL_ACK_CLIP',
  'TOOL_ACK_WIDE',
  'TOOL_HUM',
  'TRANSFER_NAME_ALIASES',
  'TURN_INTELLIGENCE',
  'USE_SMART_CONTEXT_ROUTING',
  'USE_TOOL_GATEWAY',
  'WEEKLY_PREDICTION',
  'WELLBEING_AFTER_CALL',
];
/** NOT_YET_COVERED as of 2026-11-13. Never add to it; delete a name once its flag is checked. */
export const NOT_YET_COVERED_CEILING: readonly string[] = [
  'ABUSE_DISCLOSURE_PATTERNS',
  'ACTION_CLAIM_BARE_WILL',
  'ACTION_CLAIM_GUARD',
  'ACTION_CLAIM_PAST',
  'ACTION_CLAIM_STREAM',
  'AI_NOTICE_SPOKEN',
  'BOOKING_PREFS',
  'CALLER_CARD',
  'CALLER_RECOGNITION',
  'CALL_CAPTURE_CONSENT',
  'CALL_LIVE_RELAY',
  'CALL_NEWS_OPENER',
  'CALL_REPORT_REACHES_YOU',
  'CALL_RESULT_LIVE_REPORT',
  'CALL_STATUS_RECALL',
  'CALL_WRAP_UP',
  'CLIENT_SIGNALS_V2',
  'COACH_WINS',
  'CONTACT_SAVE_ON_YES',
  'CRISIS_ADJUDICATOR',
  'CRISIS_AGREEMENT_GATE',
  'CRISIS_CLASSIFIER_BLOCKED_SIGNAL',
  'CRISIS_CLASSIFIER_EVERYDAY_RULES',
  'CRISIS_CLASSIFIER_ONLY_CHECKIN',
  'CRISIS_CLASSIFIER_SECOND_READ',
  'CRISIS_CONFIRMED_CALL_RISK',
  'CRISIS_EVENT_RECORD',
  'CRISIS_GRADED_RESPONSE',
  'CRISIS_GROUNDED_RELEASE',
  'CRISIS_IMMINENT_NEEDS_AGREEMENT',
  'CRISIS_SAME_CALL_NOTE_FADES',
  'CRISIS_TRANSFER_EVERYDAY',
  'CRISIS_WORDS_NEVER_RESURFACE',
  'CUSTOM_AGENT_CHAT_HONESTY',
  'DATES_IN_HELLO',
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
  'EOT_CONTINUED_MERGE',
  'FACT_SUBJECT_GUARD',
  'FAMILY_TABLE',
  'FERNI_SELF_MEMORY',
  'FIRST_TURN_DEFER_BACKGROUND',
  'FORGET_EVERY_READER',
  'FRIEND_REPAIR',
  'GOODBYE_ENDS_CALL',
  'GROUNDED_CLAIMS',
  'HANDOFF_ARRIVAL_ONCE',
  'HANDOFF_ASK_FIRST',
  'HANDOFF_FAILED_SAY_SO',
  'HANDOFF_HELD_TRUTHFUL',
  'HELD_GOODBYE_CHECK_IN',
  'LAUGH_CAP',
  'LIFE_LEDGER',
  'LISTEN_OFFER_STRIP',
  'LOG_CONTEXT_BUILDS',
  'MINOR_ABUSE_DISCLOSURE',
  'MINOR_CARE_SHARED_HOLD',
  'NAME_FALLING_SPLIT',
  'NAME_GATE_V2',
  'OPENER_GATE',
  'OPEN_PROMISE_TRIGGERS',
  'OUTREACH_NO_ANSWERS_READBACK',
  'OUTREACH_PONDERED_NOTES',
  'PERSONA_GROWTH',
  'PHONE_GOODBYE',
  'PHRASE_LOOP_GUARD',
  'PREEMPT_STABLE_CONTEXT',
  'PROACTIVE_BUDGET',
  'QUESTION_PACE',
  'QUIET_AFTER_QUESTION',
  'REJECTED_TRANSCRIPT_KEEPS_SPEECH',
  'REPAIR_MODE',
  'REQUIRE_FIX_VOICE',
  'SMART_HOME_LIFX',
  'SMS_CRISIS_SCREEN',
  'SPEAK_988_DIGITS',
  'TEAMMATE_TALK_FILTER',
  'TOLD_THIS_CALL',
  'TOOL_ACK_CLIP',
  'TOOL_ACK_WIDE',
  'TOOL_HUM',
  'TRANSFER_NAME_ALIASES',
  'TURN_INTELLIGENCE',
  'USE_SMART_CONTEXT_ROUTING',
  'USE_TOOL_GATEWAY',
  'WEEKLY_PREDICTION',
  'WELLBEING_AFTER_CALL',
];

/** A test that drives a memory-only flag on a crisis turn: its file, and each of its titles. */
export interface MemoryOnlyRow {
  /** Path from the repo root. */
  readonly file: string;
  /** Titles of it() or test() calls in that file, exactly as written. */
  readonly rows: readonly string[];
}

/**
 * Crisis-lane flags that by design never change a reply: they act on what is captured or kept.
 * A crisis-lane module reads them, so the census counts them, yet the six readers and SHOWN_ON
 * cannot see them. This home is open only to flags whose named row proves, on a crisis-guided
 * turn and a held turn, that the reply is unchanged AND nothing the caller said is kept with the
 * flag on. What may be added holds no words: a safety record (flags, severity, times, ids), kept
 * by the owner's rule (2026-11-11), or only a time with its expiry where no record is kept (a
 * held caller, a crisis about someone else). Both halves matter: the home exists for memory, not
 * replies. The reply grid (crisis-reply-never-lower.test.ts) also runs each of these the gate
 * reads on every call it places, and fails if any reply moves.
 *
 * The census (crisis-all-flags-never-lower.test.ts) checks only that each named file exists and
 * holds each title as an it() or test() call. What a row asserts is a reviewer's check.
 */
export const MEMORY_ONLY: Readonly<Record<string, MemoryOnlyRow>> = {
  // A gate crisis starts the proactive quiet window. The caller's own crisis: a wordless crisis
  // record. A held caller, or a crisis about someone else: only a quietUntil time (and its
  // expireAt) on minor_care_holds. The crisis turn's reply, and the crisis note on later turns and
  // calls, are unchanged. What reads the record only holds back, for CRISIS_QUIET_DAYS: proactive
  // sends and, on later calls, the pondered opener, the greeting's date line, the call sheet's
  // recentCrisis and the remembered-call card (hadCrisisWithin). Nothing adds crisis words.
  CRISIS_QUIET_FROM_GATE: {
    file: 'src/services/outreach/proactive-channels/__tests__/crisis-gate-quiet-path.test.ts',
    rows: [
      'on a crisis-guided turn and a held turn, Ferni says what it says with the flag off',
      "what it keeps holds none of the caller's words, on a guided turn and a held turn",
    ],
  },
  TURN_PATH_SINGLE_CAPTURE: {
    file: 'src/agents/voice-agent/__tests__/turn-path-single-capture.test.ts',
    rows: [
      'crisis-guided turn, turn path attached: flag on captures nothing, the handler acts the same on and off',
      'crisis read pending (reply held), turn path attached: flag on captures nothing, the handler acts the same on and off',
    ],
  },
  // A dropped call's turns go back only when none of its caller lines reads as risk; a held
  // caller's are never read. Crisis half: the first two rows. Held half: the rest.
  RESUME_AFTER_DROP: {
    file: 'src/agents/multi-agent/__tests__/resume-after-drop-held.test.ts',
    rows: [
      'RESUME_AFTER_DROP: a call that dropped right after a crisis line opens exactly as with the flag off',
      'RESUME_AFTER_DROP: a risk read that throws resumes nothing',
      "a held call's pre-hold turns are not resumed on another pod (no endedAt)",
      'a caller held in this process (another live session of theirs) gets no resume',
      'a new call already held when it starts never looks',
      'a new call held while the lookup ran: the found turns are not put back',
    ],
  },
  // The same for the app call a "call me" moved to the phone.
  CALL_ME_MOVES_TO_PHONE: {
    file: 'src/agents/multi-agent/__tests__/resume-after-drop-held.test.ts',
    rows: [
      'CALL_ME_MOVES_TO_PHONE: an app call with a crisis line opens the phone call exactly as with the flag off',
      'CALL_ME_MOVES_TO_PHONE: a risk read that throws carries nothing over',
      'a held app call: nothing is read or restored, and no moved note',
      'a phone call already held: nothing is read',
      'a phone call held while the turns were read: none go back',
    ],
  },
  // Takes the caller's recalled memories out of what a crisis reply's request reads: a crisis
  // turn's background note is built without them, and every crisis-guided request, or request on
  // a call with risk noted, gets the note without them. It only removes words: the guidance, the
  // override and every other note are the flag off's, and nothing is kept. The grid's calls carry
  // no recalled memory, so no reply there moves.
  CRISIS_NO_MEMORY_RECALL: {
    file: 'src/agents/voice-agent/__tests__/crisis-no-memory-recall.test.ts',
    rows: [
      'crisis-guided turn, flag on: no recalled memory reaches the model, every other word as with the flag off',
      'crisis read pending (reply held), flag on: the guided re-ask carries no recalled memory, every other word as with the flag off',
    ],
  },
  // Logs where the fast lane would send a turn (TURN_RECEIPT prompt.laneShadow); only the receipt
  // builder reads it. Crisis half: the first three rows. Held half: the fourth. Reply unchanged:
  // the last (the request the model gets is left as it came, flag on or off).
  FAST_LANE_SHADOW: {
    file: 'src/agents/shared/__tests__/turn-receipt-lane-shadow.test.ts',
    rows: [
      "a crisis-marked request, then the call's later unmarked chat turn: both null",
      'a crisis-held call: null, and still null after the hold itself is gone',
      'a crisis read still running: null (its verdict could hold the call)',
      'a caller who sounds under 18: null, even read with MINOR_CARE off',
      'the flag on leaves the request the model gets as it came: an open call logs, a guided one is quiet',
    ],
  },
};

/**
 * Crisis-lane flags that act on a text channel (SMS or typed chat), where the six readers and
 * SHOWN_ON (voice calls) cannot see them. Voice flags use SHOWN_ON. This home is open only to a
 * flag whose named rows drive its real text path with a fictional crisis text, flag off then on,
 * and assert the on answer is never lower: 988 or 911 still in it, nothing softened, no model
 * reply in its place.
 *
 * The census checks that each named file exists and holds each title as an it() or test() call,
 * as for MEMORY_ONLY. What a row asserts is a reviewer's check.
 */
export const TEXT_SHOWN_ON: Readonly<Record<string, readonly MemoryOnlyRow[]>> = {
  SMS_REPLY: [
    {
      file: 'src/api/__tests__/outreach-sms-crisis-survives.test.ts',
      rows: [
        'SMS_REPLY off then on: a crisis text gets the same answer, 988 and 911 in it, no model reply',
      ],
    },
    {
      // The reply's own crisis read, when the route's screen missed: its crisis reply, 988 in it.
      file: 'src/services/outreach/sms-reply/__tests__/sms-reply-webhook.test.ts',
      rows: [
        "on: the text's own crisis read: SMS_CRISIS_REPLY, flagged crisis for the route",
        "main vs head: the crisis read runs first and sends today's crisis reply, word for word",
      ],
    },
  ],
};

/**
 * Crisis-lane flags that act on the turn's tool routing, before the reply gate runs: a tool a
 * router runs on its own, and the direct tool reply that skips the reply model. The six readers
 * and SHOWN_ON (the gate's reply) never see that step. This home is open only to a flag whose
 * named rows drive the real turn path (processTurn, the real crisis reads, a stubbed classifier
 * model) on a fictional line, flag off then on, and assert that with it on a crisis turn runs no
 * tool and is never answered by a tool in place of the reply model, a failed read included.
 *
 * The census checks that each named file exists and holds each title as an it() or test() call,
 * as for MEMORY_ONLY. What a row asserts is a reviewer's check.
 */
export const TURN_ROUTING_SHOWN_ON: Readonly<Record<string, readonly MemoryOnlyRow[]>> = {
  ROUTER_EXEC_AFTER_CRISIS_READ: [
    {
      file: 'src/agents/processors/turn-processor/__tests__/router-exec-after-crisis-read.test.ts',
      rows: [
        'a crisis only the classifier reads: no tool runs and no direct reply',
        'a classifier read that fails: no tool runs and no direct reply',
        'a router that ran the tool anyway: the direct reply is still refused',
        'risk an earlier turn noted on the call: no tool runs and no direct reply',
        'a turn read that throws inside the check: no tool runs and no direct reply',
        'a classifier read still pending at its timeout, no call id: no tool runs and no direct reply',
        'a router that ran a short-circuit tool anyway on a failed read: the short-circuit refuses the direct reply',
        'FTIS, a crisis only the classifier reads: no tool runs and no direct reply',
        'FTIS ran the tool anyway on a classifier-only crisis: the FTIS bypass refuses the direct reply',
        'a crisis only the classifier reads still runs the tool and takes the direct reply',
      ],
    },
    {
      // Each router (semantic, intelligent, FTIS) holds the tool on a hold, a failed read and a
      // check that throws.
      file: 'src/tools/semantic-router/integration/__tests__/auto-execute-hold.test.ts',
      rows: [
        'each router holds the tool on a hold, a failed read and a check that throws',
        'with the flag on, each router holds the tool when no check is handed and logs no_check',
      ],
    },
    {
      // FTIS run by the transcript handler, outside processTurn.
      file: 'src/agents/voice-agent/__tests__/ftis-transcript-crisis-hold.test.ts',
      rows: [
        'flag on, FTIS on: a crisis only the classifier reads runs no tool through the transcript handler',
        'flag on, FTIS on: no crisis read of the turn starts, so no tool runs (fail closed)',
      ],
    },
  ],
};
