/**
 * DJ Speech Engine - What to Say
 *
 * This module contains ALL speech/phrase generation for the DJ system:
 * - Intro phrases when track starts
 * - Outro phrases when track ends
 * - Mid-song interjections
 * - Transition phrases
 * - LLM-powered contextual commentary
 *
 * All functions are focused on CONTENT generation - they don't decide
 * WHEN to speak (that's the Decision Engine's job).
 *
 * @module audio/dj-speech-engine
 */

import { callLLM } from '../services/llm/llm-utils.js';
import { createLogger } from '../utils/safe-logger.js';
import type { MusicTrack } from './music-player.js';

const log = createLogger({ module: 'DJSpeechEngine' });

// ============================================================================
// LLM CACHE FOR MUSIC INTERJECTIONS
// ============================================================================

/** Cache for LLM-generated interjections */
const llmInterjectionCache = new Map<string, { content: string; generatedAt: number }>();
const LLM_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_SIZE = 100;

/** Pending LLM generation promises to avoid duplicate calls */
const pendingGenerations = new Map<string, Promise<string | null>>();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Context for generating track-related speech
 */
export interface TrackSpeechContext {
  track: MusicTrack;
  personaId: string;
  /** Optional fact about the artist for contextual commentary */
  artistFact?: string;
  /** Whether user has heard this track before */
  isRepeat?: boolean;
  /** User's apparent mood */
  userMood?: string;
}

/**
 * Moment types for interjections
 */
export type InterjectionMoment =
  | 'track_start'
  | 'mid_song'
  | 'track_end'
  | 'buildup'
  | 'drop'
  | 'appreciation'
  | 'check_in'
  | 'user_liked'
  | 'user_skipped';

// ============================================================================
// PERSONA PHRASE TEMPLATES
// ============================================================================

/**
 * Ferni's DJ Voice DNA - compact for LLM prompt injection
 */
const FERNI_DJ_VOICE_DNA = `
## FERNI AS DJ
You're Ferni - a warm, curious life coach who also has great taste in music.
When you comment on music, you're sharing genuine appreciation, not performing.

## VOICE QUALITIES
- Brief: 1-2 sentences MAX. This isn't a speech.
- Genuine: Like telling a friend about a song you love
- Physical: "This one hits", "Gives me chills", "Makes me want to move"
- Warm but not cheesy: No "bangers" or DJ clichés

## THINGS FERNI SAYS AS DJ
- "Oh, I love this part coming up"
- "There's something about this song"
- "{Artist} just gets it, you know?"
- "This takes me back"

## THINGS FERNI NEVER SAYS
- "What a banger!" / "This slaps!" (try-hard)
- "Now playing..." (robotic)
- "You're gonna love this" (presumptuous)
- Generic hype phrases
`;

/**
 * Persona-specific outro phrases - ALWAYS include track info for DJ feel
 */
