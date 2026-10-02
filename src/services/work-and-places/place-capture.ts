/**
 * Travel & places statements in the user's own words (and in summaries).
 *
 *   "I live in Park Slope, Brooklyn" / "we just moved to Denver" → home (current; old home → past)
 *   "I used to live in Berlin" / "I grew up in Ohio"             → home (past)
 *   "I'm flying to Lisbon next Friday" / "trip to Rome in May"   → trip (planned; reminded)
 *   "I just got back from Lisbon"                                → trip (done)
 *   "my favourite cafe is Blue Bottle"                           → favourite
 *   "we got engaged in Paris"                                    → place with meaning
 *   "I've always wanted to visit Japan"                          → bucket list
 *
 * Pure: no I/O.
 *
 * @module services/work-and-places/place-capture
 */

import {
  ADDITIONAL_RE,
  BE,
  cleanName,
  companionsIn,
  dateFromPhrase,
  firstPerson,
  joinPlace,
  NEGATION_RE,
  PLACE,
  sentences,
  SUBJ,
  thisMonth,
} from './text-patterns.js';
import type { LifeInput, LifeSource, PlaceCategory } from './types.js';

interface Ctx {
  readonly source: LifeSource;
  readonly confidence: number;
  readonly conversationId?: string;
  readonly now: Date;
}

const re = (source: string) => new RegExp(source, 'u');

const HOME_NOW = re(
  `${SUBJ}(?:${BE})?\\s+(?:currently\\s+|still\\s+|now\\s+)?(?:lives?|living|based|settled)\\s+in\\s+${PLACE}`
);
const MOVED = re(
  `${SUBJ}\\s+(?:just\\s+|recently\\s+|finally\\s+)?(?:moved|relocated)\\s+(?:back\\s+)?to\\s+${PLACE}`
);
const HOME_PAST: ReadonlyArray<[RegExp, string | undefined]> = [
  [re(`${SUBJ}\\s+(?:used\\s+to\\s+live|lived)\\s+in\\s+${PLACE}`), undefined],
  [re(`${SUBJ}\\s+grew\\s+up\\s+in\\s+${PLACE}`), 'Grew up there'],
  [re(`${SUBJ}${BE}\\s+(?:originally\\s+)?from\\s+${PLACE}`), 'Hometown'],
  [re(`\\b[Mm]y\\s+hometown\\s+is\\s+${PLACE}`), 'Hometown'],
];

const TRIP_CONTEXT =
  /\b(trip|vacation|holiday|getaway|visit|visiting|honeymoon|conference|wedding|week|weekend|days|tomorrow|tonight|next|this|in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|on\s+\w+day|\d{1,2}(?:st|nd|rd|th)?)\b/i;
const TRIP_PLANNED = [
  re(
    `${SUBJ}(?:${BE}|['’]ll\\s+be|\\s+will\\s+be|\\s+will)?\\s+(?:going|heading|flying|traveling|travelling|driving|off|leaving)\\s+(?:back\\s+)?(?:to|for)\\s+${PLACE}([^.!?]*)`
  ),
  re(`${SUBJ}(?:${BE})?\\s+(?:visiting|planning\\s+a\\s+trip\\s+to)\\s+${PLACE}([^.!?]*)`),
  re(
    `\\b(?:[Mm]y|[Oo]ur|[Aa]|[Tt]he)\\s+(?:upcoming\\s+|big\\s+)?(?:trip|vacation|holiday|honeymoon)\\s+to\\s+${PLACE}([^.!?]*)`
  ),
];
const TRIP_DONE = [
  re(
    `${SUBJ}(?:${BE}|['’]ve|\\s+have)?\\s+(?:just\\s+)?(?:got\\s+back|gotten\\s+back|came\\s+back|back|returned)\\s+from\\s+${PLACE}([^.!?]*)`
  ),
  re(`${SUBJ}\\s+(?:went|travel(?:l)?ed|flew)\\s+to\\s+${PLACE}([^.!?]*)`),
  re(
    `${SUBJ}\\s+(?:was|were)\\s+in\\s+${PLACE}\\s+(last\\s+\\w+|over\\s+the\\s+\\w+|for\\s+[^.!?]+)`
  ),
];
const PAST_TRIP_HINT = /\b(was|were|loved|amazing|great|awesome|last|ago|over the)\b/i;

