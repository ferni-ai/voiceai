/**
 * Which uses of the caller's name in a reply address them ("That's rough,
 * Sam.", "Yes, Sam, I'm sure.", "Sam, really?"), as opposed to naming someone
 * ("my friend, Sam", "Alex, Jo, Sam"), answering ("Who goes first? Sam.") or
 * being an ordinary word ("Hope. That's what keeps you going."). Used by
 * name-gate.ts, which decides which of them a reply keeps.
 *
 * @module agents/personas/name-vocatives
 */

const GREETINGS = ['hey', 'hi', 'hiya', 'hello', 'oh'];
const GREETING_WORD = /^(?:hey|hi|hiya|hello|oh)\s+/i;
/** Words that open a new clause after ", Sam,": the name was addressing them. */
const CLAUSE_START = new Set(
  (
    "i i'm i'd i've i'll you you're you've you'll you'd we we're let's it it's that that's " +
    "this there there's what what's how how's why when honestly seriously listen look come " +
    'but so because ' +
    'please trust believe go take tell just'
  ).split(' ')
);
/**
 * NAME_FALLING_SPLIT: more words that open a clause after ", Sam,". Without
 * them ", Sam, and you handled it well" was never found, so mid-call it kept
 * the name and a kept name ran on: "a lot, | Sam, and you..." rose 4.41 st,
 * "a lot, | Sam. | And you..." 1.44 st (voiceai-evidence/name-intonation-2026-10-24).
 */
const CLAUSE_START_SPLIT = new Set(
  "and have catch let hope keep enjoy get talk see stay don't".split(' ')
);
/** After ", Sam, and": a new clause ("and you handled it"), not a noun phrase ("and the kids"). */
const AND_CLAUSE = new Set(
  (
    "you you're you've you'll you'd i i'm i've i'll i'd it it's that that's we we're we'll " +
    "let let's have keep hope enjoy get take tell call text thanks thank don't remember make go come"
  ).split(' ')
);
/** A hello before ", Sam,": the hello would be left alone ("Hey, and welcome back!"). */
const HELLO_ONLY = /^\s*(?:(?:oh|ah|well|okay|ok),?\s+)?(?:hey|hi|hiya|hello)(?:\s+there)?\s*$/i;
/** A goodbye before ", Sam, and": the name already falls inside it (2026-10-24 F01, X4). */
const GOODBYE_LEAD =
  /^\s*(?:take care|see you(?: later| soon| tomorrow)?|bye(?:-bye)?|goodbye|talk (?:to you )?soon|good ?night|sleep well)\s*$/i;
