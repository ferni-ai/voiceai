/**
 * Tool Content Integration
 *
 * Integrates PhD-level research and persona methodologies into tool execution.
 * This is the bridge between the content layer and the tool layer.
 *
 * Usage in a tool:
 *   const context = await getEnhancedToolContext(ctx.agentId, 'boundaries', userMessage);
 *   // context includes: research, methodology, personaPhrases, relevantFrameworks
 */

import { getLogger } from '../../../utils/safe-logger.js';
import {
  loadResearchBase,
  loadPersonaMethodology,
  getFramework,
  getDomainResearch,
  getFrameworksForDomain,
  getPersonaPhrases,
  getTendencyApproach,
  getRandomInsight,
  type Framework,
  type DomainResearch,
  type PersonaMethodology,
} from './content/content-loader.js';
import {
  getLifeCoachingProfile,
  detectTendencyCues,
  type LifeCoachingProfile,
} from './user-profile.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface EnhancedToolContext {
  // Research foundation
  research: DomainResearch | null;
  frameworks: Framework[];
  randomInsight: string | null;

  // Persona-specific application
  methodology: PersonaMethodology | null;
  personaPhrases: {
    opening: string[];
    validation: string[];
    reframe: string[];
    encouragement: string[];
  };

  // User personalization
  userProfile: LifeCoachingProfile | null;
  detectedTendency: {
    tendency: string;
    confidence: number;
  } | null;
  tendencyApproach: {
    strength: string;
    challenge: string;
    approach: string;
  } | null;

  // Utility
  getFramework: (id: string) => Promise<Framework | null>;
  getPhrases: (category: string) => Promise<string[]>;
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Get enhanced context for a life coaching tool execution.
 * This provides the tool with research, methodology, and user personalization.
 */
