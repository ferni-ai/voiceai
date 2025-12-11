/**
 * Better Than Human - Superhuman Capabilities
 *
 * > "Your best friend forgets. We don't."
 *
 * This module exports all 12 superhuman capabilities that make Ferni
 * genuinely better than human support:
 *
 * 1. **Emotional Memory Evolution** - How we feel about you grows
 * 2. **Anticipatory Presence** - "I was hoping you'd call"
 * 3. **Linguistic Mirroring** - Speak your language
 * 4. **Visible Vulnerability** - Authentic uncertainty
 * 5. **Spontaneous Delight** - Random genuine appreciation
 * 6. **Protective Instincts** - Defend you to yourself
 * 7. **Evolving Inside Jokes** - "Remember when we named..."
 * 8. **Cross-Persona Coherence** - Team that communicates
 * 9. **Temporal Intelligence** - "You sound lighter today"
 * 10. **Meta-Relationship** - "We've built something real"
 * 11. **Somatic Presence** - Physical embodiment cues
 * 12. **Superhuman Observations** - "You use 'should' a lot"
 *
 * @module @ferni/superhuman
 */

// Types
export * from './types.js';

// Content loader
export {
  clearContentCache,
  getBetterThanHumanContentSync,
  getDelightPhrase,
  getEmotionalBondPhrase,
  getMetaRelationshipPhrase,
  getObservationPhrase,
  getProtectivePhrase,
  getRandomPhrase,
  getTemporalInsightPhrase,
  getTemporalPhrase,
  getUsageRules,
  getVulnerabilityPhrase,
  loadBetterThanHumanContent,
  preloadAllContent,
  type BetterThanHumanContent,
} from './content-loader.js';

// Analytics
export {
  betterThanHumanAnalytics,
  trackAction,
  trackCapabilityEffectiveness,
  trackCapabilityUsage,
  type CapabilityEffectivenessEvent,
  type CapabilityStats,
  type CapabilityUsageEvent,
  type SuperhumanCapability,
} from './analytics.js';

// Main orchestrator
export {
  BetterThanHumanOrchestrator,
  clearBetterThanHuman,
  getBetterThanHuman,
} from './orchestrator.js';

// Individual engines
export {
  EmotionalMemoryEngine,
  clearEmotionalMemory,
  getEmotionalMemory,
} from './emotional-memory.js';

export {
  AnticipatoryPresenceEngine,
  clearAnticipatoryPresence,
  getAnticipatoryPresence,
} from './anticipatory-presence.js';

export {
  LinguisticMirroringEngine,
  clearLinguisticMirroring,
  getLinguisticMirroring,
} from './linguistic-mirroring.js';

export {
  ProtectiveInstinctsEngine,
  SpontaneousDelightEngine,
  VisibleVulnerabilityEngine,
  clearDelightEngines,
  getProtectiveInstincts,
  getSpontaneousDelight,
  getVisibleVulnerability,
} from './spontaneous-delight.js';

export { EvolvingJokesEngine, clearEvolvingJokes, getEvolvingJokes } from './evolving-jokes.js';

export { TeamCoherenceEngine, clearTeamCoherence, getTeamCoherence } from './team-coherence.js';

export {
  TemporalEmotionalEngine,
  clearTemporalEmotional,
  getTemporalEmotional,
} from './temporal-emotional.js';

export {
  MetaRelationshipEngine,
  SomaticPresenceEngine,
  clearMetaRelationship,
  clearSomaticPresence,
  getMetaRelationship,
  getSomaticPresence,
} from './meta-relationship.js';

export {
  SuperhumanObservationsEngine,
  clearSuperhumanObservations,
  getSuperhumanObservations,
} from './superhuman-observations.js';

// Default export is the main orchestrator
export { default } from './orchestrator.js';
