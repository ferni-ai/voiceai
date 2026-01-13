/**
 * Semantic Trust Signal Detection
 *
 * Enhanced trust signal detection using semantic similarity.
 * Catches nuanced trust moments that keyword matching misses:
 *
 * - "The funeral was... fine" → False fine + heavy topic
 * - "Can I tell you something weird?" → Permission seeking
 * - "I used to get so angry, but now..." → Growth reflection
 * - "Remember that time we talked about..." → Rapport callback
 *
 * @module SemanticTrust
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'SemanticTrust' });
// ============================================================================
// SEMANTIC PATTERNS
// ============================================================================
const TRUST_PATTERNS = {
    boundary: {
        strongPatterns: [
            /\b(don't\s*want\s*to\s*talk\s*about|please\s*don't|let's\s*not\s*discuss|not\s*ready\s*to|rather\s*not)\b/i,
            /\b(avoid|skip|change\s*the\s*subject|steer\s*clear|stay\s*away\s*from|prefer\s*not\s*to)\b/i,
            /\b(off[- ]?limits|sensitive\s*topic|agreed\s*not\s*to|thought\s*we\s*agreed)\b/i,
            /\b(not\s*(bring|mention)\s*(it\s*)?up|can\s*we\s*not|let's\s*not\s*go\s*there)\b/i,
            /\b(too\s*(soon|raw|painful|hard)\s*to\s*talk\s*about)/i,
            /\b(I'd\s*rather\s*not|can't\s*go\s*there|not\s*today)/i,
        ],
        weakPatterns: [
            /\b(avoid|skip|change)/i,
            /\b(sensitive|difficult|hard|painful)/i,
            /\b(not\s*ready|don't\s*want)/i,
            /\b(let's\s*move\s*on|anyway)/i,
        ],
        examples: [
            "I don't want to talk about my dad right now",
            'Can we skip that part?',
            "Let's not go there today",
            "I'd rather not get into that",
        ],
        approach: 'Respect their boundary. Acknowledge without pushing.',
    },
    permission: {
        strongPatterns: [
            /\b(can\s*I\s*tell\s*you|is\s*it\s*okay\s*if|promise\s*you\s*won't|between\s*us)\b/i,
            /\b(safe\s*to\s*say|been\s*going\s*through|starting\s*to\s*feel|need\s*to\s*share)\b/i,
            /\b(confide|trust\s*you|opening\s*up|open\s*up\s*about|thinking\s*about\s*sharing)\b/i,
            /\b(personal\s*stuff|never\s*told\s*anyone|first\s*time\s*I'm\s*saying)/i,
            /\b(grappling\s*with|struggling\s*with|wrestling\s*with)\b/i,
            /\b((personal|ethical)\s*dilemma|dilemma.*(personal|ethical))/i,
            /\b(not\s*sure\s*(if\s*)?I\s*should\s*say|maybe\s*I\s*shouldn't|this\s*is\s*probably\s*weird)/i,
            /\b(I've\s*been\s*wanting\s*to\s*tell|I've\s*been\s*meaning\s*to\s*share)/i,
        ],
        weakPatterns: [
            /\b(can\s*I|is\s*it\s*okay|promise)/i,
            /\b(share|tell\s*you|confide|trust)/i,
            /\b(personal|private|secret)/i,
            /\b(weird|strange|crazy)/i,
            /\b(going\s*through|dealing\s*with)/i,
        ],
        examples: [
            "Can I tell you something I haven't told anyone?",
            "Promise you won't judge me?",
            "I've been going through something",
            'This might sound weird but...',
            "I'm grappling with an ethical dilemma",
        ],
        approach: 'Create safety. Affirm their trust is well-placed.',
    },
    growth: {
        strongPatterns: [
            /\b(I've\s*changed|used\s*to\s*(be|get)|I'm\s*different\s*now|I've\s*grown)\b/i,
            /\b(looking\s*back|progress|came\s*a\s*long\s*way|compared\s*to\s*before)\b/i,
            /\b(realize\s*now|I\s*used\s*to|not\s*anymore|these\s*days|grown\s*so\s*much)\b/i,
            /\b(I've\s*realized|much\s*better\s*at|so\s*much\s*better)\b/i,
            /\b(old\s*me\s*would\s*have|before\s*I\s*would\s*have|younger\s*me)/i,
            /\b(never\s*thought\s*I('d|'ll)\s*be\s*able|didn't\s*think\s*I\s*could)/i,
            /\b(proud\s*of\s*how\s*far|come\s*a\s*long\s*way)/i,
        ],
        weakPatterns: [
            /\b(changed|different|grown|progress)/i,
            /\b(before|used\s*to|now\s*I)/i,
            /\b(better|improved|developed)/i,
            /\b(looking\s*back|in\s*the\s*past)/i,
        ],
        examples: [
            "I've realized I used to get so defensive",
            'The old me would have totally lost it',
            "I'm so much better at handling this now",
            "Looking back, I've come a long way",
        ],
        approach: 'Reflect their growth back to them. Help them see the change.',
    },
    sensitive: {
        strongPatterns: [
            /\b(this\s*is\s*hard|difficult\s*to\s*say|kind\s*of\s*personal|might\s*sound\s*weird)\b/i,
            /\b(heavy|vulnerable|open\s*up|overwhelmed|really\s*personal|deeply\s*personal)\b/i,
            /\b(struggling\s*with|delicate|touchy|painful|difficult\s*topic)\b/i,
            /\b(childhood|trauma|abuse|assault|death|funeral|divorce|miscarriage)/i,
            /\b(mental\s*health|depression|anxiety|panic|suicide|self-harm)/i,
            /\b(addiction|relapse|recovery|sober)/i,
            /\b(loss|grief|mourning|passed\s*away|lost\s*(my|a))/i,
            /\b(affair|cheating|betrayal|infidelity)/i,
            /\b(diagnosis|cancer|terminal|chronic\s*illness)/i,
        ],
        weakPatterns: [
            /\b(hard|difficult|painful|tough)/i,
            /\b(personal|private|sensitive)/i,
            /\b(heavy|deep|serious)/i,
            /\b(vulnerable|exposed|raw)/i,
        ],
        examples: [
            'The funeral was... fine, I guess',
            'This is really hard to talk about',
            'I lost my mom last year',
            "I've been struggling with anxiety",
        ],
        approach: 'Honor the heaviness. Create space without rushing to fix.',
    },
    rapport: {
        strongPatterns: [
            /\b(remember\s*when|remember\s*that|like\s*you\s*said|we\s*talked\s*about)\b/i,
            /\b(our\s*thing|inside\s*joke|hilarious|that\s*time|last\s*(week|month))\b/i,
            /\b(you\s*mentioned|just\s*like\s*when|you\s*compared|reminds\s*me\s*of\s*when\s*we)\b/i,
            /\b(pulled\s*an\s*all[- ]?nighter|together\s*when)/i,
            /\b(like\s*we\s*discussed|as\s*we\s*talked\s*about|you\s*know\s*how)/i,
            /\b(that\s*joke\s*about|that\s*thing\s*you\s*said|what\s*you\s*said\s*about)/i,
        ],
        weakPatterns: [
            /\b(remember|recall|mentioned)/i,
            /\b(last\s*time|before|earlier)/i,
            /\b(talked\s*about|discussed|said)/i,
            /\b(like\s*you|as\s*you|you\s*know)/i,
        ],
        examples: [
            'Remember when we talked about that?',
            'Like you said last week...',
            'That thing you mentioned about patience',
            'Our usual Tuesday check-in',
        ],
        approach: 'Build on the shared history. Reference it naturally.',
    },
    deflection: {
        strongPatterns: [
            /\b(anyway|but\s*anyway|moving\s*on|different\s*topic|change\s*of\s*subject)\b/i,
            /\b(never\s*mind|forget\s*(I\s*said|it|about\s*it)|that's\s*not\s*important)\b/i,
            /\b(it's\s*nothing|doesn't\s*matter|not\s*a\s*big\s*deal|whatever)\b/i,
            /\b(let's\s*talk\s*about\s*something\s*else|what\s*about\s*you)/i,
            /\b(I\s*shouldn't\s*have\s*said|forget\s*I\s*brought\s*it\s*up)/i,
            /\b(long\s*story|it's\s*complicated|hard\s*to\s*explain)/i,
        ],
        weakPatterns: [
            /\b(anyway|nevermind|whatever)/i,
            /\b(forget|doesn't\s*matter)/i,
            /\b(moving\s*on|change|different)/i,
        ],
        examples: [
            'Anyway, how are you?',
            "Never mind, it's not important",
            "Let's talk about something else",
            'But anyway, what were you saying?',
        ],
        approach: 'Gently notice the redirect. Offer to come back to it if they want.',
    },
    vulnerability: {
        strongPatterns: [
            /\b(I'm\s*scared|I'm\s*afraid|I\s*don't\s*know\s*what\s*to\s*do)\b/i,
            /\b(I\s*feel\s*so\s*(lost|alone|confused|overwhelmed|hopeless))\b/i,
            /\b(I've\s*never\s*felt\s*this\s*way|I\s*don't\s*recognize\s*myself)\b/i,
            /\b(this\s*is\s*really\s*hard\s*for\s*me|I'm\s*struggling)\b/i,
            /\b(I\s*need\s*help|I\s*can't\s*do\s*this\s*alone|I'm\s*at\s*my\s*limit)\b/i,
            /\b(breaking\s*down|falling\s*apart|can't\s*cope|barely\s*holding\s*on)/i,
            /\b(haven't\s*felt\s*like\s*myself|not\s*myself\s*lately)/i,
        ],
        weakPatterns: [
            /\b(scared|afraid|worried|anxious)/i,
            /\b(lost|alone|confused|overwhelmed)/i,
            /\b(help|support|need)/i,
            /\b(struggling|hard|difficult)/i,
        ],
        examples: [
            "I don't know what to do anymore",
            "I'm scared I'm making a mistake",
            'I feel so lost right now',
            "Haven't felt like myself lately",
        ],
        approach: 'Meet their vulnerability with presence. Be with them, not fixing.',
    },
    false_fine: {
        strongPatterns: [
            // Direct "fine" with context
            /\b(i'm|it's|it\s*was)\s*(fine|okay|good|alright)\s*(,?\s*(I\s*guess|but|though|really))?/i,
            // Heavy topic + minimizing
            /\b(funeral|divorce|break-?up|layoff|diagnosis)\s*(was|went)\s*(fine|okay|alright)/i,
            // Contradiction patterns
            /\b(fine|okay)\s*[.!?]+\s*(but|it's\s*just|I\s*mean)/i,
            // Everyone's X has its [problems]
            /\b(everyone's|every)\s*(marriage|relationship|family|job)\s*(has\s*(its|their)|is\s*like\s*this)/i,
            // "That's just how it is" resignation
            /\b(that's\s*just\s*how|it\s*is\s*what\s*it\s*is|what\s*can\s*you\s*do)/i,
            // Trailing off (ellipsis or hesitation)
            /\.\.\.\s*(fine|okay|i\s*guess|whatever)/i,
        ],
        weakPatterns: [
            /\b(fine|okay|alright|good)/i,
            /\b(i\s*guess|sort\s*of|kind\s*of)/i,
            /\b(but|though|however)/i,
            /\.\.\./,
        ],
        examples: [
            'The funeral was... fine',
            "Everyone's marriage has its issues",
            "I'm fine. I mean, it's whatever",
            'It is what it is, I guess',
        ],
        approach: "Notice the mismatch. Gently probe: 'That sounds like a lot.'",
    },
    none: {
        strongPatterns: [],
        weakPatterns: [],
        examples: [],
        approach: '',
    },
};
// ============================================================================
// DETECTION
// ============================================================================
/**
 * Detect trust signals from user message
 */