const PERSONA_OUTRO_PHRASES: Record<string, (track: string, artist?: string) => string[]> = {
  ferni: (track, artist) => [
    `<break time="200ms"/>Mm, ${artist ? `"${track}" by ${artist}` : `"${track}"`}. <break time="200ms"/>I love sharing music with you.`,
    `<break time="200ms"/>${artist ? `${artist}, "${track}"` : `"${track}"`}. <break time="200ms"/>How did that land for you?`,
    `<break time="200ms"/>That was ${artist ? `${artist}` : `"${track}"`}. <break time="200ms"/>Nice little moment there.`,
    `<break time="200ms"/>And that was ${artist ? `"${track}" by ${artist}` : `"${track}"`}. <break time="200ms"/>Sometimes we just need a musical pause.`,
  ],
  peter: (track, artist) => [
    `<break time="200ms"/>That was ${artist ? `"${track}" by ${artist}` : `"${track}"`}. <break time="150ms"/>Good stuff.`,
    `<break time="200ms"/>${artist ? `${artist}, "${track}"` : `"${track}"`}. <break time="150ms"/>Solid choice.`,
    `<break time="200ms"/>And that's ${artist ? `"${track}"` : `that track`}. <break time="150ms"/>What else is on your mind?`,
  ],
  maya: (track, artist) => [
    `<break time="200ms"/>${artist ? `"${track}" by ${artist}` : `"${track}"`}. <break time="200ms"/>Beautiful.`,
    `<break time="200ms"/>Mm. <break time="150ms"/>That was ${artist ? `${artist}` : `nice`}. <break time="200ms"/>How are you feeling?`,
    `<break time="200ms"/>And that was ${artist ? `"${track}"` : `that one`}. <break time="200ms"/>Take a breath.`,
  ],
  jordan: (track, artist) => [
    `<emotion value="happy"/><break time="150ms"/>And that was ${artist ? `"${track}" by ${artist}` : `"${track}"`}! <break time="100ms"/>Good stuff!`,
    `<emotion value="happy"/><break time="150ms"/>${artist ? `${artist}` : `Nice track`}! <break time="100ms"/>What did you think?`,
    `<break time="150ms"/>That was ${artist ? `"${track}"` : `fun`}! <break time="150ms"/>Ready for more?`,
  ],
  alex: (track, artist) => [
    `<break time="150ms"/>That was ${artist ? `"${track}" by ${artist}` : `"${track}"`}. <break time="150ms"/>Nice selection.`,
    `<break time="150ms"/>${artist ? `${artist}, "${track}"` : `"${track}"`}. <break time="150ms"/>What's next on the agenda?`,
  ],
  nayan: (track, artist) => [
    `<break time="200ms"/>Ah. <break time="100ms"/>${artist ? `"${track}" by ${artist}` : `"${track}"`}. <break time="200ms"/>Music has a way of speaking what words cannot.`,
    `<break time="200ms"/>That was ${artist ? `${artist}` : `beautiful`}. <break time="200ms"/>Sometimes silence after music is its own gift.`,
  ],
};

/**
 * Persona-specific transition phrases (when changing tracks)
 */
const PERSONA_TRANSITION_PHRASES: Record<string, string[]> = {
  ferni: [
    '<break time="100ms"/>Sure. <break time="100ms"/>Let me find something else.',
    '<break time="100ms"/>Coming right up.',
    '<break time="100ms"/>New music on the way.',
  ],
  peter: [
    '<break time="100ms"/>Alright, <break time="100ms"/>switching it up.',
    '<break time="100ms"/>Coming right up.',
    '<break time="100ms"/>Let me change that for you.',
  ],
  maya: [
    '<break time="150ms"/>Of course. <break time="100ms"/>A new selection.',
    '<break time="150ms"/>Let\'s shift the energy.',
    '<break time="150ms"/>Something different, then.',
  ],
  jordan: [
    '<emotion value="happy"/><break time="100ms"/>Got it! <break time="100ms"/>Coming up!',
    '<break time="100ms"/>Switching tracks!',
    '<emotion value="happy"/><break time="100ms"/>On it!',
  ],
  alex: [
    '<break time="100ms"/>Certainly. <break time="100ms"/>Changing tracks.',
    '<break time="100ms"/>Of course. <break time="100ms"/>New selection coming.',
  ],
  nayan: [
    '<break time="150ms"/>Of course. <break time="100ms"/>A new selection.',
    '<break time="150ms"/>Certainly. <break time="100ms"/>Let\'s explore something different.',
  ],
};

/**
 * Persona-specific drop phrases (when track starts)
 */
const PERSONA_DROP_PHRASES: Record<string, (track: string, artist: string) => string[]> = {
  ferni: (track, artist) => [`Here's "${track}".`, `"${track}" by ${artist}.`, `There we go.`],
  peter: (track, artist) => [`Here's "${track}".`, `Playing "${track}" by ${artist}.`],
  maya: (track, artist) => [`Here's "${track}".`, `"${track}" by ${artist}.`, `Enjoy.`],
  jordan: (track, artist) => [
    `<emotion value="happy"/>Here it is!`,
    `<emotion value="happy"/>"${track}"!`,
    `<emotion value="happy"/>Yes!`,
  ],
  alex: (track, artist) => [`Here's "${track}" by ${artist}.`, `Playing: "${track}".`],
  nayan: (track, artist) => [`"${track}" by ${artist}.`, `Here we are.`],
};

/**
 * Persona-specific mid-song moment phrases
 */
