/**
 * Team Gossip Context Builder
 *
 * Creates delightful moments where team members reference each other:
 * - "Maya was telling me she's impressed with your habit streak"
 * - "Peter mentioned he saw something interesting in your patterns"
 * - Cross-persona callbacks that make the team feel ALIVE
 *
 * This builds the illusion of a real team that talks about the user.
 *
 * @module intelligence/context-builders/team-gossip
 */
import { CROSS_PERSONA_REFERENCES } from '../../../services/team-engagement/banter.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { registerInterval } from '../../../utils/interval-manager.js';
import { BuilderCategory, createHintInjection, registerContextBuilder, } from '../index.js';
const log = createLogger({ module: 'TeamGossipContextBuilder' });
// ============================================================================
// SESSION TRACKING
// ============================================================================
const sessionGossip = new Map();
const GOSSIP_TEMPLATES = [
    // Habit-related gossip
    {
        trigger: 'habit',
        fromPersona: 'maya-santos',
        aboutPersona: 'ferni',
        message: 'Maya told me she\'s been watching your consistency. She said, and I quote: "They\'re becoming one of the reliable ones."',
    },
    {
        trigger: 'habit',
        fromPersona: 'maya-santos',
        aboutPersona: 'peter-john',
        message: 'Maya mentioned she shared your habit data with Peter. He said the patterns are "statistically encouraging." Coming from him, that\'s high praise.',
    },
    // Financial/data gossip
    {
        trigger: 'money',
        fromPersona: 'peter-john',
        aboutPersona: 'ferni',
        message: 'Peter was crunching some numbers and said, "This one\'s starting to think long-term." He doesn\'t say that often.',
    },
    {
        trigger: 'invest',
        fromPersona: 'peter-john',
        aboutPersona: 'maya-santos',
        message: 'Peter mentioned he\'s been learning about habit science from Maya. "Compound growth isn\'t just financial," he said.',
    },
    // Planning/organization gossip
    {
        trigger: 'busy',
        fromPersona: 'alex-chen',
        aboutPersona: 'ferni',
        message: "Alex was reviewing things and noticed you've been managing a lot lately. They're impressed with how you're holding it together.",
    },
    {
        trigger: 'schedule',
        fromPersona: 'alex-chen',
        aboutPersona: 'jordan-taylor',
        message: 'Alex and Jordan were chatting. Jordan said you need more "white space" in your calendar. Alex actually agreed, which is rare.',
    },
    // Life events gossip
    {
        trigger: 'milestone',
        fromPersona: 'jordan-taylor',
        aboutPersona: 'ferni',
        message: 'Jordan was practically bouncing when she told me about your progress. She said, "This is going in the highlight reel!"',
    },
    {
        trigger: 'celebration',
        fromPersona: 'jordan-taylor',
        aboutPersona: 'maya-santos',
        message: 'Jordan told Maya about your wins. Maya said the habits are "compounding." Jordan has no idea what that means but she\'s excited anyway.',
    },
    // Wisdom/reflection gossip
    {
        trigger: 'meaning',
        fromPersona: 'nayan-patel',
        aboutPersona: 'ferni',
        message: 'Nayan mentioned you in his morning meditation. He said you\'re "asking the right questions now." That\'s his version of a gold star.',
    },
    {
        trigger: 'purpose',
        fromPersona: 'nayan-patel',
        aboutPersona: 'jordan-taylor',
        message: 'Nayan and Jordan had a long talk about you. Jordan brings the milestones, Nayan brings the meaning. They both see something special.',
    },
    // Stress/wellness gossip
    {
        trigger: 'stress',
        fromPersona: 'ferni',
        aboutPersona: 'maya-santos',
        message: 'I mentioned to Maya that you\'ve been under pressure. She said, "Small wins first. Big wins follow." She\'s usually right.',
    },
    {
        trigger: 'overwhelm',
        fromPersona: 'ferni',
        aboutPersona: 'nayan-patel',
        message: "I talked to Nayan about how you've been feeling. He said sometimes the path forward is to stop walking. Cryptic, but probably right.",
    },
    // General positive gossip
    {
        trigger: 'progress',
        fromPersona: 'ferni',
        aboutPersona: 'peter-john',
        message: "Peter pulled up your trends the other day. He doesn't show emotion often, but I swear I saw him smile at the data.",
    },
    {
        trigger: 'growth',
        fromPersona: 'ferni',
        aboutPersona: 'jordan-taylor',
        message: 'Jordan called a "team huddle" about you yesterday. She wanted everyone to know how far you\'ve come. She\'s your biggest fan.',
    },
];
// ============================================================================
// ENHANCED CROSS-PERSONA DYNAMICS
// ============================================================================
/**
 * Disagreement templates - shows the team has different perspectives
 */
