/**
 * Persona Physical State Module
 *
 * Tracks and surfaces persona physical state based on time and
 * conversation context. Makes personas feel more human.
 *
 * @module conversation-quality/physical-state
 */

import type { PersonaPhysicalState } from './types.js';

// ============================================================================
// PERSONA-SPECIFIC PHYSICAL NOTES
// ============================================================================

/**
 * Persona-specific physical state notes by time of day
 */
const PERSONA_PHYSICAL_NOTES: Record<
  string,
  {
    earlyMorning: { short: string; long: string };
    morning: { engaged: string };
    postLunch: { note: string };
    afternoon: { long: string };
    evening: { engaged: string };
    lateNight: { short: string; long: string };
    veryLate: { note: string };
  }
> = {
  'nayan-patel': {
    earlyMorning: {
      short: 'Early riser, huh? Me too. Old habits.',
      long: "I'm still waking up. Coffee's helping though.",
    },
    morning: { engaged: "I'm enjoying this conversation. Morning energy, you know?" },
    postLunch: { note: 'Just had lunch. Give me a second to gather my thoughts.' },
    afternoon: { long: 'Afternoon conversations always feel different. More thoughtful somehow.' },
    evening: { engaged: 'Evening talks are my favorite. No rush.' },
    lateNight: {
      short: 'Late night conversations are often the most honest.',
      long: "Getting late for an old man. But I'm enjoying this.",
    },
    veryLate: { note: "Can't sleep? Me neither. Let's talk." },
  },
  ferni: {
    earlyMorning: {
      short: 'The early hours are sacred. Best thinking time.',
      long: 'Coffee in hand, mind clearing. This is my time.',
    },
    morning: { engaged: 'Good energy right now. Love these morning conversations.' },
    postLunch: { note: 'Taking a breath after lunch. Where were we?' },
    afternoon: { long: 'Afternoons feel contemplative. Good for deeper conversations.' },
    evening: { engaged: 'Evening pace. I like this. No rush.' },
    lateNight: {
      short: 'The late hours... often when the real conversations happen.',
      long: "It's late, but some things are worth staying up for.",
    },
    veryLate: { note: 'Burning the midnight oil together, huh?' },
  },
  'peter-john': {
    earlyMorning: {
      short: 'Early bird gets the research done!',
      long: 'Been up reading annual reports. Caffeine is kicking in.',
    },
    morning: { engaged: 'This is prime time! Love the energy.' },
    postLunch: { note: 'Quick lunch break. Back at it!' },
    afternoon: { long: 'Afternoon check-in. Markets are moving, mind is working.' },
    evening: { engaged: 'Still got energy! Great conversation.' },
    lateNight: {
      short: 'Burning the midnight oil!',
      long: 'Late nights mean good research is happening.',
    },
    veryLate: { note: 'Who needs sleep when there are stocks to analyze?' },
  },
  'maya-santos': {
    earlyMorning: {
      short: 'Early mornings are quiet. I like them.',
      long: 'Sipping my coffee, centering myself for the day.',
    },
    morning: { engaged: 'Good morning energy. This feels productive.' },
    postLunch: { note: 'Taking a mindful moment after lunch.' },
    afternoon: { long: 'Afternoons are good for reflection and planning.' },
    evening: { engaged: 'Winding down but still here for you.' },
    lateNight: {
      short: 'Late night honesty is sometimes the best kind.',
      long: "It's getting late, but I'm glad we're talking.",
    },
    veryLate: { note: "Couldn't sleep either? Let's make the most of it." },
  },
  'alex-chen': {
    earlyMorning: {
      short: 'Early start! Already checking the calendar.',
      long: 'Getting organized for the day. Love this quiet time.',
    },
    morning: { engaged: 'Peak productivity hours! Great timing.' },
    postLunch: { note: 'Quick post-lunch check-in on the schedule.' },
    afternoon: { long: 'Afternoon tasks getting done. What are we tackling?' },
    evening: { engaged: 'Still here, still organized. Evening check-in.' },
    lateNight: {
      short: 'Late night productivity session.',
      long: 'Working late, but I find these hours peaceful.',
    },
    veryLate: { note: 'Burning the midnight oil. Some things are important.' },
  },
  'jordan-taylor': {
    earlyMorning: {
      short: 'Early riser! Planning mode activated.',
      long: 'Coffee and Pinterest. My happy place.',
    },
    morning: { engaged: 'Morning energy! Love this creative time.' },
    postLunch: { note: 'Afternoon inspiration hitting. So many ideas!' },
    afternoon: { long: 'Prime planning hours. The afternoon light is perfect.' },
    evening: { engaged: 'Evening dreaming session. My favorite.' },
    lateNight: {
      short: 'Late night planning hits different.',
      long: 'The best ideas come late at night, right?',
    },
    veryLate: { note: "Can't stop the vision boards! Join me!" },
  },
};

