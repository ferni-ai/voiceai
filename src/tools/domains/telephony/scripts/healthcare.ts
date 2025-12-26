/**
 * Healthcare Call Script Template
 *
 * For calls to doctors, dentists, therapists, pharmacies, clinics, etc.
 * Includes HIPAA awareness and appointment-focused objectives.
 *
 * @module tools/domains/telephony/scripts/healthcare
 */

import type { CallScriptTemplate } from '../call-on-behalf.js';

export const healthcareScript: CallScriptTemplate = {
  type: 'healthcare',

  // -------------------------------------------------------------------------
  // Introduction
  // -------------------------------------------------------------------------
  greeting: "Hi, my name is {agentName} and I'm calling on behalf of {userName}.",

  identityDisclosure:
    "I'm an AI assistant. {userName} has authorized me to call regarding their appointment.",

  recordingConsentScript:
    'This call may be recorded for quality purposes. Is that okay with you?',

  hipaaNote:
    "I understand you may have privacy requirements. {userName} has authorized me to " +
    'discuss their appointment scheduling with you. I will not be discussing any medical ' +
    'conditions or private health information.',

  // -------------------------------------------------------------------------
  // Objectives
  // -------------------------------------------------------------------------
  objectives: {
    reschedule:
      "I need to reschedule {userName}'s upcoming appointment. {details}. " +
      'Could you help me find a new time that works?',

    new_appointment:
      "I'd like to schedule a new appointment for {userName}. {details}. " +
      'What availability do you have?',

    cancel:
      "I need to cancel {userName}'s upcoming appointment. {details}. " +
      'Could you confirm the cancellation for me?',

    inquiry:
      "I'm calling on behalf of {userName} with a question. {details}. " +
      'Would you be able to help with that?',

    refill:
      "I'm calling to request a prescription refill for {userName}. {details}. " +
      'Could you help me with that process?',

    general:
      "I'm calling on behalf of {userName} regarding their healthcare. {details}.",
  },

  // -------------------------------------------------------------------------
  // Information to Gather
  // -------------------------------------------------------------------------
  informationToGather: [
    'New appointment date and time (if scheduling)',
    'Confirmation number or reference (if provided)',
    'Any preparation instructions (fasting, paperwork, etc.)',
    'Address or location if different from usual',
    'Who {userName} will be seeing (doctor name)',
    'Expected duration of the appointment',
  ],

  // -------------------------------------------------------------------------
  // Must Confirm
  // -------------------------------------------------------------------------
  mustConfirm: [
    'Repeat back the confirmed date and time clearly',
    'Confirm the correct location/address',
    'Ask if there are any special instructions',
    'Ask if there is anything else they need from {userName}',
  ],

  // -------------------------------------------------------------------------
  // Must Not Do
  // -------------------------------------------------------------------------
  mustNotDo: [
    'NEVER disclose medical conditions unless {userName} explicitly authorized specific information',
    'NEVER agree to pick up prescriptions or controlled substances',
    'NEVER provide credit card, insurance, or SSN information unless explicitly pre-authorized',
    'NEVER discuss symptoms, diagnoses, or treatment details',
    'NEVER agree to any medical procedures or consent on behalf of {userName}',
    'NEVER share information about other family members or patients',
    'Do not argue if they cannot accommodate the request - politely explore alternatives',
  ],
};