const PERSONA_MOMENT_PHRASES: Record<string, Record<string, string[]>> = {
  ferni: {
    buildup: [
      '<break time="100ms"/>Ooh, <break time="80ms"/>here it comes...',
      '<break time="100ms"/>Wait for it...',
      '<break time="100ms"/>This part...',
    ],
    drop: ['<emotion value="happy"/>There it is.', 'Mm.', 'Yes.'],
    appreciation: [
      '<break time="100ms"/>I love this one.',
      '<break time="100ms"/>There\'s something about this song.',
      '<break time="100ms"/>Mm, this is nice.',
    ],
  },
  peter: {
    buildup: ['<break time="100ms"/>Okay, here it comes...', '<break time="100ms"/>This part...'],
    drop: ['There it is.', 'Nice.'],
    appreciation: ['<break time="100ms"/>Good track.', '<break time="100ms"/>This is solid.'],
  },
  maya: {
    buildup: ['<break time="150ms"/>Breathe into this...', '<break time="150ms"/>Here we go...'],
    drop: ['<break time="100ms"/>Mm.', '<break time="100ms"/>Yes.'],
    appreciation: ['<break time="150ms"/>Beautiful.', '<break time="150ms"/>This one speaks.'],
  },
  jordan: {
    buildup: [
      '<emotion value="happy"/><break time="100ms"/>Ooh, here it comes!',
      '<break time="100ms"/>Wait for it!',
      '<emotion value="happy"/><break time="100ms"/>This part right here!',
    ],
    drop: [
      '<emotion value="happy"/>There it is!',
      '<emotion value="happy"/>Yes!',
      '<emotion value="happy"/>Boom!',
    ],
    appreciation: [
      '<emotion value="happy"/><break time="100ms"/>Yes! Love this part.',
      '<break time="100ms"/>This is the good stuff.',
    ],
  },
  alex: {
    buildup: [
      '<break time="100ms"/>Here comes the key part...',
      '<break time="100ms"/>Listen to this section...',
    ],
    drop: ['There.', 'Nice execution.'],
    appreciation: ['<break time="100ms"/>Well-crafted.', '<break time="100ms"/>Quality music.'],
  },
  nayan: {
    buildup: [
      '<break time="200ms"/>Observe what comes next...',
      '<break time="200ms"/>A crescendo approaches...',
    ],
    drop: ['<break time="100ms"/>Ah.', '<break time="100ms"/>There.'],
    appreciation: [
      '<break time="200ms"/>Music speaks what cannot be expressed.',
      '<break time="200ms"/>Beautiful.',
    ],
  },
};

// ============================================================================
// PHRASE GENERATION FUNCTIONS
// ============================================================================

/**
 * Get a random element from an array
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get persona-specific phrases, falling back to Ferni
 */
function getPersonaPhrases<T>(personaId: string, phrases: Record<string, T>): T {
  // Try exact match
  if (phrases[personaId]) {
    return phrases[personaId];
  }
  // Try alias (e.g., 'maya-santos' -> 'maya')
  const baseName = personaId.split('-')[0];
  if (phrases[baseName]) {
    return phrases[baseName];
  }
  // Fall back to Ferni
  return phrases.ferni;
}

/**
 * Generate an outro phrase when track is ending
 */
export function getOutroPhrase(context: TrackSpeechContext): string {
  const { track, personaId } = context;
  const phraseGenerator = getPersonaPhrases(personaId, PERSONA_OUTRO_PHRASES);
  const phrases = phraseGenerator(track.name, track.artist);
  return randomChoice(phrases);
}

/**
 * Generate a transition phrase when changing tracks
 */
export function getTransitionPhrase(personaId: string): string {
  const phrases = getPersonaPhrases(personaId, PERSONA_TRANSITION_PHRASES);
  return randomChoice(phrases);
}

/**
 * Generate a drop phrase when track starts
 */
export function getDropPhrase(context: TrackSpeechContext): string {
  const { track, personaId } = context;
  const phraseGenerator = getPersonaPhrases(personaId, PERSONA_DROP_PHRASES);
  const phrases = phraseGenerator(track.name, track.artist);
  return randomChoice(phrases);
}

/**
 * Generate a mid-song moment phrase
 */
export function getMomentPhrase(
  momentType: 'buildup' | 'drop' | 'appreciation',
  personaId: string
): string {
  const personaPhrases = getPersonaPhrases(personaId, PERSONA_MOMENT_PHRASES);
  const phrases = personaPhrases[momentType] ?? personaPhrases.appreciation;
  return randomChoice(phrases);
}

/**
 * Generate a check-in phrase for long tracks
 */
