/**
 * Tool Integration Layer for Life Coaching Content
 *
 * Provides easy-to-use functions for tools to access research and persona methodologies.
 * This is the bridge between PhD-level content and tool execution.
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import {
  loadResearchBase,
  loadPersonaMethodology,
  getFramework,
  getDomainResearch,
  getFrameworksForDomain,
  getCognitiveDistortions,
  getAttachmentStyles,
  getFourHorsemen,
  getPersonaPhrases,
  getTendencyApproach,
  type Framework,
  type DomainResearch,
  type PersonaMethodology,
} from './content-loader.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ToolContentContext {
  personaId: string;
  domain: string;
  userId?: string;
  emotionalState?: string;
  fourTendency?: 'upholder' | 'questioner' | 'obliger' | 'rebel';
}

export interface EnrichedToolContext {
  // Research (shared across all personas)
  research: DomainResearch | null;
  frameworks: Framework[];
  relevantFrameworkNames: string[];

  // Persona-specific
  methodology: PersonaMethodology | null;
  phrases: {
    opening: string[];
    validation: string[];
    encouragement: string[];
    wisdom: string[];
  };

  // User-adapted
  tendencyApproach?: {
    strength: string;
    challenge: string;
    approach: string;
  };
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Get enriched context for a tool execution
 * Call this at tool execution time to get research + methodology
 */
export async function getEnrichedToolContext(
  ctx: ToolContentContext
): Promise<EnrichedToolContext> {
  const { personaId, domain, fourTendency } = ctx;

  try {
    // Load in parallel for performance
    const [research, frameworks, methodology] = await Promise.all([
      getDomainResearch(domain),
      getFrameworksForDomain(domain),
      loadPersonaMethodology(personaId, domain),
    ]);

    // Get persona-specific phrases for common categories
    const [openingPhrases, validationPhrases, encouragementPhrases, wisdomPhrases] =
      await Promise.all([
        getPersonaPhrases(personaId, domain, 'opening'),
        getPersonaPhrases(personaId, domain, 'validation'),
        getPersonaPhrases(personaId, domain, 'encouragement'),
        getPersonaPhrases(personaId, domain, 'wisdom'),
      ]);

    // Get tendency-specific approach if we know their tendency
    let tendencyApproach;
    if (fourTendency) {
      tendencyApproach = (await getTendencyApproach(personaId, domain, fourTendency)) || undefined;
    }

    return {
      research,
      frameworks,
      relevantFrameworkNames: frameworks.map((f) => f.name),
      methodology,
      phrases: {
        opening: openingPhrases,
        validation: validationPhrases,
        encouragement: encouragementPhrases,
        wisdom: wisdomPhrases,
      },
      tendencyApproach,
    };
  } catch (error) {
    log.error({ error: String(error), personaId, domain }, 'Failed to load enriched tool context');

    // Return empty context on error - tools should handle gracefully
    return {
      research: null,
      frameworks: [],
      relevantFrameworkNames: [],
      methodology: null,
      phrases: {
        opening: [],
        validation: [],
        encouragement: [],
        wisdom: [],
      },
    };
  }
}

// ============================================================================
// CONTENT SELECTION HELPERS
// ============================================================================

/**
 * Get a random phrase from a category
 */
export function selectPhrase(phrases: string[]): string {
  if (!phrases.length) return '';
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a random key finding from domain research
 */
export function selectKeyFinding(research: DomainResearch | null): string {
  if (!research?.keyFindings?.length) return '';
  return research.keyFindings[Math.floor(Math.random() * research.keyFindings.length)];
}

/**
 * Get expert attribution for credibility
 */
export function getExpertAttribution(research: DomainResearch | null): string {
  if (!research?.leadingExperts?.length) return '';
  const expert = research.leadingExperts[0];
  return `${expert.name} - ${expert.contribution}`;
}

/**
 * Format a framework reference for conversational use
 */
export function formatFrameworkReference(framework: Framework): string {
  return `${framework.name}: ${framework.coreIdea}`;
}

// ============================================================================
// RESPONSE ENRICHMENT
// ============================================================================

/**
 * Enrich a tool response with research-backed content
 */
export function enrichResponse(
  baseResponse: string,
  context: EnrichedToolContext,
  options?: {
    includeValidation?: boolean;
    includeWisdom?: boolean;
    includeResearch?: boolean;
  }
): string {
  const parts: string[] = [];

  // Add validation if requested and available
  if (options?.includeValidation && context.phrases.validation.length) {
    parts.push(selectPhrase(context.phrases.validation));
  }

  // Add the base response
  parts.push(baseResponse);

  // Add research-backed insight if requested
  if (options?.includeResearch && context.research) {
    const finding = selectKeyFinding(context.research);
    if (finding) {
      parts.push(`Research shows: ${finding}`);
    }
  }

  // Add wisdom if requested
  if (options?.includeWisdom && context.phrases.wisdom.length) {
    parts.push(selectPhrase(context.phrases.wisdom));
  }

  return parts.join('\n\n');
}

/**
 * Adapt response based on Four Tendencies
 */
export function adaptForTendency(
  response: string,
  tendency: 'upholder' | 'questioner' | 'obliger' | 'rebel' | undefined,
  tendencyApproach?: { strength: string; challenge: string; approach: string }
): string {
  if (!tendency || !tendencyApproach) return response;

  // Prepend tendency-aware framing
  const framing = tendencyApproach.approach;
  if (framing) {
    return `${framing}\n\n${response}`;
  }

  return response;
}

// ============================================================================
// SPECIALIZED CONTENT GETTERS
// ============================================================================

/**
 * Get cognitive distortions for CBT-based tools
 */
export async function getCBTDistortions(): Promise<
  Array<{ name: string; description: string; example: string }>
> {
  return getCognitiveDistortions();
}

/**
 * Get attachment styles for relationship tools
 */
export async function getAttachmentInfo(): Promise<
  Array<{ style: string; internalModel: string; inRelationships: string }>
> {
  return getAttachmentStyles();
}

/**
 * Get Gottman's Four Horsemen for relationship tools
 */
export async function getRelationshipWarnings(): Promise<
  Array<{ horseman: string; description: string; antidote: string }>
> {
  return getFourHorsemen();
}

/**
 * Get a specific framework for direct reference
 */
export async function getSpecificFramework(frameworkId: string): Promise<Framework | null> {
  return getFramework(frameworkId);
}

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

/**
 * Get handoff notes from persona methodology
 */
export async function getHandoffNotes(
  fromPersonaId: string,
  domain: string,
  toPersonaId: string
): Promise<string | null> {
  const methodology = await loadPersonaMethodology(fromPersonaId, domain);

  if (!methodology) return null;

  const handoffNotes = methodology.handoffNotes as Record<string, string> | undefined;
  const toKey = `to${toPersonaId.charAt(0).toUpperCase() + toPersonaId.slice(1)}`;

  return handoffNotes?.[toKey] || null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Re-export from content-loader for convenience
  loadResearchBase,
  loadPersonaMethodology,
  getFramework,
  getDomainResearch,
  getFrameworksForDomain,
};

export default {
  getEnrichedToolContext,
  selectPhrase,
  selectKeyFinding,
  getExpertAttribution,
  formatFrameworkReference,
  enrichResponse,
  adaptForTendency,
  getCBTDistortions,
  getAttachmentInfo,
  getRelationshipWarnings,
  getSpecificFramework,
  getHandoffNotes,
};
