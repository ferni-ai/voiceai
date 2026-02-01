/**
 * Outreach Voice Context Builder
 *
 * Provides voice guidance for proactive outreach messages.
 * Different tone for "thinking of you" vs response mode.
 *
 * PHILOSOPHY:
 * "Lead with warmth and genuine care. Meet them where they are.
 *  Offer presence without pressure."
 *
 * This builder activates during proactive check-ins, follow-ups after
 * tough conversations, or milestone celebrations - times when Ferni
 * reaches out first rather than responding.
 *
 * @module OutreachVoiceContext
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { loadOutreachVoice, type OutreachVoice } from '../../../services/persona-content-loader.js';
import {
  registerContextBuilder,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'OutreachVoiceContext' });

// ============================================================================
// STATE & CACHE
// ============================================================================

const contentCache = new Map<string, OutreachVoice>();

// ============================================================================
// CONTENT LOADING
// ============================================================================

async function loadContent(personaId: string): Promise<OutreachVoice | null> {
  if (contentCache.has(personaId)) {
    return contentCache.get(personaId)!;
  }

  try {
    const content = await loadOutreachVoice(personaId);
    if (content) {
      contentCache.set(personaId, content);
      log.debug({ personaId }, 'Loaded outreach voice content');
    }
    return content;
  } catch (error) {
    log.warn({ personaId, error }, 'Failed to load outreach voice content');
    return null;
  }
}

// ============================================================================
// OUTREACH DETECTION
// ============================================================================

type OutreachContext =
  | 'thinking_of_you'
  | 'after_tough_conversation'
  | 'celebration'
  | 'gentle_check_in'
  | 'after_absence'
  | 'milestone'
  | 'none';

function detectOutreachContext(input: ContextBuilderInput): OutreachContext {
  const { userData } = input;
  const turnCount = userData.turnCount || 0;

  // On first turn with returning user, this is a re-engagement
  if (turnCount === 0 && userData.isReturningUser) {
    return 'gentle_check_in';
  }

  // Otherwise this builder doesn't apply during normal conversation
  // It's meant for proactive outreach scenarios
  return 'none';
}

// ============================================================================
// GUIDANCE GENERATION
// ============================================================================

function getRelationshipStage(userData: ContextBuilderInput['userData']): string {
  // Use turn count and returning user status as proxy for relationship depth
  const turnCount = userData.turnCount || 0;
  const isReturning = userData.isReturningUser || false;
  
  if (!isReturning) return 'new';
  if (turnCount < 10) return 'building';
  if (turnCount < 50) return 'established';
  return 'deep';
}

function generateOutreachGuidance(
  content: OutreachVoice,
  context: OutreachContext,
  relationshipStage: string
): string | null {
  const lines: string[] = [`[OUTREACH VOICE: ${context.toUpperCase().replace(/_/g, ' ')}]`, ''];

  // Voice profile
  if (content.voice_profile) {
    lines.push('VOICE PROFILE:');
    lines.push(`- Tone: ${content.voice_profile.tone}`);
    lines.push(`- Energy: ${content.voice_profile.energy}`);
    lines.push(`- Style: ${content.voice_profile.style}`);
    lines.push('');
  }

  // Relationship-appropriate style
  const relationshipStyle = content.relationship_adaptations?.[relationshipStage as keyof typeof content.relationship_adaptations];
  if (relationshipStyle) {
    lines.push(`RELATIONSHIP STAGE (${relationshipStage}):`)
    lines.push(`- Formality: ${relationshipStyle.formality}`);
    lines.push(`- Opening style: ${relationshipStyle.opening_style}`);
    lines.push(`- Closing style: ${relationshipStyle.closing_style}`);
    if (relationshipStyle.can_reference_shared_history) {
      lines.push('- Can reference shared history and inside jokes');
    }
    lines.push('');
  }

  // Context-specific templates
  const triggerTemplates = content.trigger_templates;
  if (triggerTemplates) {
    switch (context) {
      case 'thinking_of_you':
        if (triggerTemplates.thinking_of_you) {
          lines.push('TEMPLATE GUIDANCE:');
          lines.push(`Example: "${triggerTemplates.thinking_of_you.general}"`);
        }
        break;
      case 'after_tough_conversation':
        if (triggerTemplates.thinking_of_you?.after_tough_conversation) {
          lines.push('TEMPLATE GUIDANCE:');
          lines.push(`Example: "${triggerTemplates.thinking_of_you.after_tough_conversation}"`);
        }
        break;
      case 'celebration':
        if (triggerTemplates.thinking_of_you?.celebration) {
          lines.push('TEMPLATE GUIDANCE:');
          lines.push(`Example: "${triggerTemplates.thinking_of_you.celebration}"`);
        }
        break;
      case 'gentle_check_in':
        if (triggerTemplates.gentle_check_in) {
          lines.push('TEMPLATE GUIDANCE:');
          lines.push(`Example: "${triggerTemplates.gentle_check_in.regular}"`);
        }
        break;
      case 'after_absence':
        if (triggerTemplates.gentle_check_in?.after_absence) {
          lines.push('TEMPLATE GUIDANCE:');
          lines.push(`Example: "${triggerTemplates.gentle_check_in.after_absence}"`);
        }
        break;
      case 'milestone':
        if (triggerTemplates.milestone) {
          lines.push('TEMPLATE GUIDANCE:');
          lines.push(`Example: "${triggerTemplates.milestone.growth_noticed}"`);
        }
        break;
    }
    lines.push('');
  }

  // Always/Never rules
  if (content.always_do && content.always_do.length > 0) {
    lines.push('ALWAYS:');
    for (const item of content.always_do.slice(0, 3)) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (content.do_not && content.do_not.length > 0) {
    lines.push('NEVER:');
    for (const item of content.do_not.slice(0, 3)) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildOutreachVoiceContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { persona, userData } = input;
  const injections: ContextInjection[] = [];

  const personaId = persona?.identity?.id || 'ferni';

  // Load content
  const content = await loadContent(personaId);
  if (!content) {
    return injections;
  }

  // Detect context
  const context = detectOutreachContext(input);

  if (context === 'none') {
    return injections;
  }

  // Get relationship stage
  const relationshipStage = getRelationshipStage(userData);

  // Generate guidance
  const guidance = generateOutreachGuidance(content, context, relationshipStage);
  if (guidance) {
    injections.push(
      createHintInjection('outreach_voice', guidance, { category: 'persona' })
    );

    log.debug({ personaId, context, relationshipStage }, 'Outreach voice guidance applied');
  }

  return injections;
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder({
  name: 'outreach_voice_context',
  description: 'Provides voice guidance for proactive outreach messages',
  priority: 58, // Engagement layer - influences tone for proactive reach-outs
  build: buildOutreachVoiceContext,
});

export { buildOutreachVoiceContext };
