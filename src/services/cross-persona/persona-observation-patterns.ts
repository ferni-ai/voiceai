/**
 * Persona-Specific Observation Patterns
 *
 * Each persona has unique expertise and observes different signals.
 * This module defines what each persona "looks for" in conversation,
 * enabling richer Team Huddle coordination.
 *
 * > "Six brilliant minds. Each seeing what the others can't."
 *
 * @module services/cross-persona/persona-observation-patterns
 */

import type { PersonaId, PersonaObservation } from './team-huddle.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ObservationPattern {
  /** Keywords/phrases that trigger observation */
  keywords: string[];
  /** What type of observation this produces */
  observationType: PersonaObservation['observationType'];
  /** Template for the observation content */
  contentTemplate: string;
  /** Base confidence for this pattern */
  baseConfidence: number;
  /** Suggested action template */
  suggestedActionTemplate?: string;
  /** Domain tag for cross-referencing */
  domain: string;
}

export interface PersonaObservationProfile {
  personaId: PersonaId;
  /** Display name for logging */
  displayName: string;
  /** Primary domain of expertise */
  primaryDomain: string;
  /** What this persona specifically looks for */
  observationPatterns: ObservationPattern[];
  /** Cross-persona cues that might warrant handoff suggestions */
  handoffCues: Array<{
    keywords: string[];
    targetPersona: PersonaId;
    reason: string;
  }>;
}

// ============================================================================
// FERNI - Life Coordinator (General Support)
// ============================================================================

const FERNI_PATTERNS: PersonaObservationProfile = {
  personaId: 'ferni',
  displayName: 'Ferni',
  primaryDomain: 'life_coaching',
  observationPatterns: [
    {
      keywords: ['stuck', 'lost', 'confused', 'direction', 'purpose'],
      observationType: 'concern',
      contentTemplate: 'User expressing feelings of being stuck or lacking direction.',
      baseConfidence: 0.7,
      suggestedActionTemplate: 'Explore what "stuck" means to them specifically',
      domain: 'life_direction',
    },
    {
      keywords: ['change', 'transition', 'new chapter', 'moving on', 'letting go'],
      observationType: 'opportunity',
      contentTemplate: 'User navigating life transition.',
      baseConfidence: 0.65,
      suggestedActionTemplate: 'Support through transition with reflection',
      domain: 'life_transitions',
    },
    {
      keywords: ['help', 'support', 'need', 'struggling', "can't"],
      observationType: 'concern',
      contentTemplate: 'User explicitly asking for or expressing need for support.',
      baseConfidence: 0.8,
      suggestedActionTemplate: 'Provide immediate emotional support',
      domain: 'support_seeking',
    },
    {
      keywords: ['grateful', 'thankful', 'appreciate', 'blessed', 'lucky'],
      observationType: 'opportunity',
      contentTemplate: 'User expressing gratitude - good moment for growth reflection.',
      baseConfidence: 0.6,
      suggestedActionTemplate: 'Deepen gratitude practice',
      domain: 'positive_emotions',
    },
  ],
  handoffCues: [
    {
      keywords: ['research', 'learn', 'study', 'understand'],
      targetPersona: 'peter',
      reason: 'User wants to learn or research something',
    },
    {
      keywords: ['routine', 'habit', 'sleep', 'exercise'],
      targetPersona: 'maya',
      reason: 'User discussing habits or routines',
    },
    {
      keywords: ['calendar', 'schedule', 'meeting', 'email'],
      targetPersona: 'alex',
      reason: 'User needs communication or schedule help',
    },
    {
      keywords: ['goal', 'achieve', 'celebrate', 'milestone'],
      targetPersona: 'jordan',
      reason: 'User discussing goals or achievements',
    },
    {
      keywords: ['meaning', 'purpose', 'legacy', 'death', 'philosophy'],
      targetPersona: 'nayan',
      reason: 'User exploring deeper existential questions',
    },
  ],
};

// ============================================================================
// PETER - Research & Knowledge (Financial Focus)
// ============================================================================

