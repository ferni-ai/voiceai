/**
 * Restaurant Scripts
 *
 * Conversation scripts for restaurant reservation calls.
 * Handles reservations, dietary accommodations, and large party requests.
 */
export const restaurantScripts = [
    // Reservation request
    {
        domain: 'restaurant',
        type: 'booking',
        greeting: 'Hi there!',
        introduction: "I'm Alex, calling on behalf of {{userName}}. I'm helping them make a dinner reservation.",
        requestTemplate: `I'm looking to book a table for {{partySize}} on {{date}}.
{{#if timePreference}}They'd prefer around {{timePreference}}.{{/if}}
{{#if occasion}}It's for {{occasion}}.{{/if}}

Do you have availability?`,
        followUps: {
            availability: [
                'What times do you have available that evening?',
                'Would the night before or after work better?',
                "Do you take walk-ins if we can't reserve?",
            ],
            dietary: [
                'Can the kitchen accommodate {{dietary}}?',
                'Do you have vegetarian/vegan options?',
                'Are there any gluten-free options on the menu?',
            ],
            seating: [
                'Could we request outdoor seating?',
                'Is there a private dining area?',
                'Can we be seated away from the kitchen?',
            ],
            largeParty: [
                'Do you have a prix fixe menu for larger groups?',
                'Is there a separate check option for groups?',
                "What's the deposit for a large party?",
            ],
            special: [
                'Could you arrange something special for {{occasion}}?',
                'Do you do birthday desserts?',
                'Can we pre-order a cake?',
            ],
        },
        thankYou: 'Perfect, thank you so much! {{userName}} is really looking forward to it.',
        callbackRequest: 'And who should they ask for if they need to change the reservation?',
        extractionPrompts: [
            'Extract the reservation time confirmed',
            'Extract the party size confirmed',
            'Extract the name the reservation is under',
            'Extract any special accommodations noted',
            'Extract confirmation number if provided',
        ],
    },
    // Quote/inquiry for large events
    {
        domain: 'restaurant',
        type: 'quote',
        greeting: 'Hi!',
        introduction: "I'm Alex, calling on behalf of {{userName}}. They're interested in hosting an event at your restaurant.",
        requestTemplate: `They're planning an event for approximately {{partySize}} guests.
{{#if date}}The date would be {{date}}.{{/if}}
{{#if eventType}}It's for {{eventType}}.{{/if}}

Could you tell me about your options for private events and pricing?`,
        followUps: {
            pricing: [
                'What are the minimums for a private space?',
                'Do you offer package pricing?',
                "What's included in that price?",
            ],
            menu: [
                'Can you customize a menu?',
                'What are the prix fixe options?',
                'How do you handle dietary restrictions for groups?',
            ],
            logistics: [
                'What time could we have the space?',
                'Is AV equipment available?',
                'Is there a separate entrance?',
            ],
        },
        thankYou: 'This is great information, thank you! {{userName}} will follow up soon.',
        extractionPrompts: [
            'Extract pricing or minimums mentioned',
            'Extract capacity of private spaces',
            'Extract menu options discussed',
            'Extract any special requirements or limitations',
        ],
    },
    // Inquiry
    {
        domain: 'restaurant',
        type: 'inquiry',
        greeting: 'Hi, quick question!',
        introduction: "I'm Alex, calling on behalf of {{userName}}.",
        requestTemplate: '{{inquiryDetails}}',
        followUps: {
            menu: [
                'Can you tell me more about that dish?',
                'What would you recommend for someone who likes {{preference}}?',
            ],
            general: ['What are your hours?', 'Do you validate parking?', 'Is there a dress code?'],
        },
        thankYou: "Great, that's exactly what I needed. Thank you!",
        extractionPrompts: [
            'Summarize the answer provided',
            'Extract any menu recommendations',
            'Extract operational details shared',
        ],
    },
];
//# sourceMappingURL=restaurant.js.map