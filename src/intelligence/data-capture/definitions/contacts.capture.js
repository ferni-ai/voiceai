/**
 * Contact Data Capture Definition
 *
 * Passively captures contact information mentioned in conversation
 * and stores it via the ContactsService.
 *
 * Examples:
 * - "My mom's number is 555-1234"
 * - "Sarah's email is sarah@example.com"
 * - "My brother lives in Seattle"
 */
import { createContact, searchContacts, updateContact } from '../../../services/contacts.js';
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'ContactCapture' });
// Relationship mapping for common family/friend terms
const RELATIONSHIP_MAP = {
    mom: { relationship: 'family', label: 'Mom' },
    mother: { relationship: 'family', label: 'Mom' },
    dad: { relationship: 'family', label: 'Dad' },
    father: { relationship: 'family', label: 'Dad' },
    sister: { relationship: 'family', label: 'Sister' },
    brother: { relationship: 'family', label: 'Brother' },
    wife: { relationship: 'family', label: 'Wife' },
    husband: { relationship: 'family', label: 'Husband' },
    spouse: { relationship: 'family', label: 'Spouse' },
    partner: { relationship: 'family', label: 'Partner' },
    grandma: { relationship: 'family', label: 'Grandma' },
    grandmother: { relationship: 'family', label: 'Grandma' },
    grandpa: { relationship: 'family', label: 'Grandpa' },
    grandfather: { relationship: 'family', label: 'Grandpa' },
    son: { relationship: 'family', label: 'Son' },
    daughter: { relationship: 'family', label: 'Daughter' },
    aunt: { relationship: 'family', label: 'Aunt' },
    uncle: { relationship: 'family', label: 'Uncle' },
    cousin: { relationship: 'family', label: 'Cousin' },
    boss: { relationship: 'colleague', label: 'Boss' },
    coworker: { relationship: 'colleague', label: 'Coworker' },
    friend: { relationship: 'friend', label: 'Friend' },
};
export const contactCaptureDefinition = {
    id: 'capture_contact_info',
    name: 'Contact Information Capture',
    description: 'Captures phone numbers, emails, and contact details mentioned in conversation',
    category: 'contact',
    triggers: {
        phrases: [
            "my mom's number is",
            "my dad's number is",
            "my sister's number is",
            "my brother's number is",
            'number is',
            'phone is',
            'email is',
            'email address is',
            'lives at',
            'address is',
            'works at',
        ],
        patterns: [
            // "My mom's number is 555-1234"
            /(?:my\s+)?(\w+)(?:'s)?\s+(?:phone\s+)?number\s+is\s+([\d\-\(\)\s\+]+)/i,
            // "Mom's phone is 555-1234"
            /(\w+)(?:'s)?\s+phone\s+is\s+([\d\-\(\)\s\+]+)/i,
            // "Sarah's email is sarah@test.com"
            /(\w+)(?:'s)?\s+email(?:\s+address)?\s+is\s+(\S+@\S+)/i,
            // "Call my mom at 555-1234"
            /call\s+(?:my\s+)?(\w+)\s+at\s+([\d\-\(\)\s\+]+)/i,
            // "Text my brother at 555-1234"
            /text\s+(?:my\s+)?(\w+)\s+at\s+([\d\-\(\)\s\+]+)/i,
        ],
        keywords: [
            { word: 'number', weight: 0.8 },
            { word: 'phone', weight: 0.8 },
            { word: 'email', weight: 0.8 },
            { word: 'mom', weight: 0.7 },
            { word: 'dad', weight: 0.7 },
            { word: 'mother', weight: 0.7 },
            { word: 'father', weight: 0.7 },
            { word: 'sister', weight: 0.7 },
            { word: 'brother', weight: 0.7 },
            { word: 'wife', weight: 0.7 },
            { word: 'husband', weight: 0.7 },
        ],
        antiKeywords: ['what', 'who', "what's", 'forgot', 'remember', 'find', 'look up', 'search'],
    },
    arguments: [
        {
            name: 'nameOrRelation',
            type: 'string',
            description: 'Name or relationship term (e.g., "mom", "Sarah")',
            required: true,
            extractionPatterns: [
                /(?:my\s+)?(\w+)(?:'s)?\s+(?:phone|number|email)/i,
                /call\s+(?:my\s+)?(\w+)/i,
                /text\s+(?:my\s+)?(\w+)/i,
            ],
        },
        {
            name: 'phone',
            type: 'string',
            description: 'Phone number',
            required: false,
            extractionPatterns: [
                /(?:number|phone)\s+is\s+([\d\-\(\)\s\+]+)/i,
                /at\s+([\d\-\(\)\s\+]+)/i,
                /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
                /(\+?1?[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/,
            ],
        },
        {
            name: 'email',
            type: 'string',
            description: 'Email address',
            required: false,
            extractionPatterns: [/email(?:\s+address)?\s+is\s+(\S+@\S+)/i, /(\S+@\S+\.\S+)/i],
        },
    ],
    confidence: {
        baseScore: 0.6,
        patternMatchBonus: 0.3,
        keywordDensityMultiplier: 1.2,
        negativeKeywordPenalty: 0.3,
    },
    handler: async (extractedArgs, context) => {
        const { nameOrRelation, phone, email } = extractedArgs;
        if (!nameOrRelation || (!phone && !email)) {
            log.debug({ extractedArgs }, 'Missing required args for contact capture');
            return null;
        }
        const lowerName = nameOrRelation.toLowerCase().replace(/'s$/, '');
        const relationInfo = RELATIONSHIP_MAP[lowerName];
        // Determine display name
        const displayName = relationInfo ? relationInfo.label : nameOrRelation;
        const relationship = relationInfo?.relationship || 'other';
        try {
            // Check if contact already exists
            const existingResults = await searchContacts(context.userId, displayName);
            const existingResult = existingResults.find((r) => r.contact.displayName?.toLowerCase() === displayName.toLowerCase());
            if (existingResult) {
                // Update existing contact
                const updates = {};
                if (phone)
                    updates.phone = phone.trim();
                if (email)
                    updates.email = email.trim();
                if (Object.keys(updates).length > 0) {
                    await updateContact(existingResult.contact.id, updates);
                    log.info({ contactId: existingResult.contact.id, updates, userId: context.userId }, 'Updated existing contact with new info');
                    const updatedField = phone ? 'number' : 'email';
                    return `Got it, I've updated ${displayName}'s ${updatedField}.`;
                }
                // Already have this info
                return null;
            }
            // Create new contact
            const newContact = await createContact(context.userId, {
                displayName,
                phone: phone?.trim(),
                email: email?.trim(),
                relationship,
                notes: `Captured from conversation: "${context.transcript.slice(0, 100)}..."`,
            });
            log.info({ contactId: newContact.id, name: displayName, userId: context.userId }, 'Created new contact from passive capture');
            const capturedField = phone ? `${displayName}'s number` : `${displayName}'s email`;
            return `Got it, I've saved ${capturedField}.`;
        }
        catch (error) {
            log.error({ error: String(error), extractedArgs }, 'Failed to capture contact');
            return null;
        }
    },
};
//# sourceMappingURL=contacts.capture.js.map