const PETER_PATTERNS: PersonaObservationProfile = {
  personaId: 'peter',
  displayName: 'Peter',
  primaryDomain: 'research',
  observationPatterns: [
    {
      keywords: ['stress', 'work', 'job', 'career', 'boss', 'coworker'],
      observationType: 'concern',
      contentTemplate: 'User expressing work-related stress.',
      baseConfidence: 0.7,
      suggestedActionTemplate: 'Explore work stress patterns and coping strategies',
      domain: 'work_stress',
    },
    {
      keywords: ['money', 'financial', 'budget', 'invest', 'save', 'debt'],
      observationType: 'insight',
      contentTemplate: 'User discussing financial matters.',
      baseConfidence: 0.75,
      suggestedActionTemplate: 'Provide evidence-based financial perspective',
      domain: 'financial',
    },
    {
      keywords: ['data', 'research', 'study', 'evidence', 'proven'],
      observationType: 'opportunity',
      contentTemplate: 'User interested in research-backed information.',
      baseConfidence: 0.8,
      suggestedActionTemplate: 'Share relevant research insights',
      domain: 'research_interest',
    },
    {
      keywords: ['market', 'economy', 'inflation', 'recession'],
      observationType: 'insight',
      contentTemplate: 'User concerned about economic conditions.',
      baseConfidence: 0.7,
      suggestedActionTemplate: 'Provide historical context and long-term perspective',
      domain: 'economic_concerns',
    },
  ],
  handoffCues: [
    {
      keywords: ['overwhelmed', 'burnout', 'exhausted'],
      targetPersona: 'maya',
      reason: 'User showing signs of burnout - needs habit support',
    },
    {
      keywords: ['sad', 'anxious', 'scared', 'worried'],
      targetPersona: 'ferni',
      reason: 'User needs emotional support',
    },
  ],
};

// ============================================================================
// MAYA - Habits & Routines
// ============================================================================

const MAYA_PATTERNS: PersonaObservationProfile = {
  personaId: 'maya',
  displayName: 'Maya',
  primaryDomain: 'habits',
  observationPatterns: [
    {
      keywords: ['sleep', 'tired', 'exhausted', 'insomnia', 'rest'],
      observationType: 'concern',
      contentTemplate: 'User reporting sleep issues or fatigue.',
      baseConfidence: 0.8,
      suggestedActionTemplate: 'Explore sleep hygiene and energy management',
      domain: 'sleep_health',
    },
    {
      keywords: ['exercise', 'workout', 'gym', 'run', 'walk', 'active'],
      observationType: 'pattern',
      contentTemplate: 'User discussing physical activity patterns.',
      baseConfidence: 0.7,
      suggestedActionTemplate: 'Support movement habits and motivation',
      domain: 'physical_activity',
    },
    {
      keywords: ['routine', 'habit', 'daily', 'morning', 'night', 'ritual'],
      observationType: 'insight',
      contentTemplate: 'User discussing routines or habits.',
      baseConfidence: 0.75,
      suggestedActionTemplate: 'Optimize and reinforce positive routines',
      domain: 'routine_building',
    },
    {
      keywords: ['broke', 'failed', 'skipped', 'missed', 'relapse'],
      observationType: 'concern',
      contentTemplate: 'User reporting habit break or setback.',
      baseConfidence: 0.85,
      suggestedActionTemplate: 'Support recovery without judgment',
      domain: 'habit_setbacks',
    },
    {
      keywords: ['streak', 'days', 'consistent', 'keeping up'],
      observationType: 'milestone',
      contentTemplate: 'User tracking habit progress.',
      baseConfidence: 0.7,
      suggestedActionTemplate: 'Celebrate progress and reinforce',
      domain: 'habit_tracking',
    },
  ],
  handoffCues: [
    {
      keywords: ['why', 'deeper', 'meaning', 'purpose'],
      targetPersona: 'nayan',
      reason: 'User seeking deeper meaning behind habits',
    },
    {
      keywords: ['organize', 'plan', 'schedule'],
      targetPersona: 'alex',
      reason: 'User needs scheduling help for habits',
    },
  ],
};

// ============================================================================
// JORDAN - Milestones & Celebrations
// ============================================================================

