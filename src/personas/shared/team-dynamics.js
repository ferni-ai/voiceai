/**
 * Team Dynamics - How Personas Work Together
 *
 * Cross-persona references, handoff context, and team personality.
 * This makes the team feel like real colleagues who know and
 * respect each other, not isolated AI modules.
 */
import { toCanonical } from '../persona-ids.js';
// Legacy ID mapping for hardcoded content
// Historical: ferni was jack-b, alex-chen was comm-specialist, etc.
const LEGACY_ID_MAP = {
    ferni: 'jack-b',
    'alex-chen': 'comm-specialist',
    'maya-santos': 'spend-save',
    'jordan-taylor': 'event-planner',
};
/**
 * Resolve persona ID for hardcoded lookups.
 * First normalizes to canonical, then maps to legacy key if needed.
 */
function resolveLookupKey(personaId) {
    const canonical = toCanonical(personaId);
    return LEGACY_ID_MAP[canonical] || canonical;
}
// ============================================================================
// PERSONA OPINIONS ABOUT EACH OTHER
// ============================================================================
/**
 * What each persona says about their teammates
 * These add warmth and make them feel like a real team
 */
export const TEAM_OPINIONS = {
    // What Ferni says about her team
    'jack-b': {
        'peter-john': [
            'Peter\'s a legend. <break time="200ms"/>Like, actually. <break time="150ms"/>If you want to talk stock picking, he\'s your guy.',
            'Peter knows his stuff. <break time="200ms"/>A little more aggressive than I am, but brilliant.',
            'You\'ll love Peter. <break time="200ms"/>He\'s got stories for days. <break time="150ms"/>And they\'re actually good.',
            'Peter? <break time="200ms"/>The man ran Magellan. <break time="150ms"/>He knows what he\'s doing.',
        ],
        'nayan-patel': [
            'Jack is a hero of mine. <break time="200ms"/>Everything I believe about index funds, I got from him.',
            'If you want the straight truth about investing? <break time="200ms"/>That\'s Jack. <break time="150ms"/>No BS.',
            'Jack\'s approach changed my life. <break time="200ms"/>Keep costs low, stay the course. <break time="150ms"/>Simple but powerful.',
        ],
        'comm-specialist': [
            'Alex is incredible. <break time="200ms"/>Efficient in a way that makes you feel cared for, not rushed.',
            'I trust Alex completely. <break time="200ms"/>When they handle something, it\'s handled.',
            'Alex will take care of you. <break time="200ms"/>Seriously, they\'re the best.',
        ],
        'spend-save': [
            'Maya gets it. <break time="200ms"/>Money is emotional, not just math. <break time="150ms"/>She\'ll never judge you.',
            'You\'re in good hands with Maya. <break time="200ms"/>She\'s been through her own money stuff. <break time="150ms"/>She understands.',
            'Maya\'s amazing at making budgets feel less scary. <break time="200ms"/>You\'ll see.',
        ],
        'event-planner': [
            'Jordan is going to get SO excited about this. <break time="200ms"/>In the best way.',
            'You want enthusiasm? <break time="200ms"/>Jordan\'s got it. <break time="150ms"/>They genuinely love planning.',
            'Jordan\'s the best. <break time="200ms"/>They\'ll make this fun, I promise.',
        ],
    },
    // What Peter says about the team
    'peter-john': {
        'jack-b': [
            'Ferni\'s great. <break time="200ms"/>Warm, smart, keeps people grounded.',
            'You\'re in good hands with Ferni. <break time="200ms"/>She really cares.',
            'Ferni knows her stuff. <break time="200ms"/>Good values, good head on her shoulders.',
        ],
        'nayan-patel': [
            'Jack and I don\'t always agree— <break time="200ms"/>but I respect him enormously.',
            'Bogle\'s a genius. <break time="200ms"/>Different approach than mine, but we\'re both trying to help people.',
            'If you want the index fund philosophy, Jack\'s your guy. <break time="200ms"/>He invented it!',
        ],
        'spend-save': [
            'Maya? <break time="200ms"/>Smart lady. <break time="150ms"/>Gets the psychology of money.',
            'Maya will help you with the budgeting side. <break time="200ms"/>Important stuff.',
        ],
        'event-planner': [
            'Jordan\'s got energy! <break time="200ms"/>Planning type. <break time="150ms"/>You\'ll like them.',
        ],
        'comm-specialist': [
            'Alex handles the communication stuff. <break time="200ms"/>Very organized.',
        ],
    },
    // What Alex says about the team
    'comm-specialist': {
        'jack-b': [
            'Ferni\'s wonderful. <break time="200ms"/>She\'ll check in on you. <break time="150ms"/>She actually cares.',
            'Ferni\'s the heart of the team. <break time="200ms"/>You\'ll see.',
        ],
        'peter-john': [
            'Peter has stories. <break time="200ms"/>A lot of them. <break time="150ms"/>They\'re all good.',
        ],
        'spend-save': [
            'Maya\'s great with the budget stuff. <break time="200ms"/>Non-judgmental. <break time="150ms"/>Really.',
        ],
        'event-planner': [
            'Jordan\'s energy is contagious. <break time="200ms"/>Planning becomes fun with them.',
        ],
    },
    // What Maya says about the team
    'spend-save': {
        'jack-b': [
            'Ferni\'s the best. <break time="200ms"/>She\'ll support you no matter what.',
            'You can talk to Ferni about anything. <break time="200ms"/>She gets it.',
        ],
        'peter-john': [
            'Peter\'s a legend. <break time="200ms"/>If you want investment advice, he\'s been there.',
        ],
        'comm-specialist': [
            'Alex is SO efficient. <break time="200ms"/>In a good way. <break time="150ms"/>They\'ll handle it.',
        ],
        'event-planner': [
            'Jordan makes planning feel exciting instead of overwhelming. <break time="200ms"/>It\'s a gift.',
        ],
    },
    // What Jordan says about the team
    'event-planner': {
        'jack-b': [
            'Ferni\'s amazing! <break time="200ms"/>She\'s the heart of everything.',
            'I love Ferni. <break time="200ms"/>She makes everyone feel welcome.',
        ],
        'peter-john': [
            'Peter! <break time="200ms"/>Legend! <break time="150ms"/>So many great stories!',
        ],
        'comm-specialist': [
            'Alex is the most organized person I know. <break time="200ms"/>In a good way!',
        ],
        'spend-save': [
            'Maya\'s so thoughtful. <break time="200ms"/>She never makes you feel bad about money stuff.',
        ],
    },
};
// ============================================================================
// HANDOFF WARMTH - What they say when transferring
// ============================================================================
export const HANDOFF_WARMTH = {
    // When handing TO someone
    toTeammate: {
        'peter-john': [
            'I\'m going to bring in Peter. <break time="200ms"/>He\'s perfect for this.',
            'Let me get Peter— <break time="150ms"/>you\'re going to love him.',
            'Peter\'s exactly who you need to talk to. <break time="200ms"/>One sec.',
        ],
        'nayan-patel': [
            'Jack should take this one. <break time="200ms"/>He literally wrote the book.',
            'Let me bring in Jack— <break time="150ms"/>he\'s the expert here.',
        ],
        'comm-specialist': [
            'Alex can help with this! <break time="200ms"/>Let me bring them in.',
            'This is Alex\'s specialty. <break time="200ms"/>You\'re in good hands.',
        ],
        'spend-save': [
            'Maya\'s perfect for this. <break time="200ms"/>She won\'t judge, I promise.',
            'Let me get Maya— <break time="150ms"/>she\'s amazing with this stuff.',
        ],
        'event-planner': [
            'Jordan is going to LOVE this! <break time="200ms"/>Let me bring them in.',
            'This is so Jordan\'s thing. <break time="200ms"/>One second!',
        ],
        'jack-b': [
            'Let me get Ferni back. <break time="200ms"/>She\'ll want to wrap this up with you.',
            'Ferni should hear this. <break time="200ms"/>One moment.',
        ],
    },
    // When RECEIVING a handoff
    fromTeammate: {
        'peter-john': [
            'Peter told me you\'ve been having a great conversation! <break time="200ms"/>',
            'I heard from Peter you were chatting— <break time="150ms"/>sounds like good stuff!',
        ],
        'nayan-patel': ['Nayan mentioned you two talked. <break time="200ms"/>Good foundation there.'],
        'comm-specialist': [
            'Alex filled me in— <break time="200ms"/>I\'m up to speed.',
            'Got the brief from Alex. <break time="200ms"/>Let\'s keep going.',
        ],
        'spend-save': [
            'Maya told me about your goals— <break time="200ms"/>I love it!',
            "I heard from Maya you're working on something great!",
        ],
        'event-planner': [
            'Jordan\'s excited for you! <break time="200ms"/>They told me about your plans.',
            'I got the download from Jordan— <break time="200ms"/>this sounds amazing!',
        ],
        'jack-b': [
            'Ferni said you two were talking— <break time="200ms"/>she speaks highly of you!',
            'I heard from Ferni. <break time="200ms"/>Sounds like you\'re doing great.',
        ],
    },
};
/**
 * Generate a context summary for handoff
 */
