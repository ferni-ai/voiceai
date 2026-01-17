/**
 * Healthcare Scripts
 *
 * Conversation scripts for medical appointment scheduling.
 * Handles new patient appointments, follow-ups, and prescription inquiries.
 */

import type { OutreachScript } from '../types.js';

export const healthcareScripts: OutreachScript[] = [
  // Appointment scheduling
  {
    domain: 'healthcare',
    type: 'appointment',

    greeting: 'Hello, good {{timeOfDay}}.',

    introduction: "I'm calling on behalf of {{userName}} to schedule an appointment.",

    requestTemplate: `{{#if isNewPatient}}They're a new patient looking to establish care.{{else}}They're an existing patient who needs a follow-up.{{/if}}
{{#if providerType}}They're looking to see a {{providerType}}.{{/if}}
{{#if reason}}The reason for the visit is {{reason}}.{{/if}}
{{#if urgency}}This is {{urgency}} in nature.{{/if}}

What's your earliest availability?`,

    followUps: {
      availability: [
        'Do you have anything sooner?',
        'What about a different day of the week?',
        'Is there a cancellation list we could be added to?',
      ],
      insurance: [
        'Do you accept {{insurance}}?',
        'Will they need a referral?',
        'What should they bring for insurance verification?',
      ],
      newPatient: [
        'Is there paperwork to fill out beforehand?',
        'How early should they arrive for the first visit?',
        'Should they bring any medical records?',
      ],
      provider: [
        'Can they request a specific provider?',
        'Is Dr. {{providerName}} accepting new patients?',
        "What's the provider's specialty?",
      ],
      logistics: [
        "What's the office address?",
        'Is parking available?',
        'Can they bring someone to the appointment?',
      ],
    },

    thankYou: 'Thank you so much for your help. {{userName}} will be there.',

    callbackRequest: 'If they need to reschedule, what number should they call?',

    extractionPrompts: [
      'Extract the appointment date and time',
      'Extract the provider name',
      'Extract what to bring to the appointment',
      'Extract insurance acceptance confirmation',
      'Extract any pre-appointment requirements',
      'Extract the office address',
    ],
  },

  // Prescription inquiry
  {
    domain: 'healthcare',
    type: 'status',

    greeting: 'Hello.',

    introduction: "I'm calling on behalf of {{userName}} about a prescription.",

    requestTemplate: `They're checking on a prescription refill for {{medication}}.
{{#if pharmacy}}It should be sent to {{pharmacy}}.{{/if}}

Has the refill been processed?`,

    followUps: {
      refill: [
        'When will it be ready for pickup?',
        'Does it need prior authorization?',
        'Can it be expedited?',
      ],
      renewal: [
        'Do they need an appointment for a renewal?',
        'Can the doctor renew it without a visit?',
        'How long until the prescription expires?',
      ],
    },

    thankYou: 'Great, thank you for checking on that.',

    extractionPrompts: [
      'Extract refill status (approved/pending/denied)',
      'Extract when medication will be ready',
      'Extract if an appointment is needed',
      'Extract any insurance or authorization issues',
    ],
  },

  // Test results inquiry
  {
    domain: 'healthcare',
    type: 'inquiry',

    greeting: 'Hello.',

    introduction: "I'm calling on behalf of {{userName}} to check on some test results.",

    requestTemplate: `They had {{testType}} done on {{testDate}} and wanted to know if the results are available.`,

    followUps: {
      results: [
        'Can the results be shared over the phone?',
        'Is a follow-up appointment needed?',
        'Can the results be sent to the patient portal?',
      ],
      timing: ['When should the results be ready?', "Will someone call when they're in?"],
    },

    thankYou: "Thank you for checking. They'll look for the results.",

    extractionPrompts: [
      'Extract if results are available',
      'Extract if follow-up is needed',
      'Extract how to access results',
      'Extract any concerning findings mentioned',
    ],
  },
];
