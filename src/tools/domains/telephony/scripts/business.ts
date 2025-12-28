/**
 * Business Call Script Template
 *
 * For general business calls: banks, utilities, customer service,
 * professional services, etc.
 *
 * @module tools/domains/telephony/scripts/business
 */

import type { CallScriptTemplate } from '../call-on-behalf.js';

export const businessScript: CallScriptTemplate = {
  type: 'business',

  // -------------------------------------------------------------------------
  // Introduction
  // -------------------------------------------------------------------------
  greeting: "Hello, my name is {agentName} and I'm calling on behalf of {userName}.",

  identityDisclosure:
    "I'm an AI assistant authorized by {userName} to make this call. " +
    'I hope you can help me today.',

  recordingConsentScript: 'This call may be recorded for quality purposes. Is that acceptable?',

  // -------------------------------------------------------------------------
  // Objectives
  // -------------------------------------------------------------------------
  objectives: {
    inquiry:
      "I'm calling on behalf of {userName} with a question. {details}. " +
      'Could you help me with that?',

    reschedule:
      'I need to reschedule an appointment for {userName}. {details}. ' +
      'What options do you have available?',

    cancel:
      'I need to cancel something for {userName}. {details}. ' + 'Could you process that for me?',

    new_appointment:
      "I'd like to schedule an appointment for {userName}. {details}. " +
      'What availability do you have?',

    general: "I'm calling on behalf of {userName}. {details}.",

    check_in: "I'm checking in on behalf of {userName}. {details}.",

    deliver_message: 'I have a message from {userName}. {details}.',
  },

  // -------------------------------------------------------------------------
  // Information to Gather
  // -------------------------------------------------------------------------
  informationToGather: [
    'Confirmation of the action taken',
    'Any reference or confirmation numbers',
    'Next steps or follow-up required',
    'Contact information for follow-up if needed',
    'Timeline for resolution if applicable',
    'Any documentation that will be sent',
  ],

  // -------------------------------------------------------------------------
  // Must Confirm
  // -------------------------------------------------------------------------
  mustConfirm: [
    'Repeat back key details of what was discussed or agreed',
    'Confirm any dates, times, or deadlines',
    'Ask for confirmation number or reference',
    'Clarify next steps clearly',
  ],

  // -------------------------------------------------------------------------
  // Must Not Do
  // -------------------------------------------------------------------------
  mustNotDo: [
    'NEVER provide Social Security numbers, full credit card numbers, or bank account details',
    'NEVER agree to financial obligations, payments, or contracts without explicit authorization',
    'NEVER share personal information beyond what is necessary for the call',
    'Do not argue or become confrontational if they cannot help',
    'Do not make promises about what {userName} will or will not do',
    'Do not authorize any changes to accounts without confirmation from {userName}',
  ],
};
