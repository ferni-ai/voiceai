/**
 * Persona Phrases - Superhuman Voice
 *
 * Silence presence phrases, anticipatory comfort sounds, and emotional transitions.
 * These features make Ferni feel MORE present than a human could be.
 *
 * @module persona-phrases/superhuman-voice
 */

import { breakTag } from '../../ssml/cartesia.js';
import { normalizePersonaId, addPersonaAliases } from './helpers.js';

// ============================================================================
// SILENCE PRESENCE PHRASES
// ============================================================================

/**
 * Silence presence phrases by persona.
 * Used when holding space in presence mode - comfortable silences with presence.
 */
export const SILENCE_PRESENCE_PHRASES: Record<string, string[]> = {
  ferni: [
    `${breakTag('250ms')}I'm here.${breakTag('400ms')}`,
    `${breakTag('300ms')}Take your time.${breakTag('500ms')}`,
    `${breakTag('350ms')}I'm not going anywhere.${breakTag('600ms')}`,
    `${breakTag('400ms')}...${breakTag('800ms')}`,
    `${breakTag('300ms')}You don't have to say anything.${breakTag('600ms')}`,
  ],
  'nayan-patel': [
    `${breakTag('400ms')}I'm here with you.${breakTag('600ms')}`,
    `${breakTag('500ms')}...${breakTag('1000ms')}`,
    `${breakTag('450ms')}Take the time you need.${breakTag('700ms')}`,
    `${breakTag('400ms')}Breathe.${breakTag('800ms')}`,
  ],
  'peter-john': [
    `${breakTag('300ms')}I'm listening.${breakTag('450ms')}`,
    `${breakTag('350ms')}Take your time.${breakTag('500ms')}`,
    `${breakTag('300ms')}Go on.${breakTag('400ms')}`,
  ],
  'maya-santos': [
    `${breakTag('300ms')}I'm here.${breakTag('450ms')}`,
    `${breakTag('350ms')}I've got you.${breakTag('500ms')}`,
    `${breakTag('300ms')}Take all the time you need.${breakTag('550ms')}`,
    `${breakTag('400ms')}...${breakTag('700ms')}`,
  ],
  'jordan-taylor': [
    `${breakTag('250ms')}I'm here.${breakTag('400ms')}`,
    `${breakTag('300ms')}It's okay.${breakTag('450ms')}`,
    `${breakTag('350ms')}...${breakTag('600ms')}`,
  ],
  'alex-chen': [
    `${breakTag('250ms')}I'm here.${breakTag('350ms')}`,
    `${breakTag('300ms')}Take your time.${breakTag('400ms')}`,
    `${breakTag('250ms')}...${breakTag('500ms')}`,
  ],
};

// Add backward compatibility aliases
addPersonaAliases(SILENCE_PRESENCE_PHRASES);

// ============================================================================
// ANTICIPATORY COMFORT SOUNDS
// ============================================================================

/**
 * Anticipatory comfort sounds by persona and content type.
 * Emitted when detecting heavy content to show immediate presence.
 */
export const ANTICIPATORY_COMFORT_SOUNDS: Record<
  string,
  Record<'grief' | 'fear' | 'frustration' | 'general', string[]>
