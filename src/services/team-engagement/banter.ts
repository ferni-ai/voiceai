/**
 * Cross-Persona Banter
 *
 * Characters referencing each other and warm introductions
 * during persona transitions.
 *
 * @module team-engagement/banter
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'banter' });

// ============================================================================
// HANDOFF BANTER - Warm introductions during persona transitions
// KEEP THESE SHORT - users do multiple transfers per session
// Pronouns: personas/persona-pronouns.ts (Ferni and Alex are he/him).
// ============================================================================

export const HANDOFF_BANTER: Record<string, Record<string, string[]>> = {
  // Ferni introducing others
  // NOTE: Keep these ~2-3 seconds to cover agent spawn time
  ferni: {
    'alex-chen': [
      "Let me get Alex for you. <break time='300ms'/> He's great at this.",
      "Alex is perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Alex. <break time='300ms'/> You'll like him.",
    ],
    'maya-santos': [
      "Let me get Maya for you. <break time='300ms'/> She's wonderful.",
      "Maya's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Maya. <break time='300ms'/> You'll love her.",
    ],
    'jordan-taylor': [
      "Let me get Jordan for you. <break time='300ms'/> She's got great energy.",
      "Jordan's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Jordan. <break time='300ms'/> She's wonderful.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He has such wisdom.",
      "Nayan's perfect for this. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wonderful.",
    ],
    'peter-john': [
      "Let me get Peter for you. <break time='300ms'/> He'll love this.",
      "Peter's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Peter. <break time='300ms'/> You'll like him.",
    ],
  },

  // Alex introducing others
  'alex-chen': {
    ferni: [
      "Let me get Ferni for you. <break time='300ms'/> He's great at this.",
      "Ferni's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Ferni. <break time='300ms'/> You'll like him.",
    ],
    'maya-santos': [
      "Let me get Maya for you. <break time='300ms'/> She's wonderful with habits.",
      "Maya's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Maya. <break time='300ms'/> She's great.",
    ],
    'jordan-taylor': [
      "Let me get Jordan for you. <break time='300ms'/> She's got vision.",
      "Jordan's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Jordan. <break time='300ms'/> She's wonderful.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He sees the bigger picture.",
      "Nayan's perfect for this. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wise.",
    ],
    'peter-john': [
      "Let me get Peter for you. <break time='300ms'/> He loves patterns.",
      "Peter's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Peter. <break time='300ms'/> You'll like him.",
    ],
  },

  // Maya introducing others
  'maya-santos': {
    ferni: [
      "Let me get Ferni for you. <break time='300ms'/> He's wonderful.",
      "Ferni's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Ferni. <break time='300ms'/> You'll like him.",
    ],
    'alex-chen': [
      "Let me get Alex for you. <break time='300ms'/> He's great at organizing.",
      "Alex is perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Alex. <break time='300ms'/> He's wonderful.",
    ],
    'jordan-taylor': [
      "Let me get Jordan for you. <break time='300ms'/> She dreams big.",
      "Jordan's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Jordan. <break time='300ms'/> She's wonderful.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He has such depth.",
      "Nayan's perfect for this. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wonderful.",
    ],
    'peter-john': [
      "Let me get Peter for you. <break time='300ms'/> He sees patterns.",
      "Peter's perfect for this. <break time='300ms'/> One moment.",
      "I'll bring in Peter. <break time='300ms'/> You'll like him.",
    ],
  },

  // Jordan introducing others
  'jordan-taylor': {
    ferni: [
      "Let me get Ferni for you! <break time='300ms'/> He's amazing.",
      "Ferni's perfect for this! <break time='300ms'/> One moment.",
      "I'll bring in Ferni! <break time='300ms'/> You'll love him.",
    ],
    'alex-chen': [
      "Let me get Alex for you! <break time='300ms'/> He makes things happen.",
      "Alex is perfect for this! <break time='300ms'/> One moment.",
      "I'll bring in Alex! <break time='300ms'/> He's great.",
    ],
    'maya-santos': [
      "Let me get Maya for you! <break time='300ms'/> She's wonderful.",
      "Maya's perfect for this! <break time='300ms'/> One moment.",
      "I'll bring in Maya! <break time='300ms'/> You'll love her.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He's so grounded.",
      "Nayan's perfect for this. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wonderful.",
    ],
    'peter-john': [
      "Let me get Peter for you! <break time='300ms'/> He's brilliant.",
      "Peter's perfect for this! <break time='300ms'/> One moment.",
      "I'll bring in Peter! <break time='300ms'/> You'll like him.",
    ],
  },

  // Nayan introducing others - slower, more contemplative
  'nayan-patel': {
    ferni: [
      "Let me bring Ferni to you. <break time='500ms'/> He understands.",
      "Ferni is right for this. <break time='500ms'/> One moment.",
      "I'll get Ferni. <break time='500ms'/> He's wonderful.",
    ],
    'alex-chen': [
      "Let me bring Alex to you. <break time='500ms'/> He brings clarity.",
      "Alex is right for this. <break time='500ms'/> One moment.",
      "I'll get Alex. <break time='500ms'/> He's thoughtful.",
    ],
    'maya-santos': [
      "Let me bring Maya to you. <break time='500ms'/> She builds well.",
      "Maya is right for this. <break time='500ms'/> One moment.",
      "I'll get Maya. <break time='500ms'/> She's wonderful.",
    ],
    'jordan-taylor': [
      "Let me bring Jordan to you. <break time='500ms'/> She has vision.",
      "Jordan is right for this. <break time='500ms'/> One moment.",
      "I'll get Jordan. <break time='500ms'/> She's bright.",
    ],
    'peter-john': [
      "Let me bring Peter to you. <break time='500ms'/> He sees patterns.",
      "Peter is right for this. <break time='500ms'/> One moment.",
      "I'll get Peter. <break time='500ms'/> He's thoughtful.",
    ],
  },

  // Peter introducing others
  'peter-john': {
    ferni: [
      "Let me get Ferni for you. <break time='300ms'/> He's perfect for this.",
      "Ferni's the right call here. <break time='300ms'/> One moment.",
      "I'll bring in Ferni. <break time='300ms'/> You'll like him.",
    ],
    'alex-chen': [
      "Let me get Alex for you. <break time='300ms'/> He's great at systems.",
      "Alex is the right call here. <break time='300ms'/> One moment.",
      "I'll bring in Alex. <break time='300ms'/> He's sharp.",
    ],
    'maya-santos': [
      "Let me get Maya for you. <break time='300ms'/> She's great with habits.",
      "Maya's the right call here. <break time='300ms'/> One moment.",
      "I'll bring in Maya. <break time='300ms'/> She's wonderful.",
    ],
    'jordan-taylor': [
      "Let me get Jordan for you. <break time='300ms'/> She's got vision.",
      "Jordan's the right call here. <break time='300ms'/> One moment.",
      "I'll bring in Jordan. <break time='300ms'/> She's wonderful.",
    ],
    'nayan-patel': [
      "Let me get Nayan for you. <break time='400ms'/> He has perspective.",
      "Nayan's the right call here. <break time='400ms'/> One moment.",
      "I'll bring in Nayan. <break time='400ms'/> He's wise.",
    ],
  },
};

/**
 * Get handoff banter when one persona introduces another (SOFT OPEN - spoken BEFORE voice switch)
 * This is the departing persona's warm sendoff
 */
