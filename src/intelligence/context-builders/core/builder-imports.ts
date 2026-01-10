/**
 * Context Builder Import Registry
 *
 * This avoids variable dynamic imports like `import(\`./${name}.js\`)`, which can
 * trigger bundler warnings and reduce static analyzability.
 *
 * IMPORTANT:
 * - This file MUST stay in sync with `BUILDER_MANIFEST` in `loader.ts`.
 * - Only modules referenced by the manifest are listed here.
 *
 * REORGANIZED: January 2026
 * Files have been moved to domain-driven folders. See docs/architecture/CONTEXT-BUILDERS-RATIONALIZATION.md
 */

export type BuilderImporter = () => Promise<unknown>;

export const BUILDER_IMPORTS: Record<string, BuilderImporter> = {
  // ============================================================================
  // SAFETY (in safety/)
  // ============================================================================
  crisis: async () => import('../safety/crisis.js'),
  'wellbeing-context': async () => import('../safety/wellbeing-context.js'),
  'principal-alignment': async () => import('../safety/principal-alignment.js'),
  'honesty-guardrail': async () => import('../safety/honesty-guardrail.js'),

  // ============================================================================
  // EMOTIONAL (in emotional/)
  // ============================================================================
  // emotional: DELETED - migrated to behavioral/builders/emotional.behavioral.ts
  celebration: async () => import('../emotional/celebration.js'),
  'celebration-growth': async () => import('../emotional/celebration-growth.js'),
  'somatic-context': async () => import('../emotional/somatic-context.js'),
  'human-listening': async () => import('../emotional/human-listening.js'),
  'energy-mirroring': async () => import('../emotional/energy-mirroring.js'),
  'energy-awareness': async () => import('../emotional/energy-awareness.js'),

  // ============================================================================
  // VOICE (in emotional/)
  // ============================================================================
  'voice-mismatch-critical': async () => import('../intelligence/voice-mismatch-critical.js'), // THE superhuman signal
  'voice-emotion': async () => import('../emotional/voice-emotion.js'),
  'advanced-voice-emotion': async () => import('../emotional/advanced-voice-emotion.js'),
  'voice-emotion-intelligence': async () => import('../emotional/voice-emotion-intelligence.js'),
  'emotional-contagion-timing': async () => import('../emotional/emotional-contagion-timing.js'),

  // ============================================================================
  // MEMORY (in memory/)
  // ============================================================================
  'superhuman-session-priming': async () => import('../superhuman/superhuman-session-priming.js'),
  memory: async () => import('../memory/memory.js'),
  'advanced-memory': async () => import('../memory/advanced-memory.js'),
  'proactive-memory': async () => import('../memory/proactive-memory.js'),
  'persona-memory': async () => import('../personas/persona-memory.js'),
  'human-memory': async () => import('../memory/human-memory.js'),
  'conversation-recap': async () => import('../session/conversation-recap.js'),
  'cross-session-reflection': async () => import('../session/cross-session-reflection.js'),
  'cross-session-threading': async () => import('../session/cross-session-threading.js'),
  'unified-memory-orchestrator': async () => import('../memory/unified-memory-orchestrator.js'),
  'knowledge-graph': async () => import('../memory/knowledge-graph-context.js'),
  'thinking-of-you': async () => import('../memory/thinking-of-you.js'),
  'memory-enhancement': async () => import('../memory/memory-enhancement.js'),
  'better-than-human-memory': async () => import('../memory/better-than-human-memory.js'),
  'generated-insights': async () => import('../superhuman/generated-insights.js'),
  rag: async () => import('../memory/rag.js'),

  // ============================================================================
  // PERSONA (in personas/)
  // ============================================================================
  'twin-profile-context': async () => import('../personas/twin-profile-context.js'),
  'persona-identity': async () => import('../personas/persona-identity.js'),
  'persona-quirks': async () => import('../personas/persona-quirks.js'),
  'persona-playful': async () => import('../personas/persona-playful.js'),
  'persona-vulnerability': async () => import('../personas/persona-vulnerability.js'),
  'persona-mood': async () => import('../personas/persona-mood.js'),
  'human-personality': async () => import('../personas/human-personality.js'),
  'ferni-personality': async () => import('../personas/ferni-personality.js'),
  'ferni-coordinator-insights': async () => import('../personas/ferni-coordinator-insights.js'),
  'peter-research-insights': async () => import('../personas/peter-research-insights/index.js'),
  'maya-habit-insights': async () => import('../personas/maya-habit-insights.js'),
  'maya-coaching-insights': async () => import('../personas/maya-coaching-insights/index.js'),
  'jordan-milestone-insights': async () => import('../personas/jordan-milestone-insights/index.js'),
  'nayan-wisdom-insights': async () => import('../personas/nayan-wisdom-insights.js'),
  'alex-communication-insights': async () =>
    import('../personas/alex-communication-insights/index.js'),
  'joel-dickson-insights': async () => import('../personas/joel-dickson-insights/index.js'),
  'spontaneous-vulnerability': async () => import('../personas/spontaneous-vulnerability.js'),
  'physical-presence': async () => import('../personas/physical-presence.js'),
  'lovable-presence': async () => import('../personas/lovable-presence.js'),
  'mortality-perspective': async () => import('../personas/mortality-perspective.js'),

  // ============================================================================
  // INTELLIGENCE (in intelligence/) - "Better Than Human" capabilities
  // ============================================================================
  'personality-v2': async () => import('../personality-v2.js'), // SUPERHUMAN personality intelligence
  'better-than-human-direct': async () => import('../superhuman/better-than-human-direct.js'),
  'conversational-superpowers': async () => import('../superhuman/conversational-superpowers.js'),
  'alive-awareness': async () => import('../awareness/alive-awareness.js'),
  'inner-world-injector': async () => import('../intelligence/inner-world-injector.js'),
  'proactive-noticing': async () => import('../intelligence/proactive-intelligence.js'),
  'commitment-follow-up': async () => import('../intelligence/commitment-follow-up.js'),
  'temporal-intelligence': async () => import('../intelligence/temporal-intelligence.js'),
  'pattern-surfacing': async () => import('../intelligence/pattern-intelligence.js'),
  'deep-understanding': async () => import('../intelligence/deep-understanding.js'),
  'life-context-synthesis': async () => import('../intelligence/life-context-synthesis.js'),
  'unified-intelligence': async () => import('../intelligence/unified-intelligence-context.js'),
  'sec-intelligence': async () => import('../intelligence/sec-intelligence.js'),
  'prediction-surfacing': async () => import('../intelligence/prediction-intelligence.js'),
  'semantic-intent-guidance': async () => import('../intelligence/semantic-intent-guidance.js'),

  // ============================================================================
  // COACHING (in coaching/)
  // ============================================================================
  'coaching-context': async () => import('../coaching/coaching-context.js'),
  'life-coaching-context': async () => import('../coaching/life-coaching-context.js'),
  'scientific-coaching': async () => import('../coaching/scientific-coaching.js'),
  'therapeutic-frameworks': async () => import('../coaching/therapeutic-frameworks.js'),
  'behavioral-economics': async () => import('../coaching/behavioral-economics.js'),
  methodology: async () => import('../coaching/methodology.js'),
  cognitive: async () => import('../coaching/cognitive.js'),
  'cognitive-quirks': async () => import('../coaching/cognitive-quirks.js'),
  'cognitive-distortions': async () => import('../coaching/cognitive-distortions.js'),
  'cognitive-insights': async () => import('../coaching/cognitive-insights.js'),

  // ============================================================================
  // SUPERHUMAN (in superhuman/)
  // ============================================================================
  'superhuman-insights': async () => import('../superhuman/superhuman-insights.js'),
  'semantic-intelligence-integration': async () =>
    import('../superhuman/semantic-intelligence-integration.js'),
  'superhuman-integration': async () => import('../superhuman/superhuman-integration.js'),

  // ============================================================================
  // ENGAGEMENT (in engagement/)
  // ============================================================================
  engagement: async () => import('../engagement/engagement.js'),
  'engagement-context': async () => import('../engagement/engagement-context.js'),
  'game-context': async () => import('../engagement/game-context.js'),
  storytelling: async () => import('../engagement/storytelling.js'),
  music: async () => import('../engagement/music.js'),
  'music-emotion-offers': async () => import('../engagement/music-emotion-offers.js'),
  'daily-rituals': async () => import('../engagement/daily-rituals.js'),
  'referral-prompt': async () => import('../engagement/referral-prompt.js'),

  // ============================================================================
  // TEAM (in team/)
  // ============================================================================
  'team-availability': async () => import('../team/team-availability.js'),
  'team-dynamics': async () => import('../team/team-dynamics.js'),
  handoff: async () => import('../team/handoff.js'),
  'role-boundaries': async () => import('../team/role-boundaries.js'),
  'cameo-opportunities': async () => import('../team/cameo-opportunities.js'),
  'cameo-unlock': async () => import('../team/cameo-unlock.js'),
  'team-gossip': async () => import('../team/team-gossip.js'),

  // ============================================================================
  // SESSION (in session/)
  // ============================================================================
  'conversation-forward': async () => import('../session/conversation-forward.js'),
  'session-flow': async () => import('../session/session-flow.js'),
  'natural-discovery': async () => import('../session/natural-discovery.js'), // Dreams, values, goals discovery
  intent: async () => import('../session/intent-context.js'),
  topics: async () => import('../session/topics-context.js'),
  discovery: async () => import('../session/discovery-context.js'),
  personal: async () => import('../session/personal-context.js'),
  'meta-conversation': async () => import('../session/meta-conversation.js'),
  tasks: async () => import('../session/tasks-context.js'),
  'thread-context': async () => import('../session/thread-context.js'),

  // ============================================================================
  // AWARENESS (in awareness/)
  // ============================================================================
  awareness: async () => import('../awareness/awareness.js'),
  'situational-awareness': async () => import('../awareness/situational-awareness.js'),
  'calendar-awareness': async () => import('../awareness/calendar-awareness.js'),
  'contact-awareness': async () => import('../awareness/contact-awareness.js'),
  'message-review-awareness': async () => import('../awareness/message-review-awareness.js'),
  'outreach-awareness': async () => import('../awareness/outreach-awareness.js'),
  'career-awareness': async () => import('../awareness/career-awareness.js'),
  'device-awareness': async () => import('../awareness/device-awareness.js'),
  'linkedin-awareness': async () => import('../awareness/linkedin-awareness.js'),
  'world-awareness': async () => import('../awareness/world-awareness.js'),
  'domain-fluency': async () => import('../awareness/domain-awareness.js'),
  'tool-capabilities': async () => import('../awareness/tool-awareness.js'),
  'dynamic-tool-guidance': async () => import('../awareness/tool-guidance-awareness.js'),
  'tool-timing-context': async () => import('../awareness/tool-timing-awareness.js'),
  'revelation-awareness': async () => import('../awareness/revelation-awareness.js'),

  // ============================================================================
  // EXTERNAL (in external/)
  // ============================================================================
  biometrics: async () => import('../external/biometrics.js'),
  'financial-prediction': async () => import('../external/financial-prediction.js'),
  anticipation: async () => import('../external/anticipation.js'),
  'personal-journey': async () => import('../external/personal-journey.js'),
  'macos-context': async () => import('../external/macos-context.js'),
  'outbound-call-context': async () => import('../external/outbound-call-context.js'),
  'inbound-call-context': async () => import('../external/inbound-call-context.js'),
  'family-messages-context': async () => import('../external/family-messages-context.js'),
  'family-awareness-context': async () => import('../external/family-awareness-context.js'),
  'pending-call-results': async () => import('../external/pending-call-results.js'),

  // ============================================================================
  // RELATIONSHIP (in relationship/)
  // ============================================================================
  'trust-context': async () => import('../relationship/trust-context.js'),
  'relationship-behaviors': async () => import('../relationship/relationship-behaviors.js'),
  'deep-relationship': async () => import('../relationship/deep-relationship.js'),
  'social-relationships': async () => import('../relationship/social-relationships.js'),
  'social-graph-context': async () => import('../relationship/social-graph-context.js'),
  // Relationship Arc (in relationship/arc/)
  'first-meeting-magic': async () => import('../relationship/arc/first-meeting-magic.js'),
  'acquaintance-deepening': async () => import('../relationship/arc/acquaintance-deepening.js'),
  'friendship-flowering': async () => import('../relationship/arc/friendship-flowering.js'),
  'trusted-advisor': async () => import('../relationship/arc/trusted-advisor.js'),

  // ============================================================================
  // HUMANIZATION (in humanization/)
  // ============================================================================
  'dynamic-speech-guidance': async () => import('../humanization/dynamic-speech-guidance.js'),
  'unified-humanizing': async () => import('../humanization/unified-humanizing.js'),
  humanizing: async () => import('../humanization/humanizing.js'),
  'deep-humanization': async () => import('../humanization/deep-humanization.js'),
  'conversation-humanizing': async () => import('../humanization/conversation-humanizing.js'),
  'natural-uncertainty': async () => import('../humanization/natural-uncertainty.js'),
  'response-length': async () => import('../humanization/response-length.js'),
  'tool-humanization': async () => import('../humanization/tool-humanization.js'),
  'conversational-imperfections': async () =>
    import('../humanization/conversational-imperfections.js'),

  // ============================================================================
  // LEARNING (in learning/)
  // ============================================================================
  'community-learning': async () => import('../learning/community-learning.js'),
  'wisdom-synthesis': async () => import('../learning/wisdom-synthesis.js'),

  // ============================================================================
  // ROOT INFRASTRUCTURE (stay at root)
  // ============================================================================
  goodbye: async () => import('../goodbye.js'),
};
