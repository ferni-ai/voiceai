/**
 * Relationship Stage Context Builder
 *
 * Injects relationship-stage-appropriate behaviors from personas/shared/relationship-building.ts.
 * This ensures personas adjust their tone, questions, and sharing level based on how well
 * they know the user.
 *
 * WIRED (Jan 2026): Connects the rich relationship-building content to the LLM context.
 *
 * When to inject:
 * - Early in session for greeting style guidance
 * - When appropriate moment for deepening questions arises
 * - When callback opportunities exist (follow-ups from past conversations)
 * - When persona might share personal stories (respecting stage)
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  createHintInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { createBuilderRng } from '../core/rng-utils.js';

// WIRED: Import relationship building content from personas/shared
import {
  STAGE_BEHAVIORS,
  getDeepeningQuestion,
  getAcknowledgment,
  generateCallback,
  shouldSharePersonalStory,
} from '../../../personas/shared/relationship-building.js';
import type { RelationshipStage } from '../../../types/user-profile.js';

const log = createLogger({ module: 'RelationshipStage' });

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map user profile relationship stage to the enum values used in relationship-building.ts
 */
function normalizeStage(stage?: string): RelationshipStage {
  switch (stage) {
    case 'new_acquaintance':
    case 'getting_to_know':
    case 'trusted_advisor':
    case 'old_friend':
      return stage;
    case 'building_rapport':
      return 'getting_to_know';
    case 'established':
      return 'trusted_advisor';
    case 'deep_bond':
      return 'old_friend';
    default:
      return 'new_acquaintance';
  }
}

/**
 * Detect if this is an emotional moment based on analysis
 */
function isEmotionalMoment(input: ContextBuilderInput): 'personal' | 'emotional' | 'progress' | 'struggle' | null {
  const { analysis, voiceEmotion } = input;
  
  // Check for struggle signals
  // Use state.distressLevel from ConversationAnalysis and voiceEmotion.emotion
  if ((analysis.state?.distressLevel ?? 0) > 0.5 || voiceEmotion?.emotion === 'sadness') {
    return 'struggle';
  }
  
  // Check for progress signals
  if (analysis.intent?.primary === 'celebration' || voiceEmotion?.emotion === 'joy') {
    return 'progress';
  }
  
  // Check for emotional sharing
  if (analysis.intent?.primary === 'venting' || analysis.intent?.primary === 'processing') {
    return 'emotional';
  }
  
  // Check for personal sharing (vulnerability)
  if (analysis.topics?.detected?.some(t => 
    t.includes('family') || t.includes('relationship') || t.includes('personal')
  )) {
    return 'personal';
  }
  
  return null;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildRelationshipStageContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userData, userProfile, persona, analysis } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;
  
  // Create deterministic RNG for this builder
  const rng = createBuilderRng(input, 'relationship-stage');
  
  // Get normalized relationship stage
  const stage = normalizeStage(userProfile?.relationshipStage);
  const stageBehavior = STAGE_BEHAVIORS[stage];
  
  // ========================================
  // 1. EARLY TURN: Relationship stage awareness
  // ========================================
  if (turnCount <= 2) {
    const sharingLevel = stageBehavior.sharingLevel;
    const stageHint = `[RELATIONSHIP STAGE: ${stage.replace('_', ' ')}. Sharing level: ${sharingLevel}. ${
      stage === 'new_acquaintance' 
        ? 'Keep personal stories minimal. Focus on getting to know them.' 
        : stage === 'old_friend'
        ? 'You can be more vulnerable and share deeper stories if appropriate.'
        : 'Building rapport - share relevant stories but stay appropriately boundaried.'
    }]`;
    
    injections.push(createHintInjection('relationship_stage', stageHint));
    
    log.debug({ personaId: persona.id, stage, turnCount }, 'Injected relationship stage guidance');
  }
  
  // ========================================
  // 2. CALLBACK OPPORTUNITY (follow-ups from past)
  // ========================================
  if (turnCount <= 3 && userProfile && rng.chance(0.35)) {
    const callback = generateCallback(userProfile);
    if (callback) {
      // Don't inject the literal callback - describe the opportunity
      const callbackHint = `[CALLBACK OPPORTUNITY: You remember something from a past conversation that would be natural to follow up on. Consider checking in about it if the moment feels right.]`;
      injections.push(createHintInjection('relationship_callback', callbackHint));
      
      log.debug({ personaId: persona.id, hasCallback: true }, 'Injected callback opportunity');
    }
  }
  
  // ========================================
  // 3. ACKNOWLEDGMENT for emotional moments
  // ========================================
  const emotionalType = isEmotionalMoment(input);
  if (emotionalType && rng.chance(0.5)) {
    const acknowledgmentStyle = {
      personal: 'acknowledge that they shared something personal with you',
      emotional: 'validate their feelings',
      progress: 'celebrate their progress',
      struggle: 'acknowledge the difficulty they\'re facing',
    }[emotionalType];
    
    const ackHint = `[ACKNOWLEDGMENT: This is a moment to ${acknowledgmentStyle}. Make them feel seen and heard before moving forward.]`;
    injections.push(createHintInjection('relationship_ack', ackHint));
    
    log.debug({ personaId: persona.id, emotionalType }, 'Injected acknowledgment guidance');
  }
  
  // ========================================
  // 4. DEEPENING QUESTION opportunity (later in conversation)
  // ========================================
  if (turnCount > 4 && analysis.intent?.primary !== 'task' && rng.chance(0.2)) {
    // Only suggest deepening if the conversation has space for it
    const deepeningHint = `[DEEPENING OPPORTUNITY: If the moment feels right, consider asking a question that helps you understand them better at a deeper level - appropriate for your ${stage.replace('_', ' ')} relationship.]`;
    injections.push(createHintInjection('relationship_deepen', deepeningHint));
    
    log.debug({ personaId: persona.id, stage }, 'Injected deepening question opportunity');
  }
  
  // ========================================
  // 5. STORY SHARING guidance
  // ========================================
  if (turnCount > 2 && rng.chance(0.15)) {
    const canShareLight = shouldSharePersonalStory(stage, 'light');
    const canShareMedium = shouldSharePersonalStory(stage, 'medium');
    const canShareHeavy = shouldSharePersonalStory(stage, 'heavy');
    
    let storyGuidance = '[STORY SHARING: ';
    if (canShareHeavy) {
      storyGuidance += 'Your relationship is deep enough that you can share vulnerable personal stories if relevant.]';
    } else if (canShareMedium) {
      storyGuidance += 'You can share relevant personal stories, but keep them light to medium weight.]';
    } else if (canShareLight) {
      storyGuidance += 'Keep personal stories light and brief - you\'re still getting to know each other.]';
    } else {
      storyGuidance += 'Focus on them for now rather than sharing personal stories.]';
    }
    
    injections.push(createHintInjection('relationship_story', storyGuidance));
  }
  
  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'relationship_building_context',
  description: 'Injects relationship-stage-appropriate behaviors and opportunities from personas/shared',
  priority: 55, // Medium priority - should run after core emotional but before engagement
  build: buildRelationshipStageContext,
});

export { buildRelationshipStageContext };