export async function getEnhancedToolContext(
  personaId: string,
  domain: string,
  userMessage?: string,
  userId?: string
): Promise<EnhancedToolContext> {
  try {
    // Parallel fetch for performance
    const [research, frameworks, methodology, randomInsight, userProfile] = await Promise.all([
      getDomainResearch(domain),
      getFrameworksForDomain(domain),
      loadPersonaMethodology(personaId, domain),
      getRandomInsight(domain),
      userId ? getLifeCoachingProfile(userId) : Promise.resolve(null),
    ]);

    // Detect tendency from user message if provided
    let detectedTendency: { tendency: string; confidence: number } | null = null;
    if (userMessage) {
      const tendencyResult = detectTendencyCues(userMessage);
      if (tendencyResult) {
        detectedTendency = {
          tendency: tendencyResult.tendency,
          confidence: tendencyResult.confidence,
        };
      }
    }

    // Get tendency-specific approach from methodology
    let tendencyApproach: { strength: string; challenge: string; approach: string } | null = null;
    const tendencyToUse = detectedTendency?.tendency || userProfile?.fourTendency;
    if (tendencyToUse && ['upholder', 'questioner', 'obliger', 'rebel'].includes(tendencyToUse)) {
      tendencyApproach = await getTendencyApproach(
        personaId,
        domain,
        tendencyToUse as 'upholder' | 'questioner' | 'obliger' | 'rebel'
      );
    }

    // Extract persona phrases from methodology
    const personaPhrases = {
      opening: await getPersonaPhrases(personaId, domain, 'opening'),
      validation: await getPersonaPhrases(personaId, domain, 'validation'),
      reframe: await getPersonaPhrases(personaId, domain, 'reframe'),
      encouragement: await getPersonaPhrases(personaId, domain, 'encouragement'),
    };

    log.debug(
      {
        personaId,
        domain,
        hasResearch: !!research,
        frameworkCount: frameworks.length,
        hasMethodology: !!methodology,
        detectedTendency: detectedTendency?.tendency,
      },
      'Enhanced tool context loaded'
    );

    return {
      research,
      frameworks,
      randomInsight,
      methodology,
      personaPhrases,
      userProfile,
      detectedTendency,
      tendencyApproach,
      getFramework,
      getPhrases: (category: string) => getPersonaPhrases(personaId, domain, category),
    };
  } catch (error) {
    log.error({ error: String(error), personaId, domain }, 'Failed to load enhanced tool context');

    // Return minimal context on error
    return {
      research: null,
      frameworks: [],
      randomInsight: null,
      methodology: null,
      personaPhrases: { opening: [], validation: [], reframe: [], encouragement: [] },
      userProfile: null,
      detectedTendency: null,
      tendencyApproach: null,
      getFramework,
      getPhrases: () => Promise.resolve([]),
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR TOOL USE
// ============================================================================

/**
 * Get a random phrase from a category, with fallback
 */
export function getRandomPhrase(phrases: string[], fallback: string): string {
  if (!phrases.length) return fallback;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Build a response with research-backed content
 */
export function buildResearchBackedResponse(
  coreMessage: string,
  context: EnhancedToolContext,
  options?: {
    includeInsight?: boolean;
    includeFramework?: string;
    includeTendencyAdaptation?: boolean;
  }
): string {
  let response = coreMessage;

  // Add random insight from research
  if (options?.includeInsight && context.randomInsight) {
    response += `\n\nResearch shows: ${context.randomInsight}`;
  }

  // Add framework reference
  if (options?.includeFramework) {
    const framework = context.frameworks.find((f) =>
      f.name.toLowerCase().includes(options.includeFramework!.toLowerCase())
    );
    if (framework) {
      response += `\n\nThis approach draws from ${framework.name}: "${framework.coreIdea}"`;
    }
  }

  // Adapt for tendency
  if (options?.includeTendencyAdaptation && context.tendencyApproach) {
    response += `\n\n${context.tendencyApproach.approach}`;
  }

  return response;
}

/**
 * Get opening phrase appropriate for persona and domain
 */
export function getOpeningPhrase(context: EnhancedToolContext): string {
  return getRandomPhrase(context.personaPhrases.opening, "Let's explore this together.");
}

/**
 * Get validation phrase appropriate for persona and domain
 */
export function getValidationPhrase(context: EnhancedToolContext): string {
  return getRandomPhrase(
    context.personaPhrases.validation,
    "That makes sense given what you're going through."
  );
}

/**
 * Get encouragement phrase appropriate for persona and domain
 */
export function getEncouragementPhrase(context: EnhancedToolContext): string {
  return getRandomPhrase(context.personaPhrases.encouragement, "You're making real progress.");
}

/**
 * Format a framework for conversational use
 */
export function formatFrameworkForSpeech(framework: Framework): string {
  return `${framework.name} teaches us that ${framework.coreIdea.toLowerCase()}`;
}

/**
 * Get expert citation for credibility
 */
export function getExpertReference(research: DomainResearch | null): string | null {
  if (!research?.leadingExperts?.length) return null;
  const expert =
    research.leadingExperts[Math.floor(Math.random() * research.leadingExperts.length)];
  return `${expert.name}'s research on ${expert.contribution.toLowerCase()}`;
}

// ============================================================================
// INTEGRATION FOR SPECIFIC DOMAINS
// ============================================================================

/**
 * Get CBT cognitive distortions for anger/perfectionism tools
 */
export async function getCognitiveDistortionContext(): Promise<{
  distortions: Array<{ name: string; description: string; example: string }>;
  formatForSpeech: (distortion: { name: string; description: string }) => string;
}> {
  const cbt = await getFramework('cbt');
  const distortions =
    (
      cbt as Framework & {
        cognitiveDistortions?: Array<{ name: string; description: string; example: string }>;
      }
    )?.cognitiveDistortions || [];

  return {
    distortions,
    formatForSpeech: (d) => `${d.name}—that's when we ${d.description.toLowerCase()}`,
  };
}

/**
 * Get DBT skills for boundaries/anger tools
 */
export async function getDBTSkillContext(): Promise<{
  dearMan: string[];
  distressTolerance: string[];
}> {
  const dbt = await getFramework('dbt');
  const skills =
    (dbt as Framework & { skillModules?: Array<{ module: string; [key: string]: unknown }> })
      ?.skillModules || [];

  const interpersonal = skills.find((s) => s.module === 'Interpersonal Effectiveness');
  const distress = skills.find((s) => s.module === 'Distress Tolerance');

  return {
    dearMan: (interpersonal?.skills as string[]) || [],
    distressTolerance: (distress?.crisisSkills as string[]) || [],
  };
}

/**
 * Get attachment styles for relationships/dating tools
 */
export async function getAttachmentContext(): Promise<{
  styles: Array<{ style: string; internalModel: string; inRelationships: string }>;
  describeStyle: (style: string) => string;
}> {
  const attachment = await getFramework('attachmentTheory');
  const styles =
    (
      attachment as Framework & {
        attachmentStyles?: Array<{ style: string; internalModel: string; inRelationships: string }>;
      }
    )?.attachmentStyles || [];

  return {
    styles,
    describeStyle: (styleName: string) => {
      const style = styles.find((s) => s.style.toLowerCase() === styleName.toLowerCase());
      return style ? `${style.style} attachment means ${style.inRelationships.toLowerCase()}` : '';
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getEnhancedToolContext,
  getRandomPhrase,
  buildResearchBackedResponse,
  getOpeningPhrase,
  getValidationPhrase,
  getEncouragementPhrase,
  formatFrameworkForSpeech,
  getExpertReference,
  getCognitiveDistortionContext,
  getDBTSkillContext,
  getAttachmentContext,
};
