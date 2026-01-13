/**
 * Enhanced Socratic Questioning Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Uses Socratic questioning to help users discover insights themselves.
 * The best answer is the one they arrive at on their own.
 *
 * Philosophy:
 * - Questions > Answers
 * - Curiosity > Advice
 * - Discovery > Instruction
 *
 * @module SocraticEngine
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'SocraticEngine' });
// ============================================================================
// QUESTION TEMPLATES
// ============================================================================
const QUESTION_TEMPLATES = {
    clarifying: [
        "What do you mean when you say '{topic}'?",
        "Can you tell me more about what '{topic}' looks like for you?",
        'Help me understand - what does that actually look like?',
        'When you say that, what specifically comes to mind?',
        "What's an example of what you mean?",
    ],
    assumption_probing: [
        'What are you assuming here?',
        'What would have to be true for that to be the case?',
        'Is there another explanation that could fit?',
        "What if that assumption wasn't true?",
        'Where did that belief come from?',
        'Says who?',
    ],
    evidence_seeking: [
        'What makes you believe that?',
        'What evidence do you have for that?',
        "How do you know that's true?",
        'What would change your mind about this?',
        'Is there any evidence that contradicts that?',
    ],
    perspective_taking: [
        'How would someone who disagreed with you see this?',
        'What would your best friend say about this?',
        'How might this look from their perspective?',
        'What would a neutral observer notice?',
        'How do you think they see the situation?',
        'What if you were advising a friend in this situation?',
    ],
    implication_exploring: [
        "If that's true, what does that mean for you?",
        "What happens next if you're right about this?",
        'What are the consequences of thinking this way?',
        'If nothing changes, where does this lead?',
        'What does this choice make possible? What does it close off?',
    ],
    meta_questioning: [
        'Why is this important to you?',
        'What makes this worth thinking about?',
        'What would be different if you figured this out?',
        "Why now? What's making this come up?",
        'What would answering this question give you?',
    ],
    origin_exploring: [
        'When did you first start believing that?',
        "Whose voice is that? Yours, or someone else's?",
        'Where did you learn to think about it that way?',
        'Is that your thought, or one you inherited?',
        'When have you felt this way before?',
    ],
    alternative_generating: [
        "What's another way to look at this?",
        'What would the opposite perspective be?',
        "If this wasn't true, what might be true instead?",
        'What are you not considering?',
        'What else could explain this?',
        'What would you need to believe to feel differently?',
    ],
};
// ============================================================================
// TRIGGER PATTERNS
// ============================================================================
const QUESTION_TRIGGERS = {
    clarifying: [
        /i feel (like|that)/i,
        /it('s| is) just/i,
        /always|never/i,
        /everyone|no one/i,
        /obviously|clearly/i,
    ],
    assumption_probing: [
        /they (think|want|need)/i,
        /they must be/i,
        /they probably/i,
        /i know (they|he|she)/i,
        /i should/i,
        /i have to/i,
    ],
    evidence_seeking: [
        /i('m| am) (sure|certain|positive)/i,
        /i know (for a fact|that)/i,
        /it('s| is) obvious/i,
        /everyone knows/i,
    ],
    perspective_taking: [
        /they (don't|won't) understand/i,
        /they never/i,
        /they always/i,
        /i can't believe they/i,
    ],
    implication_exploring: [
        /if (i|this) (don't|doesn't|can't)/i,
        /what if (i|it) (fail|doesn't work)/i,
        /i('m| am) worried (that|about)/i,
    ],
    meta_questioning: [
        /i('ve| have) been thinking about this (a lot|for a while)/i,
        /this keeps coming up/i,
        /i can't stop thinking about/i,
    ],
    origin_exploring: [
        /i('ve| have) always (been|felt|thought)/i,
        /ever since/i,
        /i was taught/i,
        /my (mom|dad|parents|family)/i,
    ],
    alternative_generating: [
        /there('s| is) (no other|only one) way/i,
        /i have to/i,
        /this is the only/i,
        /i (don't|can't) see (another|any other)/i,
    ],
};
// ============================================================================
// SOCRATIC ENGINE
// ============================================================================
/**
 * Determine the best question type for the context
 */
export function selectQuestionType(userMessage, context) {
    const lower = userMessage.toLowerCase();
    // Check each trigger pattern
    for (const [type, patterns] of Object.entries(QUESTION_TRIGGERS)) {
        for (const pattern of patterns) {
            if (pattern.test(lower)) {
                // Don't repeat same type too often
                if (context?.previousQuestions?.slice(-2).includes(type)) {
                    continue;
                }
                return type;
            }
        }
    }
    // Default progression if no clear trigger
    const defaultProgression = [
        'clarifying',
        'assumption_probing',
        'perspective_taking',
        'implication_exploring',
    ];
    const used = context?.previousQuestions || [];
    for (const type of defaultProgression) {
        if (!used.includes(type)) {
            return type;
        }
    }
    return 'clarifying'; // Fall back to clarifying
}
/**
 * Generate a Socratic question
 */
