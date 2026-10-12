// Real next turns from friend-to-friend talk (SBCSAE CHAT files), cleaned the same way for both
// arms. Corpus text stays in ~/Documents/voiceai-evidence (CC BY-ND, internal evaluation only;
// see human-corpora/sbcsae/TERMS.md): never commit or publish it.
import { homedir } from 'node:os';
import { join } from 'node:path';

import { hashSeed, shuffled } from '../judge-stats.mjs';

/** A run's directory (--out, else today's under voiceai-evidence): it holds corpus text. */
export const runDir = (out) =>
  out ??
  join(homedir(), 'Documents/voiceai-evidence/next-turn', new Date().toISOString().slice(0, 10));

/** Friends, couples and family talking; lectures, sermons, meetings and service talk are out. */
export const CONVERSATIONS = [
  2, 3, 4, 5, 6, 7, 9, 11, 13, 15, 17, 19, 24, 28, 31, 32, 33, 34, 35, 36, 42, 43, 44, 45, 47, 48,
  49, 50, 51, 52, 56, 58, 59, 60,
].map((n) => `SBC${String(n).padStart(3, '0')}`);
export const TYPES = ['casual', 'venting', 'good_news', 'planning', 'low_mood'];
const NOT_A_PERSON = /^(ENV|X|X_\d|MANY|ALL|BOTH|AUD\d*|AUD_\d|BABY|DOG|MAC|HORS)$/;

export const words = (s) => (s.toLowerCase().match(/[a-z0-9']+/g) ?? []).length;
/** Unintelligible speech (X tokens) can't be shown fairly. */
export const unclear = (text) => /(^|\s)X+(\s|[.,?!]|$)/.test(text);

/** CHAT markup to spoken text with the light punctuation speech-to-text gives. */
export function cleanLine(s) {
  return s
    .replace(/\x15[^\x15]*\x15/g, ' ') // timestamps
    .replace(/\[%[^\]]*\]|&[{}]\S*|&=\S+|\+\S*|\((\.+|[\d.]+)\)/g, ' ') // notes, laughs, pauses
    .replace(/([\w'])[⌈⌉⌊⌋]\d*(?=[\w'])/g, '$1') // an overlap mark inside a word
    .replace(/[⌈⌉⌊⌋]\d*|(^|\s)@+(?=\s|$)/g, ' ')
    .replace(/[ʔ:]/g, '') // glottal stops, lengthening
    .replace(/(?<=[A-Za-z'])\d+|\d+(?=[A-Za-z])/g, '') // pitch marks ("cle3ar"): a judge spotted them
    .replace(/(\w)_(\w)/g, '$1$2')
    .replace(/\s+([.,?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Speaker turns (one speaker's consecutive utterances merged) and names by code. */
export function turnsOf(cha) {
  const line = cha.match(/^@Participants:\t(.*)$/m)?.[1] ?? '';
  const people = Object.fromEntries(
    line
      .split(',')
      .map((p) => p.trim().split(/\s+/))
      .filter(([code]) => code && !NOT_A_PERSON.test(code))
      .map(([code, name]) => [code, name[0] + name.slice(1).toLowerCase()])
  );
  const turns = [];
  for (const row of cha.replace(/\n\t/g, ' ').split('\n')) {
    const [, who, raw] = row.match(/^\*([A-Z0-9_]+):\t(.*)$/) ?? [];
    const text = raw && cleanLine(raw);
    if (!text || !words(text) || !people[who]) continue; // a laugh or breath alone
    if (turns.at(-1)?.who === who) turns.at(-1).text += ` ${text}`;
    else turns.push({ who, text });
  }
  return { people, turns };
}

/**
 * Moments to answer: B's turn right after a substantive turn by A, in a stretch where only A and
 * B talk, at most one per `gap` turns so contexts don't nearly repeat.
 */
export function momentsOf(file, cha, { window = 8, minContext = 4, gap = 12 } = {}) {
  const { people, turns } = turnsOf(cha);
  const out = [];
  for (let i = minContext, last = -gap; i < turns.length; i++) {
    const [prev, reply] = [turns[i - 1], turns[i]];
    if (prev.who === reply.who || i - last < gap || unclear(prev.text) || unclear(reply.text))
      continue;
    if (words(prev.text) < 10 || words(reply.text) < 3 || words(reply.text) > 60) continue;
    let start = i - 1;
    const pair = [prev.who, reply.who];
    while (start > 0 && i - start < window && pair.includes(turns[start - 1].who)) start--;
    if (i - start < minContext) continue;
    const context = turns
      .slice(start, i)
      .filter((t) => !unclear(t.text))
      .map((t) => ({ who: t.who === reply.who ? 'friend' : 'caller', text: t.text }));
    const names = { friend: people[reply.who], caller: people[prev.who] };
    out.push({ id: `${file}-${i}`, file, context, human: reply.text, names });
    last = i;
  }
  return out;
}

/** The friend's and caller's names swapped for neutral ones. */
export function neutralise(text, names, { friend = 'Ferni', caller = 'Sam' } = {}) {
  const swap = (s, name, to) => (name ? s.replace(new RegExp(`\\b${name}\\b`, 'gi'), to) : s);
  return swap(swap(text, names.friend, friend), names.caller, caller);
}

/** What a judge sees of any line: no tags or stage directions, lowercase, no punctuation. */
export const normalise = (text) =>
  text
    .replace(/\[[^\]]*\]|<[^>]*>|\*[^*]*\*/g, ' ')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s]|\s'|'\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Up to `n` moments, round-robin over types, at most `perFile` from one conversation. */
export function stratified(moments, n, { perFile = 6, seed = 1 } = {}) {
  const piles = TYPES.map((t) =>
    shuffled(
      moments.filter((m) => m.type === t),
      seed + hashSeed(t)
    )
  );
  const [out, fromFile] = [[], {}];
  for (let added = true; out.length < n && added;) {
    added = false;
    for (const pile of piles) {
      const i = pile.findIndex((m) => (fromFile[m.file] ?? 0) < perFile);
      if (i < 0 || out.length >= n) continue;
      const [m] = pile.splice(i, 1);
      fromFile[m.file] = (fromFile[m.file] ?? 0) + 1;
      out.push(m);
      added = true;
    }
  }
  return out;
}