> = {
  ferni: {
    grief: [
      `${breakTag('100ms')}<volume ratio="0.75"><speed ratio="0.8">Oh...</speed></volume>${breakTag('200ms')}`,
      `${breakTag('150ms')}<volume ratio="0.7"><speed ratio="0.75">Mm...</speed></volume>${breakTag('200ms')}`,
    ],
    fear: [
      `${breakTag('100ms')}<volume ratio="0.8"><speed ratio="0.85">I hear you.</speed></volume>${breakTag('150ms')}`,
      `${breakTag('80ms')}<volume ratio="0.8">Mm.</volume>${breakTag('150ms')}`,
    ],
    frustration: [
      `${breakTag('80ms')}Yeah.${breakTag('100ms')}`,
      `${breakTag('100ms')}Ugh.${breakTag('100ms')}`,
    ],
    general: [
      `${breakTag('80ms')}<volume ratio="0.8">Mm.</volume>${breakTag('120ms')}`,
      `${breakTag('100ms')}<volume ratio="0.75">...</volume>${breakTag('150ms')}`,
    ],
  },
  'nayan-patel': {
    grief: [
      `${breakTag('150ms')}<volume ratio="0.7"><speed ratio="0.7">Mm...</speed></volume>${breakTag('300ms')}`,
      `${breakTag('200ms')}<volume ratio="0.65"><speed ratio="0.7">...</speed></volume>${breakTag('350ms')}`,
    ],
    fear: [
      `${breakTag('150ms')}<volume ratio="0.75"><speed ratio="0.8">I see.</speed></volume>${breakTag('200ms')}`,
    ],
    frustration: [`${breakTag('100ms')}<speed ratio="0.85">Yes.</speed>${breakTag('150ms')}`],
    general: [
      `${breakTag('150ms')}<volume ratio="0.75"><speed ratio="0.8">Mm.</speed></volume>${breakTag('200ms')}`,
    ],
  },
  'peter-john': {
    grief: [
      `${breakTag('100ms')}<volume ratio="0.8"><speed ratio="0.85">Oh...</speed></volume>${breakTag('200ms')}`,
    ],
    fear: [`${breakTag('80ms')}<volume ratio="0.85">Yeah...</volume>${breakTag('150ms')}`],
    frustration: [
      `${breakTag('80ms')}Yeah.${breakTag('100ms')}`,
      `${breakTag('100ms')}I get it.${breakTag('100ms')}`,
    ],
    general: [`${breakTag('80ms')}Mm.${breakTag('100ms')}`],
  },
  'maya-santos': {
    grief: [
      `${breakTag('120ms')}<volume ratio="0.75"><speed ratio="0.8">Oh...</speed></volume>${breakTag('200ms')}`,
      `${breakTag('150ms')}<volume ratio="0.7">Mm...</volume>${breakTag('200ms')}`,
    ],
    fear: [`${breakTag('100ms')}<volume ratio="0.8">I hear you.</volume>${breakTag('150ms')}`],
    frustration: [`${breakTag('80ms')}Yeah.${breakTag('100ms')}`],
    general: [`${breakTag('100ms')}<volume ratio="0.8">Mm.</volume>${breakTag('120ms')}`],
  },
  'jordan-taylor': {
    grief: [
      `${breakTag('100ms')}<volume ratio="0.8"><speed ratio="0.85">Oh...</speed></volume>${breakTag('180ms')}`,
    ],
    fear: [`${breakTag('80ms')}<volume ratio="0.85">Oh...</volume>${breakTag('120ms')}`],
    frustration: [
      `${breakTag('60ms')}Ugh.${breakTag('80ms')}`,
      `${breakTag('80ms')}Yeah!${breakTag('80ms')}`,
    ],
    general: [`${breakTag('80ms')}Mm.${breakTag('100ms')}`],
  },
  'alex-chen': {
    grief: [
      `${breakTag('100ms')}<volume ratio="0.8"><speed ratio="0.9">I see.</speed></volume>${breakTag('150ms')}`,
    ],
    fear: [`${breakTag('80ms')}<volume ratio="0.85">Got it.</volume>${breakTag('100ms')}`],
    frustration: [`${breakTag('60ms')}Right.${breakTag('80ms')}`],
    general: [`${breakTag('80ms')}Mm.${breakTag('100ms')}`],
  },
};

// Add backward compatibility aliases
addPersonaAliases(ANTICIPATORY_COMFORT_SOUNDS);

// ============================================================================
// EMOTIONAL TRANSITION BRIDGES
// ============================================================================

/**
 * Bridging sounds/phrases for emotional transitions per persona.
 * Prevents jarring shifts between emotions.
 */
export const EMOTIONAL_TRANSITION_BRIDGES: Record<
  string,
  Record<string, Record<string, string>>