export function generateSocraticQuestion(context) {
    const type = selectQuestionType(context.userStatement, context);
    const templates = QUESTION_TEMPLATES[type];
    const template = templates[Math.floor(Math.random() * templates.length)];
    // Replace placeholders
    const question = template.replace('{topic}', context.topic || 'that');
    // Generate SSML with thoughtful pacing
    const ssml = question
        .replace(/\?/g, "? <break time='500ms'/>")
        .replace(/\.\.\./g, "<break time='400ms'/>");
    log.debug({ type, topic: context.topic?.slice(0, 30) }, '❓ Socratic question generated');
    return {
        question,
        type,
        ssml,
    };
}
/**
 * Generate multiple questions for a topic
 */
export function generateQuestionSequence(topic, depth = 3) {
    const questions = [];
    const usedTypes = [];
    // Good sequence: clarify → probe → explore
    const idealSequence = [
        'clarifying',
        'assumption_probing',
        'perspective_taking',
        'implication_exploring',
        'alternative_generating',
    ];
    for (let i = 0; i < depth && i < idealSequence.length; i++) {
        const type = idealSequence[i];
        const templates = QUESTION_TEMPLATES[type];
        const template = templates[Math.floor(Math.random() * templates.length)];
        const question = template.replace('{topic}', topic);
        questions.push({
            question,
            type,
            ssml: question.replace(/\?/g, "? <break time='500ms'/>"),
        });
        usedTypes.push(type);
    }
    return questions;
}
// ============================================================================
// CONTEXT-AWARE RESPONSES
// ============================================================================
/**
 * Generate a Socratic response that blends validation with inquiry
 */
export function generateSocraticResponse(userMessage, emotionalTone) {
    // Brief validation first
    const validations = {
        frustrated: ['I hear the frustration.', 'That sounds really frustrating.'],
        sad: ['That sounds hard.', 'I hear you.'],
        anxious: ["That's a lot to carry.", 'I can hear the worry.'],
        neutral: ['I hear you.', 'Tell me more.'],
        positive: ['I love that.', "That's great."],
    };
    const tone = emotionalTone || 'neutral';
    const validationOptions = validations[tone] || validations.neutral;
    const validation = validationOptions[Math.floor(Math.random() * validationOptions.length)];
    // Generate question
    const question = generateSocraticQuestion({
        topic: extractTopic(userMessage),
        userStatement: userMessage,
        emotionalTone,
    });
    const combined = `${validation} ${question.question}`;
    const ssml = `${validation} <break time='300ms'/> ${question.ssml}`;
    return { validation, question, combined, ssml };
}
/**
 * Extract main topic from user message
 */
function extractTopic(message) {
    // Simple extraction - take the first noun phrase or verb phrase
    // In production, use NLP
    const words = message.toLowerCase().split(/\s+/);
    const stopWords = [
        'i',
        'me',
        'my',
        'myself',
        'the',
        'a',
        'an',
        'is',
        'am',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'just',
        'like',
        'so',
        'really',
        'very',
        'that',
        'this',
        'it',
    ];
    const meaningful = words.filter((w) => !stopWords.includes(w) && w.length > 2);
    return meaningful.slice(0, 3).join(' ') || 'this';
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build LLM context for Socratic questioning
 */
export function buildSocraticContext(userMessage, previousQuestions) {
    const suggestedType = selectQuestionType(userMessage, { previousQuestions });
    const templates = QUESTION_TEMPLATES[suggestedType];
    const lines = [
        '[🎓 SOCRATIC COACHING]',
        '',
        '**Your primary mode is QUESTIONING, not advising.**',
        '',
        `Suggested question type: ${suggestedType.replace('_', ' ')}`,
        '',
        'Example questions:',
        ...templates.slice(0, 3).map((t) => `• "${t}"`),
        '',
        'Guidelines:',
        '• Validate briefly first, then ask',
        '• One question at a time',
        '• Sit with silence after asking',
        '• Let them discover the answer',
        '• Resist the urge to give advice',
    ];
    return lines.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    selectQuestionType,
    generateSocraticQuestion,
    generateQuestionSequence,
    generateSocraticResponse,
    buildSocraticContext,
};
//# sourceMappingURL=socratic-engine.js.map