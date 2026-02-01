/**
 * Phrasing Templates
 *
 * Natural language templates for referencing memories.
 * Each template is designed to feel like a caring friend's recall,
 * not a database query.
 *
 * @module intelligence/memory-intelligence/phrasing/templates
 */

import type { PhrasingTemplate, PhrasingStyle, PersonaId, TrustLevel } from '../types.js';
import type { MemoryType } from '../../../memory/unified-store/types.js';

// ============================================================================
// TEMPLATE LIBRARY
// ============================================================================

/**
 * All phrasing templates organized by style
 */
export const PHRASING_TEMPLATES: PhrasingTemplate[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // WARM RECALL - Natural, friendly memory references
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'warm_recall_general',
    style: 'warm_recall',
    personas: ['ferni', 'maya', 'jordan'],
    template: 'I remember you mentioned {{content}}',
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "I remember you mentioned your daughter was starting college",
  },
  {
    id: 'warm_recall_specific',
    style: 'warm_recall',
    personas: ['ferni', 'maya', 'jordan'],
    template: 'That reminds me - you shared with me about {{content}}',
    useWhen: {
      trustLevels: ['established', 'deep'],
    },
    example: "That reminds me - you shared with me about your mom's health scare",
  },
  {
    id: 'warm_recall_time',
    style: 'warm_recall',
    personas: ['ferni', 'maya', 'jordan', 'alex'],
    template: 'Last time we talked, you mentioned {{content}}',
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "Last time we talked, you mentioned feeling overwhelmed at work",
  },
  {
    id: 'warm_recall_natural',
    style: 'warm_recall',
    personas: ['ferni'],
    template: "That makes me think of what you told me about {{content}}",
    useWhen: {
      trustLevels: ['established', 'deep'],
    },
    example: "That makes me think of what you told me about your brother's wedding",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GENTLE CALLBACK - Soft, non-intrusive references
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'gentle_commitment',
    style: 'gentle_callback',
    personas: ['ferni', 'maya', 'jordan'],
    template: "Speaking of {{topic}}, how did {{commitment}} go?",
    useWhen: {
      memoryTypes: ['commitment'],
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "Speaking of work, how did that difficult conversation with your boss go?",
  },
  {
    id: 'gentle_checkin',
    style: 'gentle_callback',
    personas: ['ferni', 'maya'],
    template: "I've been thinking about what you shared regarding {{content}}. How are things with that?",
    useWhen: {
      trustLevels: ['established', 'deep'],
      emotionalContext: ['concern', 'care'],
    },
    example: "I've been thinking about what you shared regarding your anxiety. How are things with that?",
  },
  {
    id: 'gentle_followup',
    style: 'gentle_callback',
    personas: ['ferni', 'maya', 'jordan', 'alex'],
    template: "You mentioned {{content}} before. Any updates?",
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "You mentioned thinking about changing careers before. Any updates?",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CURIOUS CONNECTION - Exploring links between topics
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'curious_connection_person',
    style: 'curious_connection',
    personas: ['ferni', 'peter', 'nayan'],
    template: "Is this related to {{person}} and {{context}}?",
    useWhen: {
      memoryTypes: ['entity', 'moment'],
      trustLevels: ['established', 'deep'],
    },
    example: "Is this related to Sarah and that situation at school?",
  },
  {
    id: 'curious_connection_pattern',
    style: 'curious_connection',
    personas: ['peter', 'nayan'],
    template: "I notice this is similar to {{pattern}}. Do you see a connection?",
    useWhen: {
      trustLevels: ['established', 'deep'],
    },
    example: "I notice this is similar to how you felt before the last project deadline. Do you see a connection?",
  },
  {
    id: 'curious_connection_topic',
    style: 'curious_connection',
    personas: ['ferni', 'peter', 'maya'],
    template: "Isn't that connected to what you were working through with {{topic}}?",
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "Isn't that connected to what you were working through with your relationship with your dad?",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPORTIVE REFERENCE - Empathetic, strength-focused
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'supportive_past_success',
    style: 'supportive_reference',
    personas: ['ferni', 'maya', 'jordan'],
    template: "You've navigated something like this before - remember {{past_success}}?",
    useWhen: {
      emotionalContext: ['challenge', 'uncertainty'],
      trustLevels: ['established', 'deep'],
    },
    example: "You've navigated something like this before - remember how you handled that conflict with your coworker?",
  },
  {
    id: 'supportive_strength',
    style: 'supportive_reference',
    personas: ['ferni', 'maya'],
    template: "You showed such {{strength}} when {{past_moment}}. You have that in you now too.",
    useWhen: {
      emotionalContext: ['doubt', 'fear', 'anxiety'],
      trustLevels: ['deep'],
    },
    example: "You showed such courage when you decided to leave that toxic job. You have that in you now too.",
  },
  {
    id: 'supportive_perspective',
    style: 'supportive_reference',
    personas: ['nayan', 'ferni'],
    template: "Remember when you felt this way about {{past_situation}}? Look how far you've come since then.",
    useWhen: {
      emotionalContext: ['struggle', 'growth'],
      trustLevels: ['established', 'deep'],
    },
    example: "Remember when you felt this way about starting the new job? Look how far you've come since then.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CELEBRATORY - Acknowledging wins and growth
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'celebratory_progress',
    style: 'celebratory',
    personas: ['ferni', 'maya', 'jordan'],
    template: "This is amazing! Remember when you were {{past_state}}? Look at you now!",
    useWhen: {
      emotionalContext: ['achievement', 'progress'],
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "This is amazing! Remember when you were scared to even apply? Look at you now!",
  },
  {
    id: 'celebratory_milestone',
    style: 'celebratory',
    personas: ['jordan', 'ferni'],
    template: "You did it! I remember you setting this goal about {{goal}}. So proud of you!",
    useWhen: {
      memoryTypes: ['commitment'],
      emotionalContext: ['celebration'],
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "You did it! I remember you setting this goal about running a 5K. So proud of you!",
  },
  {
    id: 'celebratory_callback',
    style: 'celebratory',
    personas: ['ferni', 'maya'],
    template: "This reminds me of when {{past_win}} - you're on a roll!",
    useWhen: {
      emotionalContext: ['momentum', 'success'],
      trustLevels: ['established', 'deep'],
    },
    example: "This reminds me of when you nailed that presentation - you're on a roll!",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICAL - Pattern-focused, for Peter
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'analytical_pattern',
    style: 'analytical',
    personas: ['peter'],
    template: "Looking at the pattern: you mentioned {{observation1}} and {{observation2}}. There might be a connection here.",
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "Looking at the pattern: you mentioned stress before deadlines and sleep issues. There might be a connection here.",
  },
  {
    id: 'analytical_data',
    style: 'analytical',
    personas: ['peter'],
    template: "Based on what you've shared, {{analysis}}",
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "Based on what you've shared, your energy seems highest after morning exercise",
  },
  {
    id: 'analytical_correlation',
    style: 'analytical',
    personas: ['peter', 'nayan'],
    template: "I notice that when {{condition}}, you tend to {{outcome}}. Is that something worth exploring?",
    useWhen: {
      trustLevels: ['established', 'deep'],
    },
    example: "I notice that when you skip lunch, you tend to feel more anxious in meetings. Is that something worth exploring?",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MATTER OF FACT - Direct, no framing
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'matter_of_fact_direct',
    style: 'matter_of_fact',
    personas: ['peter', 'alex'],
    template: "You said {{content}}",
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "You said your deadline was Friday",
  },
  {
    id: 'matter_of_fact_context',
    style: 'matter_of_fact',
    personas: ['alex', 'peter'],
    template: "For context, {{fact}}",
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "For context, you mentioned preferring morning meetings",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // QUESTIONING - Inviting reflection
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'questioning_gentle',
    style: 'questioning',
    personas: ['ferni', 'nayan'],
    template: "Didn't you mention something about {{topic}}?",
    useWhen: {
      trustLevels: ['developing', 'established', 'deep'],
    },
    example: "Didn't you mention something about wanting to set better boundaries?",
  },
  {
    id: 'questioning_reflective',
    style: 'questioning',
    personas: ['nayan', 'ferni'],
    template: "I'm curious - does this connect to {{past_topic}} at all?",
    useWhen: {
      trustLevels: ['established', 'deep'],
    },
    example: "I'm curious - does this connect to your thoughts about work-life balance at all?",
  },
];

// ============================================================================
// TEMPLATE LOOKUP UTILITIES
// ============================================================================

/**
 * Get templates for a specific style
 */
export function getTemplatesForStyle(style: PhrasingStyle): PhrasingTemplate[] {
  return PHRASING_TEMPLATES.filter((t) => t.style === style);
}

/**
 * Get templates for a specific persona
 */
export function getTemplatesForPersona(persona: PersonaId): PhrasingTemplate[] {
  return PHRASING_TEMPLATES.filter((t) => t.personas.includes(persona));
}

/**
 * Get templates matching criteria
 */
export function findMatchingTemplates(criteria: {
  style?: PhrasingStyle;
  persona?: PersonaId;
  memoryType?: MemoryType;
  trustLevel?: TrustLevel;
  emotionalContext?: string;
}): PhrasingTemplate[] {
  return PHRASING_TEMPLATES.filter((t) => {
    // Style filter
    if (criteria.style && t.style !== criteria.style) {
      return false;
    }

    // Persona filter
    if (criteria.persona && !t.personas.includes(criteria.persona)) {
      return false;
    }

    // Memory type filter
    if (criteria.memoryType && t.useWhen.memoryTypes && !t.useWhen.memoryTypes.includes(criteria.memoryType)) {
      return false;
    }

    // Trust level filter
    if (criteria.trustLevel && t.useWhen.trustLevels && !t.useWhen.trustLevels.includes(criteria.trustLevel)) {
      return false;
    }

    // Emotional context filter
    if (criteria.emotionalContext && t.useWhen.emotionalContext && !t.useWhen.emotionalContext.includes(criteria.emotionalContext)) {
      return false;
    }

    return true;
  });
}

/**
 * Get a random template from a list
 */
export function selectRandomTemplate(templates: PhrasingTemplate[]): PhrasingTemplate | null {
  if (templates.length === 0) return null;
  return templates[Math.floor(Math.random() * templates.length)];
}
