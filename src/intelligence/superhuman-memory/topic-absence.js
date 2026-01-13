/**
 * Topic Absence Detection
 *
 * Notice what's NOT being said.
 *
 * @module superhuman-memory/topic-absence
 */
/**
 * Detect topics that have gone quiet
 */
export function detectTopicAbsences(humanMemory, recentTopics, sessionCount) {
    const absences = [];
    // Check running themes that haven't been mentioned recently
    if (humanMemory?.runningThemes?.length) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        for (const theme of humanMemory.runningThemes) {
            // Skip themes that were recently mentioned
            if (recentTopics.some((t) => t.toLowerCase().includes(theme.theme.toLowerCase()))) {
                continue;
            }
            // Check if this was a frequent theme that's gone quiet
            if ((theme.frequency === 'every_session' || theme.frequency === 'often') &&
                theme.lastMentioned < thirtyDaysAgo) {
                const daysSinceLastMention = Math.floor((now.getTime() - theme.lastMentioned.getTime()) / (1000 * 60 * 60 * 24));
                absences.push({
                    topic: theme.theme,
                    lastMentioned: theme.lastMentioned,
                    sessionsSinceLastMention: Math.floor(daysSinceLastMention / 7), // Rough estimate
                    possibleReasons: inferAbsenceReasons(theme),
                    suggestedApproach: determineSuggestedApproach(theme),
                    naturalPrompt: generateAbsencePrompt(theme),
                });
            }
        }
    }
    // Check challenges that were "working_on_it" but haven't been mentioned
    if (humanMemory?.growthArc?.challenges?.length) {
        for (const challenge of humanMemory.growthArc.challenges) {
            if (challenge.status === 'working_on_it' || challenge.status === 'struggling') {
                const now = new Date();
                const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
                if (challenge.lastUpdate < fourteenDaysAgo) {
                    if (!recentTopics.some((t) => t.toLowerCase().includes(challenge.challenge.toLowerCase()))) {
                        absences.push({
                            topic: challenge.challenge,
                            lastMentioned: challenge.lastUpdate,
                            sessionsSinceLastMention: Math.floor((now.getTime() - challenge.lastUpdate.getTime()) / (7 * 24 * 60 * 60 * 1000)),
                            possibleReasons: ['resolved', 'avoiding', 'deprioritized'],
                            suggestedApproach: 'gentle_check_in',
                            naturalPrompt: `How's things going with ${challenge.challenge}? We haven't talked about it in a while.`,
                        });
                    }
                }
            }
        }
    }
    return absences;
}
function inferAbsenceReasons(theme) {
    const reasons = [];
    if (theme.sentiment === 'positive') {
        reasons.push('resolved', 'deprioritized');
    }
    else if (theme.sentiment === 'challenging') {
        reasons.push('avoiding', 'resolved');
    }
    else {
        reasons.push('forgotten', 'deprioritized');
    }
    return reasons;
}
function determineSuggestedApproach(theme) {
    if (theme.sentiment === 'positive') {
        return 'celebrate_resolution';
    }
    else if (theme.sentiment === 'challenging') {
        return 'gentle_check_in';
    }
    return 'wait_for_them';
}
function generateAbsencePrompt(theme) {
    if (theme.sentiment === 'positive') {
        return `By the way, how's ${theme.theme} going? We used to talk about it a lot.`;
    }
    else if (theme.sentiment === 'challenging') {
        return `I've been thinking about you and ${theme.theme}. How are things on that front?`;
    }
    return `Whatever happened with ${theme.theme}?`;
}
//# sourceMappingURL=topic-absence.js.map