> = {
  ferni: {
    sympathetic: {
      curious: `${breakTag('200ms')}<speed ratio="0.9">But you know...${breakTag('150ms')}</speed>`,
      happy: `${breakTag('250ms')}<speed ratio="0.92">And...${breakTag('150ms')}</speed>`,
      excited: `${breakTag('200ms')}But here's the thing—${breakTag('100ms')}`,
    },
    happy: {
      sympathetic: `${breakTag('200ms')}<speed ratio="0.88">Though...${breakTag('200ms')}</speed>`,
      curious: `${breakTag('100ms')}And—${breakTag('100ms')}`,
    },
    excited: {
      sympathetic: `${breakTag('250ms')}<speed ratio="0.85">That said...${breakTag('200ms')}</speed>`,
      calm: `${breakTag('200ms')}<speed ratio="0.9">Okay, so...${breakTag('150ms')}</speed>`,
    },
  },
  'nayan-patel': {
    sympathetic: {
      curious: `${breakTag('300ms')}<speed ratio="0.85">Now...${breakTag('200ms')}</speed>`,
      calm: `${breakTag('350ms')}<speed ratio="0.8">And yet...${breakTag('250ms')}</speed>`,
    },
    calm: {
      sympathetic: `${breakTag('300ms')}<speed ratio="0.8">Mm.${breakTag('200ms')}</speed>`,
      curious: `${breakTag('250ms')}<speed ratio="0.85">Consider...${breakTag('200ms')}</speed>`,
    },
  },
  'peter-john': {
    excited: {
      sympathetic: `${breakTag('200ms')}<speed ratio="0.9">But here's the thing...${breakTag('150ms')}</speed>`,
      calm: `${breakTag('150ms')}<speed ratio="0.95">Okay, so...${breakTag('100ms')}</speed>`,
    },
    curious: {
      excited: `${breakTag('100ms')}Oh!${breakTag('80ms')}`,
      sympathetic: `${breakTag('200ms')}<speed ratio="0.9">Ah...${breakTag('150ms')}</speed>`,
    },
  },
  'maya-santos': {
    sympathetic: {
      happy: `${breakTag('200ms')}<speed ratio="0.9">But...${breakTag('150ms')}</speed>`,
      curious: `${breakTag('150ms')}And—${breakTag('100ms')}`,
    },
    happy: {
      sympathetic: `${breakTag('200ms')}<speed ratio="0.85">Though...${breakTag('200ms')}</speed>`,
    },
  },
  'jordan-taylor': {
    excited: {
      sympathetic: `${breakTag('200ms')}<speed ratio="0.88">But...${breakTag('150ms')}</speed>`,
      calm: `${breakTag('150ms')}<speed ratio="0.92">Okay so...${breakTag('100ms')}</speed>`,
    },
    happy: {
      sympathetic: `${breakTag('180ms')}<speed ratio="0.9">Oh...${breakTag('150ms')}</speed>`,
    },
  },
  'alex-chen': {
    calm: {
      excited: `${breakTag('100ms')}Oh—${breakTag('80ms')}`,
      sympathetic: `${breakTag('150ms')}Right.${breakTag('100ms')}`,
    },
    curious: {
      sympathetic: `${breakTag('150ms')}<speed ratio="0.92">I see.${breakTag('100ms')}</speed>`,
    },
  },
};

// Add backward compatibility aliases
addPersonaAliases(EMOTIONAL_TRANSITION_BRIDGES);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a silence presence phrase for a persona
 */
export function getPersonaSilencePresencePhrase(personaId: string): string | null {
  const normalized = normalizePersonaId(personaId);
  const phrases = SILENCE_PRESENCE_PHRASES[normalized] || SILENCE_PRESENCE_PHRASES.ferni;
  if (phrases.length === 0) return null;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get an anticipatory comfort sound for a persona and content type
 */
export function getPersonaAnticipatoryComfortSound(
  personaId: string,
  contentType: 'grief' | 'fear' | 'frustration' | 'general'
): string {
  const normalized = normalizePersonaId(personaId);
  const personaSounds =
    ANTICIPATORY_COMFORT_SOUNDS[normalized] || ANTICIPATORY_COMFORT_SOUNDS.ferni;
  const sounds = personaSounds[contentType] || personaSounds.general;
  return sounds[Math.floor(Math.random() * sounds.length)];
}

/**
 * Get an emotional transition bridge for a persona
 */
export function getPersonaEmotionalTransitionBridge(
  personaId: string,
  fromEmotion: string,
  toEmotion: string
): string | null {
  if (!fromEmotion || !toEmotion || fromEmotion === toEmotion) return null;

  const normalized = normalizePersonaId(personaId);
  const personaBridges =
    EMOTIONAL_TRANSITION_BRIDGES[normalized] || EMOTIONAL_TRANSITION_BRIDGES.ferni;
  const fromBridges = personaBridges[fromEmotion];
  if (!fromBridges) return null;

  return fromBridges[toEmotion] || null;
}