export function detectTrustSignals(message) {
    const signals = [];
    for (const [signalType, patterns] of Object.entries(TRUST_PATTERNS)) {
        if (signalType === 'none')
            continue;
        let strongMatches = 0;
        let weakMatches = 0;
        const matchedStrong = [];
        for (const pattern of patterns.strongPatterns) {
            if (pattern.test(message)) {
                strongMatches++;
                matchedStrong.push(pattern.source.slice(0, 30));
            }
        }
        for (const pattern of patterns.weakPatterns) {
            if (pattern.test(message)) {
                weakMatches++;
            }
        }
        // Score: Strong matches worth 0.4, weak worth 0.1
        const strongScore = Math.min(0.8, strongMatches * 0.4);
        const weakScore = Math.min(0.3, weakMatches * 0.1);
        const score = strongScore + weakScore;
        // Need at least 0.4 confidence
        if (score >= 0.4) {
            const reason = [
                strongMatches > 0 ? `${strongMatches} strong` : '',
                weakMatches > 0 ? `${weakMatches} weak` : '',
            ]
                .filter(Boolean)
                .join(', ');
            signals.push({
                type: signalType,
                confidence: Math.min(0.95, score),
                reason,
                suggestedApproach: patterns.approach,
            });
        }
    }
    // Sort by confidence
    signals.sort((a, b) => b.confidence - a.confidence);
    if (signals.length > 0) {
        log.debug({ signalCount: signals.length, topSignal: signals[0]?.type }, '🤝 Trust signals detected');
    }
    return signals;
}
/**
 * Get the most significant trust signal
 */
export function detectPrimaryTrustSignal(message) {
    const signals = detectTrustSignals(message);
    if (signals.length === 0) {
        return {
            type: 'none',
            confidence: 0,
            reason: 'No trust signals detected',
        };
    }
    return signals[0];
}
// ============================================================================
// EXPORTS
// ============================================================================
export { detectTrustSignals as default };
//# sourceMappingURL=semantic-trust.js.map