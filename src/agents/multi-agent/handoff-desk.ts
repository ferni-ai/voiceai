/**
 * HANDOFF_DESK (off by default): the teammate arrives knowing what the caller asked for
 * and what is still unfinished. Plan: docs/plans/2026-10-29-specialist-beats.md lane S1.
 *
 * Prod, 2026-10: every handoff logged hadPreBriefing=false. The pre-briefing is read
 * from bogle_users/{uid}/pre_briefings (predictive-handoff.ts), which nothing on the
 * live path writes, and the swap drops function calls (persona-swap.ts), so a teammate
 * never saw a call that was waiting on the caller's yes: an on-behalf call asked of Ferni
 * just before a handoff was unknown to the teammate, and one prod arrival line claimed the
 * last persona had caught it up when nothing was passed on (plan S1, audit finding 3).
 *
 * With the flag on, the leaving persona's desk is written at the handoff, in memory, from
 * its own session (no store read, no model call):
 * - asked: the caller's last one or two lines that ask for or say something (not "can I
 *   talk to Alex?"), in their words;
 * - waiting: a read-back still waiting on their yes (outreach-confirm.ts);
 * - unfinished: a call, text or email the tools refused ("Nothing was dialed: …"), and a
 *   reminder or commitment set on this call.
 * The desk replaces the pre-briefing read in the teammate's prompt, and the first line
 * names the thread ("You wanted a call to Rosa, … Want me to go ahead?"). An empty desk
 * tells the teammate nothing was passed on, and a first line that claims a briefing
 * ("X caught me up") is not said.
 *
 * Contact data never enters the desk (memory/domain/contact-data.ts). The summary the desk
 * joins is dropped whole when it touches a forgotten topic (agent-setup.ts
 * buildHandoffContext). Not here yet: open items on the teammate's beat from the call
 * sheet, which has no live render (intelligence/person-model; memory lanes M1/M6).
 *
 * @module agents/multi-agent/handoff-desk
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { containsContactData } from '../../memory/index.js';
import { pendingFor } from '../../tools/domains/communication/outreach/index.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TOOL_REFUSAL } from '../personas/action-claims.js';
import { toSecondPerson } from './arrival-reason.js';
import { topicWords } from './caller-words.js';
import { arrivalLine, personaFirstName, readConversation } from './handoff-brief.js';
import { preBriefSpecialist } from './handoff-fast-arrival.js';

const log = createLogger({ module: 'HandoffDesk' });

function handoffDeskEnabled(env: Env = process.env): boolean {
  return flagOn('HANDOFF_DESK', env);
}

export interface HandoffDesk {
  fromPersonaId: string;
  toPersonaId: string;
  /** The caller's last lines that say something, in their words, contact data removed. */
  asked: string[];
  /** A read-back still waiting on the caller's yes ("a call to Rosa, about …"). */
  waiting?: string;
  /** Sends the tools refused, and follow-ups set on this call. */
  unfinished: string[];
}

const FIELD_MAX = 160;
const clip = (s: string, n = FIELD_MAX): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * The text with no phone number or email: a sentence that holds one loses its digit and
 * email words, and is dropped if the guard still finds contact data in what is left or
 * little is left ("Her number is 727-555-0142.").
 */
