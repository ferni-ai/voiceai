/**
 * Ask when unclear: when the caller asks for something and Ferni can't tell
 * who or what they mean, or their words came through cut up, he checks in one
 * short question with his best guess ("Priya, right?") instead of guessing
 * silently and acting on it.
 *
 * On a dev call (2026-10-11) ink heard "Still still on there." and Ferni
 * answered with an unrelated memory. Asked to "call her" with a mom and a
 * sister on the call, he called one of them. Ink gives no confidence to go on
 * (the turns websocket sends only `transcript`, probed 2026-10-11; repair-check.ts),
 * so the cues come from the words, in code, with no second model call:
 *
 *   reference  a request whose object is a bare pronoun ("call her", "send it",
 *              "play that one again") with no single thing on the call it can
 *              be: none or two people of that kind, no song played yet
 *   fragment   a short turn with a doubled word and no one doing anything
 *              ("Still still on there."), or one that stops on "the"/"a"/"my"
 *
 * It rides REPAIR_MODE's slot: repairNoteFor (repair-check.ts) asks for this
 * cue after its own mishear cues and keeps its rules (one note per turn, none after Ferni just
 * checked, none while venting or in crisis, none with crisis guidance).
 * ASK_WHEN_UNCLEAR=on, with REPAIR_MODE=on, enables it.
 *
 * @module agents/personas/unclear-turn
 */

import type { llm } from '@livekit/agents';

export function askWhenUnclearEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.ASK_WHEN_UNCLEAR === 'on';
}

export interface UnclearCue {
  kind: 'reference' | 'fragment';
  /** The words that are unclear, as the caller's captions have it. */
  heard: string;
  /** Who it could be, most recent first: at most two, none when nothing fits. */
  options: string[];
}

/**
 * A request to Ferni on a bare pronoun: "call her", "Can you send it", "take it
 * off", "look it up", "what she said". Only where a request starts (turn or
 * clause start, "can you", "please"): "I did send it" asks for nothing.
 */
const REQUEST =
  /(?:^|[.?!,]\s*|\b(?:can|could|would|will) you (?:please |just )?|\bplease |\bjust )((?:call|ring|text|message|email|remind me (?:about|of)|play|send|move|cancel|reschedule|take|put|delete|do|book|tell)\s+(her|him|them|it|that one|this one|the other one|that)\b|look (?:it|that) up\b)|\bwhat (?:did )?(she|he) (?:said|say|think|thought)\b/i;