export function getCheckInPhrase(personaId: string): string {
  const checkInPhrases: Record<string, string[]> = {
    ferni: [
      '<break time="200ms"/>How are you feeling with this?',
      '<break time="200ms"/>Still vibing?',
      '<break time="200ms"/>Want me to keep it going or switch it up?',
    ],
    peter: [
      '<break time="150ms"/>Still good with this?',
      '<break time="150ms"/>Should I keep playing?',
    ],
    maya: [
      '<break time="200ms"/>How is this landing for you?',
      '<break time="200ms"/>Shall we continue?',
    ],
    jordan: [
      '<break time="100ms"/>You still with me?',
      '<emotion value="happy"/><break time="100ms"/>More of this? Or something new?',
    ],
    alex: ['<break time="150ms"/>Shall I continue?', '<break time="150ms"/>Any preferences?'],
    nayan: [
      '<break time="200ms"/>Does this serve you?',
      '<break time="200ms"/>Shall we continue this journey?',
    ],
  };

  const phrases = getPersonaPhrases(personaId, checkInPhrases);
  return randomChoice(phrases);
}

/**
 * Generate a music stopped phrase
 */
export function getMusicStoppedPhrase(personaId: string, wasPaused = false): string {
  if (wasPaused) {
    const pausePhrases: Record<string, string[]> = {
      ferni: [
        '<break time="150ms"/>Music paused. <break time="100ms"/>What\'s up?',
        '<break time="150ms"/>Got it. <break time="100ms"/>I\'m here.',
      ],
      peter: [
        '<break time="150ms"/>Got it. <break time="100ms"/>Music on pause.',
        '<break time="150ms"/>Sure. <break time="100ms"/>We can get back to that later.',
      ],
      maya: [
        '<break time="150ms"/>Pausing the music. <break time="100ms"/>What\'s up?',
        '<break time="150ms"/>Okay. <break time="100ms"/>Silence can be nice too.',
      ],
      jordan: [
        '<break time="100ms"/>Got it! <break time="100ms"/>Music paused.',
        '<break time="100ms"/>Sure! <break time="100ms"/>What do you need?',
      ],
      alex: ['<break time="150ms"/>Music paused.', '<break time="150ms"/>Noted.'],
      nayan: [
        '<break time="200ms"/>Music paused. <break time="150ms"/>What calls to you?',
        '<break time="200ms"/>Silence, then.',
      ],
    };
    return randomChoice(getPersonaPhrases(personaId, pausePhrases));
  }

  const stopPhrases: Record<string, string[]> = {
    ferni: [
      '<break time="150ms"/>Okay. <break time="100ms"/>What\'s on your mind?',
      '<break time="150ms"/>Sure. <break time="100ms"/>I\'m all ears.',
    ],
    peter: ['<break time="150ms"/>Alright.', '<break time="150ms"/>Sure.'],
    maya: ['<break time="150ms"/>Of course.', '<break time="150ms"/>Okay.'],
    jordan: ['<break time="100ms"/>Got it!', '<break time="100ms"/>Sure!'],
    alex: ['<break time="150ms"/>Understood.', '<break time="150ms"/>Of course.'],
    nayan: ['<break time="200ms"/>As you wish.', '<break time="200ms"/>Of course.'],
  };
  return randomChoice(getPersonaPhrases(personaId, stopPhrases));
}

// ============================================================================
// LLM-POWERED INTERJECTIONS
// ============================================================================

/**
 * Build prompt for LLM music interjection
 */
function buildInterjectionPrompt(context: TrackSpeechContext, moment: InterjectionMoment): string {
  const momentDescriptions: Record<InterjectionMoment, string> = {
    track_start: 'The song just started playing. Say something brief to introduce/appreciate it.',
    mid_song: "We're in the middle of the song. A brief appreciative moment if you feel it.",
    track_end: 'The song just finished. A quick, warm reflection.',
    buildup: 'A musical buildup is happening. Brief anticipation.',
    drop: 'The drop/climax just hit. Quick reaction.',
    appreciation: 'A beautiful moment in the song. Brief appreciation.',
    check_in: 'The song has been playing a while. Quick check-in with user.',
    user_liked: 'The user expressed they liked it! Share in their enjoyment briefly.',
    user_skipped: 'The user skipped the song. Acknowledge gracefully and move on.',
  };

  let artistContext = '';
  if (context.artistFact) {
    artistContext = `\nFACT YOU KNOW: ${context.artistFact}`;
  } else if (context.track.artist) {
    artistContext = `\nYou're playing music by ${context.track.artist}.`;
  }

  return `${FERNI_DJ_VOICE_DNA}

## CURRENT MOMENT
Track: "${context.track.name || 'this song'}" by ${context.track.artist || 'the artist'}${artistContext}

MOMENT: ${momentDescriptions[moment]}

## YOUR TASK
Generate ONE brief, genuine Ferni-style reaction (1-2 sentences max).
Don't use quotation marks around your response.
Just output the line Ferni would say, nothing else.`;
}

