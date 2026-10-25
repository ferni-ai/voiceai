/**
 * Which short clips each persona renders in its own voice (rendered and
 * served by conversational-audio-cache.ts).
 *
 * @module agents/shared/reaction-clips
 */

/**
 * Every clip the clip player can be asked for, in whoever's voice is on the
 * call: neutral and soft backchannels (backchannel-policy.ts), contextual
 * reactions (backchannel-context.ts), the laugh-along, and the turn-opening
 * "Hmm"/"Mm" (turn-opening-sound.ts). A missing clip plays nothing, so every
 * persona renders all of them (reaction-clip-coverage.test.ts holds this).
 */
// prettier-ignore
export const REACTION_CLIPS: readonly string[] = ['Mm', 'Hmm', 'Yeah', 'Mhm', 'Right', 'Mm-hmm',
  'Oh', '[laughter]', 'Oh no', 'Oof', 'Whoa', 'No way', 'Ha', 'Aw'];

/** Each persona's own sounds on top of REACTION_CLIPS. */
const EXTRAS: Readonly<Record<string, readonly string[]>> = {
  ferni: ['I hear you'],
  'maya-santos': ['Okay', 'I hear you'],
  'peter-john': ['Okay', 'Interesting', 'Oh!'],
  'alex-chen': ['Got it', 'Okay', 'I see'],
  'jordan-taylor': ['Oh!', 'Yes!', 'Uh-huh'],
  'nayan-patel': ['Yes', 'Indeed', 'I see', 'Ah'],
};

/** Every persona whose voice can be on a call: the team and the financial legends. */
export const CLIP_PERSONAS: readonly string[] = [
  ...Object.keys(EXTRAS),
  'joel-dickson',
  'john-bogle',
  'peter-lynch',
];

/** A persona's full clip list: the shared reactions plus its own extras. */
export function backchannelsFor(personaId: string): string[] {
  return [...new Set([...REACTION_CLIPS, ...(EXTRAS[personaId] ?? [])])];
}

/**
 * What worker boot renders: Ferni's full list (calls start on Ferni) and only
 * the teammates' extras, so boot makes fewer TTS calls than before, not more.
 * The boot prewarm races a 10 s budget (gce/warmup.ts) and serves no clip
 * until it finishes; ~100 more calls for personas most calls never reach would
 * only lengthen that window. A teammate's reactions (9-14 one-word clips, in
 * parallel) render when its voice is set up for a call, seconds before its
 * first pause (warmPersonaReactions).
 */
export function bootBackchannels(personaId: string): readonly string[] {
  return personaId === 'ferni' ? backchannelsFor('ferni') : (EXTRAS[personaId] ?? []);
}

/**
 * Presence-sound takes Seth kept (41 rated, 2026-10, Ferni's instant clone on
 * sonic-3.6-2026-08-27); he rejected every synthesized or voice-converted hum,
 * snore and whistle. Exact transcripts, tags and all (voiced-take-render.ts
 * passes on the ones each voice honors). The sung hum is not a real tune yet.
 */
// prettier-ignore
export const VOICED_TAKES = {
  'thinking-hum': ['Hmmm.', '<speed ratio="0.8"/><volume ratio="0.6"/>Hmmmm.', 'Mmm... hm.',
    '<volume ratio="0.7"/>Mmm-hmm-hmm.'],
  recognition: ['<emotion value="excited"/>Ohh!', '<emotion value="happy"/>Oh, mm!', 'Ohhh, yeah.',
    '<emotion value="excited"/>Ah!'],
  surprised: ['Huh! [laughter]', '<emotion value="excited"/>Ha! Huh.', '[laughter] Huh!'],
  'content-sigh': ['<emotion value="calm"/>Ahhh.', '<emotion value="calm"/><speed ratio="0.8"/>Mmm, ahh.',
    '<emotion value="content"/>Haahh.'],
  'morning-yawn': ['<emotion value="calm"/><speed ratio="0.7"/>Aaaahhh, mmm.',
    '<emotion value="calm"/><speed ratio="0.75"/>Ohhh, aaahh, okay.'],
  laugh: ['[laughter]', 'Ha, [laughter]', '<emotion value="happy"/>[laughter] oh man.'],
  aww: ['<emotion value="happy"/>Aww.', '<emotion value="happy"/><speed ratio="0.85"/>Awww, mm.'],
  mmhm: ['Mm-hm.', '<emotion value="happy"/>Mmhm!', '<volume ratio="0.7"/>Mm. Mm-hm.'],
  'sung-hum': ['<speed ratio="0.8"/>Hmm hmm hmmm, hm hm hmmm.'],
} satisfies Record<string, readonly string[]>;

export type VoicedCategory = keyof typeof VOICED_TAKES;

/**
 * BACKCHANNEL_TIMING's takes per backchannel token (backchannel-timing.ts), in
 * whichever persona voice is on the call: with five clips, 30% of prod's
 * backchannels (1.7 a minute, 60 calls) repeated one heard inside 60 s (sounds
 * audit 2026-10-22). Of 65 candidates rendered in 10 persona voices, kept where
 * three blind Gemini judges per voice scored the take >= 4 of 5 as a natural
 * listener's backchannel in every voice, at <= 700 ms median length:
 * voiceai-evidence/backchannel-takes-2026-10-23. `soft` ones also scored >= 4
 * for "still OK right after sad news" and play in soft and heavy moments too;
 * `bright` ones only when the bag may use bright takes. No "Right" take passed
 * (the plain one scores 3.7). No text matches another clip once tags are
 * stripped (the cache key), so none replays another clip's audio.
 */
// prettier-ignore
export const BACKCHANNEL_TAKES: Readonly<
  Record<'soft' | 'bright', Readonly<Record<string, readonly string[]>>>
> = {
  soft: {
    Mm: ['Mm.', 'Mmm.', 'Mm,'],
    Mhm: ['Mhm.', 'Mhmm.', 'M-hm.', '<volume ratio="0.7"/>Mhm...', '<emotion value="calm"/>Mhm-hm.'],
    'Mm-hmm': ['Mm-hmm.', 'Mmm-hmm.', 'Mm-hmmm.', 'Mhm-hmm.', '<speed ratio="1.15"/>Mm-hmm...'],
  },
  bright: {
    'Mm-hmm': ['Uh-huh.'],
    Yeah: ['Yeahh.', 'Yeah,', 'Yeh.', 'Yeah...'],
  },
};