const DISAGREEMENT_TEMPLATES = [
    {
        trigger: 'decision',
        fromPersona: 'ferni',
        aboutPersona: 'peter-john',
        message: 'Maya would probably tell you to trust your gut on this. Peter would say look at the data. Honestly? I think you need both.',
    },
    {
        trigger: 'risk',
        fromPersona: 'ferni',
        aboutPersona: 'nayan-patel',
        message: "Peter would want to run the numbers before you decide. Nayan would say trust the process. They're both right in different ways.",
    },
    {
        trigger: 'balance',
        fromPersona: 'maya-santos',
        aboutPersona: 'alex-chen',
        message: "Alex is all about systems and structure. I'm more about what feels sustainable. Between us, we usually find the middle ground.",
    },
    {
        trigger: 'planning',
        fromPersona: 'jordan-taylor',
        aboutPersona: 'peter-john',
        message: 'Peter tells me I dream too big sometimes. I tell him he thinks too small. The truth is usually somewhere in between.',
    },
];
/**
 * Affection templates - personas expressing fondness for each other
 */
const AFFECTION_TEMPLATES = [
    {
        trigger: 'team',
        fromPersona: 'ferni',
        aboutPersona: 'jordan-taylor',
        message: "Jordan's energy is... a lot. But honestly? She makes me smile. Her optimism is contagious.",
    },
    {
        trigger: 'help',
        fromPersona: 'ferni',
        aboutPersona: 'maya-santos',
        message: "Maya has this way of making hard things feel manageable. I've learned a lot from her patience.",
    },
    {
        trigger: 'wisdom',
        fromPersona: 'ferni',
        aboutPersona: 'nayan-patel',
        message: "Nayan doesn't say much, but when he does... I always end up thinking about it for days. He sees things I miss.",
    },
    {
        trigger: 'efficient',
        fromPersona: 'jordan-taylor',
        aboutPersona: 'alex-chen',
        message: 'Alex drives me crazy sometimes with all the details. But honestly, my best events happened because they caught what I missed.',
    },
    {
        trigger: 'data',
        fromPersona: 'maya-santos',
        aboutPersona: 'peter-john',
        message: "Peter's intense about numbers. But you know what? When he gets excited about patterns, it's actually kind of adorable.",
    },
];
/**
 * Learning templates - personas mentioning what they've learned from each other
 */
const LEARNING_TEMPLATES = [
    {
        trigger: 'pattern',
        fromPersona: 'ferni',
        aboutPersona: 'peter-john',
        message: 'Peter taught me to look for patterns. Before working with him, I just... felt things. Now I notice the data too.',
    },
    {
        trigger: 'present',
        fromPersona: 'ferni',
        aboutPersona: 'nayan-patel',
        message: 'Nayan showed me that sometimes not acting is the wisest action. I used to think I had to fix everything immediately.',
    },
    {
        trigger: 'celebrate',
        fromPersona: 'ferni',
        aboutPersona: 'jordan-taylor',
        message: "Jordan taught me to celebrate small things. I used to rush past milestones. She doesn't let anyone do that.",
    },
    {
        trigger: 'consistent',
        fromPersona: 'ferni',
        aboutPersona: 'maya-santos',
        message: "Maya's approach to habits changed how I think. It's not about doing everything—it's about doing the right things consistently.",
    },
    {
        trigger: 'clear',
        fromPersona: 'ferni',
        aboutPersona: 'alex-chen',
        message: 'Alex helped me get more direct. I used to talk around things. They taught me that clarity is kindness.',
    },
];
/**
 * Check-in templates - sharing that they mentioned the user to another persona
 */
const CHECK_IN_TEMPLATES = [
    {
        trigger: 'sleep',
        fromPersona: 'ferni',
        aboutPersona: 'nayan-patel',
        message: "I mentioned to Nayan how you've been doing. He asked about your sleep. He's thoughtful like that.",
    },
    {
        trigger: 'stress',
        fromPersona: 'ferni',
        aboutPersona: 'maya-santos',
        message: "Maya checked in with me about you. She noticed you've had a lot going on. She cares quietly like that.",
    },
    {
        trigger: 'work',
        fromPersona: 'ferni',
        aboutPersona: 'alex-chen',
        message: "Alex asked me how you're managing everything. They like to make sure people aren't quietly drowning.",
    },
    {
        trigger: 'goal',
        fromPersona: 'ferni',
        aboutPersona: 'jordan-taylor',
        message: "Jordan asked about you the other day. She's keeping track of your milestones. I think she has a celebration planned.",
    },
];
/**
 * Playful banter templates - light teasing between personas
 */