const JORDAN_PATTERNS: PersonaObservationProfile = {
  personaId: 'jordan',
  displayName: 'Jordan',
  primaryDomain: 'milestones',
  observationPatterns: [
    {
      keywords: ['goal', 'achieve', 'target', 'reach', 'accomplish'],
      observationType: 'opportunity',
      contentTemplate: 'User discussing goals or achievements.',
      baseConfidence: 0.75,
      suggestedActionTemplate: 'Help clarify and celebrate goals',
      domain: 'goal_setting',
    },
    {
      keywords: ['birthday', 'anniversary', 'wedding', 'graduation'],
      observationType: 'milestone',
      contentTemplate: 'User mentioning upcoming event.',
      baseConfidence: 0.9,
      suggestedActionTemplate: 'Note for celebration/reminder',
      domain: 'life_events',
    },
    {
      keywords: ['celebrate', 'proud', 'did it', 'finally', 'success'],
      observationType: 'milestone',
      contentTemplate: 'User celebrating an achievement.',
      baseConfidence: 0.85,
      suggestedActionTemplate: 'Join in celebration and reinforce',
      domain: 'achievements',
    },
    {
      keywords: ['deadline', 'due', 'by', 'until', 'before'],
      observationType: 'pattern',
      contentTemplate: 'User tracking deadlines or timelines.',
      baseConfidence: 0.7,
      suggestedActionTemplate: 'Help plan and track progress',
      domain: 'time_tracking',
    },
  ],
  handoffCues: [
    {
      keywords: ['overwhelmed', 'too much', 'burned out'],
      targetPersona: 'maya',
      reason: 'User needs habit/routine support',
    },
    {
      keywords: ['emotional', 'crying', 'sad'],
      targetPersona: 'ferni',
      reason: 'User needs emotional support',
    },
  ],
};

// ============================================================================
// ALEX - Communication & Calendar
// ============================================================================

const ALEX_PATTERNS: PersonaObservationProfile = {
  personaId: 'alex',
  displayName: 'Alex',
  primaryDomain: 'communication',
  observationPatterns: [
    {
      keywords: ['email', 'message', 'reply', 'respond', 'write'],
      observationType: 'opportunity',
      contentTemplate: 'User needs communication help.',
      baseConfidence: 0.8,
      suggestedActionTemplate: 'Assist with communication drafting',
      domain: 'written_communication',
    },
    {
      keywords: ['meeting', 'calendar', 'schedule', 'appointment', 'call'],
      observationType: 'insight',
      contentTemplate: 'User discussing scheduling.',
      baseConfidence: 0.75,
      suggestedActionTemplate: 'Help optimize calendar',
      domain: 'scheduling',
    },
    {
      keywords: ['busy', 'overwhelmed', 'no time', 'packed'],
      observationType: 'concern',
      contentTemplate: 'User reporting calendar overload.',
      baseConfidence: 0.8,
      suggestedActionTemplate: 'Review and optimize schedule',
      domain: 'time_management',
    },
    {
      keywords: ['difficult conversation', 'awkward', 'hard to say'],
      observationType: 'opportunity',
      contentTemplate: 'User preparing for difficult communication.',
      baseConfidence: 0.85,
      suggestedActionTemplate: 'Help craft sensitive messages',
      domain: 'difficult_conversations',
    },
  ],
  handoffCues: [
    {
      keywords: ['habit', 'routine', 'daily'],
      targetPersona: 'maya',
      reason: 'User discussing habits',
    },
    {
      keywords: ['research', 'learn', 'understand'],
      targetPersona: 'peter',
      reason: 'User wants to research something',
    },
  ],
};

// ============================================================================
// NAYAN - Wisdom & Philosophy
// ============================================================================

