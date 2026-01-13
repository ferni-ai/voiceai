/**
 * Commitment Data Capture Definition
 *
 * Passively captures intentions, promises, and decisions mentioned in conversation.
 * Feeds into the Commitment Keeper superhuman service.
 *
 * Examples:
 * - "I'm going to start exercising more"
 * - "I promised Sarah I'd call her this week"
 * - "I've decided to take that job"
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'CommitmentCapture' });
export const commitmentCaptureDefinition = {
    id: 'capture_commitment',
    name: 'Commitment Capture',
    description: 'Captures intentions, promises, and decisions mentioned naturally in conversation',
    category: 'commitment',
    triggers: {
        phrases: [
            "i'm going to",
            'i will',
            "i'll",
            'i want to',
            'i need to',
            'i have to',
            'i should',
            "i've decided",
            'i decided',
            'i promised',
            'i committed',
            "i'm planning to",
            'my goal is',
            'i intend to',
            "i'm determined to",
        ],
        patterns: [
            // "I'm going to start exercising"
            /i(?:'m| am)\s+going\s+to\s+(.+)/i,
            // "I will call her tomorrow"
            /i\s+will\s+(.+)/i,
            // "I've decided to quit smoking"
            /i(?:'ve| have)\s+decided\s+to\s+(.+)/i,
            // "I promised to help"
            /i\s+promised\s+(?:\w+\s+)?(?:to\s+)?(.+)/i,
            // "My goal is to run a marathon"
            /my\s+goal\s+is\s+(?:to\s+)?(.+)/i,
            // "I want to learn Spanish"
            /i\s+want\s+to\s+(.+)/i,
            // "I need to call mom"
            /i\s+need\s+to\s+(.+)/i,
        ],
        keywords: [
            { word: 'promise', weight: 0.9 },
            { word: 'commit', weight: 0.9 },
            { word: 'decide', weight: 0.8 },
            { word: 'decision', weight: 0.8 },
            { word: 'goal', weight: 0.8 },
            { word: 'going to', weight: 0.7 },
            { word: 'want to', weight: 0.6 },
            { word: 'need to', weight: 0.6 },
            { word: 'plan', weight: 0.7 },
            { word: 'intend', weight: 0.8 },
        ],
        // Avoid capturing questions or past tense
        antiKeywords: [
            "didn't",
            'failed',
            'forgot',
            'used to',
            'should have',
            '?',
            'what if',
            'maybe',
            'might',
        ],
    },
    arguments: [
        {
            name: 'commitment',
            type: 'string',
            description: 'The commitment content',
            required: true,
            extractionPatterns: [
                /i(?:'m| am)\s+going\s+to\s+(.+?)(?:\.|$)/i,
                /i\s+will\s+(.+?)(?:\.|$)/i,
                /i(?:'ve| have)\s+decided\s+to\s+(.+?)(?:\.|$)/i,
                /i\s+promised\s+(?:\w+\s+)?(?:to\s+)?(.+?)(?:\.|$)/i,
                /my\s+goal\s+is\s+(?:to\s+)?(.+?)(?:\.|$)/i,
                /i\s+want\s+to\s+(.+?)(?:\.|$)/i,
                /i\s+need\s+to\s+(.+?)(?:\.|$)/i,
            ],
        },
        {
            name: 'type',
            type: 'string',
            description: 'Type of commitment: intention, promise, or decision',
            required: false,
            extractionPatterns: [
                /(promis)/i, // "promised" → promise
                /(decid)/i, // "decided" → decision
            ],
        },
        {
            name: 'target',
            type: 'string',
            description: 'Person the commitment is made to (if any)',
            required: false,
            extractionPatterns: [
                /promised\s+(\w+)/i, // "promised Sarah"
                /told\s+(\w+)/i, // "told mom"
            ],
        },
    ],
    confidence: {
        baseScore: 0.5,
        patternMatchBonus: 0.4,
        keywordDensityMultiplier: 1.1,
        negativeKeywordPenalty: 0.2,
    },
    handler: async (extractedArgs, context) => {
        const { commitment, type: rawType, target, } = extractedArgs;
        if (!commitment || commitment.length < 5) {
            log.debug({ extractedArgs }, 'Commitment too short or missing');
            return null;
        }
        // Determine commitment type
        let commitmentType = 'intention';
        if (rawType?.includes('promis')) {
            commitmentType = 'promise';
        }
        else if (rawType?.includes('decid')) {
            commitmentType = 'decision';
        }
        // Clean up the commitment text
        const cleanCommitment = commitment.trim().replace(/\s+/g, ' ');
        // Don't capture very generic statements
        const genericPhrases = ['do it', 'do that', 'try', 'see', 'think about it'];
        if (genericPhrases.some((phrase) => cleanCommitment.toLowerCase() === phrase)) {
            return null;
        }
        try {
            // Import dynamically to avoid circular deps
            const { saveCommitment } = await import('../../../services/superhuman/commitment-keeper.js');
            await saveCommitment({
                userId: context.userId,
                statement: cleanCommitment,
                summary: cleanCommitment.slice(0, 100),
                text: cleanCommitment.slice(0, 100),
                type: commitmentType,
                topic: context.transcript.slice(0, 100),
                emotionalWeight: commitmentType === 'decision' ? 0.8 : 0.5,
                createdAt: Date.now(),
                lastMentioned: Date.now(),
                followUpAfter: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week
                status: 'active',
                followUpCount: 0,
            });
            log.info({ commitment: cleanCommitment, type: commitmentType, userId: context.userId }, 'Captured commitment from conversation');
            // Only acknowledge decisions and promises explicitly, not intentions
            if (commitmentType === 'decision') {
                return "I hear that. I'll remember this decision.";
            }
            else if (commitmentType === 'promise' && target) {
                return `I'll help you remember that promise to ${target}.`;
            }
            // For intentions, silently remember (more natural)
            return null;
        }
        catch (error) {
            log.error({ error: String(error), extractedArgs }, 'Failed to capture commitment');
            return null;
        }
    },
};
//# sourceMappingURL=commitments.capture.js.map