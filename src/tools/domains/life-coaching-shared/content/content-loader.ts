/**
 * Content Loader for Life Coaching Domains
 *
 * Loads PhD-level research and persona-specific methodologies.
 * Research is shared across all personas; methodology is persona-specific application.
 *
 * Architecture:
 *   research-base.json (Domain) → Universal scientific foundation
 *   personas/{id}/methodologies/{domain}.json → How that persona applies the research
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { getLogger } from '../../../../utils/safe-logger.js';

const log = getLogger();

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Content paths - use process.cwd() for reliable path resolution in all environments
const CONTENT_PATH = join(process.cwd(), 'src/tools/domains/life-coaching-shared/content');
const PERSONA_PATH = join(process.cwd(), 'src/personas/bundles');

function getContentBasePath(): string {
  // Check if src path exists, otherwise try dist
  if (existsSync(join(CONTENT_PATH, 'research-base.json'))) {
    return CONTENT_PATH;
  }
  const distPath = join(process.cwd(), 'dist/tools/domains/life-coaching-shared/content');
  if (existsSync(join(distPath, 'research-base.json'))) {
    return distPath;
  }
  // Fallback to __dirname for production
  return __dirname;
}

function getPersonaBasePath(): string {
  if (existsSync(PERSONA_PATH)) {
    return PERSONA_PATH;
  }
  const distPath = join(process.cwd(), 'dist/personas/bundles');
  if (existsSync(distPath)) {
    return distPath;
  }
  return join(__dirname, '../../../../personas/bundles');
}

// ============================================================================
// TYPES
// ============================================================================

export interface Framework {
  name: string;
  founder?: string;
  founders?: string[];
  coreIdea: string;
  keyPrinciple: string;
  efficacy: string;
  domains: string[];
  techniques?: Technique[];
  citations: string[];
  [key: string]: unknown; // Allow framework-specific fields
}

export interface Technique {
  name: string;
  description?: string;
  steps?: string[];
  examples?: string[];
  example?: string;
}

export interface DomainResearch {
  leadingExperts: Expert[];
  keyFindings: string[];
  assessments?: Assessment[];
  citations: string[];
  [key: string]: unknown; // Allow domain-specific fields
}

export interface Expert {
  name: string;
  contribution: string;
}

export interface Assessment {
  name: string;
  source: string;
  measures: string;
}

export interface PersonaMethodology {
  meta: {
    version: string;
    personaId: string;
    domain: string;
    philosophy: string;
  };
  [personaName: string]: unknown; // Persona-specific approach
}

export interface ResearchBase {
  meta: {
    version: string;
    lastUpdated: string;
    purpose: string;
  };
  frameworks: Record<string, Framework>;
  domainSpecificResearch: Record<string, DomainResearch>;
}

// ============================================================================
// CACHE
// ============================================================================

let researchBaseCache: ResearchBase | null = null;
const methodologyCache = new Map<string, PersonaMethodology>();

// ============================================================================
// LOADING FUNCTIONS
// ============================================================================

/**
 * Load the shared research base (cached after first load)
 */
export async function loadResearchBase(): Promise<ResearchBase> {
  if (researchBaseCache) {
    return researchBaseCache;
  }

  try {
    const basePath = getContentBasePath();
    const filePath = join(basePath, 'research-base.json');
    const content = await readFile(filePath, 'utf-8');
    researchBaseCache = JSON.parse(content) as ResearchBase;
    log.debug({ path: filePath }, 'Loaded research base');
    return researchBaseCache;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load research base');
    // Return minimal structure on error
    return {
      meta: { version: '0.0.0', lastUpdated: '', purpose: '' },
      frameworks: {},
      domainSpecificResearch: {},
    };
  }
}

/**
 * Load a persona's methodology for a specific domain
 */