function withoutContactData(text: string): string {
  return sentencesOf(text)
    .map((sentence) => {
      if (!containsContactData(sentence)) return sentence;
      const stripped = sentence
        .split(/\s+/)
        .map((w) => (/[\d@]/.test(w) ? w.replace(/^.*?([,.;:!?]*)$/, '$1') : w))
        .join(' ')
        .replace(/\s+(?:at|on|is|to)(?=\s*(?:[,.;:!?]|$))/gi, '')
        .replace(/\s+([,.;:!?])/g, '$1')
        .replace(/([,.;:!?])[,.;:!?]+/g, '$1')
        .trim();
      const tooLittle = stripped.split(/\s+/).length <= 3;
      return tooLittle || containsContactData(stripped) ? '' : stripped;
    })
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** "Can I talk to Alex?": asks for a teammate (or is filler) and says nothing else. */
const onlyAsksForTeammate = (line: string): boolean => topicWords(line).length === 0;

/** Reminders and commitments: set on this call, they are follow-ups the teammate now owns. */
const FOLLOW_UPS = new Set([
  'recordCommitment',
  'setReminder',
  'scheduleReminder',
  'scheduleFollowUp',
  'setContactFollowUp',
  'scheduleProactiveReminder',
  'createCoordinatedReminder',
]);
const WHAT_KEYS = ['commitment', 'text', 'description', 'title', 'reminder', 'message', 'task'];
const REFUSED = /^Nothing was (?:sent|dialed|posted)\b/;
/** Tools say failure in words, never isError: true when any sentence is a refusal (action-claims.ts). */
const saysNotDone = (output: string | undefined, said: RegExp = TOOL_REFUSAL): boolean =>
  sentencesOf((output ?? '').replace(/[\u2018\u2019]/g, "'")).some((s) => said.test(s));

interface ToolItem {
  type?: string;
  name?: string;
  callId?: string;
  args?: string;
  output?: string;
  isError?: boolean;
}

/** What a follow-up tool was asked to keep, from its arguments. */
function argText(args: string | undefined): string {
  try {
    const a = JSON.parse(args ?? '{}') as Record<string, unknown>;
    const value = WHAT_KEYS.map((k) => a[k]).find((v) => typeof v === 'string' && v.trim() !== '');
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

/** Each tool output with the call it answers. */
function toolResults(session: unknown): Array<{ name: string; call?: ToolItem; out: ToolItem }> {
  const s = session as { history?: { items?: ToolItem[] }; chatCtx?: { items?: ToolItem[] } };
  const items = s?.history?.items ?? s?.chatCtx?.items ?? [];
  const calls = new Map(items.filter((i) => i.type === 'function_call').map((i) => [i.callId, i]));
  return items
    .filter((i) => i.type === 'function_call_output')
    .map((out) => {
      const call = calls.get(out.callId);
      return { name: call?.name ?? out.name ?? '', call, out };
    });
}

/**
 * Refused sends (a call, text or email tool whose last output says "Nothing was sent", the
 * outbound gate's and tools' own wording) and follow-ups set, from the tool calls.
 */
function unfinishedFrom(session: unknown): string[] {
  const results = toolResults(session);
  const lastOutput = new Map(results.map((r) => [r.name, r.out.output]));
  const refused = [...lastOutput.values()]
    .filter((output): output is string => saysNotDone(output, REFUSED))
    .map((output) => withoutContactData(sentencesOf(output).find((s) => REFUSED.test(s)) ?? ''))
    .filter((said) => said !== '')
    .map((said) => `Asked for, not done: ${clip(said)}`);
  const followUps = results
    .filter((r) => FOLLOW_UPS.has(r.name))
    .map((r) => ({ r, what: withoutContactData(argText(r.call?.args)) }))
    .filter((f) => f.what !== '')
    .map(({ r, what }) =>
      r.out.isError === true || saysNotDone(r.out.output)
        ? `Asked for, not done (${r.name}): ${clip(what)}`
        : `Set on this call (${r.name}): ${clip(what)}`
    );
  return [...refused, ...followUps].slice(-4);
}

/** The leaving persona's desk, written from its session at the handoff; null with the flag off. */
export function writeDesk(
  from: { personaId: string; session: unknown },
  toPersonaId: string,
  env: Env = process.env
): HandoffDesk | null {
  if (!handoffDeskEnabled(env)) return null;
  const callerLines = readConversation(from.session)
    .turns.filter((t) => t.speaker === 'caller')
    .map((t) => withoutContactData(t.text))
    .filter((t) => t !== '' && !onlyAsksForTeammate(t));
  const pending = pendingFor(from.session as object | undefined);
  const live = pending && Date.now() <= pending.expiresAt ? pending.readBack : '';
  const desk: HandoffDesk = {
    fromPersonaId: from.personaId,
    toPersonaId,
    asked: callerLines.slice(-2).map((l) => clip(l)),
    waiting: toSecondPerson(withoutContactData(live)) || undefined, // read back to the caller
    unfinished: unfinishedFrom(from.session),
  };
  log.info(
    {
      to: toPersonaId,
      asked: desk.asked.length,
      waiting: Boolean(desk.waiting),
      unfinished: desk.unfinished.length,
    },
    'Handoff desk written'
  );
  return desk;
}

export function deskIsEmpty(desk: HandoffDesk): boolean {
  return desk.asked.length === 0 && !desk.waiting && desk.unfinished.length === 0;
}

/** The desk as it goes in the teammate's prompt. */
export function formatDesk(desk: HandoffDesk): string {
  const from = personaFirstName(desk.fromPersonaId);
  if (deskIsEmpty(desk)) {
    return `[HANDOFF DESK] ${from} passed you nothing from this call. Don't say anyone caught you up, filled you in or told you anything; greet them and ask what they'd like.`;
  }
  return [
    `[HANDOFF DESK from ${from}, this call: what is still open]`,
    ...desk.asked.map((l) => `They said: "${l}"`),
    desk.waiting &&
      `Waiting on their yes: ${desk.waiting}. Nothing has been placed or sent. If they still want it, use the tool again: it reads back once more.`,
    ...desk.unfinished,
    `Pick this up first, in your own words. Never say ${from} told you anything that isn't here.`,
  ]
    .filter(Boolean)
    .join('\n');
}

const ASK_YOU = /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(.+)$/i;
const WANT = /\bI(?:'d like| would like| want| need)\s+(you\s+)?to\s+(.+)$/i;
const DO = /^(?:please\s+)?((?:call|text|email|message|remind|book|send|schedule|tell|ask)\s.+)$/i;

/** "Can you call my mom?" → "You wanted me to call your mom." */
function wantedLine(sentence: string): string | undefined {
  const s = sentence.replace(/[.?!]+$/, '').trim();
  const ask = s.match(ASK_YOU)?.[1] ?? s.match(DO)?.[1];
  const want = ask ? undefined : s.match(WANT);
  const rest = ask ?? want?.[2];
  if (!rest || topicWords(rest).length === 0) return undefined;
  const words = toSecondPerson(rest)
    .replace(/^(?:call|text|email|message|remind|book|send|schedule|tell|ask)\b/i, (v) =>
      v.toLowerCase()
    )
    .split(/\s+/)
    .slice(0, 16)
    .join(' ');
  return `You wanted ${ask || want?.[1] ? 'me ' : ''}to ${words}. Still want that?`;
}

/** The first line that names the thread, or undefined when the desk has none to name. */
function threadLine(desk: HandoffDesk): string | undefined {
  if (desk.waiting) return `You wanted ${desk.waiting}. Want me to go ahead?`;
  for (const line of [...desk.asked].reverse()) {
    for (const sentence of sentencesOf(line).reverse()) {
      const named = wantedLine(sentence);
      if (named) return named;
    }
  }
  return undefined;
}

/** A line that says the teammate was briefed: "Ferni caught me up", "I've heard a little". */
const BRIEFING_CLAIM =
  /\b(?:caught me up|fill(?:ed)? me in|briefed me|up to speed|(?:told|tells) me|mentioned|passed (?:\w+ )?along|let me know|i'?ve heard|heard (?:that|you|about|a little)|hear\b|know you|said you|says you)\b/i;

function claimsBriefing(line: string): boolean {
  return BRIEFING_CLAIM.test(line);
}

/**
 * The teammate's first line. Flag off (no desk): `current`, as before. With a thread to
 * name, the line names it. With an empty desk, a line claiming a briefing becomes a plain
 * hello. Otherwise `current` (undefined: the canned line, handoff-brief.ts arrivalLine).
 */
export function arrivalFromDesk(
  desk: HandoffDesk | null,
  current: string | undefined,
  env: Env = process.env
): string | undefined {
  if (!desk) return current;
  const named = threadLine(desk);
  if (named) return named;
  if (!deskIsEmpty(desk)) return current;
  const line = current ?? arrivalLine(desk.toPersonaId, desk.fromPersonaId, env);
  return claimsBriefing(line) ? `Hey, it's ${personaFirstName(desk.toPersonaId)}.` : line;
}

/**
 * What the teammate's prompt gets in place of the pre-briefing: the desk (flag on), else
 * the pre_briefings read (predictive-handoff.ts) as before.
 */
export async function briefFromDesk(
  desk: HandoffDesk | null,
  userId: string | undefined,
  request: { targetPersonaId: string; conversationSummary?: string }
): ReturnType<typeof preBriefSpecialist> {
  if (!desk) {
    return preBriefSpecialist(userId, request.targetPersonaId, request.conversationSummary);
  }
  const summary = [formatDesk(desk), request.conversationSummary].filter(Boolean).join('\n\n');
  return { preBriefing: null, summary };
}