/** `text` ends inside an open quote ('"Thanks' / '“Thanks'). */
const inQuote = (text: string): boolean =>
  (text.match(/"/g)?.length ?? 0) % 2 === 1 || text.lastIndexOf('“') > text.lastIndexOf('”');
/** Words before a list item: "to Jo, Sam, and", "with you, Sam, and". */
const LIST_LEAD = new Set('to with and between like from for than'.split(' '));
const OBJECT = new Set('me him her them us'.split(' '));

/**
 * Whether `word` after ", Sam," opens a clause that addresses the caller, for
 * NAME_FALLING_SPLIT; null while the text that decides it is still to come.
 * Anything less clear is left as it was: a list ("Say hi to Jo, Sam, and the
 * kids", "It was me, Sam, and the dog", "Alex, Sam, and I went"), a hello
 * before the name ("Hey, Sam, and welcome back!"), a short goodbye before
 * "and" ("Take care, Sam, and"), words inside a quote ('"Thanks, Sam, and
 * good luck," she said'). ", Sam, and I ..." is a clause only after a whole
 * clause or a discourse word ("I hear you, Sam, and I mean it", "Thanks, Sam,
 * and I mean it"), never after a name or noun that opens the sentence.
 */
function splitClauseStart(
  word: string,
  clause: string,
  before: string,
  after: string,
  final: boolean
): boolean | null {
  if (!CLAUSE_START_SPLIT.has(word) || HELLO_ONLY.test(clause) || inQuote(before)) return false;
  const words = clause.trim().split(/\s+/);
  const last = words[words.length - 1] ?? '';
  const capital = /^\p{Lu}/u.test(last);
  if (
    OBJECT.has(last.toLowerCase()) ||
    LIST_LEAD.has((words[words.length - 2] ?? '').toLowerCase())
  )
    return false;
  if (capital && (words.length > 1 || !DISCOURSE.has(last.toLowerCase()))) return false;
  if (word !== 'and') return true;
  if (GOODBYE_LEAD.test(clause)) return false;
  const next = /^\s*,\s*and\s+([\p{L}'’]+)([\s\S]?)/u.exec(after);
  if (!next || (next[2] === '' && !final)) return final ? false : null;
  return AND_CLAUSE.has(next[1].toLowerCase().replace('’', "'"));
}
/** "my friend, Sam" renames someone; it doesn't address the caller. */
const APPOSITIVE = new RegExp(
  `\\b(?:my|your|his|her|their|our|the|a|an|this|that)\\s+(?:[\\p{L}'’-]+\\s+)?(?:${(
    'friend friends brother sister son daughter mom mum dad mother father wife husband partner ' +
    'boss cousin uncle aunt kid kids boy girl guy coworker colleague neighbor neighbour roommate ' +
    'buddy teacher doctor nephew niece grandson granddaughter grandma grandpa boyfriend ' +
    'mentor pastor priest rabbi landlord trainer sponsor counselor client student classmate teammate ' +
    'girlfriend fiance fiancee manager baby child nurse dog cat puppy coach therapist ex'
  )
    .split(' ')
    .join('|')})\\s*$`,
  'iu'
);
/** Words that open a sentence and then address someone ("Yes, Sam"), not a list ("Alex, Sam"). */
const DISCOURSE = new Set(
  (
    'yes yeah yep no nope okay ok well oh hey hi right sure so but and really honestly ' +
    'seriously look listen alright aw ah wow man thanks sorry good great fair true wait ' +
    'hmm hm mm come fine totally exactly absolutely see'
  ).split(' ')
);
/**
 * Names that are also ordinary words ("Rich, isn't it?", "Hope. That's what
 * keeps you going."): at a sentence start they go only when a clause that
 * addresses the caller follows ("Will, you did great").
 */
const WORD_NAMES = new Set(
  (
    'will hope grace joy mark rich faith rose dawn bill pat sue art amber ruby jack sky hunter ' +
    'chance chase grant june may april summer autumn winter august rob drew guy sunny ' +
    'honey holly ivy lily iris daisy jade pearl ray rusty sandy stormy taylor victor'
  ).split(' ')
);
/** After a question, "Sam, you did great" still addresses them; "Sam, I think." answers. */
const ADDRESSING = new Set(
  "you you're you've you'll you'd your i've i'm i'll i'd listen look honestly seriously come please".split(
    ' '
  )
);

/** A caller named May or June: "April, May, June" is the calendar. */
const CALENDAR = new Set(
  'january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday'.split(
    ' '
  )
);
/** The words either side of `start`..`end` include a month or weekday. */
function inCalendarList(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start).match(/([\p{L}]+)[\s,]*$/u)?.[1] ?? '';
  const after = text.slice(end).match(/^[\s,]*([\p{L}]+)/u)?.[1] ?? '';
  return CALENDAR.has(before.toLowerCase()) || CALENDAR.has(after.toLowerCase());
}

/** A full stop after these doesn't end a sentence ("Dr. Will"). */
const ABBREVIATION = /\b(?:dr|mr|mrs|ms|st|jr|sr|prof|mt)\.\s+$/i;
export const LETTER = /\p{L}/u;
const LEAD = /^(?:\s|<[^>]*>|\[[^\]]*\])*/;

/** A stretch of the reply that addresses the caller by name. */
export interface Vocative {
  start: number;
  end: number;
  /** What replaces it when it goes ("" or ","). */
  with: string;
  /** Capitalise the first letter after it when it goes (the name opened a sentence). */
  capNext: boolean;
  /** Where the name ends when it runs on into its sentence (for a falling name). */
  fallAt?: number;
  /** Where the name itself starts and ends (inside start..end). */
  nameAt: number;
  nameEnd: number;
}

/**
 * Sentence starts (past any markup): the reply's first spoken character and
 * after . ! ? … plus space, but not after "Dr.". `afterQuestion`: the
 * sentence before asked something, so a name here may be the answer.
 */
function sentenceStarts(text: string): Array<{ at: number; afterQuestion: boolean }> {
  const lead = (i: number): number => i + (text.slice(i).match(LEAD)?.[0].length ?? 0);
  const starts = [{ at: lead(0), afterQuestion: false }];
  for (const m of text.matchAll(/[.!?…]+["')\]]?\s+/g)) {
    const end = m.index + m[0].length;
    if (ABBREVIATION.test(text.slice(Math.max(0, end - 8), end))) continue;
    starts.push({ at: lead(end), afterQuestion: m[0].includes('?') });
  }
  return starts;
}

/**
 * Vocative uses of `name` in `text`, and the first position whose answer
 * still depends on text not here yet (null when everything is decided).
 * `final`: no more text is coming, so the end of `text` ends the reply.
 * `split`: NAME_FALLING_SPLIT's wider clause starts (CLAUSE_START_SPLIT).
 */
export function findVocatives(
  text: string,
  name: string,
  final: boolean,
  split = false
): { found: Vocative[]; undecidedAt: number | null } {
  const found: Vocative[] = [];
  let undecidedAt: number | null = null;
  const undecided = (i: number): void => {
    undecidedAt = undecidedAt === null ? i : Math.min(undecidedAt, i);
  };
  /** What follows the name ending at `i`. */
  const follow = (i: number): 'word' | 'space' | 'punct' | 'end' | 'wait' => {
    const c = text.charAt(i);
    if (c === '') return final ? 'end' : 'wait';
    if (LETTER.test(c) || /[\d'’]/.test(c)) return 'word';
    if (c === '-') {
      // "Mary-Kate" is another name; "Sam - " is a dash.
      const next = text.charAt(i + 1);
      if (next === '') return final ? 'punct' : 'wait';
      if (LETTER.test(next)) return 'word';
    }
    if (/\s/.test(c)) {
      const after = text.slice(i);
      if (/^\s+[—–]/.test(after)) return 'punct'; // "Sam — I hear you"
      if (!final && /^\s+$/.test(after)) return 'wait';
      return 'space';
    }
    return 'punct';
  };
  // The model sometimes writes "sam"; a name that is also a word must match as written.
  const wordName = WORD_NAMES.has(name.toLowerCase());
  const norm = (t: string): string => (wordName ? t : t.toLowerCase());
  const isName = (rest: string): boolean => norm(rest.slice(0, name.length)) === norm(name);
  /** A start of the name that more text could complete. */
  const partialName = (rest: string): boolean =>
    !final && rest.length < name.length && norm(name).startsWith(norm(rest));
  /** The word after ", " at `i`, lowercased; null when not here yet, '' when not a word. */
  const nextWord = (i: number): string | null => {
    const after = text.slice(i).replace(/^\s*[,—–]?\s*/, '');
    if (after === '') return final ? '' : null;
    if (!LETTER.test(after.charAt(0))) return '';
    const word = after.match(/^([\p{L}'’]+)([\s\S]?)/u);
    if (!word || (word[2] === '' && !final)) return null;
    return word[1].toLowerCase().replace('’', "'");
  };

  // ", Sam." | ", Sam" ending the reply | ", Sam, I'm sure"
  for (const m of text.matchAll(/,\s*/g)) {
    const at = m.index;
    const nameAt = at + m[0].length;
    const rest = text.slice(nameAt);
    if (partialName(rest)) {
      undecided(at);
      continue;
    }
    if (!isName(rest)) continue;
    const end = nameAt + name.length;
    const f = follow(end);
    if (f === 'wait') {
      undecided(at);
      continue;
    }
    if (f === 'word' || f === 'space') continue; // ", Sam said", ", Sam and I"
    if (CALENDAR.has(name.toLowerCase()) && inCalendarList(text, nameAt, end)) continue;
    // "my friend, Sam" and "Alex, Jo, Sam" name someone.
    const before = text.slice(0, at);
    const clause = before.slice(
      Math.max(...[',', '.', '!', '?', '…'].map((p) => before.lastIndexOf(p))) + 1
    );
    if (APPOSITIVE.test(clause)) continue;
    const listed = clause.trim().match(/^\p{Lu}[\p{L}'’-]*$/u);
    const delimiter = before.charAt(before.length - clause.length - 1);
    if (listed && delimiter === ',' && !DISCOURSE.has(listed[0].toLowerCase())) continue;
    if (f === 'end' || /^\s*[.!?…—–;:]/.test(text.slice(end))) {
      // "What got you through? Honestly, Faith." may be the word answering it.
      if (wordName && /\?[^.!?]*$/.test(text.slice(0, at))) continue;

      found.push({ start: at, end, with: '', capNext: false, nameAt, nameEnd: end });
      continue;
    }
    if (text.charAt(end) !== ',') continue;
    // ", Sam, I'm sure" addresses them; ", Sam, called" or ", Sam, [laughter]" isn't clear.
    const word = nextWord(end);
    if (word === null) {
      undecided(at);
      continue;
    }
    const opens =
      CLAUSE_START.has(word) ||
      (split && splitClauseStart(word, clause, before, text.slice(end), final));
    if (opens === null) undecided(at);
    else if (opens) {
      found.push({
        start: at,
        end: end + 1,
        with: ',',
        capNext: false,
        fallAt: end,
        nameAt,
        nameEnd: end,
      });
    }
  }

  // "Sam, really?" | "Hey Sam, ..." | "… Sam" ending the reply
  for (const { at: s, afterQuestion } of sentenceStarts(text)) {
    let rest = text.slice(s);
    if (
      !final &&
      /^[a-z]*$/i.test(rest) &&
      GREETINGS.some((g) => g.startsWith(rest.toLowerCase()))
    ) {
      undecided(s); // "", "He", "Hey": a greeting may still be coming
      continue;
    }
    const greet = rest.match(GREETING_WORD)?.[0] ?? '';
    rest = rest.slice(greet.length);
    if (partialName(rest)) {
      undecided(s);
      continue;
    }
    if (!isName(rest)) continue;
    const nameAt = s + greet.length;
    const end = nameAt + name.length;
    const f = follow(end);
    if (f === 'wait') {
      undecided(s);
      continue;
    }
    if (f === 'word' || f === 'space') continue; // "Sam's", "Sam and I"
    // After a question ("Who goes first? Sam.") or for a name that is also a word
    // ("Hope. That's what..."), only "Sam, you did great" addresses them.
    if (afterQuestion && wordName) continue; // "What carried you? Faith, you said."
    if (afterQuestion || wordName) {
      const word = nextWord(end);
      if (word === null) {
        undecided(s);
        continue;
      }
      if (!/^\s*[,—–]/.test(text.slice(end))) continue;
      if (!ADDRESSING.has(word)) continue; // "Will, you did great"; not "Rich, that's the word"
    }
    if (CALENDAR.has(name.toLowerCase()) && inCalendarList(text, nameAt, end)) continue;
    if (/^oh\s/i.test(greet)) {
      // "Oh Sam, that's awful" -> "Oh, that's awful": the "Oh" is the reaction, not a hello.
      found.push({ start: nameAt - 1, end, with: '', capNext: false, nameAt, nameEnd: end });
      continue;
    }
    // The name goes with its comma or dash (a hello before it goes too: "Hey Sam,"
    // mid-call is a second hello); a sentence that was only the name goes whole.
    const tail = text.slice(end).match(/^(?:\s*[,—–;:]\s*|[.!?…]+\s*)?/)?.[0] ?? '';
    const runsOn = f !== 'end' && /^\s*[,—–]/.test(tail);
    found.push({
      start: greet ? s : nameAt,
      end: end + tail.length,
      with: '',
      capNext: true,
      fallAt: runsOn ? end : undefined,
      nameAt,
      nameEnd: end,
    });
  }
  found.sort((a, b) => a.start - b.start);
  const merged: Vocative[] = []; // a stretch found from both sides counts once
  for (const v of found)
    if (!merged.length || v.start >= merged[merged.length - 1].end) merged.push(v);
  return { found: merged, undecidedAt };
}

/**
 * Apply the decisions to `text`: the first vocative `mayKeep` accepts stays
 * (ending its own sentence when `falling`); every other one goes.
 */
export function applyVocatives(
  text: string,
  found: readonly Vocative[],
  mayKeep: (v: Vocative) => boolean,
  falling: boolean
): string {
  let out = '';
  let at = 0;
  let kept = false;
  let cap = false;
  const emit = (s: string): void => {
    if (cap) {
      const i = s.search(LETTER);
      if (i >= 0) {
        s = s.slice(0, i) + s.charAt(i).toUpperCase() + s.slice(i + 1);
        cap = false;
      }
    }
    out += s;
  };
  for (const v of found) {
    emit(text.slice(at, v.start));
    const said = text.slice(v.start, v.end);
    if (!kept && mayKeep(v)) {
      kept = true;
      if (falling && v.fallAt !== undefined) {
        // "Sam, take care" -> "Sam. Take care": the name ends its own sentence.
        const cut = v.fallAt - v.start;
        emit(`${said.slice(0, cut)}.${said.slice(cut).replace(/^\s*[,—–]/, '')}`);
        cap = true;
      } else emit(said);
    } else {
      emit(v.with);
      if (v.capNext) cap = true;
    }
    at = v.end;
  }
  emit(text.slice(at));
  return out;
}
