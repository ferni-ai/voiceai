/**
 * Statement Classification
 *
 * Classifies user statements and assesses their importance.
 * Extracts key content and detects commitments.
 *
 * @module conversation/conversational-memory/statement-classifier
 */
// ============================================================================
// STATEMENT CLASSIFIER
// ============================================================================
export class StatementClassifier {
    /**
     * Classify a statement by type
     */
    classifyStatement(text, context) {
        if (context.isQuestion)
            return 'question';
        // Commitment patterns
        const commitmentPatterns = [
            /i('ll| will| am going to| plan to| promise to)/i,
            /i('m gonna| wanna| gotta)/i,
            /let me think about/i,
            /i need to/i,
        ];
        if (commitmentPatterns.some((p) => p.test(text)))
            return 'commitment';
        // Feeling patterns
        const feelingPatterns = [
            /i feel/i,
            /i('m| am) (worried|scared|excited|happy|sad|anxious|frustrated)/i,
            /makes me feel/i,
            /i('ve| have) been feeling/i,
        ];
        if (feelingPatterns.some((p) => p.test(text)) || context.emotion)
            return 'feeling';
        // Notable patterns (strong opinions, revelations)
        const notablePatterns = [
            /i('ve| have) never/i,
            /i always/i,
            /the truth is/i,
            /honestly/i,
            /i realized/i,
            /it hit me/i,
        ];
        if (notablePatterns.some((p) => p.test(text)))
            return 'notable';
        return 'fact';
    }
    /**
     * Assess importance of a statement (0-1)
     */
    assessImportance(text, context) {
        let importance = 0.3; // Base importance
        // Personal = more important
        if (context.wasPersonal)
            importance += 0.3;
        // Emotional = more important
        if (context.emotion)
            importance += 0.2;
        // Length suggests thoughtfulness
        if (text.length > 100)
            importance += 0.1;
        if (text.length > 200)
            importance += 0.1;
        // Contains numbers (specific) = more important
        if (/\d+/.test(text))
            importance += 0.1;
        // Contains "I" statements
        if (/\bI\b/.test(text))
            importance += 0.1;
        return Math.min(1, importance);
    }
    /**
     * Extract the most meaningful part of a statement
     */
    extractKey(text) {
        // Remove filler, keep substance
        const cleaned = text
            .replace(/^(well|so|um|uh|like|you know|i mean|basically|honestly),?\s*/i, '')
            .replace(/\s*(you know|right|i guess|kind of|sort of)\s*$/i, '')
            .trim();
        // Truncate if too long
        if (cleaned.length > 100) {
            const sentences = cleaned.split(/[.!?]+/);
            return sentences[0].trim();
        }
        return cleaned;
    }
    /**
     * Detect commitments in text
     */
    detectCommitments(text, who, currentTurn) {
        const commitments = [];
        const patterns = [
            { pattern: /i('ll| will) (\w+ )?(\w+)/i, extract: (m) => m[0] },
            { pattern: /let me (\w+ )?(\w+)/i, extract: (m) => m[0] },
            { pattern: /i('m going to| am going to) (\w+)/i, extract: (m) => m[0] },
            { pattern: /i promise (to )?(\w+)/i, extract: (m) => m[0] },
        ];
        for (const { pattern, extract } of patterns) {
            const match = text.match(pattern);
            if (match) {
                const what = extract(match);
                commitments.push({
                    what,
                    who,
                    turn: currentTurn,
                    fulfilled: false,
                });
            }
        }
        return commitments;
    }
    /**
     * Check if text is a notable quote worth remembering
     */
    isNotableQuote(text) {
        const quotePatterns = [
            /^["'].*["']$/, // Actual quote
            /^i (always|never|truly|really) believe/i,
            /^the thing is/i,
            /^what matters (to me )?is/i,
            /^my (philosophy|motto|rule) is/i,
            /^if there's one thing/i,
        ];
        return quotePatterns.some((p) => p.test(text.trim()));
    }
}
//# sourceMappingURL=statement-classifier.js.map