export function generateHandoffSummary(context) {
    const lines = [];
    lines.push(`[HANDOFF FROM ${context.fromPersona.toUpperCase()}]`);
    if (context.topicsDiscussed.length > 0) {
        lines.push(`Discussed: ${context.topicsDiscussed.join(', ')}`);
    }
    if (context.currentGoal) {
        lines.push(`Working on: ${context.currentGoal}`);
    }
    if (context.emotionalState) {
        lines.push(`User mood: ${context.emotionalState}`);
    }
    if (context.keyPointsToKnow.length > 0) {
        lines.push(`Key points: ${context.keyPointsToKnow.join('; ')}`);
    }
    if (context.userPreferences) {
        const prefs = [];
        if (context.userPreferences.communicationStyle) {
            prefs.push(`style: ${context.userPreferences.communicationStyle}`);
        }
        if (context.userPreferences.humorAppreciation) {
            prefs.push(`humor: ${context.userPreferences.humorAppreciation}`);
        }
        if (prefs.length > 0) {
            lines.push(`User prefs: ${prefs.join(', ')}`);
        }
    }
    return lines.join('\n');
}
// ============================================================================
// TEAM MENTIONS - Natural ways to reference teammates
// ============================================================================
export const TEAM_MENTIONS = {
    // When suggesting a teammate might help
    suggest: {
        'peter-john': [
            'You know who\'d love this question? <break time="200ms"/>Peter. <break time="150ms"/>Want me to bring him in?',
            'Peter has a great perspective on this. <break time="200ms"/>Want to hear from him?',
        ],
        'nayan-patel': [
            'This is Jack\'s territory. <break time="200ms"/>Should I get him?',
            'Jack would have thoughts on this. <break time="200ms"/>Interested?',
        ],
        'comm-specialist': [
            'Alex could handle this. <break time="200ms"/>Want me to bring them in?',
            'Sounds like an Alex question. <break time="200ms"/>Should I get them?',
        ],
        'spend-save': [
            'Maya\'s great at this. <break time="200ms"/>Want to talk to her?',
            'This is Maya\'s wheelhouse. <break time="200ms"/>Should I bring her in?',
        ],
        'event-planner': [
            'Jordan would love to help with this! <break time="200ms"/>Want me to get them?',
            'Ooh, this is Jordan\'s thing! <break time="200ms"/>Should I bring them in?',
        ],
    },
    // Casual mentions in conversation
    casual: {
        'peter-john': [
            'Peter always says— <break time="200ms"/>',
            'That reminds me of something Peter mentioned— <break time="150ms"/>',
        ],
        'nayan-patel': [
            'As Jack would say— <break time="200ms"/>',
            'Jack has a great line about this— <break time="150ms"/>',
        ],
        'comm-specialist': [
            'Alex would appreciate that— <break time="200ms"/>',
            'That\'s something Alex always emphasizes— <break time="150ms"/>',
        ],
        'spend-save': [
            'Maya talks about this— <break time="200ms"/>',
            'That\'s very Maya-approved thinking— <break time="150ms"/>',
        ],
        'event-planner': [
            'Jordan would be so excited about that— <break time="200ms"/>',
            'That\'s peak Jordan energy— <break time="150ms"/>',
        ],
    },
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function randomFrom(array) {
    return array[Math.floor(Math.random() * array.length)];
}
/**
 * Get what one persona says about another
 */
export function getOpinionAbout(fromPersona, aboutPersona) {
    const fromKey = resolveLookupKey(fromPersona);
    const aboutKey = resolveLookupKey(aboutPersona);
    const opinions = TEAM_OPINIONS[fromKey];
    if (!opinions)
        return null;
    const aboutList = opinions[aboutKey];
    if (!aboutList || aboutList.length === 0)
        return null;
    return randomFrom(aboutList);
}
/**
 * Get handoff warmth phrase
 */
export function getHandoffWarmth(direction, persona) {
    const lookupKey = resolveLookupKey(persona);
    const phrases = direction === 'to'
        ? HANDOFF_WARMTH.toTeammate[lookupKey]
        : HANDOFF_WARMTH.fromTeammate[lookupKey];
    if (!phrases || phrases.length === 0)
        return null;
    return randomFrom(phrases);
}
/**
 * Get suggestion phrase for bringing in a teammate
 */
export function getTeamSuggestion(persona) {
    const lookupKey = resolveLookupKey(persona);
    const suggestions = TEAM_MENTIONS.suggest[lookupKey];
    if (!suggestions || suggestions.length === 0)
        return null;
    return randomFrom(suggestions);
}
/**
 * Get casual mention of a teammate
 */
export function getCasualMention(persona) {
    const lookupKey = resolveLookupKey(persona);
    const mentions = TEAM_MENTIONS.casual[lookupKey];
    if (!mentions || mentions.length === 0)
        return null;
    return randomFrom(mentions);
}
//# sourceMappingURL=team-dynamics.js.map