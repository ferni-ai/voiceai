/**
 * Recovery Event Data Capture Definition
 *
 * Passively captures events that need recovery time.
 * Detects mentions of difficult experiences the user needs to recover from.
 *
 * @module intelligence/data-capture/definitions/recovery-event.capture
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'data-capture:recovery-event' });
// Map event types
const RECOVERY_EVENT_TYPES = {
    // Conflict
    fight: { type: 'conflict', baseIntensity: 0.7 },
    argument: { type: 'conflict', baseIntensity: 0.7 },
    blowup: { type: 'conflict', baseIntensity: 0.8 },
    'falling out': { type: 'conflict', baseIntensity: 0.8 },
    confrontation: { type: 'conflict', baseIntensity: 0.7 },
    // Bad news
    'bad news': { type: 'bad_news', baseIntensity: 0.7 },
    'found out': { type: 'bad_news', baseIntensity: 0.6 },
    'got news': { type: 'bad_news', baseIntensity: 0.6 },
    diagnosis: { type: 'bad_news', baseIntensity: 0.8 },
    // Rejection
    rejected: { type: 'rejection', baseIntensity: 0.8 },
    'turned down': { type: 'rejection', baseIntensity: 0.7 },
    "didn't get": { type: 'rejection', baseIntensity: 0.6 },
    'passed over': { type: 'rejection', baseIntensity: 0.7 },
    ghosted: { type: 'rejection', baseIntensity: 0.7 },
    'said no': { type: 'rejection', baseIntensity: 0.6 },
    // Loss
    lost: { type: 'loss', baseIntensity: 0.9 },
    died: { type: 'loss', baseIntensity: 0.95 },
    'passed away': { type: 'loss', baseIntensity: 0.95 },
    funeral: { type: 'loss', baseIntensity: 0.9 },
    breakup: { type: 'loss', baseIntensity: 0.85 },
    divorce: { type: 'loss', baseIntensity: 0.9 },
    ended: { type: 'loss', baseIntensity: 0.7 },
    miscarriage: { type: 'loss', baseIntensity: 0.95 },
    'put down': { type: 'loss', baseIntensity: 0.85 }, // pet loss
    // Betrayal
    betrayed: { type: 'betrayal', baseIntensity: 0.9 },
    cheated: { type: 'betrayal', baseIntensity: 0.9 },
    'stabbed in the back': { type: 'betrayal', baseIntensity: 0.85 },
    lied: { type: 'betrayal', baseIntensity: 0.7 },
    // Failure
    failed: { type: 'failure', baseIntensity: 0.7 },
    bombed: { type: 'failure', baseIntensity: 0.7 },
    blew: { type: 'failure', baseIntensity: 0.6 },
    'messed up': { type: 'failure', baseIntensity: 0.6 },
    // Intense work
    deadline: { type: 'intense_work', baseIntensity: 0.6 },
    crunch: { type: 'intense_work', baseIntensity: 0.7 },
    'all-nighter': { type: 'intense_work', baseIntensity: 0.8 },
    'worked all': { type: 'intense_work', baseIntensity: 0.7 },
    'pulled an all-nighter': { type: 'intense_work', baseIntensity: 0.8 },
    sprint: { type: 'intense_work', baseIntensity: 0.6 },
    // Burnout
    burnout: { type: 'burnout', baseIntensity: 0.9 },
    'burned out': { type: 'burnout', baseIntensity: 0.9 },
    exhausted: { type: 'burnout', baseIntensity: 0.7 },
    'running on empty': { type: 'burnout', baseIntensity: 0.8 },
    depleted: { type: 'burnout', baseIntensity: 0.8 },
    // Social
    'big event': { type: 'social_event', baseIntensity: 0.5 },
    party: { type: 'social_event', baseIntensity: 0.4 },
    wedding: { type: 'social_event', baseIntensity: 0.5 },
    conference: { type: 'social_event', baseIntensity: 0.6 },
    reunion: { type: 'social_event', baseIntensity: 0.6 },
    // Emotional conversation
    'heavy conversation': { type: 'emotional_conversation', baseIntensity: 0.7 },
    'emotional talk': { type: 'emotional_conversation', baseIntensity: 0.7 },
    'heart-to-heart': { type: 'emotional_conversation', baseIntensity: 0.6 },
    'hard talk': { type: 'emotional_conversation', baseIntensity: 0.7 },
    'difficult conversation': { type: 'emotional_conversation', baseIntensity: 0.7 },
    // Medical
    surgery: { type: 'medical_procedure', baseIntensity: 0.8 },
    procedure: { type: 'medical_procedure', baseIntensity: 0.6 },
    doctor: { type: 'medical_procedure', baseIntensity: 0.4 },
    hospital: { type: 'medical_procedure', baseIntensity: 0.7 },
    'emergency room': { type: 'medical_procedure', baseIntensity: 0.8 },
    biopsy: { type: 'medical_procedure', baseIntensity: 0.8 },
    // Stress
    'panic attack': { type: 'anxiety_peak', baseIntensity: 0.9 },
    'anxiety attack': { type: 'anxiety_peak', baseIntensity: 0.9 },
    breakdown: { type: 'anxiety_peak', baseIntensity: 0.85 },
    meltdown: { type: 'anxiety_peak', baseIntensity: 0.8 },
    'freaking out': { type: 'anxiety_peak', baseIntensity: 0.7 },
    overwhelmed: { type: 'anxiety_peak', baseIntensity: 0.7 },
    // Disappointment
    disappointed: { type: 'disappointment', baseIntensity: 0.6 },
    'let down': { type: 'disappointment', baseIntensity: 0.6 },
    'fell through': { type: 'disappointment', baseIntensity: 0.6 },
    canceled: { type: 'disappointment', baseIntensity: 0.5 },
    // Embarrassment
    embarrassed: { type: 'embarrassment', baseIntensity: 0.5 },
    humiliated: { type: 'embarrassment', baseIntensity: 0.7 },
    mortified: { type: 'embarrassment', baseIntensity: 0.7 },
    ashamed: { type: 'embarrassment', baseIntensity: 0.7 },
    // Trauma
    traumatic: { type: 'trauma', baseIntensity: 0.95 },
    assault: { type: 'trauma', baseIntensity: 0.95 },
    accident: { type: 'trauma', baseIntensity: 0.85 },
    witnessed: { type: 'trauma', baseIntensity: 0.85 },
};
export const recoveryEventCaptureDefinition = {
    id: 'capture_recovery_event',
    name: 'Recovery Event Capture',
    description: 'Captures events needing recovery time',
    category: 'emotional',
    triggers: {
        phrases: [
            'just went through',
            'dealing with',
            'recovering from',
            'still processing',
            'happened yesterday',
            'happened today',
            'just had',
            'went through',
            'got through',
            'survived',
            'still reeling from',
            'trying to recover',
        ],
        patterns: [
            /(?:just|recently)\s+(?:went through|had|got|experienced)\s+(.+)/i,
            /(?:still|trying to)\s+(?:processing|recovering|dealing)\s+(?:with|from)\s+(.+)/i,
            /(?:yesterday|today|last night|this morning)\s+(?:i|we)\s+(?:had|went through|experienced)/i,
            /(?:can't stop thinking about|haunted by|keeps replaying)/i,
        ],
        keywords: [
            { word: 'recovering', weight: 0.9 },
            { word: 'processing', weight: 0.8 },
            { word: 'went through', weight: 0.8 },
            { word: 'just had', weight: 0.7 },
            { word: 'still dealing', weight: 0.8 },
            { word: 'reeling', weight: 0.9 },
        ],
        antiKeywords: ['planning to', 'want to', 'should i', 'thinking about doing'],
    },
    arguments: [
        {
            name: 'eventDescription',
            type: 'string',
            description: 'What happened',
            required: true,
            extractionPatterns: [
                /(?:went through|had|experienced|dealing with|recovering from)\s+(?:a|an|the)?\s*(.+?)(?:\.|,|$)/i,
                /(?:just|recently)\s+(.+?)(?:\.|,|$)/i,
            ],
        },
        {
            name: 'intensity',
            type: 'string',
            description: 'How intense the experience was',
            required: false,
            extractionPatterns: [
                /(terrible|horrible|awful|devastating|brutal|tough|hard|difficult|rough)/i,
                /(mild|minor|small|little)/i,
            ],
        },
    ],
    confidence: {
        baseScore: 0.6,
        patternMatchBonus: 0.2,
        keywordDensityMultiplier: 1.2,
        negativeKeywordPenalty: 0.3,
    },
    handler: async (extractedArgs, context) => {
        const eventDescription = String(extractedArgs.eventDescription || '').trim();
        const intensityWord = String(extractedArgs.intensity || '').toLowerCase();
        if (!eventDescription || eventDescription.length < 5) {
            log.debug('No valid event description for recovery');
            return null;
        }
        // Find the event type
        let eventType;
        const descLower = eventDescription.toLowerCase();
        const transcriptLower = context.transcript.toLowerCase();
        for (const [keyword, mapping] of Object.entries(RECOVERY_EVENT_TYPES)) {
            if (descLower.includes(keyword) || transcriptLower.includes(keyword)) {
                eventType = mapping;
                break;
            }
        }
        if (!eventType) {
            // Default to high_stress for unclassified
            eventType = { type: 'high_stress', baseIntensity: 0.6 };
        }
        // Adjust intensity based on words
        let intensity = eventType.baseIntensity;
        if (intensityWord.match(/terrible|horrible|awful|devastating|brutal/)) {
            intensity = Math.min(1, intensity + 0.2);
        }
        else if (intensityWord.match(/mild|minor|small|little/)) {
            intensity = Math.max(0.2, intensity - 0.2);
        }
        try {
            const { startRecoveryTracking } = await import('../../../services/superhuman/recovery-tracking.js');
            await startRecoveryTracking(context.userId, eventType.type, intensity, eventDescription.slice(0, 200));
            log.info({ type: eventType.type, intensity, userId: context.userId }, 'Captured recovery event from conversation');
            // Silently capture
            return null;
        }
        catch (error) {
            log.error({ error: String(error), eventDescription }, 'Failed to capture recovery event');
            return null;
        }
    },
};
//# sourceMappingURL=recovery-event.capture.js.map