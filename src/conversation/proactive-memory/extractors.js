/**
 * Content Extractors
 *
 * Extracts time references, events, goals, people, and struggles from user messages.
 *
 * @module conversation/proactive-memory/extractors
 */
// ============================================================================
// TIME EXTRACTION
// ============================================================================
/**
 * Extract time reference from text
 */
export function extractTimeReference(text) {
    const lowered = text.toLowerCase();
    // Specific day references
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = new Date();
    const currentDay = today.getDay();
    for (let i = 0; i < dayOfWeek.length; i++) {
        if (lowered.includes(dayOfWeek[i])) {
            // Calculate next occurrence of this day
            let daysUntil = i - currentDay;
            if (daysUntil <= 0)
                daysUntil += 7;
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + daysUntil);
            return {
                type: 'specific_date',
                date: targetDate,
                description: dayOfWeek[i],
            };
        }
    }
    // Relative references
    const relativePatterns = [
        { pattern: /\btomorrow\b/, daysFromNow: 1, desc: 'tomorrow' },
        { pattern: /\btonight\b/, daysFromNow: 0, desc: 'tonight' },
        { pattern: /\btoday\b/, daysFromNow: 0, desc: 'today' },
        { pattern: /\bnext week\b/, daysFromNow: 7, desc: 'next week' },
        { pattern: /\bin a (few )?days?\b/, daysFromNow: 3, desc: 'in a few days' },
        { pattern: /\bthis weekend\b/, daysFromNow: 6 - currentDay, desc: 'this weekend' },
        { pattern: /\bnext month\b/, daysFromNow: 30, desc: 'next month' },
        { pattern: /\bsoon\b/, daysFromNow: 5, desc: 'soon' },
    ];
    for (const { pattern, daysFromNow, desc } of relativePatterns) {
        if (pattern.test(lowered)) {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + daysFromNow);
            return {
                type: 'relative',
                date: targetDate,
                description: desc,
            };
        }
    }
    return { type: 'none', description: '' };
}
// ============================================================================
// CONTENT EXTRACTION
// ============================================================================
/**
 * Extract memorable content from text
 */
export function extractContent(text) {
    const result = {
        events: [],
        goals: [],
        people: [],
        struggles: [],
    };
    // Event patterns
    const eventPatterns = [
        /(?:have|got|there's|have a|got a|going to a) (interview|meeting|appointment|exam|test|presentation|wedding|funeral|party|trip|vacation|date|surgery|procedure)/gi,
        /(?:my|the) (interview|meeting|appointment) (?:is|was)/gi,
        /(interview|meeting) (?:with|at|for)/gi,
    ];
    for (const pattern of eventPatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const timeRef = extractTimeReference(text);
            result.events.push({
                event: match[1] || match[0],
                timeRef: timeRef.type !== 'none' ? timeRef : undefined,
            });
        }
    }
    // Goal patterns
    const goalPatterns = [
        /(?:trying to|want to|working on|training for|preparing for) ([a-z ]{5,40})/gi,
        /my goal is to ([a-z ]{5,40})/gi,
        /i('m| am) (learning|studying|practicing) ([a-z ]{3,30})/gi,
    ];
    for (const pattern of goalPatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const goal = match[1] || match[3] || match[0];
            if (goal && goal.length > 5) {
                result.goals.push(goal.trim());
            }
        }
    }
    // People patterns
    const peoplePatterns = [
        /my (mom|mother|dad|father|brother|sister|wife|husband|partner|boss|friend|colleague|son|daughter|child|grandma|grandpa) ([A-Z][a-z]+)?/gi,
        /([A-Z][a-z]+),? my (mom|mother|dad|father|brother|sister|wife|husband|partner|boss|friend|colleague)/gi,
    ];
    for (const pattern of peoplePatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const relationship = match[1] || match[2];
            const name = match[2] || match[1];
            if (name && /^[A-Z]/.test(name)) {
                result.people.push({ name, relationship });
            }
            else if (relationship) {
                result.people.push({ name: relationship, relationship });
            }
        }
    }
    // Struggle patterns
    const strugglePatterns = [
        /(?:struggling with|dealing with|worried about|stressed about) ([a-z ]{5,50})/gi,
        /(?:it's been hard|having trouble) ([a-z ]{3,40})/gi,
        /can('t|not) seem to ([a-z ]{3,30})/gi,
    ];
    for (const pattern of strugglePatterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
            const struggle = match[1] || match[2] || match[0];
            if (struggle && struggle.length > 5) {
                result.struggles.push(struggle.trim());
            }
        }
    }
    return result;
}
//# sourceMappingURL=extractors.js.map