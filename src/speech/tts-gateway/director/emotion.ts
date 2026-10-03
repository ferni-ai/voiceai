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
const HEAVY =
  /\b(?:sorry|loss|lost|passed away|passing|died|death|grief|grieving|hard|hurts?|pain(?:ful)?|scared|afraid|anxious|worried|struggl(?:e|ing)|difficult|tough|sad|lonely|sick|cancer|diagnosis|breakup|divorce|fired|laid off|overwhelmed|exhausted)\b/i;
const BRIGHT =
  /\b(?:congrat(?:s|ulations)|amazing|awesome|wonderful|fantastic|great|incredible|brilliant|delighted|celebrate|so happy|excited|proud of you|love that|yay)\b/i;

/** How the reply's opening words read. Heavy wins over bright. */
export function readValence(text: string): Valence {
  if (HEAVY.test(text)) return 'heavy';
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
}

export interface EmotionDecision {
  emotion: StableEmotion | undefined;
  source: 'authored' | 'mapped' | 'session' | 'words' | 'previous' | 'bridge' | 'none';
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
