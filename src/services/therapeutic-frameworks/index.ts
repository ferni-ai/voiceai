/**
 * Therapeutic Frameworks Index
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Evidence-based therapeutic frameworks adapted for voice coaching.
 * These aren't replacements for therapy—they're tools that help
 * Ferni offer research-backed support in everyday conversation.
 *
 * FRAMEWORKS:
 * 1. ACT (Acceptance & Commitment Therapy)
 *    - Values clarification
 *    - Cognitive defusion
 *    - Present moment awareness
 *
 * 2. DBT (Dialectical Behavior Therapy)
 *    - Distress tolerance (TIPP, STOP, ACCEPTS)
 *    - Emotion regulation (PLEASE, Opposite Action)
 *    - Interpersonal effectiveness (DEAR MAN, GIVE, FAST)
 *    - Mindfulness (Wise Mind)
 *
 * 3. Motivational Interviewing
 *    - Change talk detection
 *    - OARS responses
 *    - Rolling with resistance
 *
 * @module TherapeuticFrameworks
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  // ACT Types
  ACTProcess,
  ACTValue,
  ValueDomain,
  CommittedAction,
  DefusionTechnique,

  // DBT Types
  DBTModule,
  DBTSkill,

  // MI Types
  ChangeTalk,
  ChangeTalkInstance,
  OARSSkills,

  // CBT Types
  CognitiveRestructuring,
  BehavioralActivation,
  PleasantActivity,
  ActivityLogEntry,
  MoodEntry,

  // Profiles
  TherapeuticProfile,
  TherapeuticFrameworksConfig,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';

// ============================================================================
// ACT - ACCEPTANCE & COMMITMENT THERAPY
// ============================================================================

export {
  // Values
  detectValuesInSpeech,
  recordValue,
  getUserValues,
  getValuesByDomain,
  getTopValues,
  checkValuesAlignment,
  generateValuesPrompt,
  buildValuesContext,
  getValuesQuestion,
  getValueExamples,
  recordCommittedAction,
  completeAction,
  getPendingActions,
  VALUES_QUESTIONS,
  VALUE_EXAMPLES,
  type DetectedValue,
  type ValuesAlignment,
} from './act-values.js';

export {
  // Defusion
  DEFUSION_TECHNIQUES,
  selectDefusionTechnique,
  getAllDefusionTechniques,
  getDefusionTechnique,
  recordDefusionUse,
  getMostEffectiveDefusion,
  getRecentDefusionTechniques,
  buildDefusionContext,
} from './act-defusion.js';

// ============================================================================
// DBT - DIALECTICAL BEHAVIOR THERAPY
// ============================================================================

export {
  // Skills
  DISTRESS_TOLERANCE_SKILLS,
  EMOTION_REGULATION_SKILLS,
  INTERPERSONAL_SKILLS,
  MINDFULNESS_SKILLS,
  ALL_DBT_SKILLS,
  selectDBTSkill,
  getSkillsByModule,
  getDBTSkill,
  recordSkillUse,
  getMostEffectiveSkills,
  getLearnedSkills,
  buildDBTContext,
} from './dbt-skills.js';

// ============================================================================
// MOTIVATIONAL INTERVIEWING
// ============================================================================

export {
  // Change talk
  detectChangeTalk,
  getStrongestChangeTalk,
  detectSustainTalk,
  recordChangeTalk,
  getChangeTalkHistory,
  getTopChangeTalkTopics,
  analyzeAmbivalence,

  // OARS
  generateOARSResponse,
  OPEN_QUESTIONS,
  AFFIRMATIONS,
  REFLECTION_TEMPLATES,
  CHANGE_TALK_PATTERNS,

  // Context
  buildMIContext,

  type OARSResponse,
  type Reflection,
} from './motivational-interviewing.js';

// ============================================================================
// UNIFIED API
// ============================================================================

import {
  detectValuesInSpeech,
  buildValuesContext,
  getUserValues,
} from './act-values.js';
import { buildDefusionContext, selectDefusionTechnique } from './act-defusion.js';
import { buildDBTContext, selectDBTSkill } from './dbt-skills.js';
import { buildMIContext, detectChangeTalk, detectSustainTalk } from './motivational-interviewing.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TherapeuticFrameworks' });

/**
 * Build complete therapeutic context for a conversation turn.
 */
export function buildTherapeuticContext(
  userId: string,
  userText: string,
  context?: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
    relationshipStage?: 'new' | 'building' | 'established' | 'deep';
    enableACT?: boolean;
    enableDBT?: boolean;
    enableMI?: boolean;
  }
): TherapeuticContextResult {
  const {
    topic,
    emotion,
    emotionIntensity = 0.5,
    relationshipStage = 'building',
    enableACT = true,
    enableDBT = true,
    enableMI = true,
  } = context || {};

  const contextParts: string[] = [];
  const result: TherapeuticContextResult = {
    hasContext: false,
    frameworks: [],
    contextParts: [],
    primaryRecommendation: null,
  };

  // Only use frameworks for users we have relationship with
  if (relationshipStage === 'new') {
    return result;
  }

  // High distress → DBT first
  if (enableDBT && emotionIntensity > 0.7) {
    const dbtContext = buildDBTContext(userId, {
      emotionIntensity,
      keywords: userText.toLowerCase().split(' '),
    });
    if (dbtContext) {
      contextParts.push(dbtContext);
      result.frameworks.push('dbt');
      result.primaryRecommendation = 'dbt_skill';
    }
  }

  // Motivational Interviewing - detect change talk
  if (enableMI) {
    const miContext = buildMIContext(userId, userText, topic);
    if (miContext) {
      contextParts.push(miContext);
      result.frameworks.push('mi');
      if (!result.primaryRecommendation) {
        result.primaryRecommendation = 'reflect_change_talk';
      }
    }
  }

  // ACT Values - for established relationships
  if (enableACT && (relationshipStage === 'established' || relationshipStage === 'deep')) {
    // Check for values in speech
    const detectedValues = detectValuesInSpeech(userText, { topic, emotion });
    if (detectedValues.length > 0) {
      const valuesContext = buildValuesContext(userId);
      if (valuesContext) {
        contextParts.push(valuesContext);
        result.frameworks.push('act');
      }
    }
  }

  // ACT Defusion - for recurring negative thoughts (detected elsewhere)
  // This would integrate with cognitive-intelligence

  result.hasContext = contextParts.length > 0;
  result.contextParts = contextParts;

  if (result.hasContext) {
    log.debug(
      {
        userId,
        frameworks: result.frameworks,
        primary: result.primaryRecommendation,
      },
      '🎓 Therapeutic context built'
    );
  }

  return result;
}

export interface TherapeuticContextResult {
  hasContext: boolean;
  frameworks: string[];
  contextParts: string[];
  primaryRecommendation:
    | 'dbt_skill'
    | 'reflect_change_talk'
    | 'values_alignment'
    | 'defusion'
    | null;
}

/**
 * Get a summary of therapeutic work with a user.
 */
export function getTherapeuticSummary(userId: string): TherapeuticSummary {
  const values = getUserValues(userId);
  const changeTalkTopics = detectChangeTalk('', undefined); // Just for type

  return {
    hasData: values.length > 0,
    valuesIdentified: values.length,
    topValues: values.slice(0, 3).map((v) => v.value),
    // Add more summary data as needed
  };
}

export interface TherapeuticSummary {
  hasData: boolean;
  valuesIdentified: number;
  topValues: string[];
}

