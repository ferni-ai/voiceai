// Types restored - context builder properly typed
/**
 * Storytelling Context Builder
 *
 * Detects when an agent is about to tell a story and:
 * - Offers background music (persona-specific)
 * - Adjusts pacing suggestions
 * - Enhances the storytelling experience
 */
import { log } from '@livekit/agents';
import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import {
  getStoryMusicOffer,
  getStorytellingIntro,
  getStorytellingConfig,
} from '../../personas/theatrical.js';

// ============================================================================
// STORYTELLING PATTERNS
// ============================================================================
/**
 * Patterns that indicate a story is about to be told
 */
const STORY_TRIGGER_PATTERNS = [
  /\b(let me tell you|i remember|back in|years ago|when i was|one time|picture this|there was a time)\b/i,
  /\b(reminds me of|that story about|speaking of which|funny story|true story)\b/i,
  /\b(i'll never forget|i once|my father|my grandfather|when i worked)\b/i,
];
/**
 * User requests for stories
 */
const STORY_REQUEST_PATTERNS =
  /\b(tell me (a story|about)|share (a story|an experience)|what happened|give me an example)\b/i;
// Track if we've offered music recently (per session)
let lastMusicOfferTime = 0;
const MUSIC_OFFER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between offers
// ============================================================================
// STORYTELLING CONTEXT BUILDER
// ============================================================================
/**
 * Build storytelling-related context injections
 */
function buildStorytellingContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, persona } = input;
  const injections: ContextInjection[] = [];
  const personaId = persona?.id;
  // -----------------------------------------------
  // USER REQUESTS A STORY
  // -----------------------------------------------
  if (STORY_REQUEST_PATTERNS.test(userText)) {
    getLogger().debug({ persona: personaId }, 'User requested a story');
    // Get persona-specific storytelling intro
    let introExample = '';
    if (personaId) {
      const intro = getStorytellingIntro(personaId);
      if (intro) {
        // Strip SSML for the example
        introExample = intro.replace(/<[^>]*>/g, '');
      }
    }
    // Get pacing style for persona (bundle-aware)
    const config = personaId ? getStorytellingConfig(personaId) : null;
    const pacingGuidance = config ? getPacingGuidance(config.pacingStyle) : '';
    injections.push(
      createHintInjection(
        'storytelling_request',
        `[STORYTELLING MODE REQUESTED]
User wants a story! Make it engaging.
${introExample ? `Start with something like: "${introExample}"` : ''}
${pacingGuidance}
DO:
  - Paint the scene first
  - Use specific details
  - Build to a point
  - Connect it back to their situation
DO NOT:
  - Rush through it
  - Make it generic
  - Forget the punchline/lesson`
      )
    );
    // Offer music if cooldown has passed
    if (personaId && shouldOfferMusic()) {
      const musicOffer = getStoryMusicOffer(personaId);
      if (musicOffer) {
        // Strip SSML for the suggestion
        const cleanOffer = musicOffer.replace(/<[^>]*>/g, '');
        injections.push(
          createHintInjection(
            'story_music',
            `[OPTIONAL: You can offer background music before telling the story: "${cleanOffer}"]`
          )
        );
        lastMusicOfferTime = Date.now();
      }
    }
  }
  // -----------------------------------------------
  // DETECT AGENT ABOUT TO TELL STORY (from previous response context)
  // This helps on follow-up where agent decided to tell a story
  // -----------------------------------------------
  // Note: This would need access to the agent's previous response
  // For now, we detect via user requests above
  return injections;
}
/**
 * Get pacing guidance based on persona style
 */
function getPacingGuidance(style: string): string {
  switch (style) {
    case 'animated':
      return 'PACING: Fast and energetic! Quick transitions, excitement in your voice.';
    case 'measured':
      return 'PACING: Slow and thoughtful. Let pauses do the work.';
    case 'calm':
      return 'PACING: Gentle and steady. No rush at all.';
    case 'energetic':
      return 'PACING: High energy! But vary the speed for impact.';
    default:
      return '';
  }
}
/**
 * Check if we should offer music (cooldown logic)
 */
function shouldOfferMusic() {
  const timeSinceLastOffer = Date.now() - lastMusicOfferTime;
  return timeSinceLastOffer > MUSIC_OFFER_COOLDOWN_MS;
}
/**
 * Reset music offer cooldown (call at session start)
 */
export function resetStorytellingState() {
  lastMusicOfferTime = 0;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('storytelling', buildStorytellingContext);
export { buildStorytellingContext, STORY_TRIGGER_PATTERNS, STORY_REQUEST_PATTERNS };
