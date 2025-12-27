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
  crisis: () => import('./crisis.js'),
  'wellbeing-context': () => import('./wellbeing-context.js'),
  'principal-alignment': () => import('../principal-alignment.js'),

  // EMOTIONAL (in emotional/)
  emotional: () => import('../emotional/emotional.js'),
  celebration: () => import('../emotional/celebration.js'),
  'celebration-growth': () => import('../emotional/celebration-growth.js'),
  'somatic-context': () => import('../somatic-context.js'),

  // VOICE (in emotional/)
  'voice-mismatch-critical': () => import('../voice-mismatch-critical.js'), // THE superhuman signal
  'voice-emotion': () => import('../emotional/voice-emotion.js'),
  'advanced-voice-emotion': () => import('../emotional/advanced-voice-emotion.js'),
  'voice-emotion-intelligence': () => import('../emotional/voice-emotion-intelligence.js'),
  'human-listening': () => import('../human-listening.js'),

  // MEMORY (in memory/)
  memory: () => import('../memory/memory.js'),
  'advanced-memory': () => import('../memory/advanced-memory.js'),
  'proactive-memory': () => import('../memory/proactive-memory.js'),
  'persona-memory': () => import('../personas/persona-memory.js'),
  'human-memory': () => import('../memory/human-memory.js'), // Human-centric: dates, growth, jokes
  'conversation-recap': () => import('../session/conversation-recap.js'),
  'cross-session-reflection': () => import('../session/cross-session-reflection.js'),
  'cross-session-threading': () => import('../session/cross-session-threading.js'),
  'unified-memory-orchestrator': () => import('../memory/unified-memory-orchestrator.js'), // Coordinates all memory systems
  'thinking-of-you': () => import('../thinking-of-you.js'), // Proactive callbacks and follow-ups

  // PERSONA (in personas/)
  'persona-identity': () => import('../personas/persona-identity.js'),
  'persona-quirks': () => import('../personas/persona-quirks.js'),
  'persona-playful': () => import('../personas/persona-playful.js'),
  'persona-vulnerability': () => import('../personas/persona-vulnerability.js'),
  'persona-mood': () => import('../personas/persona-mood.js'),
  'human-personality': () => import('../human-personality.js'),
  'ferni-personality': () => import('../ferni-personality.js'), // Ferni-specific: dynamic expressions, pushbacks, passions
  'ferni-coordinator-intelligence': () => import('../personas/ferni-coordinator-intelligence.js'), // Ferni: smart handoff suggestions
  'peter-research-insights': () => import('../personas/peter-research-insights.js'), // Peter-specific: deep research briefings
  'maya-habit-insights': () => import('../personas/maya-habit-insights.js'), // Maya-specific: habit patterns and predictive care
  'maya-coaching-insights': () => import('../personas/maya-coaching-insights.js'), // Maya: cross-team coaching insights
  'jordan-milestone-insights': () => import('../personas/jordan-milestone-insights.js'), // Jordan: milestone and goal insights
  'nayan-wisdom-insights': () => import('../personas/nayan-wisdom-insights.js'), // Nayan: big-picture wisdom synthesis
  'alex-communication-insights': () => import('../personas/alex-communication-insights.js'), // Alex: communication coaching insights
  'better-than-human-direct': () => import('../better-than-human-direct.js'), // Direct surfacing of BTH phrases
  'conversational-superpowers': () => import('../conversational-superpowers.js'),
  'conversation-forward': () => import('../session/conversation-forward.js'), // Better Than Human: keep conversations moving
  'alive-awareness': () => import('../awareness/alive-awareness.js'),
  'inner-world-injector': () => import('../inner-world-injector.js'),
  'spontaneous-vulnerability': () => import('../spontaneous-vulnerability.js'),
  'physical-presence': () => import('../physical-presence.js'),
  'lovable-presence': () => import('../lovable-presence.js'),

  // COACHING (in coaching/)
  'coaching-context': () => import('../coaching/coaching-context.js'),
  'life-coaching-context': () => import('../life-coaching-context.js'),
  'scientific-coaching': () => import('../coaching/scientific-coaching.js'),
  'therapeutic-frameworks': () => import('../coaching/therapeutic-frameworks.js'),
  'behavioral-economics': () => import('../coaching/behavioral-economics.js'),
  methodology: () => import('../methodology.js'),
  'prediction-surfacing': () => import('../prediction-surfacing.js'), // Proactive prediction surfacing

  // COGNITIVE (in coaching/ for cognitive-* files)
  awareness: () => import('../awareness/awareness.js'),
  cognitive: () => import('../cognitive.js'),
  'cognitive-quirks': () => import('../coaching/cognitive-quirks.js'),
  'cognitive-distortions': () => import('../coaching/cognitive-distortions.js'),
  'cognitive-insights': () => import('../coaching/cognitive-insights.js'),
  'pattern-surfacing': () => import('../pattern-surfacing.js'),
  'superhuman-insights': () => import('../superhuman/superhuman-insights.js'),
  'semantic-intelligence-integration': () =>
    import('../superhuman/semantic-intelligence-integration.js'), // V3.0-V3.7 Semantic Intelligence
  'deep-understanding': () => import('../deep-understanding.js'), // Unified deep intelligence
  'life-context-synthesis': () => import('../life-context-synthesis.js'), // Phase 6: Cross-domain life context

  // CAPABILITY AWARENESS
  'domain-fluency': () => import('../domain-fluency.js'), // Conceptual capability awareness

  // ENGAGEMENT
  engagement: () => import('../engagement.js'),
  'engagement-context': () => import('../engagement-context.js'),
  'game-context': () => import('../game-context.js'),
  storytelling: () => import('../storytelling.js'),
  music: () => import('../music.js'),
  'music-emotion-offers': () => import('../music-emotion-offers.js'),
  'daily-rituals': () => import('../daily-rituals.js'), // Morning Sky Check, Habit Heartbeat, etc.
  'outreach-awareness': () => import('../awareness/outreach-awareness.js'), // Proactive contact outreach nudges

  // TEAM (in superhuman/)
  'team-availability': () => import('../superhuman/team-availability.js'),
  'team-dynamics': () => import('../superhuman/team-dynamics.js'),
  handoff: () => import('../superhuman/handoff.js'),
  'role-boundaries': () => import('../role-boundaries.js'),
  'cameo-opportunities': () => import('../cameo-opportunities.js'),
  'cameo-unlock': () => import('../cameo-unlock.js'), // Natural team member introductions
  'team-gossip': () => import('../superhuman/team-gossip.js'), // Cross-persona references and banter

  // CONTEXT (in awareness/)
  'outbound-call-context': () => import('../outbound-call-context.js'), // On-behalf call awareness
  'tool-capabilities': () => import('../tool-capabilities.js'),
  'dynamic-tool-guidance': () => import('../dynamic-tool-guidance.js'),
  'tool-timing-context': () => import('../tool-timing-context.js'), // Tool execution timing for natural framing
  intent: () => import('../intent.js'),
  topics: () => import('../topics.js'),
  discovery: () => import('../discovery.js'),
  personal: () => import('../personal.js'),
  pacing: () => import('../pacing.js'),
  'meta-conversation': () => import('../meta-conversation.js'),
  'situational-awareness': () => import('../awareness/situational-awareness.js'),
  'trust-context': () => import('../trust-context.js'),
  'relationship-behaviors': () => import('../relationship-behaviors.js'),
  'session-flow': () => import('../session/session-flow.js'),
  'calendar-awareness': () => import('../awareness/calendar-awareness.js'),
  'contact-awareness': () => import('../awareness/contact-awareness.js'),
  'message-review-awareness': () => import('../awareness/message-review-awareness.js'), // Alex: calendar snapshot for scheduling
  goodbye: () => import('../goodbye.js'),
  rag: () => import('../memory/rag.js'),
  tasks: () => import('../tasks.js'),

  // EXTERNAL
  biometrics: () => import('../biometrics.js'),
  'career-awareness': () => import('../awareness/career-awareness.js'),
  'device-awareness': () => import('../awareness/device-awareness.js'),
  'linkedin-awareness': () => import('../awareness/linkedin-awareness.js'),
  'financial-prediction': () => import('../financial-prediction.js'),
  anticipation: () => import('../anticipation.js'),
  'social-relationships': () => import('../social-relationships.js'),
  'world-awareness': () => import('../awareness/world-awareness.js'),
  'personal-journey': () => import('../personal-journey.js'),
  'macos-context': () => import('../macos-context.js'), // macOS menubar app context

  // HUMANIZING (in humanization/)
  'dynamic-speech-guidance': () => import('../dynamic-speech-guidance.js'), // LLM behavioral guidance (replaces phrase pools)
  'unified-humanizing': () => import('../humanization/unified-humanizing.js'), // Consolidated humanization orchestrator
  humanizing: () => import('../humanization/humanizing.js'),
  'deep-humanization': () => import('../humanization/deep-humanization.js'),
  'conversation-humanizing': () => import('../humanization/conversation-humanizing.js'),
  'natural-uncertainty': () => import('../natural-uncertainty.js'),
  'response-length': () => import('../response-length.js'),
  'energy-mirroring': () => import('../emotional/energy-mirroring.js'),
  'energy-awareness': () => import('../emotional/energy-awareness.js'),
  'tool-humanization': () => import('../humanization/tool-humanization.js'),

  // LEARNING
  'community-learning': () => import('../community-learning.js'),
  'wisdom-synthesis': () => import('../wisdom-synthesis.js'),

  // BETTER THAN HUMAN (New Dec 2024)
  'proactive-noticing': () => import('../proactive-noticing.js'), // "I notice..." pattern surfacing
  'commitment-follow-up': () => import('../commitment-follow-up.js'), // Accountability tracking
  'temporal-intelligence': () => import('../temporal-intelligence.js'), // Time patterns, dates
  'deep-relationship': () => import('../deep-relationship.js'), // Shared vocabulary, milestones

  // RELATIONSHIP ARC (Complete relationship development system - Dec 2024)
  // Uses Firestore storage for persistence, tracks first words, key moments, stages
  'first-meeting-magic': () => import('../relationship-arc/first-meeting-magic.js'), // Stage: Stranger (turns 0-3)
  'acquaintance-deepening': () => import('../relationship-arc/acquaintance-deepening.js'), // Stage: Acquaintance (sessions 2-5)
  'friendship-flowering': () => import('../relationship-arc/friendship-flowering.js'), // Stage: Friend (sessions 6-15)
  'trusted-advisor': () => import('../relationship-arc/trusted-advisor.js'), // Stage: Trusted Advisor (sessions 15+)

  // REVELATION AWARENESS (Capability throttling, anti-surveillance, permissions)
  'revelation-awareness': () => import('../revelation-awareness.js'), // Ensures capabilities feel human
};
