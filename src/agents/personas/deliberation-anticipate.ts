/**
 * DELIBERATION_MODE=anticipate: the deliberator (deliberation.ts) drafts two
 * directions for a weighty turn, imagines how THIS caller would most likely
 * take each, and keeps the one they would take better.
 *
 * Reading someone's state is not the same as using it to choose what to say;
 * recent work does the second by simulating the listener before speaking
 * (ToMA, ACL 2026 Findings; user simulators such as Mind2Dialogue and
 * ProPerSim). Same single model call, budget, spacing, expiry and safety rules
 * as the default mode; a choice the simulation expects to land badly is
 * dropped. Logged as labels only (kinds, simulated reactions, fit, why), no
 * words. Off unless DELIBERATION=on and DELIBERATION_MODE=anticipate.
 *
 * @module agents/personas/deliberation-anticipate
 */

type Env = Record<string, string | undefined>;

export type DeliberationMode = 'reflect' | 'anticipate';

export function deliberationMode(env: Env = process.env): DeliberationMode {
  return env.DELIBERATION_MODE === 'anticipate' ? 'anticipate' : 'reflect';
}

/**
 * The header of the theory-of-mind note (#684, intelligence/theory-of-mind/note.ts),
 * a system message in the agent's context once THEORY_OF_MIND=on. Matched by
 * text so this works the day it lands; import it once #684 is merged.
 */
export const MIND_NOTE_HEADER = '[HOW THEY ARE]';

const REACTIONS = ['opens_up', 'engaged', 'neutral', 'brushes_off', 'defensive', 'hurt'] as const;
export type Reaction = (typeof REACTIONS)[number];
/** Reactions that mean the thought would land badly with this caller. */
const LANDS_BADLY = new Set<Reaction>(['defensive', 'hurt']);

const BECAUSE = [
  'fits_mood',
  'more_specific',
  'less_intrusive',
  'invites_more',
  'gentler',
  'more_honest',
] as const;
export type Because = (typeof BECAUSE)[number];

const KINDS = ['insight', 'question', 'connection', 'reframe'] as const;

export const ANTICIPATE_SYSTEM = `You are Ferni's private thoughts during a live phone call with someone he cares about. Ferni (warm, dry, curious; grew up in Wyoming, lived in Japan, a life coach who talks like a friend) answers in real time. You have a little longer.
First draft TWO different things he might bring up in the next turn or two (each an insight, a better question, a connection between two things they said, or a truer or kinder reframe). Then, for each, imagine how THIS person would most likely react if he said it, judging from how they talk on this call, what Ferni remembers and how they tend to be. Keep the one they would take better, and only if it is worth more than what he would say anyway.
Ground both in what they actually said. Never invent facts, history or people. No diagnoses, clinical labels or therapy-speak, no unasked-for advice dressed up as insight, no flattery.
Return JSON only, either {"kind":"none"} or {"kind":"<kind of the one you keep>","note":"that thought, under 22 words","confidence":0.0-1.0,"whyNow":"under 12 words","doNotUseIf":"under 10 words","options":[{"kind":"insight"|"question"|"connection"|"reframe","reaction":"${REACTIONS.join('"|"')}","fit":1-5},{...the second}],"chose":0|1,"because":"${BECAUSE.join('"|"')}"}`;

export interface Anticipation {
  options: Array<{ kind: string; reaction: Reaction; fit: number }>;
  chose: 0 | 1;
  because: Because;
}

/** The simulation's labels, or null when they are missing or not from the allowed sets. */
export function parseAnticipation(reply: string): Anticipation | null {
  try {
    const p = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] ?? '') as Record<string, unknown>;
    const raw = Array.isArray(p.options) ? (p.options as Array<Record<string, unknown>>) : [];
    const options = raw.slice(0, 2).map((o) => ({
      kind: String(o.kind),
      reaction: o.reaction as Reaction,
      fit: Number(o.fit),
    }));
    const valid = options.every(
      (o) =>
        (KINDS as readonly string[]).includes(o.kind) &&
        REACTIONS.includes(o.reaction) &&
        o.fit >= 1 &&
        o.fit <= 5
    );
    if (options.length !== 2 || !valid || (p.chose !== 0 && p.chose !== 1)) return null;
    if (!BECAUSE.includes(p.because as Because)) return null;
    return { options, chose: p.chose, because: p.because as Because };
  } catch {
    return null;
  }
}

/** Whether the simulation expects the kept thought to land badly with this caller. */
export function landsBadly(a: Anticipation): boolean {
  return LANDS_BADLY.has(a.options[a.chose].reaction);
}

/**
 * The thought the anticipate arm keeps: only one that was weighed against a
 * second, is the one the simulation kept, and is not expected to land badly.
 */
export function keptAfterSimulation<T extends { kind: string }>(
  t: T | null,
  a: Anticipation | null
): T | null {
  if (!t || !a || a.options[a.chose].kind !== t.kind || landsBadly(a)) return null;
  return t;
}

/** The labels to log: what was weighed, what won and why. No words. */
export function anticipationLog(a: Anticipation | null): Record<string, unknown> {
  if (!a) return { anticipated: false };
  const best = a.options[0].fit >= a.options[1].fit ? 0 : 1;
  return {
    anticipated: true,
    options: a.options,
    chose: a.chose,
    because: a.because,
    choseBestFit: a.options[0].fit === a.options[1].fit || a.chose === best,
    landsBadly: landsBadly(a),
  };
}