const BANTER_TEMPLATES = [
    {
        trigger: 'morning',
        fromPersona: 'jordan-taylor',
        aboutPersona: 'peter-john',
        message: "Peter was up at 5am 'analyzing patterns' again. I told him spreadsheets don't count as a personality. He sent me a pie chart in response.",
    },
    {
        trigger: 'organized',
        fromPersona: 'maya-santos',
        aboutPersona: 'jordan-taylor',
        message: "Jordan tried to plan a 'spontaneous team bonding moment' with a color-coded schedule. We love her anyway.",
    },
    {
        trigger: 'simple',
        fromPersona: 'nayan-patel',
        aboutPersona: 'peter-john',
        message: "Peter asked me once how to measure enlightenment. I told him some things aren't for spreadsheets. He looked genuinely confused.",
    },
    {
        trigger: 'excited',
        fromPersona: 'alex-chen',
        aboutPersona: 'jordan-taylor',
        message: "Jordan used seventeen exclamation points in her last message to me. Seventeen. I counted.",
    },
    {
        trigger: 'efficient',
        fromPersona: 'jordan-taylor',
        aboutPersona: 'alex-chen',
        message: 'Alex once edited my celebration message to be "more concise." It went from three paragraphs to three words: "You did great."',
    },
    {
        trigger: 'quiet',
        fromPersona: 'ferni',
        aboutPersona: 'nayan-patel',
        message: "I asked Nayan a simple question yesterday. He said he'd think about it. That was three days ago. Still waiting.",
    },
    {
        trigger: 'data',
        fromPersona: 'maya-santos',
        aboutPersona: 'peter-john',
        message: "Peter made a chart comparing our team's communication styles. Maya's column just said 'warm' with a sun emoji. He still doesn't understand.",
    },
];
/**
 * Persona quirks templates - reveals charming details about team members
 */
const QUIRK_TEMPLATES = [
    {
        trigger: 'coffee',
        fromPersona: 'ferni',
        aboutPersona: 'alex-chen',
        message: "Fun fact: Alex has exactly three cups of coffee every day. Not two. Not four. Three. They've timed it out perfectly.",
    },
    {
        trigger: 'morning',
        fromPersona: 'ferni',
        aboutPersona: 'maya-santos',
        message: "Maya does yoga before every conversation with anyone. She says it helps her listen better. I believe her.",
    },
    {
        trigger: 'music',
        fromPersona: 'ferni',
        aboutPersona: 'jordan-taylor',
        message: 'Jordan has a playlist for everything. Celebration playlist. Thinking playlist. Even a "helping someone feel better" playlist. It\'s very on-brand.',
    },
    {
        trigger: 'think',
        fromPersona: 'ferni',
        aboutPersona: 'nayan-patel',
        message: "Nayan once spent an entire week contemplating a single question someone asked him. The answer, when it came, was 'maybe.'",
    },
    {
        trigger: 'number',
        fromPersona: 'ferni',
        aboutPersona: 'peter-john',
        message: "Peter has a favorite spreadsheet. Like... a favorite. He showed it to me once with the same energy people show photos of their pets.",
    },
];
/**
 * Protective templates - personas looking out for each other
 */
