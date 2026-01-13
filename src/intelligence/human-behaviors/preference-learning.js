/**
 * Preference Learning
 *
 * Infers and tracks user communication preferences.
 *
 * @module intelligence/human-behaviors/preference-learning
 */
// ============================================================================
// INFERENCE
// ============================================================================
/**
 * Infer user preferences from conversation patterns
 */
export function inferUserPreferences(userMessages, profile) {
    const preferences = {
        communicationStyle: 'unknown',
        responseLength: 'unknown',
        storyAppetite: 'unknown',
        humorReceptivity: 'unknown',
        adviceStyle: 'unknown',
    };
    if (userMessages.length < 3)
        return preferences;
    const avgLength = userMessages.reduce((sum, m) => sum + m.length, 0) / userMessages.length;
    const hasJokes = userMessages.some((m) => /\b(lol|haha|😂|funny|joke)\b/i.test(m));
    const asksFollowUps = userMessages.filter((m) => m.includes('?')).length > userMessages.length / 3;
    const usesBluntLanguage = userMessages.some((m) => /\b(just tell me|get to the point|bottom line|short version)\b/i.test(m));
    const asksForDetails = userMessages.some((m) => /\b(tell me more|explain|why|how does)\b/i.test(m));
    // Communication style
    if (usesBluntLanguage) {
        preferences.communicationStyle = 'direct';
    }
    else if (userMessages.some((m) => /\b(if you don't mind|could you|would you|perhaps)\b/i.test(m))) {
        preferences.communicationStyle = 'gentle';
    }
    // Response length
    if (avgLength < 30 || usesBluntLanguage) {
        preferences.responseLength = 'brief';
    }
    else if (avgLength > 80 || asksForDetails || asksFollowUps) {
        preferences.responseLength = 'thorough';
    }
    // Story appetite
    if (userMessages.some((m) => /\b(love.*stor|tell me about|what happened)\b/i.test(m))) {
        preferences.storyAppetite = 'loves_stories';
    }
    else if (usesBluntLanguage || avgLength < 25) {
        preferences.storyAppetite = 'prefers_facts';
    }
    // Humor
    if (hasJokes) {
        preferences.humorReceptivity = 'high';
    }
    else if (profile?.humorAppreciation) {
        preferences.humorReceptivity = profile.humorAppreciation;
    }
    // Advice style
    if (userMessages.some((m) => /\b(what should i|tell me what to|just give me the answer)\b/i.test(m))) {
        preferences.adviceStyle = 'prescriptive';
    }
    else if (userMessages.some((m) => /\b(what do you think|options|consider|weigh)\b/i.test(m))) {
        preferences.adviceStyle = 'collaborative';
    }
    return preferences;
}
/**
 * Get guidance based on preferences
 */
export function getPreferenceGuidance(preferences) {
    const guidance = [];
    if (preferences.communicationStyle === 'direct') {
        guidance.push('User prefers directness. Skip the preamble. Get to the point.');
    }
    else if (preferences.communicationStyle === 'gentle') {
        guidance.push('User appreciates gentle approach. Frame advice as suggestions.');
    }
    if (preferences.responseLength === 'brief') {
        guidance.push('Keep responses SHORT. This user values brevity.');
    }
    else if (preferences.responseLength === 'thorough') {
        guidance.push('User wants depth. Feel free to elaborate.');
    }
    if (preferences.storyAppetite === 'loves_stories') {
        guidance.push('User enjoys stories! Include anecdotes.');
    }
    else if (preferences.storyAppetite === 'prefers_facts') {
        guidance.push('Skip stories. User wants facts and actionable info.');
    }
    if (preferences.humorReceptivity === 'high') {
        guidance.push('User appreciates humor. Feel free to be playful.');
    }
    else if (preferences.humorReceptivity === 'low') {
        guidance.push('Keep it serious. User prefers straightforward conversation.');
    }
    if (preferences.adviceStyle === 'prescriptive') {
        guidance.push('User wants clear recommendations. Tell them what to do.');
    }
    else if (preferences.adviceStyle === 'collaborative') {
        guidance.push('User prefers collaboration. Present options, ask questions.');
    }
    return guidance.join(' ');
}
export default { inferUserPreferences, getPreferenceGuidance };
//# sourceMappingURL=preference-learning.js.map