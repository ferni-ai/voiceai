/**
 * One emotion per reply (owner ruling 1; spec §2.3, §5.1).
 *
 * Inputs, in priority order: the emotion the LLM wrote, the session's
 * emotion hint, the reply's own opening words, and the previous reply's
 * emotion. The output is always one of STABLE_EMOTIONS or nothing (the voice
 * then takes its tone from the words).
 *
 * STABLE_EMOTIONS is the measured-stable allowlist: continuation-tts's
 * CALM_EMOTIONS. Big emotions (excited, surprised...) widened Ferni's pitch
 * range from 8.7 to 10.9 semitones and swung it 6.4-10.9 st between turns
 * (docs/plans/2026-09-27-human-level-ferni.md); every value here is a valid
 * Sonic emotion (checked against the gateway SSML validator in tests).
 *
 * Cartesia only honours an emotion consistent with the words, so a candidate
 * the opening words contradict is vetoed, and a reply that was sympathetic
 * last turn is not tagged bright this turn unless its own words are bright.
 *
 * @module speech/tts-gateway/director/emotion
 */

export const STABLE_EMOTIONS = [
  'calm',
  'content',
  'curious',
  'affectionate',
  'sympathetic',
  'contemplative',
] as const;
export type StableEmotion = (typeof STABLE_EMOTIONS)[number];

export type Valence = 'heavy' | 'bright' | 'inquisitive' | 'neutral';

const STABLE = new Set<string>(STABLE_EMOTIONS);

/** Nearest calm emotion for the ones that swing the voice; absent = no tag. */
const NEAREST_STABLE: Record<string, StableEmotion> = {
  excited: 'content',
  happy: 'content',
  joyful: 'content',
  enthusiastic: 'content',
  elated: 'content',
  triumphant: 'content',
  proud: 'content',
  amused: 'content',
  playful: 'content',
  grateful: 'affectionate',
  loving: 'affectionate',
  warm: 'affectionate',
  tender: 'affectionate',
  caring: 'affectionate',
  sad: 'sympathetic',
  melancholic: 'sympathetic',
  disappointed: 'sympathetic',
  hurt: 'sympathetic',
  apologetic: 'sympathetic',
  worried: 'sympathetic',
  anxious: 'sympathetic',
  scared: 'sympathetic',
  nervous: 'sympathetic',
  empathetic: 'sympathetic',
  surprised: 'curious',
  amazed: 'curious',
  intrigued: 'curious',
  fascinated: 'curious',
  interested: 'curious',
  peaceful: 'calm',
  serene: 'calm',
  relaxed: 'calm',
  neutral: 'calm',
  relieved: 'calm',
  thoughtful: 'contemplative',
  pensive: 'contemplative',
  reflective: 'contemplative',
  nostalgic: 'contemplative',
  wistful: 'contemplative',
};

/** Which emotions the words can carry (Cartesia: emotion must fit the words). */
const FITS: Record<Valence, ReadonlySet<StableEmotion>> = {
  heavy: new Set(['sympathetic', 'calm', 'contemplative']),
  bright: new Set(['content', 'affectionate', 'curious', 'calm']),
  inquisitive: new Set(STABLE_EMOTIONS),
  neutral: new Set(STABLE_EMOTIONS),
};

const FROM_WORDS: Partial<Record<Valence, StableEmotion>> = {
  heavy: 'sympathetic',
  bright: 'content',
  inquisitive: 'curious',
};

// Whole words only: "greatly" is not "great" (substring-classifier pitfall).
/** A loss, illness or grief word: one is enough to make a reply heavy. */
const HEAVY_LEXEME =
  /\b(?:loss|passed away|died|death|dying|grief|griev(?:e|ing)|funeral|miscarriage|cancer|tumou?r|diagnos(?:is|ed)|chemo(?:therapy)?|hospice|illness|dementia|breakup|divorce|laid off)\b/i;
/**
 * A repair apology asks the user to repeat; it is not sympathy. "Sorry,
 * could you say that again?" / "Sorry I lost track, what was the hard part?"
 * read by their other words, never as heavy.
 */