const FEMALE = 'mom mother sister wife girlfriend aunt grandma grandmother daughter niece';
const MALE = 'dad father brother husband boyfriend uncle grandpa grandfather son nephew';
const ANYONE = 'partner boss manager friend neighbor recruiter coworker roommate doctor';
const KIN = new Map<string, 'f' | 'm' | 'x'>([
  ...FEMALE.split(' ').map((w) => [w, 'f'] as const),
  ...MALE.split(' ').map((w) => [w, 'm'] as const),
  ...ANYONE.split(' ').map((w) => [w, 'x'] as const),
]);
/** Capitalized words that are not people: days, months, Ferni, sentence openers. */
const NOT_PEOPLE = new Set(
  'i ferni fern monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december okay oh hey hi yeah so and but the my your that it there here what who let he she'.split(
    ' '
  )
);
/** Ferni already put a song on: "play that one again" has its antecedent. */
const PLAYED = /\b(?:here'?s|here is|playing|put on|queued)\b|\[playMusic/i;

/** After a capital that opens a sentence, these mark it as someone ("Jordan's", "Kyle wants"). */
const ACTS = /^(?:is|was|said|says|wants|called|texted|thinks|just|and|texted|landed|asked|told)$/;

interface Person {
  who: string;
  sex: 'f' | 'm' | 'x';
  named: boolean;
  kin: boolean;
  at: number;
}

/** People named or referred to in the call's recent lines, most recent first, one per person. */
function peopleIn(lines: string[]): Person[] {
  const found: Person[] = [];
  lines.forEach((line, n) => {
    const raw = line.split(/[\s,]+/);
    const tokens = raw.map((t) => t.replace(/[^A-Za-z']/g, '').replace(/'s$/, ''));
    tokens.forEach((t, i) => {
      const kin = KIN.get(t.toLowerCase());
      const capital = /^[A-Z][a-z]+$/.test(t) && !NOT_PEOPLE.has(t.toLowerCase());
      // A capital that only starts a sentence ("Third time?") is no name; "Jordan's picking" is.
      const opens = i === 0 || /[.?!]$/.test(raw[i - 1] ?? '');
      const next = (tokens[i + 1] ?? '').toLowerCase();
      const name =
        capital &&
        (!opens ||
          /'s$/.test(raw[i] ?? '') ||
          ACTS.test(next) ||
          (next === 'the' && KIN.has((tokens[i + 2] ?? '').toLowerCase())));
      if (!kin && !name) return;
      const at = n * 100 + i;
      // "my sister Priya", "Dana the recruiter": a kin word and a name side by side are one person.
      const near = found.find((p) => at - p.at <= 2 && (kin ? !p.kin : !p.named));
      if (near) {
        if (kin) Object.assign(near, { sex: kin, kin: true, at });
        else Object.assign(near, { who: t, named: true, at });
        return;
      }
      found.push({ who: t, sex: kin ?? 'x', named: !kin, kin: Boolean(kin), at });
    });
  });
  const seen = new Set<string>();
  return found
    .reverse()
    .filter((p) => !seen.has(p.who.toLowerCase()) && seen.add(p.who.toLowerCase()));
}

/** A short turn that came through cut up, or null. */
function fragmentCue(said: string): UnclearCue | null {
  const words = said.toLowerCase().match(/[a-z']+/g) ?? [];
  const doubled = words.some(
    (w, i) =>
      w === words[i + 1] &&
      !/^(?:no|yeah|yes|very|really|so|ha|bye|okay|ok|now|go|wait|more)$/.test(w)
  );
  const subject = words.some((w) =>
    /^(?:i|i'm|you|you're|he|she|we|they|it|it's|that's|this|what|who|where|why|how)$/.test(w)
  );
  const cutOff = /\b(?:the|a|an|my|your|our|their)\s*\.?$/i.test(said.trim());
  return (doubled && !subject && words.length <= 6) || cutOff
    ? { kind: 'fragment', heard: said.trim(), options: [] }
    : null;
}

/**
 * The first unclear thing in the caller's latest words, or null. `turns` are
 * the call's earlier lines, both speakers, oldest first: Ferni's own lines
 * count as context ("play that one again" after he played one).
 */
export function unclearCue(said: string, turns: string[]): UnclearCue | null {
  const fragment = fragmentCue(said);
  if (fragment) return fragment;
  const ask = said.match(REQUEST);
  if (!ask) return null;
  const heard = ask[1] ?? ask[0];
  // "Send it to her": who it goes to is the open question.
  const to = said.slice(ask.index).match(/\b(?:to|for|with) (her|him)\b/i)?.[1];
  const pronoun = (to ?? ask[2] ?? ask[3] ?? 'it').toLowerCase();
  const recent = [...turns.slice(-6), said.slice(0, ask.index)];
  if (/^(?:her|him|them|she|he)$/.test(pronoun)) {
    const sex = /^(?:her|she)$/.test(pronoun) ? 'm' : /^(?:him|he)$/.test(pronoun) ? 'f' : '';
    const people = peopleIn(recent).filter((p) => p.sex !== sex);
    return people.length === 1
      ? null
      : { kind: 'reference', heard, options: people.slice(0, 2).map((p) => p.who) };
  }
  if (/^play\b/i.test(heard) && recent.some((line) => PLAYED.test(line))) return null;
  return { kind: 'reference', heard, options: [] };
}

/** The note for the reply model: one short question with a guess, only if it's really unclear. */
export function unclearNote(cue: UnclearCue): string {
  if (cue.kind === 'fragment')
    return `Speech-to-text heard "${cue.heard}", which looks cut up. If you can tell what they most likely meant, answer that, checking it in a few words; if you can't, ask them to say it again, the way a friend would ("Sorry, you cut out, what was that?"). Don't build on the words as heard.`;
  const [first, second] = cue.options;
  if (first && second)
    return `Before you call any tool: they said "${cue.heard}", and both ${first} and ${second} came up, so you can't be sure who they mean. Ask in a few words with your best guess ("${first}, right?") and wait for the answer.`;
  if (/\b(?:that|this|the other) one\b/i.test(cue.heard))
    return `Before you call any tool: they said "${cue.heard}", and nothing on this call is clearly the one they mean. Ask which in a few words with your best guess ("The ..., right?") and wait for the answer.`;
  return `They said "${cue.heard}". If two things on this call could be what they mean, or nothing could, don't call a tool or say you did it yet: ask in a few words with your best guess ("The ..., right?") and wait for the answer. If only one thing fits, just do it.`;
}

/** Tool calls earlier in the request, as text ("[playMusic]"), so a played song counts. */
export function toolLinesOf(chatCtx: llm.ChatContext): string[] {
  return chatCtx.items
    .filter((i) => i.type === 'function_call')
    .map((i) => `[${(i as { name?: string }).name ?? ''}]`);
}