export function getHandoffBanter(fromPersonaId: string, toPersonaId: string): string | null {
  const fromBanter = HANDOFF_BANTER[fromPersonaId];
  if (!fromBanter) {
    log.debug(
      { fromPersonaId, available: Object.keys(HANDOFF_BANTER) },
      'No soft open banter found for fromPersona'
    );
    return null;
  }

  const banterOptions = fromBanter[toPersonaId];
  if (!banterOptions || banterOptions.length === 0) {
    log.debug(
      { fromPersonaId, toPersonaId, available: Object.keys(fromBanter) },
      'No soft open banter for transition'
    );
    return null;
  }

  const selected = banterOptions[Math.floor(Math.random() * banterOptions.length)];
  log.debug(
    { fromPersonaId, toPersonaId, banter: selected.slice(0, 50) },
    'Soft open banter selected'
  );
  return selected;
}

// Alias for clarity
export const getSoftOpenBanter = getHandoffBanter;

// ============================================================================
// ARRIVING OPENERS - the new persona's first words AFTER the voice switch
// ============================================================================

/**
 * Each persona opens in their own voice. Before, Peter, Maya and Jordan all
 * opened "Hey there!" (dev 2026-10-04..12), so the first two seconds of every
 * teammate sounded the same, and the legends had no line at all ("Hey! What's
 * up?"). Short: callers transfer more than once a call. These are the canned
 * line; BRIEFED_HANDOFF writes a briefed first line in front of it when it can
 * (agents/multi-agent/handoff-brief.ts).
 */
export const ARRIVING_OPENERS: Readonly<Record<string, readonly string[]>> = {
  ferni: [
    "Hey, I'm back with you.",
    'Hey! Good to see you again.',
    "Hey, I'm here. What's going on?",
  ],
  'maya-santos': [
    "Hi, it's Maya! I'm really glad you're here.",
    "Maya here! Okay, let's figure this out together.",
    "Hi! Maya. Tell me where you're at.",
  ],
  'jordan-taylor': [
    'Jordan here! Ooh, I love a plan.',
    "Yes! Jordan here. Let's make something happen.",
    "Hi hi! It's Jordan. Tell me everything.",
  ],
  'alex-chen': [
    "Alex here. Okay, let's sort this out.",
    "Alex speaking. We'll take it one piece at a time.",
    "Alex here. Let's get the words right.",
  ],
  'peter-john': [
    'Peter here. Ooh, what are we digging into?',
    "Okay, it's Peter. I'm curious already.",
    "Peter here! Let's look at this together.",
  ],
  'nayan-patel': [
    "Hello. <break time='200ms'/> Nayan here.",
    "Namaste. <break time='200ms'/> I'm here.",
    "Hello. <break time='150ms'/> Good to sit with you.",
  ],
  'john-bogle': [
    'Hello, friend. Pull up a chair.',
    "Good to meet you. Let's take this slowly.",
    "Well, hello. Tell me what's on your mind.",
  ],
  'joel-dickson': [
    "Nate here! Ha, okay, what've we got?",
    "Hi! It's Nate. I've heard a little, tell me more.",
    'Nate here. I love this already.',
  ],
};

/**
 * The arriving persona's opener after a handoff (spoken AFTER the voice
 * switch), or null for a persona without one.
 */
export function getArrivingBanter(toPersonaId: string, fromPersonaId: string): string | null {
  const options = ARRIVING_OPENERS[toPersonaId];
  if (!options || options.length === 0) {
    log.debug({ toPersonaId, fromPersonaId }, 'No arriving opener for this persona');
    return null;
  }
  const selected = options[Math.floor(Math.random() * options.length)];
  log.debug(
    { toPersonaId, fromPersonaId, banter: selected.slice(0, 50) },
    'Arriving opener selected'
  );
  return selected;
}
