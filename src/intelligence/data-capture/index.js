/**
 * Semantic Data Capture Router
 *
 * Real-time extraction and routing of personal data mentioned during conversation.
 * Bridges the gap between tool-based semantic routing and passive data storage.
 *
 * This system enables "Better than Human" by:
 * 1. Passively capturing contacts, commitments, dreams, relationships
 * 2. Feeding data into Superhuman Services (commitment-keeper, dream-keeper, etc.)
 * 3. Generating natural acknowledgments for the LLM to weave in
 *
 * Example: "My mom's number is 555-1234"
 * → Extracts: { name: "Mom", relationship: "mother", phone: "555-1234" }
 * → Routes to: Contacts service
 * → Returns: Acknowledgment for LLM context
 *
 * @module intelligence/data-capture
 */
import { createLogger } from '../../utils/safe-logger.js';
import { runBackground } from '../../utils/background-task.js';
const log = createLogger({ module: 'DataCapture' });
// ============================================================================
// RELATIONSHIP MAPPINGS
// ============================================================================
const RELATIONSHIP_MAP = {
    mom: 'mother',
    mommy: 'mother',
    mother: 'mother',
    dad: 'father',
    daddy: 'father',
    father: 'father',
    sis: 'sister',
    sister: 'sister',
    bro: 'brother',
    brother: 'brother',
    wife: 'wife',
    husband: 'husband',
    spouse: 'spouse',
    partner: 'partner',
    boyfriend: 'boyfriend',
    girlfriend: 'girlfriend',
    fiance: 'fiancé',
    fiancee: 'fiancée',
    son: 'son',
    daughter: 'daughter',
    grandma: 'grandmother',
    grandmother: 'grandmother',
    grandpa: 'grandfather',
    grandfather: 'grandfather',
    aunt: 'aunt',
    uncle: 'uncle',
    cousin: 'cousin',
    boss: 'boss',
    manager: 'manager',
    coworker: 'coworker',
    colleague: 'colleague',
    friend: 'friend',
    neighbor: 'neighbor',
    doctor: 'doctor',
    dentist: 'dentist',
    therapist: 'therapist',
};
// ============================================================================
// PHONE NUMBER EXTRACTION
// ============================================================================
const PHONE_PATTERNS = [
    // Standard formats: (555) 123-4567, 555-123-4567, 555.123.4567
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    // With country code: +1 555 123 4567, 1-555-123-4567
    /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    // 10 digits together
    /\b\d{10}\b/,
    // 7 digits (local)
    /\b\d{3}[-.\s]?\d{4}\b/,
];
function extractPhoneNumber(text) {
    for (const pattern of PHONE_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            // Normalize to digits only
            const digits = match[0].replace(/\D/g, '');
            // Ensure we have at least 7 digits
            if (digits.length >= 7) {
                return match[0]; // Return original format
            }
        }
    }
    return null;
}
// ============================================================================
// EMAIL EXTRACTION
// ============================================================================
function extractEmail(text) {
    const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const match = text.match(pattern);
    return match ? match[0].toLowerCase() : null;
}
function extractRelationship(text) {
    const lowerText = text.toLowerCase();
    // Check for relationship patterns
    for (const [keyword, relationship] of Object.entries(RELATIONSHIP_MAP)) {
        // Patterns: "my mom's", "my mom is", "my mom,", "a sister", "have a brother"
        const patterns = [
            // "my mom", "my mom's", "my mom is"
            new RegExp(`\\bmy\\s+${keyword}(?:'s|\\s|,|$)`, 'i'),
            // "mom's number", "mom's phone"
            new RegExp(`\\b${keyword}(?:'s)?\\s+(?:number|phone|email)`, 'i'),
            // "have a sister", "got a brother" - for introduction patterns
            new RegExp(`\\b(?:have|got)\\s+a\\s+${keyword}\\b`, 'i'),
            // "a sister named", "a brother called" - named introductions
            new RegExp(`\\ba\\s+${keyword}\\s+(?:named|called)\\b`, 'i'),
        ];
        for (const pattern of patterns) {
            const match = lowerText.match(pattern);
            if (match) {
                // Capitalize for display name
                const displayName = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                return {
                    relationship,
                    displayName,
                    position: match.index ?? 0,
                };
            }
        }
    }
    return null;
}
// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================
function classifyIntent(text, hasContactInfo, hasRelationship) {
    const lowerText = text.toLowerCase();
    // Explicit save commands
    if (/\b(save|remember|add|store)\s+(my\s+)?/.test(lowerText) && hasContactInfo) {
        return 'explicit_save';
    }
    // Correction patterns
    if (/\b(actually|new|changed|updated|different)\s+/.test(lowerText) && hasContactInfo) {
        return 'correction';
    }
    // Query patterns
    if (/\b(what('s|is)|do you know|remind me|tell me)\s+/.test(lowerText)) {
        return 'query';
    }
    // If sharing contact info without explicit command
    if (hasContactInfo && /\b(is|here('s)?)\s+/.test(lowerText)) {
        return 'implicit_share';
    }
    // Relationship mention with action intent (call, text, message, talk to)
    // e.g., "call my mom", "text my brother", "I need to talk to my sister"
    if (hasRelationship && /\b(call|text|message|reach|contact|talk\s+to|speak\s+(to|with))\s+(my\s+)?/.test(lowerText)) {
        return 'relationship_mention';
    }
    // Explicit relationship introduction (my X is, I have a X)
    // e.g., "my mom is coming over", "I have a brother named John"
    if (hasRelationship && /\b(my\s+\w+\s+(is|was|has|loves|likes|works|lives))\b/.test(lowerText)) {
        return 'relationship_mention';
    }
    // Naming a relationship (my X, her/his name is Y, my X named Y)
    // e.g., "my mom, her name is Betty", "my brother named John", "my mom's name is Sarah"
    if (hasRelationship && /\b(name\s+is|named|called)\b/i.test(lowerText)) {
        return 'relationship_mention';
    }
    // Emotional relationship mentions (miss, love, worried about, thinking of)
    // e.g., "I miss my mom", "I love my sister", "worried about my dad"
    if (hasRelationship && /\b(miss|love|adore|worried\s+(about|for)|thinking\s+(of|about)|care\s+(for|about))\s+(my\s+)?/.test(lowerText)) {
        return 'relationship_mention';
    }
    // First-time relationship introduction (I have a, I've got a, there's my)
    // e.g., "I have a sister", "I've got a brother in Seattle"
    if (hasRelationship && /\b(i\s+(have|'ve\s+got|got)\s+a|there('s| is)\s+my)\s+/i.test(lowerText)) {
        return 'relationship_mention';
    }
    // Reference only (mentioned but not sharing new info)
    return 'reference_only';
}
// ============================================================================
// MAIN EXTRACTION
// ============================================================================
function extractContactEntity(text) {
    const phone = extractPhoneNumber(text);
    const email = extractEmail(text);
    const relationshipMatch = extractRelationship(text);
    // Must have either contact info OR relationship context
    if (!phone && !email && !relationshipMatch) {
        return null;
    }
    // Return entity even if only relationship (no phone/email)
    // The intent classifier will decide if it should be saved
    return {
        type: 'contact',
        name: relationshipMatch?.displayName,
        relationship: relationshipMatch?.relationship,
        phone: phone ?? undefined,
        email: email ?? undefined,
    };
}
// ============================================================================
// ACKNOWLEDGMENT GENERATION
// ============================================================================
function generateAcknowledgment(items) {
    if (items.length === 0)
        return undefined;
    const contactItems = items.filter((i) => i.entity.type === 'contact' && i.storage.action !== 'skip');
    if (contactItems.length === 0)
        return undefined;
    const contact = contactItems[0].entity;
    const name = contact.name || contact.relationship || 'that contact';
    const hasContactInfo = !!(contact.phone || contact.email);
    const parts = [];
    if (contact.phone)
        parts.push('number');
    if (contact.email)
        parts.push('email');
    const what = parts.join(' and ');
    // Different acknowledgments based on intent
    const intent = contactItems[0].intent;
    switch (intent) {
        case 'explicit_save':
            return `Got it! I've saved ${name}'s ${what}.`;
        case 'implicit_share':
            return `I've saved ${name}'s ${what} for you.`;
        case 'correction':
            return `Updated! I've got ${name}'s new ${what}.`;
        case 'relationship_mention':
            // Relationship-only save - acknowledge we're remembering them
            return hasContactInfo
                ? `I've noted ${name}'s ${what}.`
                : undefined; // Silent save for relationship-only - more natural
        default:
            return undefined;
    }
}
// ============================================================================
// STORAGE ROUTING
// ============================================================================
async function routeToStorage(item, context) {
    if (item.storage.action === 'skip')
        return;
    if (item.entity.type !== 'contact')
        return;
    const contact = item.entity;
    // ═══════════════════════════════════════════════════════════════════════════
    // 🧠 ENTITY STORE: Unified entity capture (Better Than Human memory)
    // This is the PRIMARY storage - legacy collections below are for backwards compatibility
    // ═══════════════════════════════════════════════════════════════════════════
    try {
        const { capturePersonEntity, isEntityStoreReady } = await import('../../memory/entity-store/integration.js');
        if (isEntityStoreReady()) {
            await capturePersonEntity(context.userId, {
                name: contact.name,
                relationship: contact.relationship,
                phone: contact.phone,
                email: contact.email,
            }, {
                conversationId: context.sessionId || 'unknown',
                sessionId: context.sessionId || 'unknown',
                personaId: context.personaId || 'ferni', // Use context persona or fallback to Ferni
                transcript: context.transcript,
            });
            log.info({ userId: context.userId, name: contact.name || contact.relationship }, '🧠 Captured to unified entity store');
        }
    }
    catch (entityErr) {
        log.warn({ error: String(entityErr) }, 'Entity store capture failed (non-fatal, continuing to legacy)');
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // LEGACY: Also write to old collections for backwards compatibility
    // TODO: Remove after migration is complete
    // ═══════════════════════════════════════════════════════════════════════════
    // Import contacts service
    const { createContact, findContact, updateContact } = await import('../../services/contacts.js');
    // Check if contact already exists
    if (contact.name) {
        const existing = await findContact(context.userId, contact.name);
        if (existing) {
            // Update existing
            updateContact(existing.id, {
                phones: contact.phone
                    ? [{ number: contact.phone, type: 'mobile', primary: true }]
                    : undefined,
                emails: contact.email
                    ? [{ address: contact.email, type: 'personal', primary: true }]
                    : undefined,
            });
            log.info({ userId: context.userId, name: contact.name }, '📇 Updated existing contact via data capture');
            return;
        }
    }
    // Create new contact in main contacts service
    const newContact = await createContact(context.userId, {
        displayName: contact.name || contact.relationship || 'Contact',
        phone: contact.phone,
        relationship: contact.relationship,
        nicknames: contact.relationship ? [contact.relationship] : undefined,
    });
    log.info({
        userId: context.userId,
        name: contact.name,
        relationship: contact.relationship,
        hasPhone: !!contact.phone,
        hasEmail: !!contact.email,
    }, '📇 Created contact via data capture');
    // 🐛 FIX: Also add to contact_relationships for telephony/search
    // This ensures "call my brother" will find the contact
    try {
        const { upsertContact } = await import('../../services/contacts/contact-relationship-service.js');
        const relationshipType = contact.relationship === 'mother' || contact.relationship === 'father' ||
            contact.relationship === 'brother' || contact.relationship === 'sister' ||
            contact.relationship === 'wife' || contact.relationship === 'husband' ||
            contact.relationship === 'son' || contact.relationship === 'daughter'
            ? 'family'
            : contact.relationship === 'friend' ? 'friend'
                : contact.relationship === 'boss' || contact.relationship === 'coworker' || contact.relationship === 'colleague'
                    ? 'colleague'
                    : 'other';
        await upsertContact(context.userId, {
            contactId: newContact.id,
            name: contact.name || contact.relationship || 'Contact',
            phone: contact.phone,
            email: contact.email,
            relationship: relationshipType,
            notes: contact.relationship, // Store the specific relationship (mom, brother, etc.)
        });
        log.info({ userId: context.userId, name: contact.name, relationship: contact.relationship }, '📇 Also synced to contact_relationships for telephony');
    }
    catch (syncErr) {
        log.warn({ error: String(syncErr) }, 'Failed to sync contact to relationships (non-fatal)');
    }
}
// ============================================================================
// MAIN ENTRY POINT
// ============================================================================
/**
 * Process transcript for data capture
 *
 * Extracts entities, classifies intent, routes to storage,
 * and returns context for LLM acknowledgment.
 */
export async function processDataCapture(context) {
    const { transcript, userId } = context;
    const captured = [];
    // Extract contact entities
    const contactEntity = extractContactEntity(transcript);
    if (contactEntity) {
        const hasContactInfo = !!(contactEntity.phone || contactEntity.email);
        const hasRelationship = !!(contactEntity.relationship || contactEntity.name);
        const intent = classifyIntent(transcript, hasContactInfo, hasRelationship);
        // Determine storage action - now includes relationship_mention for "call my mom" style phrases
        const shouldSave = intent === 'explicit_save' ||
            intent === 'implicit_share' ||
            intent === 'correction' ||
            intent === 'relationship_mention';
        // Determine storage target (contacts for contact info, relationships for relationship-only)
        const storageTarget = hasContactInfo ? 'contacts' : 'relationships';
        const item = {
            entity: contactEntity,
            intent,
            confidence: hasContactInfo ? 0.9 : hasRelationship ? 0.7 : 0.5,
            storage: {
                target: storageTarget,
                action: shouldSave ? 'create' : 'skip',
                reason: shouldSave
                    ? `${intent}: saving ${hasContactInfo ? 'contact info' : 'relationship'}`
                    : 'reference only, not saving',
            },
            acknowledged: shouldSave,
        };
        captured.push(item);
        // Route to storage (fire and forget for performance)
        if (shouldSave) {
            runBackground(routeToStorage(item, context), { task: 'data-capture-storage', userId });
        }
    }
    // Generate acknowledgment
    const suggestedAcknowledgment = generateAcknowledgment(captured);
    // Generate context for LLM
    const contextForLLM = captured.length > 0 && suggestedAcknowledgment
        ? `[DATA CAPTURED: ${suggestedAcknowledgment}]`
        : undefined;
    if (captured.length > 0) {
        log.info({
            userId,
            capturedCount: captured.length,
            types: captured.map((c) => c.entity.type),
            intents: captured.map((c) => c.intent),
        }, '🎯 Data capture extracted entities');
    }
    return {
        captured,
        suggestedAcknowledgment,
        contextForLLM,
    };
}
let dataCaptureConfig = null;
async function loadDataCaptureConfig() {
    if (dataCaptureConfig)
        return dataCaptureConfig;
    try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const configPath = path.resolve(process.cwd(), 'data/model-config.json');
        const configText = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(configText);
        dataCaptureConfig = {
            enabled: config.dataCaptureDefaults?.enabled ?? true,
            enabledCaptures: config.dataCaptureDefaults?.enabledCaptures ?? [],
            disabledCaptures: config.dataCaptureDefaults?.disabledCaptures ?? [],
        };
        log.debug({
            enabled: dataCaptureConfig.enabled,
            enabledCount: dataCaptureConfig.enabledCaptures.length,
            disabledCount: dataCaptureConfig.disabledCaptures.length,
        }, '📋 Data capture config loaded');
    }
    catch (error) {
        log.debug({ error: String(error) }, 'Using default data capture config');
        dataCaptureConfig = {
            enabled: true,
            enabledCaptures: [],
            disabledCaptures: [],
        };
    }
    return dataCaptureConfig;
}
/**
 * Check if a specific capture definition is enabled
 */
function isCaptureEnabled(captureId, config) {
    // If data capture is globally disabled, nothing is enabled
    if (!config.enabled)
        return false;
    // If enabledCaptures is specified, only those are enabled
    if (config.enabledCaptures.length > 0) {
        return config.enabledCaptures.includes(captureId);
    }
    // Otherwise, check if it's in the disabled list
    return !config.disabledCaptures.includes(captureId);
}
/**
 * Definition-based data capture router.
 * Uses DataCaptureDefinitions to detect and extract data patterns.
 * This extends the hardcoded approach above with configurable definitions.
 * Respects dataCaptureDefaults config for enabling/disabling specific captures.
 */
class DefinitionBasedRouter {
    definitions = [];
    initialized = false;
    config = null;
    async initialize() {
        if (this.initialized)
            return;
        try {
            // Load config first
            this.config = await loadDataCaptureConfig();
            // Load all definitions
            const { allDataCaptureDefinitions } = await import('./definitions/index.js');
            // Filter based on config
            this.definitions = allDataCaptureDefinitions.filter((def) => {
                // Extract capture category from definition ID (e.g., "capture_contacts" -> "contacts")
                const captureId = def.category || def.id.replace('capture_', '');
                const enabled = isCaptureEnabled(captureId, this.config);
                if (!enabled) {
                    log.debug({ captureId, defId: def.id }, '⏭️ Data capture disabled by config');
                }
                return enabled;
            });
            this.initialized = true;
            log.info({
                total: allDataCaptureDefinitions.length,
                enabled: this.definitions.length,
                disabled: allDataCaptureDefinitions.length - this.definitions.length,
            }, '🧠 Definition-based data capture initialized');
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Failed to load data capture definitions');
        }
    }
    async captureFromDefinitions(context) {
        if (!this.initialized) {
            await this.initialize();
        }
        for (const def of this.definitions) {
            const matchScore = this.calculateMatchScore(context.transcript, def);
            if (matchScore > def.confidence.baseScore) {
                const extractedArgs = this.extractArguments(context.transcript, def);
                // Check required arguments
                const missingRequired = def.arguments.some((arg) => arg.required && extractedArgs[arg.name] === undefined);
                if (missingRequired) {
                    log.debug({ defId: def.id, transcript: context.transcript.slice(0, 50), extractedArgs }, 'Skipping definition: missing required args');
                    continue;
                }
                try {
                    const acknowledgment = await def.handler(extractedArgs, context);
                    if (acknowledgment) {
                        log.info({ defId: def.id, extractedArgs, userId: context.userId }, '🧠 Definition-based data captured');
                        return acknowledgment;
                    }
                }
                catch (error) {
                    log.error({ defId: def.id, error: String(error) }, 'Error in definition handler');
                }
            }
        }
        return null;
    }
    calculateMatchScore(transcript, def) {
        let score = 0;
        const lowerTranscript = transcript.toLowerCase();
        // Phrase matching (strongest signal)
        if (def.triggers.phrases) {
            for (const phrase of def.triggers.phrases) {
                if (lowerTranscript.includes(phrase.toLowerCase())) {
                    score += def.confidence.baseScore;
                    break;
                }
            }
        }
        // Pattern matching
        if (def.triggers.patterns) {
            for (const pattern of def.triggers.patterns) {
                if (pattern.test(transcript)) {
                    score += def.confidence.patternMatchBonus || 0;
                    break;
                }
            }
        }
        // Keyword matching
        if (def.triggers.keywords) {
            let keywordCount = 0;
            for (const keyword of def.triggers.keywords) {
                if (lowerTranscript.includes(keyword.word.toLowerCase())) {
                    keywordCount++;
                    score += keyword.weight;
                }
            }
            if (keywordCount > 0) {
                score *= def.confidence.keywordDensityMultiplier || 1;
            }
        }
        // Anti-keyword penalty
        if (def.triggers.antiKeywords) {
            for (const antiKeyword of def.triggers.antiKeywords) {
                if (lowerTranscript.includes(antiKeyword.toLowerCase())) {
                    score *= def.confidence.negativeKeywordPenalty || 1;
                    break;
                }
            }
        }
        return score;
    }
    extractArguments(transcript, def) {
        const extracted = {};
        for (const arg of def.arguments) {
            if (arg.extractionPatterns) {
                for (const pattern of arg.extractionPatterns) {
                    const match = transcript.match(pattern);
                    if (match && match[1]) {
                        extracted[arg.name] = match[1];
                        break;
                    }
                }
            }
        }
        return extracted;
    }
}
// Singleton instance
let definitionRouter = null;
function getDefinitionRouter() {
    if (!definitionRouter) {
        definitionRouter = new DefinitionBasedRouter();
    }
    return definitionRouter;
}
/**
 * Enhanced data capture that combines hardcoded + definition-based capture.
 *
 * This is the main entry point for "Better than Human" passive learning.
 *
 * @param context - Capture context with transcript and user info
 * @returns Capture result with acknowledgment for LLM injection
 */
export async function captureDataBetterThanHuman(context) {
    // First, try the fast hardcoded path for contacts
    const hardcodedResult = await processDataCapture(context);
    // If hardcoded captured something that should be saved, use that result
    // Note: relationship-only saves may not have an acknowledgment (silent save)
    // but we still want to return the captured data for tracking
    if (hardcodedResult.captured.length > 0 &&
        hardcodedResult.captured.some((c) => c.storage.action !== 'skip')) {
        return hardcodedResult;
    }
    // Try definition-based capture for commitments, dreams, relationships
    const router = getDefinitionRouter();
    const definitionAck = await router.captureFromDefinitions(context);
    if (definitionAck) {
        log.info({
            userId: context.userId.slice(0, 12) + '...',
            acknowledgment: definitionAck.slice(0, 50),
        }, '🎯 Better-than-Human data captured via definition');
        return {
            captured: [],
            suggestedAcknowledgment: definitionAck,
            contextForLLM: `[DATA CAPTURED: ${definitionAck}]`,
        };
    }
    // Nothing captured
    return {
        captured: [],
        suggestedAcknowledgment: undefined,
        contextForLLM: undefined,
    };
}
//# sourceMappingURL=index.js.map