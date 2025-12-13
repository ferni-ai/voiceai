/**
 * Context Builder Import Registry
 *
 * This avoids variable dynamic imports like `import(\`./${name}.js\`)`, which can
 * trigger bundler warnings and reduce static analyzability.
 *
 * IMPORTANT:
 * - This file MUST stay in sync with `BUILDER_MANIFEST` in `loader.ts`.
 * - Only modules referenced by the manifest are listed here.
 */

export type BuilderImporter = () => Promise<unknown>;

export const BUILDER_IMPORTS: Record<string, BuilderImporter> = {
  // SAFETY
  crisis: () => import('./crisis.js'),
  'wellbeing-context': () => import('./wellbeing-context.js'),

  // EMOTIONAL
  emotional: () => import('./emotional.js'),
  celebration: () => import('./celebration.js'),
  'celebration-growth': () => import('./celebration-growth.js'),
  'somatic-context': () => import('./somatic-context.js'),

  // VOICE
  'voice-emotion': () => import('./voice-emotion.js'),
  'advanced-voice-emotion': () => import('./advanced-voice-emotion.js'),
  'voice-emotion-intelligence': () => import('./voice-emotion-intelligence.js'),
  'human-listening': () => import('./human-listening.js'),

  // MEMORY
  memory: () => import('./memory.js'),
  'advanced-memory': () => import('./advanced-memory.js'),
  'proactive-memory': () => import('./proactive-memory.js'),
  'persona-memory': () => import('./persona-memory.js'),
  'human-memory': () => import('./human-memory.js'), // Human-centric: dates, growth, jokes
  'conversation-recap': () => import('./conversation-recap.js'),
  'cross-session-reflection': () => import('./cross-session-reflection.js'),
  'cross-session-threading': () => import('./cross-session-threading.js'),

  // PERSONA
  'persona-identity': () => import('./persona-identity.js'),
  'persona-quirks': () => import('./persona-quirks.js'),
  'persona-playful': () => import('./persona-playful.js'),
  'persona-vulnerability': () => import('./persona-vulnerability.js'),
  'persona-mood': () => import('./persona-mood.js'),
  'human-personality': () => import('./human-personality.js'),
  'conversational-superpowers': () => import('./conversational-superpowers.js'),
  'alive-awareness': () => import('./alive-awareness.js'),
  'inner-world-injector': () => import('./inner-world-injector.js'),
  'spontaneous-vulnerability': () => import('./spontaneous-vulnerability.js'),
  'physical-presence': () => import('./physical-presence.js'),
  'lovable-presence': () => import('./lovable-presence.js'),

  // COACHING
  'coaching-context': () => import('./coaching-context.js'),
  'life-coaching-context': () => import('./life-coaching-context.js'),
  'scientific-coaching': () => import('./scientific-coaching.js'),
  'therapeutic-frameworks': () => import('./therapeutic-frameworks.js'),
  'behavioral-economics': () => import('./behavioral-economics.js'),
  methodology: () => import('./methodology.js'),

  // COGNITIVE
  awareness: () => import('./awareness.js'),
  cognitive: () => import('./cognitive.js'),
  'cognitive-quirks': () => import('./cognitive-quirks.js'),
  'cognitive-distortions': () => import('./cognitive-distortions.js'),
  'cognitive-insights': () => import('./cognitive-insights.js'),
  'pattern-surfacing': () => import('./pattern-surfacing.js'),
  'superhuman-insights': () => import('./superhuman-insights.js'),
  'deep-understanding': () => import('./deep-understanding.js'), // Unified deep intelligence

  // ENGAGEMENT
  engagement: () => import('./engagement.js'),
  'engagement-context': () => import('./engagement-context.js'),
  'game-context': () => import('./game-context.js'),
  storytelling: () => import('./storytelling.js'),
  music: () => import('./music.js'),
  'music-emotion-offers': () => import('./music-emotion-offers.js'),

  // TEAM
  'team-availability': () => import('./team-availability.js'),
  'team-dynamics': () => import('./team-dynamics.js'),
  handoff: () => import('./handoff.js'),
  'role-boundaries': () => import('./role-boundaries.js'),
  'cameo-opportunities': () => import('./cameo-opportunities.js'),

  // CONTEXT
  'dynamic-tool-guidance': () => import('./dynamic-tool-guidance.js'),
  intent: () => import('./intent.js'),
  topics: () => import('./topics.js'),
  discovery: () => import('./discovery.js'),
  personal: () => import('./personal.js'),
  pacing: () => import('./pacing.js'),
  'meta-conversation': () => import('./meta-conversation.js'),
  'situational-awareness': () => import('./situational-awareness.js'),
  'trust-context': () => import('./trust-context.js'),
  'relationship-behaviors': () => import('./relationship-behaviors.js'),
  'session-flow': () => import('./session-flow.js'),
  goodbye: () => import('./goodbye.js'),
  rag: () => import('./rag.js'),
  tasks: () => import('./tasks.js'),

  // EXTERNAL
  biometrics: () => import('./biometrics.js'),
  'financial-prediction': () => import('./financial-prediction.js'),
  anticipation: () => import('./anticipation.js'),
  'social-relationships': () => import('./social-relationships.js'),
  'world-awareness': () => import('./world-awareness.js'),
  'personal-journey': () => import('./personal-journey.js'),

  // HUMANIZING
  humanizing: () => import('./humanizing.js'),
  'deep-humanization': () => import('./deep-humanization.js'),
  'conversation-humanizing': () => import('./conversation-humanizing.js'),
  'natural-uncertainty': () => import('./natural-uncertainty.js'),
  'response-length': () => import('./response-length.js'),
  'energy-mirroring': () => import('./energy-mirroring.js'),
  'energy-awareness': () => import('./energy-awareness.js'),
  'tool-humanization': () => import('./tool-humanization.js'),

  // LEARNING
  'community-learning': () => import('./community-learning.js'),
  'wisdom-synthesis': () => import('./wisdom-synthesis.js'),
};
