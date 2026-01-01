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
  // SAFETY (in core/)
  crisis: async () => import('./crisis.js'),
  'wellbeing-context': async () => import('./wellbeing-context.js'),
  'principal-alignment': async () => import('../principal-alignment.js'),

  // EMOTIONAL (in emotional/)
  // emotional: DELETED - migrated to behavioral/builders/emotional.behavioral.ts
  celebration: async () => import('../emotional/celebration.js'),
  'celebration-growth': async () => import('../emotional/celebration-growth.js'),
  'somatic-context': async () => import('../somatic-context.js'),

  // VOICE (in emotional/)
  'voice-mismatch-critical': async () => import('../voice-mismatch-critical.js'), // THE superhuman signal
  'voice-emotion': async () => import('../emotional/voice-emotion.js'),
  'advanced-voice-emotion': async () => import('../emotional/advanced-voice-emotion.js'),
  'voice-emotion-intelligence': async () => import('../emotional/voice-emotion-intelligence.js'),
  'human-listening': async () => import('../human-listening.js'),

  // MEMORY (in memory/)
  'superhuman-session-priming': async () => import('../superhuman-session-priming.js'), // NEW: Surfaces ALL superhuman memory at session start
  memory: async () => import('../memory/memory.js'),
  'advanced-memory': async () => import('../memory/advanced-memory.js'),
  'proactive-memory': async () => import('../memory/proactive-memory.js'),
  'persona-memory': async () => import('../personas/persona-memory.js'),
  'human-memory': async () => import('../memory/human-memory.js'), // Human-centric: dates, growth, jokes
  'conversation-recap': async () => import('../session/conversation-recap.js'),
  'cross-session-reflection': async () => import('../session/cross-session-reflection.js'),
  'cross-session-threading': async () => import('../session/cross-session-threading.js'),
  'unified-memory-orchestrator': async () => import('../memory/unified-memory-orchestrator.js'), // Coordinates all memory systems
  'thinking-of-you': async () => import('../thinking-of-you.js'), // Proactive callbacks and follow-ups
  'memory-enhancement': async () => import('../memory-enhancement.js'), // Tonal memory, curiosity, thinking, growth
  'better-than-human-memory': async () => import('../memory/better-than-human-memory.js'), // P0: Proactive surfacing with timing + learning

  // PERSONA (in personas/)
  'twin-profile-context': async () => import('../twin-profile-context.js'), // Digital Twin profile for personalization
  'persona-identity': async () => import('../personas/persona-identity.js'),
  'persona-quirks': async () => import('../personas/persona-quirks.js'),
  'persona-playful': async () => import('../personas/persona-playful.js'),
  'persona-vulnerability': async () => import('../personas/persona-vulnerability.js'),
  'persona-mood': async () => import('../personas/persona-mood.js'),
  'human-personality': async () => import('../human-personality.js'),
  'ferni-personality': async () => import('../ferni-personality.js'), // Ferni-specific: dynamic expressions, pushbacks, passions
  'ferni-coordinator-insights': async () => import('../personas/ferni-coordinator-insights.js'), // Ferni: smart handoff suggestions
  'peter-research-insights': async () => import('../personas/peter-research-insights/index.js'), // Peter-specific: deep research briefings
  'maya-habit-insights': async () => import('../personas/maya-habit-insights.js'), // Maya-specific: habit patterns and predictive care
  'maya-coaching-insights': async () => import('../personas/maya-coaching-insights/index.js'), // Maya: cross-team coaching insights
  'jordan-milestone-insights': async () => import('../personas/jordan-milestone-insights/index.js'), // Jordan: milestone and goal insights
  'nayan-wisdom-insights': async () => import('../personas/nayan-wisdom-insights.js'), // Nayan: big-picture wisdom synthesis
  'alex-communication-insights': async () =>
    import('../personas/alex-communication-insights/index.js'), // Alex: communication coaching insights
  'better-than-human-direct': async () => import('../better-than-human-direct.js'), // Direct surfacing of BTH phrases
  'conversational-superpowers': async () => import('../conversational-superpowers.js'),
  'conversation-forward': async () => import('../session/conversation-forward.js'), // Better Than Human: keep conversations moving
  'alive-awareness': async () => import('../awareness/alive-awareness.js'),
  'inner-world-injector': async () => import('../inner-world-injector.js'),
  'spontaneous-vulnerability': async () => import('../spontaneous-vulnerability.js'),
  'physical-presence': async () => import('../physical-presence.js'),
  'lovable-presence': async () => import('../lovable-presence.js'),

  // COACHING (in coaching/)
  'coaching-context': async () => import('../coaching/coaching-context.js'),
  'life-coaching-context': async () => import('../life-coaching-context.js'),
  'scientific-coaching': async () => import('../coaching/scientific-coaching.js'),
  'therapeutic-frameworks': async () => import('../coaching/therapeutic-frameworks.js'),
  'behavioral-economics': async () => import('../coaching/behavioral-economics.js'),
  methodology: async () => import('../methodology.js'),
  'prediction-surfacing': async () => import('../prediction-surfacing.js'), // Proactive prediction surfacing

  // COGNITIVE (in coaching/ for cognitive-* files)
  awareness: async () => import('../awareness/awareness.js'),
  cognitive: async () => import('../cognitive.js'),
  'cognitive-quirks': async () => import('../coaching/cognitive-quirks.js'),
  'cognitive-distortions': async () => import('../coaching/cognitive-distortions.js'),
  'cognitive-insights': async () => import('../coaching/cognitive-insights.js'),
  'pattern-surfacing': async () => import('../pattern-surfacing.js'),
  'superhuman-insights': async () => import('../superhuman/superhuman-insights.js'),
  'semantic-intelligence-integration': async () =>
    import('../superhuman/semantic-intelligence-integration.js'), // V3.0-V3.7 Semantic Intelligence
  'deep-understanding': async () => import('../deep-understanding.js'), // Unified deep intelligence
  'life-context-synthesis': async () => import('../life-context-synthesis.js'), // Phase 6: Cross-domain life context

  // CAPABILITY AWARENESS
  'domain-fluency': async () => import('../domain-fluency.js'), // Conceptual capability awareness

  // ENGAGEMENT
  engagement: async () => import('../engagement.js'),
  'engagement-context': async () => import('../engagement-context.js'),
  'game-context': async () => import('../game-context.js'),
  storytelling: async () => import('../storytelling.js'),
  music: async () => import('../music.js'),
  'music-emotion-offers': async () => import('../music-emotion-offers.js'),
  'daily-rituals': async () => import('../daily-rituals.js'), // Morning Sky Check, Habit Heartbeat, etc.
  'outreach-awareness': async () => import('../awareness/outreach-awareness.js'), // Proactive contact outreach nudges

  // TEAM (in superhuman/)
  'team-availability': async () => import('../superhuman/team-availability.js'),
  'team-dynamics': async () => import('../superhuman/team-dynamics.js'),
  handoff: async () => import('../superhuman/handoff.js'),
  'role-boundaries': async () => import('../role-boundaries.js'),
  'cameo-opportunities': async () => import('../cameo-opportunities.js'),
  'cameo-unlock': async () => import('../cameo-unlock.js'), // Natural team member introductions
  'team-gossip': async () => import('../superhuman/team-gossip.js'), // Cross-persona references and banter
  'semantic-intent-guidance': async () => import('../semantic-intent-guidance.js'), // Semantic pattern matching for handoffs, tools

  // CONTEXT (in awareness/)
  'outbound-call-context': async () => import('../outbound-call-context.js'), // On-behalf call awareness
  'tool-capabilities': async () => import('../tool-capabilities.js'),
  'dynamic-tool-guidance': async () => import('../dynamic-tool-guidance.js'),
  'tool-timing-context': async () => import('../tool-timing-context.js'), // Tool execution timing for natural framing
  intent: async () => import('../intent.js'),
  topics: async () => import('../topics.js'),
  discovery: async () => import('../discovery.js'),
  personal: async () => import('../personal.js'),
  // pacing: DELETED - migrated to behavioral/builders/pacing.behavioral.ts
  'meta-conversation': async () => import('../meta-conversation.js'),
  'situational-awareness': async () => import('../awareness/situational-awareness.js'),
  'trust-context': async () => import('../trust-context.js'),
  'relationship-behaviors': async () => import('../relationship-behaviors.js'),
  'session-flow': async () => import('../session/session-flow.js'),
  'calendar-awareness': async () => import('../awareness/calendar-awareness.js'),
  'contact-awareness': async () => import('../awareness/contact-awareness.js'),
  'message-review-awareness': async () => import('../awareness/message-review-awareness.js'), // Alex: calendar snapshot for scheduling
  goodbye: async () => import('../goodbye.js'),
  rag: async () => import('../memory/rag.js'),
  tasks: async () => import('../tasks.js'),

  // EXTERNAL
  biometrics: async () => import('../biometrics.js'),
  'career-awareness': async () => import('../awareness/career-awareness.js'),
  'device-awareness': async () => import('../awareness/device-awareness.js'),
  'linkedin-awareness': async () => import('../awareness/linkedin-awareness.js'),
  'financial-prediction': async () => import('../financial-prediction.js'),
  anticipation: async () => import('../anticipation.js'),
  'social-relationships': async () => import('../social-relationships.js'),
  'world-awareness': async () => import('../awareness/world-awareness.js'),
  'personal-journey': async () => import('../personal-journey.js'),
  'macos-context': async () => import('../macos-context.js'), // macOS menubar app context

  // HUMANIZING (in humanization/)
  'dynamic-speech-guidance': async () => import('../dynamic-speech-guidance.js'), // LLM behavioral guidance (replaces phrase pools)
  'unified-humanizing': async () => import('../humanization/unified-humanizing.js'), // Consolidated humanization orchestrator
  humanizing: async () => import('../humanization/humanizing.js'),
  'deep-humanization': async () => import('../humanization/deep-humanization.js'),
  'conversation-humanizing': async () => import('../humanization/conversation-humanizing.js'),
  'natural-uncertainty': async () => import('../natural-uncertainty.js'),
  'response-length': async () => import('../response-length.js'),
  'energy-mirroring': async () => import('../emotional/energy-mirroring.js'),
  'energy-awareness': async () => import('../emotional/energy-awareness.js'),
  'tool-humanization': async () => import('../humanization/tool-humanization.js'),

  // LEARNING
  'community-learning': async () => import('../community-learning.js'),
  'wisdom-synthesis': async () => import('../wisdom-synthesis.js'),

  // BETTER THAN HUMAN (New Dec 2024)
  'proactive-noticing': async () => import('../proactive-noticing.js'), // "I notice..." pattern surfacing
  'commitment-follow-up': async () => import('../commitment-follow-up.js'), // Accountability tracking
  'temporal-intelligence': async () => import('../temporal-intelligence.js'), // Time patterns, dates
  'deep-relationship': async () => import('../deep-relationship.js'), // Shared vocabulary, milestones

  // RELATIONSHIP ARC (Complete relationship development system - Dec 2024)
  // Uses Firestore storage for persistence, tracks first words, key moments, stages
  'first-meeting-magic': async () => import('../relationship-arc/first-meeting-magic.js'), // Stage: Stranger (turns 0-3)
  'acquaintance-deepening': async () => import('../relationship-arc/acquaintance-deepening.js'), // Stage: Acquaintance (sessions 2-5)
  'friendship-flowering': async () => import('../relationship-arc/friendship-flowering.js'), // Stage: Friend (sessions 6-15)
  'trusted-advisor': async () => import('../relationship-arc/trusted-advisor.js'), // Stage: Trusted Advisor (sessions 15+)

  // REVELATION AWARENESS (Capability throttling, anti-surveillance, permissions)
  'revelation-awareness': async () => import('../revelation-awareness.js'), // Ensures capabilities feel human

  // CONVERSATIONAL IMPERFECTIONS (Dec 2024)
  // Mid-sentence corrections, word-finding, thought pivots - makes speech feel human
  'conversational-imperfections': async () => import('../conversational-imperfections.js'),
};
