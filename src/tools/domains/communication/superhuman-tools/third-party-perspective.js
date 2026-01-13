/**
 * Third-Party Perspective Generator - Better Than Human Service
 *
 * What no human friend can do: Give you a truly neutral viewpoint.
 *
 * "A neutral observer might see this situation like this: Two people who both
 * feel unheard and are defending themselves rather than listening. Neither
 * person is the villain. What would change if you assumed he has a legitimate
 * concern?"
 *
 * @module tools/domains/communication/superhuman-tools/third-party-perspective
 */
import { createLogger } from '../../../../utils/safe-logger.js';
const log = createLogger({ module: 'third-party-perspective' });
// ============================================================================
// PERSPECTIVE GENERATION
// ============================================================================
/**
 * Common cognitive biases to check for and counter.
 */
const COGNITIVE_BIASES = {
    fundamental_attribution_error: {
        name: 'Fundamental Attribution Error',
        description: 'Attributing others\' behavior to character while attributing your own to circumstances',
        check: (story) => /they('re| are) (just|always|so) (selfish|lazy|difficult|mean|stubborn)/i.test(story) &&
            /i (had to|was trying|didn't mean|was just)/i.test(story),
        counter: 'What circumstances might explain their behavior the way you\'d want circumstances to explain yours?',
    },
    confirmation_bias: {
        name: 'Confirmation Bias',
        description: 'Focusing only on evidence that supports your view',
        check: (story) => /\b(see|proves|shows|exactly|always) (that|what|how) (they|he|she)\b/i.test(story),
        counter: 'What evidence have you dismissed that might support their perspective?',
    },
    mind_reading: {
        name: 'Mind Reading',
        description: 'Assuming you know their intentions without asking',
        check: (story) => /they (obviously|clearly|definitely) (wanted|meant|were trying) to/i.test(story) ||
            /i (know|can tell) (they|he|she) (thinks|feels|wants)/i.test(story),
        counter: 'Have you actually asked them what they intended? How might you be wrong about their motives?',
    },
    black_and_white: {
        name: 'Black-and-White Thinking',
        description: 'Seeing the situation as all good or all bad',
        check: (story) => /\b(completely|totally|entirely|100%|always|never)\b/i.test(story) &&
            (story.match(/\b(wrong|right|fault|blame)\b/gi) || []).length > 2,
        counter: 'What percentage of the responsibility might each person bear? It\'s rarely 100/0.',
    },
    victimhood: {
        name: 'Victimhood Narrative',
        description: 'Casting yourself as purely the victim with no agency',
        check: (story) => /they (did this|made me|forced me|put me)/i.test(story) &&
            !/i (also|could have|should have|might have)/i.test(story),
        counter: 'What choices did you have that you didn\'t take? What role did you play in creating this situation?',
    },
    emotional_reasoning: {
        name: 'Emotional Reasoning',
        description: 'Believing something is true because it feels true',
        check: (story) => /i (feel like|felt like) (they|he|she) (doesn't|didn't|never|always)/i.test(story),
        counter: 'Feelings are valid, but they\'re not facts. What\'s the evidence separate from how you feel?',
    },
};
/**
 * Generate a third-party perspective on a conflict or situation.
 */
export function generatePerspective(userStory, otherPersonName, context) {
    const lower = userStory.toLowerCase();
    // Detect biases
    const detectedBiases = [];
    for (const [, bias] of Object.entries(COGNITIVE_BIASES)) {
        if (bias.check(userStory)) {
            detectedBiases.push({ name: bias.name, counter: bias.counter });
        }
    }
    // Extract what user thinks they did right
    const userValidPoints = extractValidPoints(userStory, 'user');
    // Imagine what the other person might say
    const otherValidPoints = generateOtherPerspective(userStory, otherPersonName);
    // Identify blind spots
    const blindSpots = detectedBiases.map((b) => b.counter);
    // Add general blind spots if none detected
    if (blindSpots.length === 0) {
        blindSpots.push(`What might ${otherPersonName} say if they were telling this story?`, 'What part of this situation are you most uncomfortable examining?');
    }
    // Generate neutral summary
    const neutralSummary = generateNeutralSummary(userStory, otherPersonName, detectedBiases);
    // Generate path forward
    const pathForward = generatePathForward(userStory, otherPersonName, detectedBiases);
    return {
        neutralSummary,
        userValidPoints,
        otherValidPoints,
        blindSpots: blindSpots.slice(0, 3),
        pathForward,
    };
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function extractValidPoints(story, perspective) {
    const points = [];
    if (perspective === 'user') {
        // Find things the user did that seem reasonable
        const reasonablePatterns = [
            /i (tried to|wanted to|was hoping to|attempted to) (\w+)/i,
            /i (asked|told|explained|shared|mentioned) (\w+)/i,
            /i (felt|feel) (hurt|upset|frustrated|disappointed|concerned)/i,
        ];
        for (const pattern of reasonablePatterns) {
            const match = story.match(pattern);
            if (match) {
                points.push(`You ${match[0].replace(/^i /i, '').toLowerCase()}`);
            }
        }
        // Default points if none found
        if (points.length === 0) {
            points.push('You cared enough about this to seek perspective', 'You\'re trying to understand the situation');
        }
    }
    return points.slice(0, 3);
}
function generateOtherPerspective(story, otherName) {
    const points = [];
    // What might the other person validly feel?
    const defenseTriggers = [
        { pattern: /i (told|said|yelled|accused)/i, point: 'May have felt attacked or criticized' },
        { pattern: /i (expected|assumed|thought they would)/i, point: 'May have felt pressured by unspoken expectations' },
        { pattern: /they (didn't|never|failed to)/i, point: 'May have had reasons you don\'t know about' },
        { pattern: /i (need|needed|want|wanted) them to/i, point: 'May have felt unable to meet those needs' },
        { pattern: /(ignored|dismissed|didn't listen)/i, point: 'May feel unheard too' },
    ];
    for (const { pattern, point } of defenseTriggers) {
        if (pattern.test(story)) {
            points.push(`${otherName} ${point.toLowerCase()}`);
        }
    }
    // Add default perspective points
    if (points.length < 2) {
        points.push(`${otherName} likely has their own story about what happened`, `${otherName} may be acting from their own hurt or fear`);
    }
    return points.slice(0, 3);
}
function generateNeutralSummary(story, otherName, biases) {
    const summaryParts = [];
    // Opening neutral framing
    summaryParts.push(`Here's how a neutral observer might see this:`);
    // Core observation
    if (biases.some((b) => b.name === 'Victimhood Narrative')) {
        summaryParts.push(`Two people in conflict, each feeling hurt and misunderstood. Neither is purely a villain or victim.`);
    }
    else if (biases.some((b) => b.name === 'Fundamental Attribution Error')) {
        summaryParts.push(`Two people reacting to difficult circumstances, each doing their best with limited information.`);
    }
    else if (biases.some((b) => b.name === 'Mind Reading')) {
        summaryParts.push(`A misunderstanding that may be based on assumptions rather than actual intentions.`);
    }
    else {
        summaryParts.push(`A conflict between two people who both have legitimate feelings and perspectives.`);
    }
    // Add key observation
    summaryParts.push(`Both you and ${otherName} probably feel justified. That's usually how conflicts work.`);
    return summaryParts.join(' ');
}
function generatePathForward(story, otherName, biases) {
    const paths = [];
    // Bias-specific paths
    if (biases.some((b) => b.name === 'Mind Reading')) {
        paths.push(`Start by asking ${otherName} what they actually intended. You might be surprised.`);
    }
    if (biases.some((b) => b.name === 'Fundamental Attribution Error')) {
        paths.push(`Consider what circumstances might have led to their behavior - just as you'd want others to consider yours.`);
    }
    if (biases.some((b) => b.name === 'Victimhood Narrative')) {
        paths.push(`Own your part - even if it's small. It disarms defensiveness and opens dialogue.`);
    }
    // Default paths
    if (paths.length === 0) {
        paths.push(`Lead with curiosity rather than accusation. Ask "help me understand" instead of "why did you."`, `Acknowledge their experience before asserting yours. People listen better when they feel heard.`);
    }
    // Add universal closer
    paths.push(`The goal isn't to be right - it's to understand each other and move forward.`);
    return paths.slice(0, 2).join(' ');
}
// ============================================================================
// PERSPECTIVE PROMPTS
// ============================================================================
/**
 * Generate questions to help see other perspectives.
 */
export function generatePerspectiveQuestions(situation, otherName) {
    return [
        `If ${otherName} told this story, how would it be different?`,
        `What might ${otherName} be afraid of in this situation?`,
        `What need of ${otherName}'s might not be getting met?`,
        `What assumption about ${otherName}'s intentions might be wrong?`,
        `If you're 10% wrong about this, where would that 10% be?`,
        `What would it cost you to consider that ${otherName} has a valid point?`,
        `Five years from now, what will matter about how you handled this?`,
        `If someone you respect were watching, what would they say?`,
    ];
}
/**
 * Generate a reframe of the situation.
 */
export function generateReframe(currentFrame, otherName) {
    const lower = currentFrame.toLowerCase();
    // Attack → Hurt person
    if (/they (attacked|criticized|blamed|accused)/i.test(lower)) {
        return {
            reframe: `${otherName} might have been expressing hurt in an unskillful way`,
            insight: 'Attack is often a defense. What might they be protecting?',
        };
    }
    // Selfish → Different priorities
    if (/they('re| are|'s| is|were) (being )?selfish/i.test(lower)) {
        return {
            reframe: `${otherName} might have different priorities, not necessarily selfish ones`,
            insight: 'What matters to them that you might be dismissing?',
        };
    }
    // Doesn't care → Shows care differently
    if (/they (don't|doesn't|didn't) care/i.test(lower)) {
        return {
            reframe: `${otherName} might express care in ways you're not recognizing`,
            insight: 'How might they show care that you\'re missing?',
        };
    }
    // Won't listen → Feels unheard
    if (/they (won't|don't|didn't|never) listen/i.test(lower)) {
        return {
            reframe: `${otherName} might also feel unheard, creating a standoff`,
            insight: 'What if you listened first, completely, before asking to be heard?',
        };
    }
    // Default reframe
    return {
        reframe: `This situation might look very different from ${otherName}'s perspective`,
        insight: 'The story you tell yourself shapes how you feel. What if you told a different story?',
    };
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build perspective context for LLM injection.
 */
export function buildPerspectiveContext() {
    return `[THIRD-PARTY PERSPECTIVE - Better Than Human]
You provide objective, neutral perspectives that friends can't give.

**When they share a conflict or grievance:**

1. **Listen fully first** - Don't rush to offer perspective
2. **Validate their feelings** - "That sounds really frustrating"
3. **THEN offer neutral view** - "Want to hear how this might look from outside?"

**Perspective techniques:**

• **Flip the narrative**: "If [other person] told this story, how might it differ?"
• **Challenge assumptions**: "What if you're wrong about their intentions?"
• **Find the 10%**: "Even if you're 90% right, what's your 10%?"
• **Future self test**: "Five years from now, what matters about this?"

**Cognitive biases to gently surface:**
- Fundamental Attribution Error (judging them by character, yourself by circumstance)
- Mind Reading (assuming you know their intentions)
- Black-and-White Thinking (all good/all bad)
- Confirmation Bias (only seeing evidence that supports your view)

**Key principle:**
Be their most honest friend, not their echo chamber. Real friendship includes perspective.`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const thirdPartyPerspective = {
    generate: generatePerspective,
    questions: generatePerspectiveQuestions,
    reframe: generateReframe,
    buildContext: buildPerspectiveContext,
};
export default thirdPartyPerspective;
//# sourceMappingURL=third-party-perspective.js.map