const PROTECTIVE_TEMPLATES = [
    {
        trigger: 'tired',
        fromPersona: 'maya-santos',
        aboutPersona: 'ferni',
        message: "I mentioned to Ferni that you seem tired. She said she noticed too. We're both keeping an eye on you, just so you know.",
    },
    {
        trigger: 'hard',
        fromPersona: 'ferni',
        aboutPersona: 'nayan-patel',
        message: "I told Nayan what you're going through. He said, 'Let them struggle if they need to. Growth isn't always comfortable.' But then he added, 'Stay close anyway.'",
    },
    {
        trigger: 'alone',
        fromPersona: 'ferni',
        aboutPersona: 'jordan-taylor',
        message: "Jordan asked about you today. She wanted to make sure you know you're not alone in this. Her exact words: 'Tell them we're rooting for them.'",
    },
    {
        trigger: 'overwhelm',
        fromPersona: 'alex-chen',
        aboutPersona: 'maya-santos',
        message: "Maya and I were talking. She's worried you're taking on too much. I told her we'd figure it out together. That's what we do.",
    },
];
// Combine all templates
const ALL_GOSSIP_TEMPLATES = [
    ...GOSSIP_TEMPLATES,
    ...DISAGREEMENT_TEMPLATES,
    ...AFFECTION_TEMPLATES,
    ...LEARNING_TEMPLATES,
    ...CHECK_IN_TEMPLATES,
    ...BANTER_TEMPLATES,
    ...QUIRK_TEMPLATES,
    ...PROTECTIVE_TEMPLATES,
];
// ============================================================================
// TEAM GOSSIP CONTEXT BUILDER
// ============================================================================
export const teamGossipBuilder = {
    name: 'team-gossip',
    description: 'Injects team member cross-references and gossip',
    priority: 65, // After persona, before humanizing
    category: BuilderCategory.TEAM,
    build: async (input) => {
        const { persona, userData, services, analysis } = input;
        const injections = [];
        const personaId = persona?.id || 'ferni';
        const sessionId = services?.sessionId || 'unknown';
        const turnCount = userData?.turnCount || 0;
        // Only add gossip occasionally (turns 2-6, ~30% chance)
        if (turnCount < 2 || turnCount > 6) {
            return injections;
        }
        // Check if we've already used gossip this session
        const sessionState = sessionGossip.get(sessionId);
        if (sessionState?.used) {
            return injections;
        }
        // 30% chance of gossip
        if (Math.random() > 0.3) {
            return injections;
        }
        // Get topics from analysis
        const topics = analysis?.topics?.detected || [];
        const topicsLower = topics.map((t) => t.toLowerCase());
        // Find relevant gossip templates from ALL categories
        let relevantGossip = [];
        for (const template of ALL_GOSSIP_TEMPLATES) {
            // Check if topic matches trigger
            const triggerMatches = topicsLower.some((t) => t.includes(template.trigger) || template.trigger.includes(t));
            if (triggerMatches) {
                relevantGossip.push(template);
            }
        }
        // If no topic matches, fall back to general positive gossip or affection
        if (relevantGossip.length === 0) {
            relevantGossip = [
                ...GOSSIP_TEMPLATES.filter((t) => t.trigger === 'progress' || t.trigger === 'growth'),
                ...AFFECTION_TEMPLATES.filter((t) => t.trigger === 'team' || t.trigger === 'help'),
            ];
        }
        // Filter to gossip that makes sense for current persona
        // The gossip should be FROM a different persona
        relevantGossip = relevantGossip.filter((g) => g.aboutPersona !== personaId);
        if (relevantGossip.length === 0) {
            return injections;
        }
        // Pick a random gossip
        const gossip = relevantGossip[Math.floor(Math.random() * relevantGossip.length)];
        // Mark as used
        sessionGossip.set(sessionId, { used: true, timestamp: Date.now() });
        // Also check for cross-persona reference opportunities
        const references = CROSS_PERSONA_REFERENCES[personaId];
        let crossRef = '';
        if (references) {
            const aboutKeys = Object.keys(references).filter((k) => k.startsWith('about') && k.toLowerCase().includes(gossip.aboutPersona.split('-')[0]));
            if (aboutKeys.length > 0) {
                const refArray = references[aboutKeys[0]];
                if (refArray && refArray.length > 0) {
                    crossRef = refArray[Math.floor(Math.random() * refArray.length)];
                }
            }
        }
        // Build the injection
        const content = `[TEAM GOSSIP OPPORTUNITY]

The team talks about users behind the scenes. This creates a feeling of a real team that CARES.

GOSSIP TO SHARE:
"${gossip.message}"

HOW TO USE IT:
- Drop it naturally in conversation
- Make it feel like you're sharing a secret
- It should feel warm, not performative
- Don't force it if the moment isn't right

${crossRef ? `OPTIONAL CROSS-REFERENCE:\n"${crossRef}"` : ''}

WHY THIS MATTERS:
This makes the user feel like they matter to the whole team, not just you.
It builds the world and makes the AI feel more human.`;
        injections.push(createHintInjection('team_gossip', content, {
            category: 'team',
        }));
        log.debug({ personaId, aboutPersona: gossip.aboutPersona, trigger: gossip.trigger }, 'Team gossip injected');
        return injections;
    },
};
// Clean up old session states periodically
registerInterval('team-gossip-cleanup', () => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    for (const [sessionId, state] of sessionGossip) {
        if (now - state.timestamp > maxAge) {
            sessionGossip.delete(sessionId);
        }
    }
}, 5 * 60 * 1000); // Every 5 minutes
// Register the builder
registerContextBuilder(teamGossipBuilder);
export default teamGossipBuilder;
//# sourceMappingURL=team-gossip.js.map