export async function loadPersonaMethodology(
  personaId: string,
  domain: string
): Promise<PersonaMethodology | null> {
  const cacheKey = `${personaId}:${domain}`;

  if (methodologyCache.has(cacheKey)) {
    return methodologyCache.get(cacheKey)!;
  }

  try {
    // Path: src/personas/bundles/{personaId}/content/methodologies/{domain}-methodology.json
    const basePath = getPersonaBasePath();
    const filePath = join(
      basePath,
      personaId,
      'content/methodologies',
      `${domain}-methodology.json`
    );

    const content = await readFile(filePath, 'utf-8');
    const methodology = JSON.parse(content) as PersonaMethodology;

    methodologyCache.set(cacheKey, methodology);
    log.debug({ personaId, domain, path: filePath }, 'Loaded persona methodology');

    return methodology;
  } catch {
    // Methodology not found is normal - not all personas have all domain methodologies
    log.debug({ personaId, domain }, 'No persona methodology found');
    return null;
  }
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get a specific framework from the research base
 */
export async function getFramework(frameworkId: string): Promise<Framework | null> {
  const research = await loadResearchBase();
  return research.frameworks[frameworkId] || null;
}

/**
 * Get domain-specific research
 */
export async function getDomainResearch(domain: string): Promise<DomainResearch | null> {
  const research = await loadResearchBase();

  // Map tool domains to research keys
  const domainMapping: Record<string, string> = {
    boundaries: 'boundaries',
    anger: 'anger',
    procrastination: 'procrastination',
    'burnout-recovery': 'burnout',
    perfectionism: 'perfectionism',
    'trauma-support': 'trauma',
    'digital-wellness': 'digitalWellness',
    'body-relationship': 'bodyRelationship',
    relationships: 'relationships',
    neurodiversity: 'neurodiversity',
    intimacy: 'intimacy',
    'breakup-recovery': 'breakupRecovery',
    midlife: 'midlife',
    'chronic-conditions': 'chronicConditions',
    'social-skills': 'socialSkills',
    dating: 'dating',
  };

  const researchKey = domainMapping[domain] || domain;
  return research.domainSpecificResearch[researchKey] || null;
}

/**
 * Get frameworks relevant to a specific domain
 */
export async function getFrameworksForDomain(domain: string): Promise<Framework[]> {
  const research = await loadResearchBase();
  const frameworks: Framework[] = [];

  for (const [_, framework] of Object.entries(research.frameworks)) {
    if (framework.domains.includes(domain)) {
      frameworks.push(framework);
    }
  }

  return frameworks;
}

/**
 * Get cognitive distortions from CBT framework
 */
export async function getCognitiveDistortions(): Promise<
  Array<{ name: string; description: string; example: string }>
> {
  const cbt = await getFramework('cbt');
  return (
    (
      cbt as Framework & {
        cognitiveDistortions?: Array<{ name: string; description: string; example: string }>;
      }
    )?.cognitiveDistortions || []
  );
}

/**
 * Get DBT skills modules
 */
export async function getDBTSkills(): Promise<Array<{ module: string; [key: string]: unknown }>> {
  const dbt = await getFramework('dbt');
  return (
    (dbt as Framework & { skillModules?: Array<{ module: string; [key: string]: unknown }> })
      ?.skillModules || []
  );
}

/**
 * Get attachment styles information
 */
export async function getAttachmentStyles(): Promise<
  Array<{ style: string; internalModel: string; inRelationships: string }>
> {
  const attachment = await getFramework('attachmentTheory');
  return (
    (
      attachment as Framework & {
        attachmentStyles?: Array<{ style: string; internalModel: string; inRelationships: string }>;
      }
    )?.attachmentStyles || []
  );
}

/**
 * Get Gottman's Four Horsemen
 */
export async function getFourHorsemen(): Promise<
  Array<{ horseman: string; description: string; antidote: string }>
> {
  const gottman = await getFramework('gottmanMethod');
  return (
    (
      gottman as Framework & {
        fourHorsemen?: Array<{ horseman: string; description: string; antidote: string }>;
      }
    )?.fourHorsemen || []
  );
}

// ============================================================================
// PERSONA-AWARE RETRIEVAL
// ============================================================================

/**
 * Get a persona's phrasing for a specific domain context
 */
export async function getPersonaPhrases(
  personaId: string,
  domain: string,
  category: string
): Promise<string[]> {
  const methodology = await loadPersonaMethodology(personaId, domain);

  if (!methodology) return [];

  // Extract short name from personaId (e.g., "maya-santos" -> "maya", "nayan-patel" -> "nayan")
  const shortName = personaId.split('-')[0].toLowerCase();

  // Look for phrases in methodology (e.g., "mayasPhrases", "nayansPhrases")
  const phrasesKey = `${shortName}sPhrases`;
  const phrases = methodology[phrasesKey] as Record<string, string[]> | undefined;

  if (phrases && phrases[category]) {
    return phrases[category];
  }

  // Also check for "personaPhrases" as a fallback
  const genericPhrases = methodology['personaPhrases'] as Record<string, string[]> | undefined;
  if (genericPhrases && genericPhrases[category]) {
    return genericPhrases[category];
  }

  return [];
}

/**
 * Get persona's approach for a specific Four Tendencies type
 */
export async function getTendencyApproach(
  personaId: string,
  domain: string,
  tendency: 'upholder' | 'questioner' | 'obliger' | 'rebel'
): Promise<{ strength: string; challenge: string; approach: string } | null> {
  const methodology = await loadPersonaMethodology(personaId, domain);

  if (!methodology) return null;

  // Check multiple possible locations for tendency data
  const assessment = methodology.assessmentApproach as {
    fourTendenciesIntegration?: Record<
      string,
      { strength: string; challenge: string; mayasApproach?: string; nayansApproach?: string }
    >;
  };

  // Also check in tendencyAdaptations
  const tendencyAdaptations = methodology.tendencyAdaptations as Record<
    string,
    { strength: string; challenge: string; approach: string }
  >;

  // Try assessmentApproach first
  const tendencyData = assessment?.fourTendenciesIntegration?.[tendency];

  // Also try tendencyAdaptations
  const altTendencyData = tendencyAdaptations?.[tendency];

  if (altTendencyData) {
    return altTendencyData;
  }

  if (!tendencyData) return null;

  // Extract short name from personaId (e.g., "maya-santos" -> "maya")
  const shortName = personaId.split('-')[0].toLowerCase();
  const approachKey = `${shortName}sApproach`;

  return {
    strength: tendencyData.strength,
    challenge: tendencyData.challenge,
    approach: (tendencyData as Record<string, string>)[approachKey] || '',
  };
}

/**
 * Get combined context for a tool - research + persona methodology
 */
export async function getToolContext(
  personaId: string,
  domain: string
): Promise<{
  research: DomainResearch | null;
  frameworks: Framework[];
  methodology: PersonaMethodology | null;
}> {
  const [research, frameworks, methodology] = await Promise.all([
    getDomainResearch(domain),
    getFrameworksForDomain(domain),
    loadPersonaMethodology(personaId, domain),
  ]);

  return { research, frameworks, methodology };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get a random expert quote/finding for a domain
 */
export async function getRandomInsight(domain: string): Promise<string | null> {
  const research = await getDomainResearch(domain);

  if (!research || !research.keyFindings?.length) return null;

  const findings = research.keyFindings;
  return findings[Math.floor(Math.random() * findings.length)];
}

/**
 * Get citation for a specific framework
 */
export async function getCitation(frameworkId: string): Promise<string | null> {
  const framework = await getFramework(frameworkId);

  if (!framework || !framework.citations?.length) return null;

  // Return first (primary) citation
  return framework.citations[0];
}

/**
 * Clear all caches (useful for testing or hot reload)
 */
export function clearContentCaches(): void {
  researchBaseCache = null;
  methodologyCache.clear();
  log.debug('Content caches cleared');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadResearchBase,
  loadPersonaMethodology,
  getFramework,
  getDomainResearch,
  getFrameworksForDomain,
  getCognitiveDistortions,
  getDBTSkills,
  getAttachmentStyles,
  getFourHorsemen,
  getPersonaPhrases,
  getTendencyApproach,
  getToolContext,
  getRandomInsight,
  getCitation,
  clearContentCaches,
};
