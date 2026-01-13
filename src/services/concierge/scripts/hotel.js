/**
 * Hotel Scripts
 *
 * Conversation scripts for hotel-related calls.
 * Handles rate quotes, availability checks, and bookings.
 */
export const hotelScripts = [
    // Quote request script
    {
        domain: 'hotel',
        type: 'quote',
        greeting: 'Hi, good {{timeOfDay}}!',
        introduction: "I'm Alex, calling on behalf of {{userName}}. I'm helping them find hotel accommodations.",
        requestTemplate: `I'm looking for room availability for {{checkIn}} to {{checkOut}}.
{{#if guests}}That would be for {{guests}} guests.{{/if}}
{{#if roomType}}They're interested in a {{roomType}} if available.{{/if}}

Could you tell me your best available rate? And are there any promotions or discounts I should know about - like AAA, AARP, or corporate rates?`,
        followUps: {
            price: [
                "And that's the best rate you have available?",
                'Are there any other room types at a different price point?',
                'Does that include taxes and fees?',
            ],
            availability: [
                'Do you have availability for those dates?',
                'What about the day before or after if those dates are full?',
                'How many rooms do you have available?',
            ],
            discounts: [
                'Do you offer any AAA or AARP discounts?',
                'Are there corporate rates available?',
                'Any special promotions running right now?',
                'What about a discount for booking directly?',
            ],
            amenities: [
                'Is breakfast included?',
                'Is there free parking?',
                'Does the room have {{amenity}}?',
                'Is the pool open?',
            ],
            policies: [
                "What's your cancellation policy?",
                'Is a deposit required?',
                'What time is check-in and check-out?',
            ],
        },
        thankYou: "That's very helpful, thank you so much! I'll share this with {{userName}} and they may call back to book.",
        callbackRequest: 'If I need to follow up, can I ask who I spoke with today?',
        extractionPrompts: [
            'Extract the nightly rate mentioned',
            'Extract any discounts offered and their percentage',
            'Extract the room type being quoted',
            'Extract availability confirmation (yes/no)',
            'Extract the cancellation policy',
            'Extract any reference number or quote ID',
            'Extract the name of the person we spoke with',
        ],
    },
    // Booking script
    {
        domain: 'hotel',
        type: 'booking',
        greeting: 'Hi, good {{timeOfDay}}!',
        introduction: "I'm Alex, calling on behalf of {{userName}}. They spoke with your hotel earlier and would like to proceed with a booking.",
        requestTemplate: `They'd like to book a room for {{checkIn}} to {{checkOut}}.
{{#if referenceNumber}}The quote reference was {{referenceNumber}}.{{/if}}
{{#if roomType}}They wanted the {{roomType}}.{{/if}}

Can we proceed with that reservation?`,
        followUps: {
            confirmation: [
                'Can I get a confirmation number?',
                'Will they receive an email confirmation?',
                'What name will the reservation be under?',
            ],
            payment: [
                'Is a deposit required now?',
                'What payment methods do you accept?',
                'Can I provide a credit card to hold the reservation?',
            ],
            details: [
                'Can we add a note for early check-in if available?',
                "Can you note they'll need {{specialRequest}}?",
            ],
        },
        thankYou: 'Wonderful, thank you for your help! {{userName}} is looking forward to their stay.',
        extractionPrompts: [
            'Extract the confirmation number',
            'Extract the total price',
            'Extract the check-in and check-out times',
            'Extract any special notes or requests confirmed',
            'Extract deposit amount if mentioned',
        ],
    },
    // Inquiry script
    {
        domain: 'hotel',
        type: 'inquiry',
        greeting: 'Hi, good {{timeOfDay}}!',
        introduction: "I'm Alex, calling on behalf of {{userName}}. They have a few questions about your hotel.",
        requestTemplate: '{{inquiryDetails}}',
        followUps: {
            general: [
                'Could you tell me more about that?',
                'Is there anything else I should know?',
                'Who should they contact if they have more questions?',
            ],
        },
        thankYou: "That's exactly what I needed, thank you so much for your help!",
        extractionPrompts: [
            'Summarize the main answer or information provided',
            'Extract any contact information shared',
            'Extract any recommendations or suggestions made',
        ],
    },
];
//# sourceMappingURL=hotel.js.map