/**
 * Persona-Voiced Observations Generator
 *
 * "Better Than Human" principle: Insights should feel like they come from
 * real friends who've been paying attention - not a dashboard.
 *
 * This generator produces observations voiced by specific team members:
 * - Peter notices patterns and data
 * - Maya notices habits and energy
 * - Jordan notices milestones and celebrations
 * - Alex notices communication and calendar patterns
 * - Nayan notices deeper meanings and growth
 * - Ferni coordinates and notices the whole picture
 *
 * Each observation is phrased in that persona's voice and style.
 *
 * @module services/superhuman/insight-generation/generators/persona-voiced-observations
 */
import { v4 as uuid } from 'uuid';
import { createLogger } from '../../../../utils/safe-logger.js';
import { registerInsightGenerator } from '../engine.js';
const log = createLogger({ module: 'PersonaVoicedObservations' });
const PERSONA_VOICES = {
    peter: {
        name: 'Peter',
        openings: [
            'I\'ve been looking at your patterns, and something interesting came up.',
            'The data tells a story here.',
            'I noticed something in your numbers.',
            'There\'s a pattern I want to show you.',
        ],
        style: 'analytical but warm, data-driven but human',
        domains: ['financial', 'patterns', 'research', 'trends'],
        tone: 'warm_observation',
    },
    maya: {
        name: 'Maya',
        openings: [
            'Hey, I\'ve been watching your energy and noticed something.',
            'I want to celebrate something with you.',
            'Your habits are telling me a story.',
            'I noticed a shift in your routine.',
        ],
        style: 'encouraging, focused on small wins, habit-aware',
        domains: ['habits', 'energy', 'routines', 'streaks', 'self-care'],
        tone: 'celebratory',
    },
    jordan: {
        name: 'Jordan',
        openings: [
            'I\'ve been thinking about something to celebrate.',
            'There\'s a milestone I don\'t want you to miss.',
            'I noticed an anniversary coming up.',
            'Something special is around the corner.',
        ],
        style: 'celebratory, milestone-focused, planning-oriented',
        domains: ['celebrations', 'milestones', 'events', 'anniversaries'],
        tone: 'celebratory',
    },
    alex: {
        name: 'Alex',
        openings: [
            'Looking at your schedule, I noticed something.',
            'There\'s a communication pattern I want to flag.',
            'Your calendar tells me something.',
            'I spotted an opportunity in your week.',
        ],
        style: 'efficient but caring, communication-focused',
        domains: ['calendar', 'communication', 'scheduling', 'meetings'],
        tone: 'direct_but_kind',
    },
    nayan: {
        name: 'Nayan',
        openings: [
            'I\'ve been reflecting on your journey.',
            'There\'s something deeper I want to share.',
            'Looking at the bigger picture...',
            'I see a thread running through your story.',
        ],
        style: 'philosophical, wise, sees the bigger picture',
        domains: ['growth', 'meaning', 'values', 'life philosophy', 'wisdom'],
        tone: 'reflective',
    },
    ferni: {
        name: 'Ferni',
        openings: [
            'The team has been noticing some things.',
            'I\'ve been thinking about you.',
            'Something came up that I want to share.',
            'I noticed something that matters.',
        ],
        style: 'warm, curious, coordinating the whole picture',
        domains: ['overall', 'coordination', 'relationships', 'life'],
        tone: 'warm_observation',
    },
};
const OBSERVATION_TEMPLATES = [
    // Peter - Pattern observations
    {
        persona: 'peter',
        pattern: 'energy_time_correlation',
        template: 'Your energy seems to dip around {timeframe}. This has happened {count} times now. Worth noting for planning.',
        priority: 'medium',
        surfacingMoment: 'natural_pause',
        minDataPoints: 3,
    },
    {
        persona: 'peter',
        pattern: 'topic_mood_correlation',
        template: 'I noticed you seem {emotion} when {topic} comes up. It\'s come up {count} times with this same energy.',
        priority: 'medium',
        surfacingMoment: 'topic_relevant',
        minDataPoints: 3,
    },
    // Maya - Habit observations
    {
        persona: 'maya',
        pattern: 'streak_celebration',
        template: 'You\'ve been consistent with {habit} for {days} days now. That\'s not nothing. That\'s you showing up.',
        priority: 'high',
        surfacingMoment: 'celebration',
        minDataPoints: 5,
    },
    {
        persona: 'maya',
        pattern: 'energy_recovery',
        template: 'Your energy has been climbing back up this week. I see you taking care of yourself.',
        priority: 'medium',
        surfacingMoment: 'session_start',
        minDataPoints: 2,
    },
    {
        persona: 'maya',
        pattern: 'capacity_warning',
        template: 'You\'ve mentioned being tired {count} times lately. Your plate looks full. How are you actually doing?',
        priority: 'high',
        surfacingMoment: 'gentle_probe',
        minDataPoints: 3,
    },
    // Jordan - Milestone observations
    {
        persona: 'jordan',
        pattern: 'relationship_milestone',
        template: 'It\'s been {duration} since we first talked. {conversationCount} conversations. That\'s a real relationship we\'ve built.',
        priority: 'high',
        surfacingMoment: 'celebration',
        minDataPoints: 1,
    },
    {
        persona: 'jordan',
        pattern: 'upcoming_important_date',
        template: '{date_name} is coming up in {days} days. Last year you mentioned {context}. Wanted to make sure it\'s on your radar.',
        priority: 'high',
        surfacingMoment: 'session_start',
        minDataPoints: 1,
    },
    {
        persona: 'jordan',
        pattern: 'quiet_win',
        template: 'This might seem small, but you {achievement}. That\'s worth acknowledging.',
        priority: 'medium',
        surfacingMoment: 'celebration',
        minDataPoints: 1,
    },
    // Alex - Communication observations  
    {
        persona: 'alex',
        pattern: 'calendar_density',
        template: 'Your week looks {density}. You\'ve got {count} things scheduled. Want to talk about priorities?',
        priority: 'medium',
        surfacingMoment: 'session_start',
        minDataPoints: 3,
    },
    {
        persona: 'alex',
        pattern: 'person_silence',
        template: 'You haven\'t mentioned {person} in a while. Last time was {days} days ago. Everything okay there?',
        priority: 'low',
        surfacingMoment: 'natural_pause',
        minDataPoints: 3,
    },
    // Nayan - Wisdom observations
    {
        persona: 'nayan',
        pattern: 'growth_reflection',
        template: 'You know what strikes me? A few months ago, you wouldn\'t have {growth_example}. Something shifted.',
        priority: 'medium',
        surfacingMoment: 'natural_pause',
        minDataPoints: 2,
    },
    {
        persona: 'nayan',
        pattern: 'values_alignment',
        template: 'You said {value} matters to you, but I\'ve noticed {contradiction}. Not judging—just curious what\'s happening there.',
        priority: 'medium',
        surfacingMoment: 'gentle_probe',
        minDataPoints: 2,
    },
    {
        persona: 'nayan',
        pattern: 'dream_reminder',
        template: 'Remember when you talked about {dream}? That was {days} days ago. Is that dream still alive?',
        priority: 'low',
        surfacingMoment: 'natural_pause',
        minDataPoints: 1,
    },
    // Ferni - Coordinated observations
    {
        persona: 'ferni',
        pattern: 'team_summary',
        template: 'The team has been paying attention. {summary}. We\'re in your corner.',
        priority: 'high',
        surfacingMoment: 'session_start',
        minDataPoints: 3,
    },
    {
        persona: 'ferni',
        pattern: 'first_time_share',
        template: 'You shared something new last time—{topic}. That meant something that you trusted me with that.',
        priority: 'high',
        surfacingMoment: 'session_start',
        minDataPoints: 1,
    },
];
async function fetchUserData(userId) {
    const data = {};
    try {
        const { getFirestoreDb } = await import('../../firestore-utils.js');
        const db = getFirestoreDb();
        if (!db)
            return data;
        // Fetch profile
        const profileDoc = await db.collection('bogle_users').doc(userId).get();
        if (profileDoc.exists) {
            data.profile = profileDoc.data();
        }
        // Fetch commitments
        const commitmentsSnap = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('commitments')
            .limit(10)
            .get();
        data.commitments = commitmentsSnap.docs.map(d => d.data());
        // Fetch dreams
        const dreamsSnap = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('dreams')
            .limit(10)
            .get();
        data.dreams = dreamsSnap.docs.map(d => d.data());
        // Fetch relationship network
        const networkSnap = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('relationship_network')
            .limit(20)
            .get();
        data.networkData = networkSnap.docs.map(d => d.data());
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Error fetching user data for observations');
    }
    return data;
}
// ============================================================================
// OBSERVATION GENERATOR
// ============================================================================
function generatePersonaOpening(persona) {
    const voice = PERSONA_VOICES[persona];
    if (!voice)
        return '';
    return voice.openings[Math.floor(Math.random() * voice.openings.length)];
}
function formatObservation(template, data) {
    let message = template.template;
    // Replace placeholders with data
    for (const [key, value] of Object.entries(data)) {
        message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    // Add persona opening
    const opening = generatePersonaOpening(template.persona);
    const voice = PERSONA_VOICES[template.persona];
    return `${opening}\n\n${message}`;
}
async function generateObservations(userId, context) {
    const insights = [];
    const userData = await fetchUserData(userId);
    if (!userData.profile) {
        log.debug({ userId }, 'No profile data for persona observations');
        return insights;
    }
    const now = new Date();
    // Jordan: Relationship milestone
    if (userData.profile?.totalConversations && userData.profile?.firstContact) {
        const conversationCount = userData.profile.totalConversations;
        const firstContact = new Date(userData.profile.firstContact);
        const daysSinceFirst = Math.floor((now.getTime() - firstContact.getTime()) / (1000 * 60 * 60 * 24));
        // Check for round number milestones
        const isMilestone = conversationCount === 5 ||
            conversationCount === 10 ||
            conversationCount === 25 ||
            conversationCount === 50 ||
            conversationCount === 100 ||
            (conversationCount > 0 && conversationCount % 50 === 0);
        if (isMilestone) {
            const durationStr = daysSinceFirst > 30
                ? `${Math.floor(daysSinceFirst / 30)} months`
                : `${daysSinceFirst} days`;
            const voice = PERSONA_VOICES.jordan;
            insights.push({
                id: uuid(),
                userId,
                category: 'first_time_celebration',
                priority: 'high',
                headline: `${conversationCount} conversations milestone`,
                message: `${generatePersonaOpening('jordan')}\n\nIt's been ${durationStr} since we first talked. ${conversationCount} conversations. That's a real relationship we've built.`,
                evidence: [`${conversationCount} total conversations`, `First contact: ${firstContact.toLocaleDateString()}`],
                surfacingMoment: 'celebration',
                tone: voice.tone,
                generatedAt: now,
                confidence: 1.0,
                dataPoints: 2,
                surfaced: false,
                dismissed: false,
            });
        }
    }
    // Maya: Capacity check (from time anchors mentioning tiredness)
    const timeAnchors = userData.profile.personalJourney?.seasonal?.timeAnchors || [];
    const tirednessAnchors = timeAnchors.filter(a => a.description?.toLowerCase().includes('tired') ||
        a.description?.toLowerCase().includes('exhausted') ||
        a.description?.toLowerCase().includes('overwhelmed'));
    if (tirednessAnchors.length >= 2) {
        const voice = PERSONA_VOICES.maya;
        insights.push({
            id: uuid(),
            userId,
            category: 'commitment_pattern',
            priority: 'high',
            headline: 'Energy check needed',
            message: `${generatePersonaOpening('maya')}\n\nYou've mentioned being tired ${tirednessAnchors.length} times lately. Your plate looks full. How are you actually doing?`,
            evidence: tirednessAnchors.map(a => a.description).slice(0, 3),
            surfacingMoment: 'gentle_probe',
            tone: voice.tone,
            generatedAt: now,
            confidence: 0.8,
            dataPoints: tirednessAnchors.length,
            surfaced: false,
            dismissed: false,
        });
    }
    // Nayan: Dream reminder (dreams not mentioned recently)
    if (userData.dreams && userData.dreams.length > 0) {
        for (const dream of userData.dreams.slice(0, 2)) {
            if (dream.dream && dream.lastMentioned) {
                const lastMentioned = new Date(dream.lastMentioned);
                const daysSilent = Math.floor((now.getTime() - lastMentioned.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSilent > 30) {
                    const voice = PERSONA_VOICES.nayan;
                    insights.push({
                        id: uuid(),
                        userId,
                        category: 'dream_decay',
                        priority: 'low',
                        headline: `Dormant dream: ${dream.dream.slice(0, 30)}...`,
                        message: `${generatePersonaOpening('nayan')}\n\nRemember when you talked about ${dream.dream}? That was ${daysSilent} days ago. Is that dream still alive?`,
                        evidence: [`Last mentioned: ${lastMentioned.toLocaleDateString()}`],
                        surfacingMoment: 'natural_pause',
                        tone: voice.tone,
                        generatedAt: now,
                        confidence: 0.7,
                        dataPoints: 1,
                        surfaced: false,
                        dismissed: false,
                    });
                }
            }
        }
    }
    // Alex: Person silence (someone not mentioned in a while)
    if (userData.networkData && userData.networkData.length > 0) {
        // Filter to important people (mentioned more than twice)
        const importantPeople = userData.networkData.filter(p => (p.mentionCount || 0) > 2);
        for (const person of importantPeople.slice(0, 2)) {
            if (person.name && person.lastMentioned) {
                const lastMentioned = new Date(person.lastMentioned);
                const daysSilent = Math.floor((now.getTime() - lastMentioned.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSilent > 14 && person.name.length > 2) {
                    const voice = PERSONA_VOICES.alex;
                    insights.push({
                        id: uuid(),
                        userId,
                        category: 'relationship_network',
                        priority: 'low',
                        headline: `${person.name} not mentioned lately`,
                        message: `${generatePersonaOpening('alex')}\n\nYou haven't mentioned ${person.name} in a while. Last time was ${daysSilent} days ago. Everything okay there?`,
                        evidence: [`${person.mentionCount} previous mentions`, `Last mentioned: ${lastMentioned.toLocaleDateString()}`],
                        surfacingMoment: 'natural_pause',
                        tone: voice.tone,
                        triggerPerson: person.name,
                        generatedAt: now,
                        confidence: 0.6,
                        dataPoints: person.mentionCount || 1,
                        surfaced: false,
                        dismissed: false,
                    });
                }
            }
        }
    }
    // Ferni: Growth reflection (from challenges)
    const challenges = userData.profile.humanMemory?.growthArc?.challenges || [];
    const workingChallenges = challenges.filter(c => c.status === 'working_on_it');
    if (workingChallenges.length > 0) {
        const voice = PERSONA_VOICES.ferni;
        insights.push({
            id: uuid(),
            userId,
            category: 'growth_trajectory',
            priority: 'medium',
            headline: 'Growth in progress',
            message: `${generatePersonaOpening('ferni')}\n\nI see you're working on some things. ${workingChallenges.length} challenge${workingChallenges.length > 1 ? 's' : ''} you're actively tackling. That takes courage.`,
            evidence: workingChallenges.map(c => c.challenge.slice(0, 50)),
            surfacingMoment: 'session_start',
            tone: voice.tone,
            generatedAt: now,
            confidence: 0.9,
            dataPoints: workingChallenges.length,
            surfaced: false,
            dismissed: false,
        });
    }
    log.debug({ userId, insightCount: insights.length }, 'Generated persona-voiced observations');
    return insights;
}
// ============================================================================
// GENERATOR REGISTRATION
// ============================================================================
const personaVoicedGenerator = {
    category: 'first_time_celebration', // Using this category as it's closest to "persona observations"
    name: 'Persona-Voiced Observations',
    description: 'Generates insights voiced by specific team members based on their domains',
    async generate(userId, context) {
        return generateObservations(userId, context);
    },
    async hasEnoughData(userId) {
        const userData = await fetchUserData(userId);
        // Need at least a profile to generate observations
        return !!userData.profile;
    },
};
// Register the generator
registerInsightGenerator(personaVoicedGenerator);
export { generateObservations, PERSONA_VOICES, OBSERVATION_TEMPLATES };
//# sourceMappingURL=persona-voiced-observations.js.map