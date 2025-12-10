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
  ActivityLogEntry,
  // ACT Types
  ACTProcess,
  ACTValue,
  BehavioralActivation,
  // MI Types
  ChangeTalk,
  ChangeTalkInstance,
  // CBT Types
  CognitiveRestructuring,
  CommittedAction,
  // DBT Types
  DBTModule,
  DBTSkill,
  DefusionTechnique,
  MoodEntry,
  OARSSkills,
  PleasantActivity,
  TherapeuticFrameworksConfig,
  // Profiles
  TherapeuticProfile,
  ValueDomain,
} from './types.js';

export { DEFAULT_CONFIG } from './types.js';

// ============================================================================
// ACT - ACCEPTANCE & COMMITMENT THERAPY
// ============================================================================

export {
  buildValuesContext,
  checkValuesAlignment,
  completeAction,
  // Values
  detectValuesInSpeech,
  generateValuesPrompt,
  getPendingActions,
  getTopValues,
  getUserValues,
  getValueExamples,
  getValuesByDomain,
  getValuesQuestion,
  recordCommittedAction,
  recordValue,
  VALUE_EXAMPLES,
  VALUES_QUESTIONS,
  type DetectedValue,
  type ValuesAlignment,
} from './act-values.js';

export {
  buildDefusionContext,
  // Defusion
  DEFUSION_TECHNIQUES,
  getAllDefusionTechniques,
  getDefusionTechnique,
  getMostEffectiveDefusion,
  getRecentDefusionTechniques,
  recordDefusionUse,
  selectDefusionTechnique,
} from './act-defusion.js';

// ============================================================================
// DBT - DIALECTICAL BEHAVIOR THERAPY
// ============================================================================

export {
  ALL_DBT_SKILLS,
  buildDBTContext,
  // Skills
  DISTRESS_TOLERANCE_SKILLS,
  EMOTION_REGULATION_SKILLS,
  getDBTSkill,
  getLearnedSkills,
  getMostEffectiveSkills,
  getSkillsByModule,
  INTERPERSONAL_SKILLS,
  MINDFULNESS_SKILLS,
  recordSkillUse,
  selectDBTSkill,
} from './dbt-skills.js';

// ============================================================================
// MOTIVATIONAL INTERVIEWING
// ============================================================================

export {
  AFFIRMATIONS,
  analyzeAmbivalence,
  // Context
  buildMIContext,
  CHANGE_TALK_PATTERNS,
  // Change talk
  detectChangeTalk,
  detectSustainTalk,
  // OARS
  generateOARSResponse,
  getChangeTalkHistory,
  getStrongestChangeTalk,
  getTopChangeTalkTopics,
  OPEN_QUESTIONS,
  recordChangeTalk,
  REFLECTION_TEMPLATES,
  type OARSResponse,
  type Reflection,
} from './motivational-interviewing.js';

// ============================================================================
// UNIFIED API
// ============================================================================

import { createLogger } from '../../utils/safe-logger.js';
import { buildDefusionContext, selectDefusionTechnique } from './act-defusion.js';
import { buildValuesContext, detectValuesInSpeech, getUserValues } from './act-values.js';
import { buildDBTContext, selectDBTSkill } from './dbt-skills.js';
import {
  buildMIContext,
  detectSustainTalk,
  getTopChangeTalkTopics,
} from './motivational-interviewing.js';
import type { DBTSkill, DefusionTechnique } from './types.js';

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

  // CRITICAL: DBT distress tolerance is available to ALL users, even new ones
  // Crisis doesn't wait for relationship stage. Safety first.

  // High distress → DBT first (available to everyone)
  if (enableDBT && emotionIntensity > 0.7) {
    const dbtContext = buildDBTContext(userId, {
      emotionIntensity,
      keywords: userText.toLowerCase().split(' '),
    });
    if (dbtContext) {
      contextParts.push(dbtContext);
      result.frameworks.push('dbt');
      result.primaryRecommendation = 'dbt_skill';

      // Select a specific DBT skill recommendation
      const skill = selectDBTSkill({
        emotionIntensity,
        situation: topic,
        keywords: userText.toLowerCase().split(' '),
      });
      if (skill) {
        result.recommendedSkill = skill;
      }
    }
  }

  // Motivational Interviewing - detect change talk and sustain talk
  // MI is gentle and relationship-building, available to all stages except brand new users
  if (enableMI && relationshipStage !== 'new') {
    const miContext = buildMIContext(userId, userText, topic);
    if (miContext) {
      contextParts.push(miContext);
      result.frameworks.push('mi');
      if (!result.primaryRecommendation) {
        result.primaryRecommendation = 'reflect_change_talk';
      }
    }

    // Detect sustain talk (resistance) for MI strategy adjustment
    const sustainTalk = detectSustainTalk(userText);
    if (sustainTalk.detected) {
      result.hasSustainTalk = true;
      result.sustainTalkPatterns = sustainTalk.patterns;
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

    // ACT Defusion - for recurring negative thoughts
    const defusionContext = buildDefusionContext(userId, userText);
    if (defusionContext) {
      contextParts.push(defusionContext);
      if (!result.frameworks.includes('act')) {
        result.frameworks.push('act');
      }

      // Select appropriate defusion technique
      const technique = selectDefusionTechnique({
        thought: userText,
        emotionIntensity,
      });
      if (technique) {
        result.recommendedDefusion = technique;
        if (!result.primaryRecommendation) {
          result.primaryRecommendation = 'defusion';
        }
      }
    }
  }

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
  /** Recommended DBT skill when high distress detected */
  recommendedSkill?: DBTSkill;
  /** Recommended ACT defusion technique */
  recommendedDefusion?: DefusionTechnique;
  /** Whether sustain talk (resistance) was detected */
  hasSustainTalk?: boolean;
  /** Detected sustain talk patterns */
  sustainTalkPatterns?: string[];
}

/**
 * Get a summary of therapeutic work with a user.
 */
export function getTherapeuticSummary(userId: string): TherapeuticSummary {
  const values = getUserValues(userId);
  const changeTalkTopics = getTopChangeTalkTopics(userId, 3);

  return {
    hasData: values.length > 0 || changeTalkTopics.length > 0,
    valuesIdentified: values.length,
    topValues: values.slice(0, 3).map((v) => v.value),
    changeTalkTopics,
  };
}

export interface TherapeuticSummary {
  hasData: boolean;
  valuesIdentified: number;
  topValues: string[];
  changeTalkTopics: string[];
}