const FAVORITE_WORDS =
  'restaurant|cafe|café|coffee shop|coffee place|bar|pub|park|beach|spot|place|bakery|city|bookstore|trail|pizza place|taco place';
const FAVORITE = [
  re(
    `\\b[Mm]y\\s+(?:all[- ]time\\s+)?(?:favou?rite|go-to)\\s+(${FAVORITE_WORDS})\\s+(?:is|has to be|would be)\\s+${PLACE}`
  ),
  re(`${PLACE}\\s+is\\s+my\\s+(?:all[- ]time\\s+)?(?:favou?rite|go-to)\\s+(${FAVORITE_WORDS})\\b`),
];
const MEANINGFUL: ReadonlyArray<[RegExp, string]> = [
  [re(`${SUBJ}\\s+got\\s+engaged\\s+(?:in|at|on)\\s+${PLACE}`), 'Where you got engaged'],
  [re(`${SUBJ}\\s+got\\s+married\\s+(?:in|at|on)\\s+${PLACE}`), 'Where you got married'],
  [re(`${SUBJ}\\s+(?:first\\s+)?met\\s+(?:in|at)\\s+${PLACE}`), 'Where you met'],
  [re(`${SUBJ}\\s+had\\s+(?:our|my)\\s+first\\s+date\\s+(?:in|at)\\s+${PLACE}`), 'Your first date'],
  [re(`${SUBJ}\\s+proposed\\s+(?:to\\s+\\w+\\s+)?(?:in|at|on)\\s+${PLACE}`), 'Where you proposed'],
  [
    re(`${SUBJ}\\s+(?:honeymooned|spent\\s+(?:our|my)\\s+honeymoon)\\s+(?:in|at)\\s+${PLACE}`),
    'Your honeymoon',
  ],
];
const BUCKET = [
  re(
    `${SUBJ}(?:['’]ve|\\s+have)?\\s+(?:always\\s+)?(?:wanted|dreamed|dreamt)\\s+(?:of\\s+going|to\\s+(?:go|travel|get))\\s+to\\s+${PLACE}`
  ),
  re(`${SUBJ}(?:['’]d|\\s+would)\\s+(?:love|like)\\s+to\\s+(?:visit|see|travel\\s+to)\\s+${PLACE}`),
  re(
    `${SUBJ}\\s+(?:want|hope)\\s+to\\s+(?:visit|see)\\s+${PLACE}\\s+(?:someday|one\\s+day|before\\s+I\\s+die|eventually)`
  ),
  re(`${PLACE}\\s+is\\s+on\\s+my\\s+bucket\\s+list`),
  re(
    `\\b[Mm]y\\s+dream\\s+(?:trip|destination|vacation)\\s+is\\s+(?:to\\s+(?:go\\s+to\\s+)?)?${PLACE}`
  ),
];

function place(
  ctx: Ctx,
  kind: LifeInput['kind'],
  name: string,
  extra: Partial<LifeInput> = {}
): LifeInput {
  return {
    area: 'places',
    kind,
    subject: name,
    place: name,
    source: ctx.source,
    confidence: ctx.confidence,
    conversationId: ctx.conversationId,
    ...extra,
  };
}

function categoryFor(word: string): PlaceCategory {
  if (/restaurant|pizza|taco/.test(word)) return 'restaurant';
  if (/cafe|café|coffee|bakery/.test(word)) return 'cafe';
  if (/bar|pub/.test(word)) return 'bar';
  if (/park|trail/.test(word)) return 'park';
  if (/beach/.test(word)) return 'beach';
  if (/city/.test(word)) return 'city';
  return 'other';
}

/** Index of the first PLACE group, given how many groups come before it. */
function placeAt(m: RegExpExecArray, offset: number): string {
  return joinPlace(m[offset], m[offset + 1]);
}

