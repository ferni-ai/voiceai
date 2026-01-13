/**
 * Natural Reference Generator
 *
 * Generates natural, context-aware ways to reference memories.
 * Moves beyond template-based references to genuinely human callbacks.
 *
 * Philosophy: When a friend references something from the past, they don't say
 * "I remember we talked about {topic} {timeAgo}." They say something like
 * "Oh! That's kind of like what you were dealing with last month, right?"
 *
 * @module memory/natural-reference-generator
 */
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'NaturalReferenceGenerator' });
// ============================================================================
// REFERENCE STYLE TEMPLATES
// ============================================================================
const REFERENCE_STYLES = {
    casual: {
        style: 'casual',
        templates: [
            'Oh! That reminds me of {summary}',
            "Wait, wasn't that kind of like {summary}?",
            'This is totally like {summary}',
            'Hmm, you know what this makes me think of?',
            "Didn't you have something similar going on with {topic}?",
        ],
    },
    warm: {
        style: 'warm',
        templates: [
            "I've been thinking about {summary}",
            'You shared something meaningful about this before',
            'This connects to something close to your heart',
            'I remember when you opened up about {topic}',
            'Something about this reminds me of what you shared',
        ],
    },
    gentle: {
        style: 'gentle',
        templates: [
            'I remember you mentioned {topic} before...',
            "You've been through something like this",
            'This seems connected to {summary}',
            'You touched on something similar a while back',
            "If I recall, you've dealt with {topic} before",
        ],
    },
    curious: {
        style: 'curious',
        templates: [
            "How's {topic} going, by the way?",
            "I'm curious - what happened with {summary}?",
            'Speaking of which - whatever happened with {topic}?',
            'That makes me wonder about {summary}',
            "Didn't you mention something about {topic}?",
        ],
    },
    playful: {
        style: 'playful',
        templates: [
            'Ha! This is giving me major {topic} vibes',
            'Okay, but this is basically {summary} part two',
            'Why does this feel exactly like {summary}?',
            "Plot twist: it's {topic} all over again",
            'Deja vu much? Remember {summary}?',
        ],
    },
    reflective: {
        style: 'reflective',
        templates: [
            'Looking back at {summary}...',
            "I've noticed this pattern with {topic}",
            'This seems to be an important theme for you',
            "You've grown so much since {timeAgo}",
            "It's interesting how {topic} keeps coming up",
        ],
    },
};
function getTimeExpression(timestamp) {
    const now = Date.now();
    const then = timestamp.getTime();
    const diffMs = now - then;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
        return {
            casual: 'earlier',
            warm: 'earlier today',
            formal: 'earlier today',
        };
    }
    if (diffDays === 1) {
        return {
            casual: 'yesterday',
            warm: 'just yesterday',
            formal: 'yesterday',
        };
    }
    if (diffDays < 7) {
        return {
            casual: 'the other day',
            warm: 'a few days ago',
            formal: `${diffDays} days ago`,
        };
    }
    if (diffDays < 14) {
        return {
            casual: 'last week',
            warm: 'about a week ago',
            formal: 'last week',
        };
    }
    if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return {
            casual: 'a couple weeks ago',
            warm: `about ${weeks} weeks ago`,
            formal: `${weeks} weeks ago`,
        };
    }
    if (diffDays < 60) {
        return {
            casual: 'last month',
            warm: 'about a month ago',
            formal: 'last month',
        };
    }
    if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return {
            casual: months === 1 ? 'a while back' : 'a few months ago',
            warm: `about ${months} months ago`,
            formal: `${months} months ago`,
        };
    }
    return {
        casual: 'way back',
        warm: 'quite a while ago',
        formal: 'over a year ago',
    };
}
const PERSONA_VOICES = {
    ferni: {
        preferredStyles: ['warm', 'curious', 'gentle'],
        wordChoices: {
            remember: ['I remember', "I've been thinking about", 'This reminds me of'],
            you: ['you', "you've"],
            topic: ['this', 'that', 'what you shared'],
        },
        fillers: ['you know', 'actually', 'hmm'],
    },
    peter: {
        preferredStyles: ['curious', 'reflective', 'casual'],
        wordChoices: {
            remember: ['I recall', 'If I remember correctly', 'This connects to'],
            you: ['you', "you've mentioned"],
            topic: ['this topic', 'this area', 'this question'],
        },
        fillers: ['interestingly', 'actually', 'thinking about it'],
    },
    maya: {
        preferredStyles: ['warm', 'playful', 'curious'],
        wordChoices: {
            remember: ['Oh!', 'Wait', "That's like"],
            you: ['you', "you've been"],
            topic: ['this', 'that thing', 'what you were working on'],
        },
        fillers: ['so', 'actually', 'okay so'],
    },
    alex: {
        preferredStyles: ['casual', 'playful', 'curious'],
        wordChoices: {
            remember: ['This reminds me', 'Oh that reminds me', "Wait isn't this like"],
            you: ['you', 'you guys'],
            topic: ['this', 'that whole thing', 'what you mentioned'],
        },
        fillers: ['like', 'you know', 'actually'],
    },
    jordan: {
        preferredStyles: ['curious', 'gentle', 'warm'],
        wordChoices: {
            remember: ['I remember', 'This connects to', "I've noticed"],
            you: ['you', "you've"],
            topic: ['this', 'that', 'what you shared about'],
        },
        fillers: ['hmm', 'interesting', 'actually'],
    },
    nayan: {
        preferredStyles: ['reflective', 'warm', 'gentle'],
        wordChoices: {
            remember: ['I recall', 'This brings to mind', 'There is a connection to'],
            you: ['you', 'one might notice'],
            topic: ['this matter', 'this situation', 'what you shared'],
        },
        fillers: ['perhaps', 'it seems', 'one might observe'],
    },
};
// ============================================================================
// NATURAL REFERENCE GENERATOR IMPLEMENTATION
// ============================================================================
export class NaturalReferenceGeneratorImpl {
    /**
     * Generate a natural reference for a memory
     */
    generate(memory, context) {
        const style = this.getStyleForContext({
            userMood: context.userMood,
            personaStyle: context.personaId,
            memoryType: memory.item.type,
        });
        const personaVoice = PERSONA_VOICES[context.personaId] || PERSONA_VOICES.ferni;
        const timeExpr = getTimeExpression(memory.item.timestamp);
        // Get templates for this style
        const styleTemplates = REFERENCE_STYLES[style];
        // Generate primary reference
        const primaryRef = this.fillTemplate(styleTemplates.templates[Math.floor(Math.random() * styleTemplates.templates.length)], memory.item, timeExpr, personaVoice, style);
        // Generate alternatives (different styles that also fit)
        const alternativeStyles = this.getAlternativeStyles(style, context);
        const alternatives = alternativeStyles.map((altStyle) => {
            const altTemplates = REFERENCE_STYLES[altStyle];
            return this.fillTemplate(altTemplates.templates[Math.floor(Math.random() * altTemplates.templates.length)], memory.item, timeExpr, personaVoice, altStyle);
        });
        return {
            reference: primaryRef,
            style,
            confidence: this.calculateConfidence(memory, context),
            alternatives: alternatives.slice(0, 2),
        };
    }
    /**
     * Determine best style for context
     */
    getStyleForContext(context) {
        const { userMood, personaStyle, memoryType } = context;
        const moodLower = userMood?.toLowerCase() || '';
        // Mood-based overrides
        if (['sad', 'anxious', 'worried', 'stressed', 'overwhelmed'].includes(moodLower)) {
            return 'gentle';
        }
        if (['happy', 'excited', 'energetic', 'playful'].includes(moodLower)) {
            return 'casual';
        }
        // Memory type influences
        if (memoryType === 'moment') {
            return 'warm'; // Significant moments deserve warmth
        }
        if (memoryType === 'commitment') {
            return 'curious'; // Follow-ups should be curious
        }
        // Persona preference
        const personaVoice = PERSONA_VOICES[personaStyle] || PERSONA_VOICES.ferni;
        return personaVoice.preferredStyles[0];
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    /**
     * Fill a template with memory content
     */
    fillTemplate(template, memory, timeExpr, voice, style) {
        // Extract summary from memory content
        const summary = this.extractSummary(memory.content);
        const topic = memory.topics?.[0] || 'that';
        // Choose appropriate time expression based on style
        let timeStr;
        switch (style) {
            case 'casual':
            case 'playful':
                timeStr = timeExpr.casual;
                break;
            case 'warm':
            case 'gentle':
                timeStr = timeExpr.warm;
                break;
            default:
                timeStr = timeExpr.formal;
        }
        // Fill template
        let result = template
            .replace('{summary}', summary)
            .replace('{topic}', topic)
            .replace('{timeAgo}', timeStr)
            .replace('{person}', memory.personMentioned || 'someone');
        // Maybe add a filler word (30% chance for casual/playful)
        if (['casual', 'playful'].includes(style) && Math.random() < 0.3) {
            const filler = voice.fillers[Math.floor(Math.random() * voice.fillers.length)];
            result = `${filler.charAt(0).toUpperCase() + filler.slice(1)}, ${result.charAt(0).toLowerCase() + result.slice(1)}`;
        }
        return result;
    }
    /**
     * Extract a natural summary from memory content
     */
    extractSummary(content) {
        // Get first sentence, or truncate if too long
        const firstSentence = content.split(/[.!?]/)[0].trim();
        if (firstSentence.length <= 60) {
            return firstSentence.toLowerCase();
        }
        // Truncate intelligently at a word boundary
        const truncated = firstSentence.slice(0, 50);
        const lastSpace = truncated.lastIndexOf(' ');
        return `${truncated.slice(0, lastSpace).toLowerCase()}...`;
    }
    /**
     * Get alternative styles that would also work
     */
    getAlternativeStyles(primary, context) {
        const personaVoice = PERSONA_VOICES[context.personaId] || PERSONA_VOICES.ferni;
        // Get persona's preferred styles that aren't the primary
        const alternatives = personaVoice.preferredStyles.filter((s) => s !== primary);
        // Add universal alternatives based on mood
        const moodLower = context.userMood?.toLowerCase() || '';
        if (['happy', 'excited'].includes(moodLower) && !alternatives.includes('playful')) {
            alternatives.push('playful');
        }
        return alternatives.slice(0, 2);
    }
    /**
     * Calculate confidence in this reference
     */
    calculateConfidence(memory, context) {
        let confidence = memory.score;
        // Higher confidence for established relationships
        if (context.relationshipStage === 'established' || context.relationshipStage === 'deep') {
            confidence *= 1.2;
        }
        // Higher confidence for recent memories
        const daysSince = (Date.now() - memory.item.timestamp.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
            confidence *= 1.1;
        }
        else if (daysSince > 90) {
            confidence *= 0.9;
        }
        return Math.min(1, confidence);
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultGenerator = null;
export function getNaturalReferenceGenerator() {
    if (!defaultGenerator) {
        defaultGenerator = new NaturalReferenceGeneratorImpl();
    }
    return defaultGenerator;
}
export function resetNaturalReferenceGenerator() {
    defaultGenerator = null;
}
// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================
/**
 * Generate a natural memory reference in one call
 */
export function generateNaturalReference(memory, context) {
    const generator = getNaturalReferenceGenerator();
    const result = generator.generate(memory, {
        ...context,
        conversationTone: context.conversationTone || 'neutral',
    });
    return result.reference;
}
export default {
    NaturalReferenceGeneratorImpl,
    getNaturalReferenceGenerator,
    resetNaturalReferenceGenerator,
    generateNaturalReference,
};
//# sourceMappingURL=natural-reference-generator.js.map