/**
 * Local Service Scripts
 *
 * Conversation scripts for local service providers (plumbers, electricians, etc.).
 * Handles quote requests, scheduling, and follow-ups.
 */
export const localServiceScripts = [
    // Quote request
    {
        domain: 'local_service',
        type: 'quote',
        greeting: 'Hi!',
        introduction: "I'm Alex, calling on behalf of {{userName}}. They're looking for help with a home project.",
        requestTemplate: `They need a {{serviceType}}.
{{#if description}}Here's what's going on: {{description}}{{/if}}
{{#if location}}The property is in {{location}}.{{/if}}

Would you be able to provide an estimate?`,
        followUps: {
            pricing: [
                'Is that estimate firm or could it change?',
                'What would cause the price to go up?',
                'Do you charge for the estimate?',
                'Are there any additional fees I should know about?',
            ],
            availability: [
                'When could you come take a look?',
                'How far out is your schedule?',
                'Do you offer emergency services?',
                'Can you come on a weekend?',
            ],
            scope: [
                'Does that include materials?',
                'How long would the job take?',
                'Would you need to come back for anything?',
                'Is there a warranty on the work?',
            ],
            credentials: [
                'Are you licensed and insured?',
                'Can you provide references?',
                'How long have you been doing this work?',
            ],
        },
        thankYou: "That's really helpful, thank you! {{userName}} will be in touch to schedule.",
        callbackRequest: "What's the best way for them to reach you?",
        extractionPrompts: [
            'Extract the price estimate',
            'Extract what is included in the estimate',
            'Extract estimated timeline or duration',
            'Extract earliest availability',
            'Extract if materials are included',
            'Extract warranty information',
        ],
    },
    // Scheduling
    {
        domain: 'local_service',
        type: 'appointment',
        greeting: 'Hi!',
        introduction: "I'm Alex, calling back for {{userName}}. They spoke with you about {{serviceType}} and would like to schedule.",
        requestTemplate: `They'd like to move forward with the work.
{{#if preferredDate}}They were hoping for {{preferredDate}}.{{/if}}

What times do you have available?`,
        followUps: {
            scheduling: [
                'Would morning or afternoon work better?',
                'How long of a window should they plan for?',
                'Will you call before arriving?',
            ],
            preparation: [
                'Is there anything they should do to prepare?',
                'Do they need to be home?',
                'Should they clear the area?',
            ],
            payment: [
                'How do you prefer to be paid?',
                'Is a deposit required?',
                'Do you accept credit cards?',
            ],
        },
        thankYou: "Perfect, they'll see you then! Thanks for working them in.",
        extractionPrompts: [
            'Extract the scheduled date and time',
            'Extract any preparation needed',
            'Extract payment expectations',
            'Extract estimated duration of visit',
        ],
    },
    // Follow-up on existing work
    {
        domain: 'local_service',
        type: 'status',
        greeting: 'Hi there.',
        introduction: "I'm calling for {{userName}} about some work you did recently.",
        requestTemplate: `{{#if issue}}They're having an issue with {{issue}}.{{else}}They wanted to follow up on the work from {{workDate}}.{{/if}}

Could someone take a look?`,
        followUps: {
            warranty: [
                'Is this covered under warranty?',
                'How long is the warranty period?',
                'What does the warranty cover?',
            ],
            scheduling: [
                'When could someone come back?',
                'Is this something that needs urgent attention?',
            ],
            cost: ['Would there be a charge for this?', 'Can you waive the service call fee?'],
        },
        thankYou: 'Thank you for getting back to them. They appreciate it.',
        extractionPrompts: [
            'Extract if warranty applies',
            'Extract scheduled follow-up time',
            'Extract any additional costs',
            'Extract resolution plan',
        ],
    },
];
//# sourceMappingURL=local-service.js.map