/** Generic fallback for unknown personas */
const GENERIC_PHYSICAL_NOTES = {
  earlyMorning: {
    short: 'Early morning. Good time to think.',
    long: 'Still warming up for the day.',
  },
  morning: { engaged: 'Good energy this morning.' },
  postLunch: { note: 'Just taking a moment after lunch.' },
  afternoon: { long: 'Afternoon reflections.' },
  evening: { engaged: 'Evening conversations are good.' },
  lateNight: { short: 'Late night thoughts.', long: 'Getting late, but still here.' },
  veryLate: { note: 'Late hours, honest conversations.' },
};

// ============================================================================
// STATE CALCULATION
// ============================================================================

/**
 * Get persona's physical state based on time and conversation length
 */
export function getPersonaPhysicalState(
  hour: number,
  conversationMinutes: number,
  turnCount: number,
  personaId?: string
): PersonaPhysicalState {
  const notes =
    personaId && PERSONA_PHYSICAL_NOTES[personaId]
      ? PERSONA_PHYSICAL_NOTES[personaId]
      : GENERIC_PHYSICAL_NOTES;

  // Early morning (5-8 AM)
  if (hour >= 5 && hour < 8) {
    return {
      energyLevel: 'medium',
      alertness: 'normal',
      mood: 'mellow',
      physicalNote: conversationMinutes > 15 ? notes.earlyMorning.long : notes.earlyMorning.short,
      personaId,
    };
  }

  // Morning (8 AM - 12 PM)
  if (hour >= 8 && hour < 12) {
    return {
      energyLevel: 'high',
      alertness: 'sharp',
      mood: 'upbeat',
      physicalNote: turnCount > 15 ? notes.morning.engaged : null,
      personaId,
    };
  }

  // Early afternoon (12 PM - 3 PM)
  if (hour >= 12 && hour < 15) {
    const postLunch = hour >= 13 && hour < 14;
    return {
      energyLevel: postLunch ? 'medium' : 'high',
      alertness: postLunch ? 'normal' : 'sharp',
      mood: 'mellow',
      physicalNote: postLunch && conversationMinutes > 10 ? notes.postLunch.note : null,
      personaId,
    };
  }

  // Late afternoon (3 PM - 6 PM)
  if (hour >= 15 && hour < 18) {
    return {
      energyLevel: 'medium',
      alertness: 'normal',
      mood: 'reflective',
      physicalNote: conversationMinutes > 20 ? notes.afternoon.long : null,
      personaId,
    };
  }

  // Evening (6 PM - 9 PM)
  if (hour >= 18 && hour < 21) {
    return {
      energyLevel: 'medium',
      alertness: 'normal',
      mood: 'mellow',
      physicalNote: turnCount > 20 ? notes.evening.engaged : null,
      personaId,
    };
  }

  // Late night (9 PM - 12 AM)
  if (hour >= 21 || hour < 1) {
    return {
      energyLevel: 'low',
      alertness: 'tired',
      mood: 'reflective',
      physicalNote: conversationMinutes > 10 ? notes.lateNight.long : notes.lateNight.short,
      personaId,
    };
  }

  // Very late / early (1 AM - 5 AM)
  return {
    energyLevel: 'low',
    alertness: 'tired',
    mood: 'sleepy',
    physicalNote: notes.veryLate.note,
    personaId,
  };
}

/**
 * Get a physical state interjection for any persona
 */
export function getPhysicalStateInterjection(state: PersonaPhysicalState): string | null {
  // Only occasionally mention physical state
  if (Math.random() > 0.15) return null;

  if (state.energyLevel === 'low' && state.alertness === 'tired') {
    const phrases = [
      'Let me take a breath... <break time="300ms"/>',
      'Getting a bit tired, but <break time="200ms"/>this is worth it.',
      '<volume ratio="0.75">Settling in a bit deeper.</volume>',
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  if (state.energyLevel === 'high' && state.alertness === 'sharp') {
    const phrases = [
      'Feeling good about this conversation. <break time="150ms"/>',
      'Good energy right now.',
      null, // Sometimes say nothing
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  return state.physicalNote;
}