const REPAIR =
  /\bsorry\b.*\b(?:could you|can you|say that again|(?:didn'?t|did not) catch|missed that|what was (?:that|the)|come again|repeat|lost track)\b/i;
/** An apology outside a repair is sympathy: "I'm so sorry." */
const SORRY = /\bsorry\b/i;
/**
 * Hard/tough said OF the user's situation ("that sounds really hard", "that
 * must be hard"), not of a question or a call ("hard question", "tough call").
 */
const EMPATHY_FRAME =
  /\b(?:sounds?|must be|must have been|has been|have been|been|that's|that is|it's|it is|so|really|incredibly|truly)\s+(?:(?:really|so|incredibly|truly|very)\s+)?(?:hard|tough|difficult|painful|scary|lonely|overwhelming|exhausting|heartbreaking)\b(?!\s+(?:question|call|one|part|choice|decision|to (?:say|tell|beat)))/i;
/**
 * Words that are heavy only in company: alone they are routine ("that's a
 * hard question", "sick!" as praise). Two of them together read as heavy.
 */
const HEAVY_CUE =
  /\b(?:lost|passing|terminal|stroke|hard|hurts?|pain(?:ful)?|scared|afraid|anxious|worried|struggl(?:e|ing)|difficult|tough|sad|lonely|sick|fired|overwhelmed|exhausted)\b/gi;
const BRIGHT =
  /\b(?:congrat(?:s|ulations)|amazing|awesome|wonderful|fantastic|great|incredible|brilliant|delighted|celebrate|so happy|excited|proud of you|love that|yay)\b/i;

function isHeavy(text: string): boolean {
  if (HEAVY_LEXEME.test(text)) return true;
  // A repair turn is read only by its loss words, not by its other cues.
  if (REPAIR.test(text)) return false;
  if (SORRY.test(text) || EMPATHY_FRAME.test(text)) return true;
  return (text.match(HEAVY_CUE)?.length ?? 0) >= 2;
}

/** How the reply's opening words read. Heavy wins over bright. */
export function readValence(text: string): Valence {
  if (isHeavy(text)) return 'heavy';
  if (BRIGHT.test(text)) return 'bright';
  if (text.includes('?')) return 'inquisitive';
  return 'neutral';
}

export interface EmotionInput {
  /** The emotion the LLM wrote for this reply, if any. */
  authored?: string;
  /** The session's emotion hint (gateway config). */
  sessionHint?: string;
  /** The reply's first phrase, already cleaned. */
  openingText: string;
  /** The previous reply's emotion in this session. */
  previous?: string;
  /** A tone answering how the caller sounds (prosody-response.ts), when that lever is live. */
  prosody?: StableEmotion;
}

export interface EmotionDecision {
  emotion: StableEmotion | undefined;
  source: 'authored' | 'mapped' | 'session' | 'prosody' | 'words' | 'previous' | 'bridge' | 'none';
}

function toStable(value: string | undefined): { emotion?: StableEmotion; mapped: boolean } {
  const v = value?.trim().toLowerCase();
  if (!v) return { mapped: false };
  if (STABLE.has(v)) return { emotion: v as StableEmotion, mapped: false };
  return { emotion: NEAREST_STABLE[v], mapped: true };
}

function choose(input: EmotionInput, valence: Valence): EmotionDecision {
  const fits = FITS[valence];
  const authored = toStable(input.authored);
  if (authored.emotion && fits.has(authored.emotion)) {
    return { emotion: authored.emotion, source: authored.mapped ? 'mapped' : 'authored' };
  }
  const hint = toStable(input.sessionHint).emotion;
  if (hint && fits.has(hint)) return { emotion: hint, source: 'session' };
  if (input.prosody && fits.has(input.prosody)) return { emotion: input.prosody, source: 'prosody' };
  const fromWords = FROM_WORDS[valence];
  if (fromWords) return { emotion: fromWords, source: 'words' };
  const previous = toStable(input.previous).emotion;
  if (previous && fits.has(previous)) return { emotion: previous, source: 'previous' };
  return { emotion: undefined, source: 'none' };
}

export function decideEmotion(input: EmotionInput): EmotionDecision {
  const valence = readValence(input.openingText);
  const decision = choose(input, valence);
  const brightened = decision.emotion === 'content' || decision.emotion === 'affectionate';
  if (input.previous === 'sympathetic' && brightened && valence !== 'bright') {
    return { emotion: 'calm', source: 'bridge' };
  }
  return decision;
}
