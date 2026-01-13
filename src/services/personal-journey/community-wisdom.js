/**
 * Community Wisdom Service
 *
 * Privacy-safe, pre-written wisdom from aggregate human experiences.
 * NOT real-time aggregation - these are curated insights that feel
 * like "others have been here too."
 *
 * Philosophy: This is comfort through shared humanity, not
 * algorithmic recommendations. "You're not alone" is the message.
 *
 * @module services/personal-journey/community-wisdom
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'CommunityWisdom' });
// ============================================================================
// CURATED WISDOM DATABASE
// ============================================================================
/**
 * Pre-written wisdom organized by journey type
 * These are human-written, not algorithmically generated
 */
const JOURNEY_WISDOM = {
    career_transition: {
        triggers: [
            'new job',
            'career change',
            'quit',
            'leaving my job',
            'career transition',
            'job search',
        ],
        nuggets: [
            "The space between chapters is uncomfortable... <break time='200ms'/> and necessary.",
            "Most people feel like imposters in new roles for at least six months. <break time='200ms'/> You're not alone.",
            "The doubt you're feeling? <break time='200ms'/> It means you care. That's a good sign.",
        ],
        challenges: [
            'Feeling like an imposter',
            'Missing the old identity',
            'The gap between old competence and new learning',
            'Financial uncertainty',
        ],
        whatHelps: [
            'Remembering that discomfort is growth, not failure',
            'Finding one small win each day',
            "Connecting with others who've made similar transitions",
            'Giving yourself permission to not have it figured out',
        ],
    },
    new_parent: {
        triggers: ['new baby', 'just had', 'newborn', 'first time parent', 'new parent', 'postpartum'],
        nuggets: [
            "The exhaustion is real. <break time='200ms'/> And so is the love. Both can coexist.",
            "Every parent has moments of 'what am I doing?' <break time='200ms'/> That's universal.",
            "You're doing better than you think. <break time='200ms'/> The fact that you care proves it.",
        ],
        challenges: [
            'Sleep deprivation affecting everything',
            'Identity shifts',
            'Relationship changes',
            'The pressure to enjoy every moment',
        ],
        whatHelps: [
            'Letting go of the \"perfect parent\" image',
            'Taking small moments for yourself without guilt',
            'Accepting help when offered',
            "Remembering that babies don't need perfect, they need present",
        ],
    },
    grief: {
        triggers: ['lost', 'passed away', 'grieving', 'died', 'death', 'funeral', 'missing them'],
        nuggets: [
            "Grief doesn't have a timeline. <break time='200ms'/> Anyone who says otherwise hasn't really grieved.",
            "The waves come when they come. <break time='200ms'/> You don't have to fight them.",
            "Continuing to live isn't betraying them. <break time='200ms'/> It's honoring them.",
        ],
        challenges: [
            'Unexpected triggers',
            'Others expecting you to \"move on\"',
            'Guilt about good days',
            'The permanence of it',
        ],
        whatHelps: [
            'Letting yourself feel without judgment',
            'Finding ways to maintain connection with their memory',
            'Being patient with yourself on bad days',
            'Talking about them, not around them',
        ],
    },
    anxiety: {
        triggers: ['anxious', 'anxiety', 'worried', "can't stop thinking", 'panic', 'overwhelmed'],
        nuggets: [
            "Your brain is trying to protect you. <break time='200ms'/> It's just... overzealous.",
            "The thoughts feel real. <break time='200ms'/> But thoughts aren't facts.",
            "Anxiety lies. <break time='200ms'/> It tells you the worst case is the only case.",
        ],
        challenges: [
            'The physical symptoms',
            "Racing thoughts that won't stop",
            'Anticipating the worst',
            'Others not understanding',
        ],
        whatHelps: [
            'Naming the anxiety (\"Oh, this is anxiety talking\")',
            'Grounding in the present moment',
            "Remembering past times the feared thing didn't happen",
            'Breathing exercises when it spikes',
        ],
    },
    relationship_ending: {
        triggers: ['breakup', 'divorce', 'ended', 'broke up', 'separated', 'ex'],
        nuggets: [
            "The end of a relationship is a death of a future you imagined. <break time='200ms'/> Grieve that.",
            "Healing isn't linear. <break time='200ms'/> Some days you'll feel fine, then suddenly not.",
            "You're allowed to miss someone and still know they weren't right for you.",
        ],
        challenges: [
            'Redefining your identity',
            'Mutual friends and social circles',
            'The quiet moments',
            'Second-guessing the decision',
        ],
        whatHelps: [
            'Avoiding the temptation to numb instead of feel',
            'Creating new routines',
            'Leaning on support systems',
            "Resisting the urge to compare your healing to others'",
        ],
    },
    financial_stress: {
        triggers: ['debt', 'money problems', "can't afford", 'broke', 'financial stress', 'bills'],
        nuggets: [
            "Financial stress affects everything. <break time='200ms'/> Your sleep, your relationships, your sense of self. <break time='200ms'/> That's real.",
            "One step at a time. <break time='200ms'/> You can't solve it all today.",
            "Your worth isn't your net worth. <break time='200ms'/> But I know it doesn't feel that way right now.",
        ],
        challenges: [
            'The shame around talking about it',
            'How it bleeds into every decision',
            'Feeling stuck',
            'Comparison to others',
        ],
        whatHelps: [
            'Making even small progress visible',
            'Breaking the silence with trusted people',
            'Focusing on what you can control today',
            'Separating identity from financial situation',
        ],
    },
    imposter_syndrome: {
        triggers: ['imposter', "don't deserve", 'fraud', 'luck', 'found out', 'not qualified'],
        nuggets: [
            "The most competent people often feel like frauds. <break time='200ms'/> It's called imposter syndrome for a reason.",
            "You didn't just get lucky. <break time='200ms'/> Luck doesn't sustain.",
            "The fact that you worry about being good enough... <break time='200ms'/> means you probably are.",
        ],
        challenges: [
            'Dismissing your own achievements',
            'Attributing success to external factors',
            'Fear of being \"found out\"',
            'Over-preparing to compensate',
        ],
        whatHelps: [
            'Keeping a record of positive feedback',
            'Remembering that everyone feels this sometimes',
            'Talking about it (often others relate)',
            'Accepting that growth and competence coexist with uncertainty',
        ],
    },
    burnout: {
        triggers: [
            'burnout',
            'exhausted',
            "can't anymore",
            'depleted',
            'running on empty',
            'burnt out',
        ],
        nuggets: [
            "Burnout isn't weakness. <break time='200ms'/> It's what happens when you've been strong for too long.",
            "You can't pour from an empty cup. <break time='200ms'/> That's not selfishness, it's physics.",
            "Rest is not the enemy of productivity. <break time='200ms'/> It's the prerequisite.",
        ],
        challenges: [
            'Guilt about slowing down',
            'Everything feeling like too much',
            'Loss of things that used to bring joy',
            'The pressure to perform anyway',
        ],
        whatHelps: [
            'Actually stopping (not just slowing)',
            'Saying no without explaining',
            'Protecting non-negotiable recovery time',
            'Asking \"what\'s the minimum?\" instead of \"what\'s possible?\"',
        ],
    },
    self_doubt: {
        triggers: ['doubt myself', 'not good enough', "can't do it", 'should I even', 'questioning'],
        nuggets: [
            "Self-doubt often shows up right before growth. <break time='200ms'/> It's resistance to change.",
            "You've doubted yourself before... <break time='200ms'/> and been wrong about your limits.",
            "The voice of doubt is loud, but it's not wise. <break time='200ms'/> It's just loud.",
        ],
        challenges: [
            'Paralysis before decisions',
            'Comparing yourself to others',
            'Second-guessing past choices',
            'The loop of overthinking',
        ],
        whatHelps: [
            'Taking action despite the doubt (it rarely goes away first)',
            'Remembering times you proved yourself wrong',
            'Asking \"what would I tell a friend?\"',
            'Acknowledging the doubt without obeying it',
        ],
    },
    loneliness: {
        triggers: ['lonely', 'alone', 'no one', 'isolated', 'disconnected', 'friends'],
        nuggets: [
            "Loneliness can happen even in a crowd. <break time='200ms'/> It's about connection, not proximity.",
            "Reaching out feels hard when you're lonely. <break time='200ms'/> That's the cruel irony of it.",
            "You're not as alone as loneliness makes you feel. <break time='200ms'/> That's what it does.",
        ],
        challenges: [
            'The energy required to connect when depleted',
            'Vulnerability of reaching out',
            'Fear of burdening others',
            'The silence',
        ],
        whatHelps: [
            'Small connections (they count)',
            'Being the one to reach out (others are waiting too)',
            'Finding communities around shared interests',
            'Remembering that loneliness is a signal, not a permanent state',
        ],
    },
};
/**
 * Universal patterns that apply across many situations
 */
