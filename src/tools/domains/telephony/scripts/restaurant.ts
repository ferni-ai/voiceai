/**
 * Restaurant Call Script Template
 *
 * For calls to restaurants, cafes, bars, and other dining establishments.
 * Covers reservations, takeout orders, and general inquiries.
 *
 * @module tools/domains/telephony/scripts/restaurant
 */

import type { CallScriptTemplate } from '../types.js';

export const restaurantScript: CallScriptTemplate = {
  type: 'restaurant',

  // -------------------------------------------------------------------------
  // Introduction
  // -------------------------------------------------------------------------
  greeting: "Hi! I'm {agentName}, calling on behalf of {userName}.",

  identityDisclosure:
    "I'm an AI assistant helping {userName} with a reservation. " + "I hope that's okay!",

  recordingConsentScript: 'Just to let you know, this call may be recorded. Is that alright?',

  // -------------------------------------------------------------------------
  // Objectives
  // -------------------------------------------------------------------------
  objectives: {
    reservation:
      "I'd like to make a reservation for {userName}. {details}. " + 'Do you have availability?',

    reschedule:
      'I need to change an existing reservation for {userName}. {details}. ' +
      'Could you help me with that?',

    cancel:
      'I need to cancel a reservation for {userName}. {details}. ' +
      'Could you confirm that for me?',

    inquiry:
      "I'm calling with a question for {userName}. {details}. " + 'Could you help me with that?',

    new_appointment: "I'd like to book a table for {userName}. {details}.",

    general: "I'm calling on behalf of {userName}. {details}.",
  },

  // -------------------------------------------------------------------------
  // Information to Gather
  // -------------------------------------------------------------------------
  informationToGather: [
    'Confirmed reservation date and time',
    'Party size confirmation',
    'Reservation name (should be under {userName})',
    'Confirmation number if provided',
    'Any special requests or accommodations noted',
    'Cancellation policy if applicable',
  ],

  // -------------------------------------------------------------------------
  // Must Confirm
  // -------------------------------------------------------------------------
  mustConfirm: [
    'Repeat back the date, time, and party size',
    'Confirm the reservation is under the correct name',
    'Ask about any dietary restrictions or allergies they should know about',
    'Confirm if a deposit or credit card is required',
  ],

  // -------------------------------------------------------------------------
  // Must Not Do
  // -------------------------------------------------------------------------
  mustNotDo: [
    'Do not provide credit card information unless {userName} explicitly authorized it',
    'Do not commit to large deposits or prepayments without checking first',
    'Do not make changes to an existing order beyond what was requested',
    'Do not be rude if they are busy or put you on hold',
    'Do not demand special treatment or be pushy about requests',
  ],
};