/**
 * Generate an LLM-powered interjection
 * Returns cached result if available, generates in background if not
 */
export async function generateLLMInterjection(
  context: TrackSpeechContext,
  moment: InterjectionMoment
): Promise<string | null> {
  const cacheKey = `${context.track.artist || 'unknown'}-${context.track.name || 'unknown'}-${moment}`;

  // Check cache first
  const cached = llmInterjectionCache.get(cacheKey);
  if (cached && Date.now() - cached.generatedAt < LLM_CACHE_TTL_MS) {
    log.debug({ cacheKey }, 'Using cached LLM interjection');
    return cached.content;
  }

  // Check if generation is already in progress
  const pending = pendingGenerations.get(cacheKey);
  if (pending) {
    log.debug({ cacheKey }, 'Waiting for pending LLM generation');
    return pending;
  }

  // Generate new interjection
  const generationPromise = (async () => {
    try {
      const prompt = buildInterjectionPrompt(context, moment);

      const result = await callLLM(prompt, {
        maxTokens: 100,
        temperature: 0.8,
        timeout: 3000,
      });

      if (result) {
        // Clean up the result (remove quotes if LLM added them)
        const cleaned = result.trim().replace(/^["']|["']$/g, '');

        // Cache it
        llmInterjectionCache.set(cacheKey, {
          content: cleaned,
          generatedAt: Date.now(),
        });

        // Trim cache if too large
        if (llmInterjectionCache.size > MAX_CACHE_SIZE) {
          const oldest = [...llmInterjectionCache.entries()].sort(
            (a, b) => a[1].generatedAt - b[1].generatedAt
          )[0];
          if (oldest) {
            llmInterjectionCache.delete(oldest[0]);
          }
        }

        log.debug({ cacheKey, content: cleaned }, 'LLM interjection generated');
        return cleaned;
      }

      return null;
    } catch (error) {
      log.warn({ error: String(error) }, 'LLM interjection generation failed');
      return null;
    } finally {
      pendingGenerations.delete(cacheKey);
    }
  })();

  pendingGenerations.set(cacheKey, generationPromise);
  return generationPromise;
}

/**
 * Pre-warm the LLM cache for a track
 * Call this when a track starts to have interjections ready
 */
export async function prewarmInterjectionCache(context: TrackSpeechContext): Promise<void> {
  // Pre-generate for common moments in background
  const moments: InterjectionMoment[] = ['track_start', 'track_end', 'appreciation'];

  await Promise.allSettled(moments.map(async (moment) => generateLLMInterjection(context, moment)));

  log.debug({ track: context.track.name }, 'LLM interjection cache pre-warmed');
}

/**
 * Clear the LLM interjection cache
 */
export function clearInterjectionCache(): void {
  llmInterjectionCache.clear();
  pendingGenerations.clear();
  log.debug('LLM interjection cache cleared');
}

/**
 * Get an interjection (LLM-powered with template fallback)
 */
export async function getInterjection(
  context: TrackSpeechContext,
  moment: InterjectionMoment
): Promise<string> {
  // Try LLM first
  const llmResult = await generateLLMInterjection(context, moment);
  if (llmResult) {
    return llmResult;
  }

  // Fall back to template
  const momentToType: Record<InterjectionMoment, 'buildup' | 'drop' | 'appreciation'> = {
    track_start: 'appreciation',
    mid_song: 'appreciation',
    track_end: 'appreciation',
    buildup: 'buildup',
    drop: 'drop',
    appreciation: 'appreciation',
    check_in: 'appreciation',
    user_liked: 'appreciation',
    user_skipped: 'appreciation',
  };

  return getMomentPhrase(momentToType[moment], context.personaId);
}