const NAYAN_PATTERNS: PersonaObservationProfile = {
  personaId: 'nayan',
  displayName: 'Nayan',
  primaryDomain: 'wisdom',
  observationPatterns: [
    {
      keywords: ['meaning', 'purpose', 'why', 'matters', 'worth'],
      observationType: 'insight',
      contentTemplate: 'User exploring existential questions.',
      baseConfidence: 0.8,
      suggestedActionTemplate: 'Explore meaning through wisdom traditions',
      domain: 'existential',
    },
    {
      keywords: ['death', 'dying', 'loss', 'grief', 'mortality'],
      observationType: 'concern',
      contentTemplate: 'User processing mortality or loss.',
      baseConfidence: 0.9,
      suggestedActionTemplate: 'Hold space with wisdom and presence',
      domain: 'mortality',
    },
    {
      keywords: ['legacy', 'remember', 'impact', 'contribution'],
      observationType: 'opportunity',
      contentTemplate: 'User reflecting on legacy and impact.',
      baseConfidence: 0.75,
      suggestedActionTemplate: 'Guide legacy reflection',
      domain: 'legacy',
    },
    {
      keywords: ['values', 'believe', 'important', 'principle'],
      observationType: 'insight',
      contentTemplate: 'User exploring core values.',
      baseConfidence: 0.8,
      suggestedActionTemplate: 'Deepen values exploration',
      domain: 'values',
    },
    {
      keywords: ['life', 'big picture', 'perspective', 'step back'],
      observationType: 'opportunity',
      contentTemplate: 'User seeking broader perspective.',
      baseConfidence: 0.7,
      suggestedActionTemplate: 'Offer wisdom perspective',
      domain: 'perspective',
    },
  ],
  handoffCues: [
    {
      keywords: ['practical', 'action', 'steps', 'do'],
      targetPersona: 'ferni',
      reason: 'User ready for practical action',
    },
    {
      keywords: ['habit', 'routine', 'daily'],
      targetPersona: 'maya',
      reason: 'User wants to implement habits',
    },
  ],
};

// ============================================================================
// PROFILE LOOKUP
// ============================================================================

const PERSONA_PROFILES: Record<PersonaId, PersonaObservationProfile> = {
  ferni: FERNI_PATTERNS,
  peter: PETER_PATTERNS,
  maya: MAYA_PATTERNS,
  jordan: JORDAN_PATTERNS,
  alex: ALEX_PATTERNS,
  nayan: NAYAN_PATTERNS,
};

/**
 * Get the observation profile for a persona.
 */
export function getPersonaObservationProfile(
  personaId: PersonaId
): PersonaObservationProfile {
  return PERSONA_PROFILES[personaId] || FERNI_PATTERNS;
}

/**
 * Analyze user text through a persona's lens to extract observations.
 *
 * Returns matching patterns that can be recorded to Team Huddle.
 */
export function analyzeTextForPersona(
  personaId: PersonaId,
  text: string,
  emotionIntensity?: number
): Array<{
  pattern: ObservationPattern;
  matchedKeywords: string[];
  adjustedConfidence: number;
}> {
  const profile = getPersonaObservationProfile(personaId);
  const lowerText = text.toLowerCase();
  const matches: Array<{
    pattern: ObservationPattern;
    matchedKeywords: string[];
    adjustedConfidence: number;
  }> = [];

  for (const pattern of profile.observationPatterns) {
    const matchedKeywords = pattern.keywords.filter((kw) =>
      lowerText.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      // More keyword matches = higher confidence
      const keywordBoost = Math.min(0.2, matchedKeywords.length * 0.05);
      // Higher emotion intensity = higher confidence
      const emotionBoost = emotionIntensity ? emotionIntensity * 0.1 : 0;

      matches.push({
        pattern,
        matchedKeywords,
        adjustedConfidence: Math.min(
          0.95,
          pattern.baseConfidence + keywordBoost + emotionBoost
        ),
      });
    }
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.adjustedConfidence - a.adjustedConfidence);

  return matches;
}

/**
 * Check if user text suggests a handoff to another persona.
 */
export function detectHandoffCues(
  personaId: PersonaId,
  text: string
): Array<{
  targetPersona: PersonaId;
  reason: string;
  matchedKeywords: string[];
}> {
  const profile = getPersonaObservationProfile(personaId);
  const lowerText = text.toLowerCase();
  const cues: Array<{
    targetPersona: PersonaId;
    reason: string;
    matchedKeywords: string[];
  }> = [];

  for (const cue of profile.handoffCues) {
    const matchedKeywords = cue.keywords.filter((kw) =>
      lowerText.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      cues.push({
        targetPersona: cue.targetPersona,
        reason: cue.reason,
        matchedKeywords,
      });
    }
  }

  return cues;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  FERNI_PATTERNS,
  PETER_PATTERNS,
  MAYA_PATTERNS,
  JORDAN_PATTERNS,
  ALEX_PATTERNS,
  NAYAN_PATTERNS,
  PERSONA_PROFILES,
};
