/**
 * Grief without risk gets presence, not a hotline (CRISIS_GRIEF_NO_HOTLINE=on,
 * off by default).
 *
 * Dev release check, 2026-10-18 (hard-ground call): a caller whose dad had died
 * on Saturday said "Yeah, I don't really know what to do with myself." No
 * pattern matched; the classifier alone read crisis, so the reply got crisis
 * guidance and Ferni added the 988 line to someone who was grieving, not in
 * danger. The persona already says grief alone gets no hotline; the guidance
 * overrode it.
 *
 * With the flag on, a classifier-only crisis (no pattern signal at all, a
 * plain "crisis" read about the caller, not imminent) on a turn about a loss
 * or sadness, with no risk words anywhere in the caller's lines and no safety
 * question in Ferni's last line, gets warm presence instead, and the call goes
 * on watch: a second such turn adds one gentle "are you safe right now?".
 * Anything else escalates exactly as before: risk words now or earlier, a
 * pattern match, an imminent or missing read, or text these lists cannot read.
 *
 * Privacy: logs carry the outcome, never the caller's words.
 *
 * @module CrisisGrief
 */

import { createLogger } from '../../utils/safe-logger.js';
import { endorses, hasRiskContent } from './crisis-agreement.js';
import type { CrisisVerdict } from './crisis-classifier.js';

const log = createLogger({ module: 'CrisisGrief' });

export function resolveCrisisGriefNoHotline(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.CRISIS_GRIEF_NO_HOTLINE?.trim().toLowerCase() === 'on';
}

/** NFKC, lower case, every apostrophe variant as ', spaces collapsed. */
const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Risk language in the caller's own words. Broad on purpose: a match only
 * keeps the escalation there was before. "died" alone is how a loss is told
 * ("my dad died"); dying, death and being alive are not.
 */