const UNIVERSAL_PATTERNS = [
    {
        pattern: 'feeling uncertain about a big decision',
        prevalence: 'universal',
        message: "Every big decision feels uncertain. <break time='200ms'/> Certainty is rare, and waiting for it means waiting forever.",
    },
    {
        pattern: 'comparing yourself to others',
        prevalence: 'universal',
        message: "Everyone compares. <break time='200ms'/> And everyone else's journey looks cleaner from the outside.",
    },
    {
        pattern: 'wondering if this is normal',
        prevalence: 'very_common',
        message: "If you're wondering if it's normal... <break time='200ms'/> it almost certainly is.",
    },
    {
        pattern: 'feeling behind in life',
        prevalence: 'very_common',
        message: "There's no schedule for life. <break time='200ms'/> The \"behind\" is an illusion.",
    },
    {
        pattern: 'struggling to ask for help',
        prevalence: 'very_common',
        message: "Most people want to help and don't know how. <break time='200ms'/> Asking is a gift to them too.",
    },
    {
        pattern: 'second-guessing a decision',
        prevalence: 'universal',
        message: "Second-guessing is normal. <break time='200ms'/> It doesn't mean you decided wrong.",
    },
    {
        pattern: 'feeling like you should be further along',
        prevalence: 'very_common',
        message: "Progress is invisible from the inside. <break time='200ms'/> You've come further than you think.",
    },
    {
        pattern: 'struggling with change',
        prevalence: 'universal',
        message: "Humans aren't wired to love change. <break time='200ms'/> Resistance is natural, not weak.",
    },
];
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Find relevant wisdom based on conversation context
 */
