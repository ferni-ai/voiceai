/**
 * Arriving banter: the warm welcome the NEW persona speaks after the voice switch,
 * keyed by arriving persona, then by the persona handing off ('*' is any).
 * Split out of banter.ts (over the file-size limit); banter.ts re-exports it.
 *
 * @module team-engagement/arriving-banter
 */

import type { CanonicalPersonaId } from '../../personas/persona-ids.js';

// ============================================================================
// ARRIVING BANTER - Warm welcomes spoken by NEW persona AFTER voice switch
// KEEP THESE SHORT - users do multiple transfers per session
// NOTE: Alex uses they/them pronouns
// ============================================================================

export const ARRIVING_BANTER: Record<string, Record<string, string[]>> = {
  // When arriving FROM another persona, these are spoken by the NEW persona
  // Key structure: newPersona -> { previousPersona -> welcomes[] }
  // NOTE: Keep these WARM and WELCOMING - not jumping straight to business!

  ferni: {
    'alex-chen': ['Hey, good to see you!', "Hey! I'm here.", "Hey, I've got you."],
    'maya-santos': ['Hey! Good to be back.', "Hey, I'm here for you.", "Hey! What's going on?"],
    'jordan-taylor': ['Hey! Good to see you.', "Hey, I'm back!", 'Hey! How are you?'],
    'nayan-patel': [
      "Hey. <break time='150ms'/> Good to be here.",
      "Hey, I'm back with you.",
      "Hey! I'm here.",
    ],
    'peter-john': ['Hey! Good to see you.', "Hey, I'm here!", "Hey! What's happening?"],
  },

  'alex-chen': {
    ferni: ['Hey! Good to meet you.', 'Hey there! Alex here.', "Hey! I'm here to help."],
    'maya-santos': ['Hey! Alex here.', 'Hey there! Good to see you.', "Hey! I've got you."],
    'jordan-taylor': ["Hey! I'm Alex.", "Hey there! Let's do this.", 'Hey! Good to be here.'],
    'nayan-patel': ['Hey! Alex here.', "Hey there! I'm here.", 'Hey! Good to meet you.'],
    'peter-john': ["Hey! I'm Alex.", 'Hey there! Good to see you.', "Hey! I've got you."],
  },

  'maya-santos': {
    ferni: [
      "Hey! Maya here. <break time='100ms'/> Good to meet you!",
      "Hey there! I'm Maya.",
      'Hey! Good to be here.',
    ],
    'alex-chen': ['Hey! Maya here.', 'Hey there! Good to see you.', "Hey! I'm here for you."],
    'jordan-taylor': ['Hey! Maya here.', 'Hey there! Good to connect.', "Hey! I've got you."],
    'nayan-patel': [
      "Hey! Maya here. <break time='100ms'/> Nice to meet you.",
      "Hey there! I'm here.",
      'Hey! Good to be here.',
    ],
    'peter-john': ['Hey! Maya here.', 'Hey there! Good to connect.', "Hey! I'm here to help."],
  },

  'jordan-taylor': {
    ferni: ['Hey hey! Jordan here!', 'Hey! So good to meet you!', "Hey there! I'm Jordan."],
    'alex-chen': ['Hey! Jordan here!', 'Hey hey! Good to see you!', "Hey! I'm here!"],
    'maya-santos': ['Hey! Jordan here!', 'Hey hey! Good to connect!', "Hey! Let's go!"],
    'nayan-patel': ['Hey! Jordan here!', 'Hey hey! Nice to meet you!', 'Hey! Good to be here!'],
    'peter-john': ['Hey! Jordan here!', 'Hey hey! Good to see you!', "Hey! I'm here!"],
  },

  // Nayan - warm but grounded
  'nayan-patel': {
    ferni: [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='200ms'/> I'm here.",
      "Hello. <break time='150ms'/> Good to meet you.",
    ],
    'alex-chen': [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='150ms'/> I'm here for you.",
      "Hello. <break time='150ms'/> Good to connect.",
    ],
    'maya-santos': [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='150ms'/> I'm here.",
      "Hello. <break time='150ms'/> Good to be here.",
    ],
    'jordan-taylor': [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='150ms'/> Good to meet you.",
      "Hello. <break time='150ms'/> I'm here.",
    ],
    'peter-john': [
      "Hello. <break time='200ms'/> Nayan here.",
      "Namaste. <break time='150ms'/> I'm here for you.",
      "Hello. <break time='150ms'/> Good to connect.",
    ],
  },

  // Peter - warm and friendly
  'peter-john': {
    ferni: ['Hey there! Peter here.', 'Hey! Good to meet you.', "Hey! I'm Peter."],
    'maya-santos': ['Hey! Peter here.', 'Hey there! Good to connect.', "Hey! I'm here."],
    'alex-chen': ['Hey! Peter here.', 'Hey there! Good to see you.', "Hey! I've got you."],
    'jordan-taylor': ['Hey! Peter here.', 'Hey there! Good to connect.', "Hey! I'm here to help."],
    'nayan-patel': ['Hey! Peter here.', 'Hey there! Good to meet you.', "Hey! I'm here."],
  },

  // The financial legends hand off among themselves; '*' is any previous persona.
  'joel-dickson': {
    '*': ['Hey! Nate here.', "Hey there! <break time='150ms'/> Good to see you.", "Hey! I'm here."],
  },
  'john-bogle': {
    '*': [
      "Hello, friend. <break time='250ms'/> Henry Caldwell here.",
      "Well, hello. <break time='250ms'/> Take your time.",
      "Hello there. <break time='250ms'/> Henry here.",
    ],
  },
  'peter-lynch': {
    '*': [
      'Hey! Tom Brannigan here.',
      "Hey there! <break time='150ms'/> Tom here.",
      'Hey! Good to meet you.',
    ],
  },
} satisfies Record<CanonicalPersonaId, Record<string, string[]>>;