const RISK_LANGUAGE: readonly RegExp[] = [
  /\bsuicid|\bkill(ing|ed)? (my ?self|me)\b|\bunaliv|\bkms\b|\bctb\b|\bself ?-?harm|\boverdos/,
  /\b(hurt|harm|cut|burn|starv)\w* (my ?self|me)\b|\btake my (own )?life\b/,
  /\bend(s|ed|ing)? (it|it all|things|everything|my life|this|me)\b|\bover (for good|with)\b|\bbe over soon\b/,
  /\b(don'?t|do not|didn'?t|not|never|no longer) (really |even )?(want|wanna|wanting|wish) to (be here|be around|be alive|live|exist|wake up|go on|keep going|get up|do this)\b/,
  /\bnot (be|being) (here|around|alive)\b|\b(want|wanna|wish|need) (for )?(it|this|everything|things|the pain|all of (it|this)) to (stop|end|be over)\b/,
  /\b(what'?s|what is) (even )?the point\b|\bno point\b|\bno (reason|purpose) to\b|\bnothing (left )?to live for\b/,
  /\bhopeless\b|\bno (hope|future|way out)\b|\btrapped\b|\b(give|giving|gave) up\b/,
  /\bcan'?t (go on|keep going|take (it|this|any ?more)|do (this|it) any ?more|cope|live)\b/,
  /\bburden\b|\bbetter off\b|\bwithout me\b|\b(no ?one|nobody) (would|will) (even )?(miss|care|notice)\b/,
  /\b(not|never|don'?t) wake up\b|\bsleep forever\b|\bdisappear|\bvanish|\bstop existing\b/,
  /\b(want|wish|wanna|rather) (to )?be gone\b|\b(when|after|once) i'?m gone\b/,
  /\b(die|dies|dying|dead|death)\b|\b(alive|living|live|exist|existing|existence)\b/,
  /\b(wish|should|could|would)\b[^.!?]{0,16}\bdied\b|\b(been|was|were|be) me\b|\btake me (instead|too|with)\b/,
  /\b(join|go be with|be with|follow) (him|her|them|my \w+|mom|mum|dad|mama|papa)\b|\bsee (him|her|them) (again )?soon\b/,
  /\b(pills?|tablets|meds|gun|guns|firearm|pistol|rifle|bullets?|rope|noose|razor|blades?|knife)\b/,
  /\b(bridge|ledge|roof|rooftop|cliff|tracks|poison\w*|bleach|exhaust|carbon monoxide|stockpil\w*)\b/,
  /\b(plan|plans|planned|planning|tonight|goodbye|good-bye|farewell|my will|swallow\w*)\b/,
  /\b(saved|saving|collected|collecting) (up|them|it)\b|\b(gave|give|giving) (away|my stuff|my things)\b/,
  /\b(suicide|goodbye|last|final) (note|letter)s?\b|\b(going to|gonna|about to|ready to) do it\b/,
  /\btook (something|a (bunch|lot|handful)|too many|all)\b/,
  /\b988\b|\b911\b|\b(hotline|lifeline|crisis|emergency|ambulance)\b/,
  /\b(morir\w*|muer\w*|matar\w*|vivir|pastillas)\b/,
];

/** True for anything it cannot read: outside plain ASCII and typographic punctuation. */
export function hasRiskLanguage(text: string | undefined | null): boolean {
  if (typeof text !== 'string') return true;
  try {
    if (/[^\t\n\r\x20-\x7E’‘“”—–…]/.test(text)) return true;
    const t = normalized(text);
    return RISK_LANGUAGE.some((re) => re.test(t));
  } catch {
    return true;
  }
}

/** Ferni's line asked about safety or raised a crisis line: the reply must answer it. */
const SAFETY_RAISED =
  /\b988\b|\b911\b|lifeline|hotline|crisis|\bsafe\b|(hurt|harm|kill)(ing)? yourself|suicid|end(ing)? (it|your life)|not (want|wanting) to be here|thoughts of/;

/** A loss, a death or sadness in the caller's words. */
const GRIEF =
  /\b(died|passed|pass away|lost (him|her|them|my|our|a|the)|loss|losing|funeral|memorial|burial|buried|grie\w*|mourn\w*|widow\w*|miss (him|her|them|you|my|mom|mum|dad|it|having)|missing|gone|sad|sadder|sadness|crying|cry|cried|tears|heartbroken|heartbreak|devastated|broken|hurts|aching|lonely)\b/;

export function hasGriefCue(text: string): boolean {
  return typeof text === 'string' && GRIEF.test(normalized(text));
}

/**
 * Ferni's line keeps the escalation: it asked about safety or raised a crisis
 * line, or the caller agreed with something dark it said (making it their own).
 */
function ferniLineHolds(latest: string, companion: string | undefined): boolean {
  if (typeof companion === 'string' && SAFETY_RAISED.test(normalized(companion))) return true;
  return endorses(latest) && hasRiskContent(companion ?? '');
}

export interface GriefTurn {
  env?: Record<string, string | undefined>;
  /** The pattern guard's indicators for this turn; any at all keeps the escalation. */
  indicators: readonly string[];
  /** The classifier read that escalated this turn. */
  verdict: CrisisVerdict | null;
  latest: string;
  earlier?: readonly string[];
  /** Ferni's line just before the caller's words. */
  companion?: string;
}

/** Whether this classifier-only crisis is grief with no risk signal (flag aside). */
export function isGriefWithoutRisk(turn: GriefTurn): boolean {
  try {
    const { indicators, verdict, latest, earlier = [], companion } = turn;
    if (!Array.isArray(indicators) || indicators.length > 0) return false;
    if (!verdict || verdict.risk !== 'crisis' || verdict.subject !== 'self') return false;
    if (typeof latest !== 'string' || !latest.trim()) return false;
    // Explicit risk language in any of the caller's lines always escalates.
    if ([latest, ...earlier].some(hasRiskLanguage)) return false;
    if (ferniLineHolds(latest, companion)) return false;
    return [latest, ...earlier].some(hasGriefCue);
  } catch {
    return false; // fail closed: an error never softens a turn
  }
}

export const GRIEF_PRESENCE = `[SAFETY - GRIEF WATCH]
A safety read flagged the caller's last words, but nothing they said is about hurting themselves or not wanting to be here: they are grieving.
1. Stay with them the way a close friend would: warm, plain, unhurried. Let the loss be as big as it is
2. Do not mention 988, hotlines or crisis lines on this alone, and do not switch to crisis talk
3. Do not fix or advise. One short, gentle question about them or the person they lost is fine
4. If they say anything about hurting themselves, not wanting to be here, joining the person they lost, or a plan, take it seriously: ask plainly whether they are safe right now and give the 988 Suicide & Crisis Lifeline (call or text 988)`;

export const GRIEF_CHECKIN = `${GRIEF_PRESENCE}
5. Their words have read as heavy more than once this call. After a warm reply, check in once, gently and plainly: "When you say that, are you safe right now?" Then follow their lead; a hotline only if they say they are not safe or talk about hurting themselves`;

/** Calls on watch: the grief turns already given presence. In memory only. */
const WATCH_TTL_MS = 15 * 60_000;
const WATCH_MAX = 64;
const watch = new Map<string, { at: number; turns: string[] }>();

/** For tests: forget every watch. */
export function resetGriefWatch(): void {
  watch.clear();
}

/** 'checkin' when an earlier grief turn of this call was already on watch. */
function noteWatch(scope: string | undefined, latest: string, now: number): 'presence' | 'checkin' {
  if (!scope) return 'presence';
  for (const [k, v] of watch) if (now - v.at > WATCH_TTL_MS) watch.delete(k);
  const turn = normalized(latest);
  const entry = watch.get(scope) ?? { at: now, turns: [] };
  // The gate reads every caller line since Ferni spoke, the pipeline only the
  // last: one turn's two reads contain each other and count once.
  const same = (t: string): boolean => t.includes(turn) || turn.includes(t);
  const level = entry.turns.some((t) => !same(t)) ? 'checkin' : 'presence';
  if (!entry.turns.some(same)) entry.turns.push(turn);
  entry.at = now;
  watch.delete(scope);
  if (watch.size >= WATCH_MAX) {
    const oldest = watch.keys().next().value;
    if (oldest !== undefined) watch.delete(oldest);
  }
  watch.set(scope, entry);
  return level;
}

/**
 * The guidance for a grief turn that would otherwise get the 988 line, or
 * null to escalate as before (flag off, or any risk signal).
 */
export function griefWatchGuidance(
  turn: GriefTurn & { scope?: string; source: 'gate' | 'pipeline' }
): string | null {
  if (!resolveCrisisGriefNoHotline(turn.env ?? process.env)) return null;
  if (!isGriefWithoutRisk(turn)) return null;
  const level = noteWatch(turn.scope, turn.latest, Date.now());
  log.info({ outcome: level, source: turn.source }, 'CRISIS_GRIEF_WATCH');
  return level === 'checkin' ? GRIEF_CHECKIN : GRIEF_PRESENCE;
}