export function findRelevantWisdom(text, recentTopics) {
    const lower = text.toLowerCase();
    const topics = recentTopics?.map((t) => t.toLowerCase()) || [];
    // Check journey-specific wisdom
    for (const [journeyType, wisdom] of Object.entries(JOURNEY_WISDOM)) {
        for (const trigger of wisdom.triggers) {
            if (lower.includes(trigger) || topics.some((t) => t.includes(trigger))) {
                // Found a match - return a wisdom nugget
                const nugget = wisdom.nuggets[Math.floor(Math.random() * wisdom.nuggets.length)];
                return {
                    id: `wisdom_${journeyType}_${Date.now()}`,
                    type: 'community_wisdom',
                    priority: 4,
                    content: nugget,
                    context: {
                        journeyType,
                        trigger,
                        challenges: wisdom.challenges,
                        whatHelps: wisdom.whatHelps,
                    },
                    source: 'community-wisdom',
                    requiresRelationshipStage: 'building',
                };
            }
        }
    }
    return null;
}
/**
 * Get a universal pattern insight
 */
export function getUniversalInsight(text) {
    const lower = text.toLowerCase();
    // Check for pattern matches
    for (const pattern of UNIVERSAL_PATTERNS) {
        const keywords = pattern.pattern.split(' ');
        const matchCount = keywords.filter((k) => lower.includes(k)).length;
        // If more than half the keywords match
        if (matchCount >= keywords.length / 2) {
            return {
                id: `universal_${Date.now()}`,
                type: 'community_wisdom',
                priority: 3,
                content: pattern.message,
                context: {
                    pattern: pattern.pattern,
                    prevalence: pattern.prevalence,
                },
                source: 'community-wisdom',
                requiresRelationshipStage: 'building',
            };
        }
    }
    return null;
}
/**
 * Get wisdom about what helps for a specific journey type
 */
export function getWhatHelps(journeyType) {
    const wisdom = JOURNEY_WISDOM[journeyType];
    return wisdom?.whatHelps || [];
}
/**
 * Get common challenges for a journey type
 */
export function getCommonChallenges(journeyType) {
    const wisdom = JOURNEY_WISDOM[journeyType];
    return wisdom?.challenges || [];
}
/**
 * Detect journey type from text
 */
export function detectJourneyType(text) {
    const lower = text.toLowerCase();
    for (const [journeyType, wisdom] of Object.entries(JOURNEY_WISDOM)) {
        for (const trigger of wisdom.triggers) {
            if (lower.includes(trigger)) {
                return journeyType;
            }
        }
    }
    return null;
}
/**
 * Get a comfort message for a detected journey
 */
export function getComfortMessage(journeyType) {
    const wisdom = JOURNEY_WISDOM[journeyType];
    if (!wisdom)
        return null;
    return wisdom.nuggets[Math.floor(Math.random() * wisdom.nuggets.length)];
}
/**
 * Get all available journey types
 */
export function getAvailableJourneyTypes() {
    return Object.keys(JOURNEY_WISDOM);
}
log.debug('Community wisdom service initialized', {
    journeyTypes: Object.keys(JOURNEY_WISDOM).length,
    universalPatterns: UNIVERSAL_PATTERNS.length,
});
//# sourceMappingURL=community-wisdom.js.map