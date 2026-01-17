/**
 * Semantic Coherence Probes - Central Export
 */

export * from './domain-naming.js';
export * from './semantic-memory.js';
export * from './integration-wiring.js';
export * from './architectural-philosophy.js';

import { allDomainNamingProbes } from './domain-naming.js';
import { allSemanticMemoryProbes } from './semantic-memory.js';
import { allIntegrationWiringProbes } from './integration-wiring.js';
import { allArchitecturalPhilosophyProbes } from './architectural-philosophy.js';

/**
 * All static probes combined
 */
export const allStaticProbes = [
  ...allDomainNamingProbes,
  ...allSemanticMemoryProbes,
  ...allIntegrationWiringProbes,
  ...allArchitecturalPhilosophyProbes,
];

/**
 * Probe counts by category
 */
export const probeCounts = {
  'domain-naming': allDomainNamingProbes.length,
  'semantic-memory': allSemanticMemoryProbes.length,
  'integration-wiring': allIntegrationWiringProbes.length,
  'architectural-philosophy': allArchitecturalPhilosophyProbes.length,
  total: allStaticProbes.length,
};