function parseSentence(s: string, ctx: Ctx, out: LifeInput[]): void {
  if (NEGATION_RE.test(s)) return;
  const has = (name: string, kind: string) => out.some((i) => i.place === name && i.kind === kind);

  const moved = MOVED.exec(s);
  if (moved) {
    const name = placeAt(moved, 1);
    if (name)
      out.push(place(ctx, 'home', name, { status: 'current', startDate: thisMonth(ctx.now) }));
  }
  const home = HOME_NOW.exec(s);
  if (home && !/\bused to\b/.test(s)) {
    const name = placeAt(home, 1);
    if (name && !has(name, 'home')) {
      out.push(place(ctx, 'home', name, { status: 'current', additional: ADDITIONAL_RE.test(s) }));
    }
  }
  for (const [r, note] of HOME_PAST) {
    const m = r.exec(s);
    const name = m ? placeAt(m, 1) : '';
    if (name && !has(name, 'home')) {
      const since = /\bfor\s+(\d+|a few|several|many)\s+years?\b/.exec(s)?.[0];
      out.push(
        place(ctx, 'home', name, {
          status: 'past',
          notes: note ?? (since ? `Lived there ${since}` : undefined),
        })
      );
    }
  }

  let tripSeen = false;
  for (const r of TRIP_DONE) {
    const m = r.exec(s);
    const name = m ? placeAt(m, 1) : '';
    if (!name || tripSeen) continue;
    const rest = m?.[3] ?? '';
    tripSeen = true;
    out.push(
      place(ctx, 'trip', name, {
        status: 'done',
        startDate: dateFromPhrase(`${rest} ${s}`, ctx.now, 'past'),
        withPeople: companionsIn(s),
      })
    );
  }
  for (const r of TRIP_PLANNED) {
    const m = r.exec(s);
    const name = m ? placeAt(m, 1) : '';
    if (!name || tripSeen) continue;
    const rest = m?.[3] ?? '';
    const isTripTalk = /\b(?:trip|vacation|holiday|honeymoon|visiting|planning)\b/i.test(s);
    if (!isTripTalk && !TRIP_CONTEXT.test(rest)) continue; // "going to Target" isn't a trip
    const pastTense = PAST_TRIP_HINT.test(rest) && /\b(?:was|were|last|ago)\b/i.test(rest);
    tripSeen = true;
    out.push(
      place(ctx, 'trip', name, {
        status: pastTense ? 'done' : 'planned',
        startDate: dateFromPhrase(rest, ctx.now, pastTense ? 'past' : 'future'),
        withPeople: companionsIn(s),
      })
    );
  }

  for (const r of FAVORITE) {
    const m = r.exec(s);
    if (!m) continue;
    // Group order differs: "my favourite cafe is X" vs "X is my favourite cafe".
    const wordFirst = r === FAVORITE[0];
    const word = wordFirst ? m[1] : (m[3] ?? '');
    const name = wordFirst ? placeAt(m, 2) : placeAt(m, 1);
    if (name && !has(name, 'favorite')) {
      out.push(
        place(ctx, 'favorite', name, {
          status: 'current',
          category: categoryFor(word.toLowerCase()),
        })
      );
    }
  }
  for (const [r, meaning] of MEANINGFUL) {
    const m = r.exec(s);
    const name = m ? placeAt(m, 1) : '';
    if (name) out.push(place(ctx, 'meaningful', name, { meaning, status: 'past' }));
  }
  for (const r of BUCKET) {
    const m = r.exec(s);
    const name = m ? placeAt(m, 1) : '';
    if (name && !has(name, 'bucket_list') && !has(name, 'trip')) {
      out.push(place(ctx, 'bucket_list', name, { status: 'planned' }));
    }
  }
}

/** Place statements in one piece of user text. */
export function parsePlaceStatements(
  text: string,
  source: LifeSource,
  confidence: number,
  opts: { conversationId?: string; now?: Date } = {}
): LifeInput[] {
  const ctx: Ctx = {
    source,
    confidence,
    conversationId: opts.conversationId,
    now: opts.now ?? new Date(),
  };
  const out: LifeInput[] = [];
  for (const s of sentences(text)) parseSentence(s, ctx, out);
  return out;
}

/** Place statements in a third-person summary (inferred, lower confidence). */
export function parsePlaceSummary(
  summary: string,
  opts: { conversationId?: string; now?: Date } = {}
): LifeInput[] {
  return parsePlaceStatements(firstPerson(summary), 'inferred', 0.6, opts);
}
