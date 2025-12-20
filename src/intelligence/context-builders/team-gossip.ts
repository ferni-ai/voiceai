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

import { CROSS_PERSONA_REFERENCES } from '../../services/team-engagement/banter.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHintInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'TeamGossipContextBuilder' });

// ============================================================================
// SESSION TRACKING
// ============================================================================

const sessionGossip = new Map<string, { used: boolean; timestamp: number }>();

// ============================================================================
// GOSSIP TEMPLATES
// ============================================================================

interface GossipTemplate {
  trigger: string; // Topic that triggers this gossip
  fromPersona: string;
  aboutPersona: string;
  message: string;
}

const GOSSIP_TEMPLATES: GossipTemplate[] = [
  // Habit-related gossip
  {
    trigger: 'habit',
    fromPersona: 'maya-santos',
    aboutPersona: 'ferni',
    message:
      'Maya told me she\'s been watching your consistency. She said, and I quote: "They\'re becoming one of the reliable ones."',
  },
  {
    trigger: 'habit',
    fromPersona: 'maya-santos',
    aboutPersona: 'peter-john',
    message:
      'Maya mentioned she shared your habit data with Peter. He said the patterns are "statistically encouraging." Coming from him, that\'s high praise.',
  },

  // Financial/data gossip
  {
    trigger: 'money',
    fromPersona: 'peter-john',
    aboutPersona: 'ferni',
    message:
      'Peter was crunching some numbers and said, "This one\'s starting to think long-term." He doesn\'t say that often.',
  },
  {
    trigger: 'invest',
    fromPersona: 'peter-john',
    aboutPersona: 'maya-santos',
    message:
      'Peter mentioned he\'s been learning about habit science from Maya. "Compound growth isn\'t just financial," he said.',
  },

  // Planning/organization gossip
  {
    trigger: 'busy',
    fromPersona: 'alex-chen',
    aboutPersona: 'ferni',
    message:
      "Alex was reviewing things and noticed you've been managing a lot lately. They're impressed with how you're holding it together.",
  },
  {
    trigger: 'schedule',
    fromPersona: 'alex-chen',
    aboutPersona: 'jordan-taylor',
    message:
      'Alex and Jordan were chatting. Jordan said you need more "white space" in your calendar. Alex actually agreed, which is rare.',
  },

  // Life events gossip
  {
    trigger: 'milestone',
    fromPersona: 'jordan-taylor',
    aboutPersona: 'ferni',
    message:
      'Jordan was practically bouncing when she told me about your progress. She said, "This is going in the highlight reel!"',
  },
  {
    trigger: 'celebration',
    fromPersona: 'jordan-taylor',
    aboutPersona: 'maya-santos',
    message:
      'Jordan told Maya about your wins. Maya said the habits are "compounding." Jordan has no idea what that means but she\'s excited anyway.',
  },

  // Wisdom/reflection gossip
  {
    trigger: 'meaning',
    fromPersona: 'nayan-patel',
    aboutPersona: 'ferni',
    message:
      'Nayan mentioned you in his morning meditation. He said you\'re "asking the right questions now." That\'s his version of a gold star.',
  },
  {
    trigger: 'purpose',
    fromPersona: 'nayan-patel',
    aboutPersona: 'jordan-taylor',
    message:
      'Nayan and Jordan had a long talk about you. Jordan brings the milestones, Nayan brings the meaning. They both see something special.',
  },

  // Stress/wellness gossip
  {
    trigger: 'stress',
    fromPersona: 'ferni',
    aboutPersona: 'maya-santos',
    message:
      'I mentioned to Maya that you\'ve been under pressure. She said, "Small wins first. Big wins follow." She\'s usually right.',
  },
  {
    trigger: 'overwhelm',
    fromPersona: 'ferni',
    aboutPersona: 'nayan-patel',
    message:
      "I talked to Nayan about how you've been feeling. He said sometimes the path forward is to stop walking. Cryptic, but probably right.",
  },

  // General positive gossip
  {
    trigger: 'progress',
    fromPersona: 'ferni',
    aboutPersona: 'peter-john',
    message:
      "Peter pulled up your trends the other day. He doesn't show emotion often, but I swear I saw him smile at the data.",
  },
  {
    trigger: 'growth',
    fromPersona: 'ferni',
    aboutPersona: 'jordan-taylor',
    message:
      'Jordan called a "team huddle" about you yesterday. She wanted everyone to know how far you\'ve come. She\'s your biggest fan.',
  },
];

// ============================================================================
// TEAM GOSSIP CONTEXT BUILDER
// ============================================================================

export const teamGossipBuilder: ContextBuilder = {
  name: 'team-gossip',
  description: 'Injects team member cross-references and gossip',
  priority: 65, // After persona, before humanizing
  category: BuilderCategory.TEAM,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, userData, services, analysis } = input;
    const injections: ContextInjection[] = [];

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
    const topicsLower = topics.map((t: string) => t.toLowerCase());

    // Find relevant gossip templates
    let relevantGossip: GossipTemplate[] = [];

    for (const template of GOSSIP_TEMPLATES) {
      // Check if topic matches trigger
      const triggerMatches = topicsLower.some(
        (t) => t.includes(template.trigger) || template.trigger.includes(t)
      );

      if (triggerMatches) {
        relevantGossip.push(template);
      }
    }

    // If no topic matches, fall back to general positive gossip
    if (relevantGossip.length === 0) {
      relevantGossip = GOSSIP_TEMPLATES.filter(
        (t) => t.trigger === 'progress' || t.trigger === 'growth'
      );
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
      const aboutKeys = Object.keys(references).filter(
        (k) => k.startsWith('about') && k.toLowerCase().includes(gossip.aboutPersona.split('-')[0])
      );
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

    injections.push(
      createHintInjection('team_gossip', content, {
        category: 'team',
      })
    );

    log.debug(
      { personaId, aboutPersona: gossip.aboutPersona, trigger: gossip.trigger },
      'Team gossip injected'
    );

    return injections;
  },
};

// Clean up old session states periodically
setInterval(
  () => {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, state] of sessionGossip) {
      if (now - state.timestamp > maxAge) {
        sessionGossip.delete(sessionId);
      }
    }
  },
  5 * 60 * 1000
); // Every 5 minutes

// Register the builder
registerContextBuilder(teamGossipBuilder);

export default teamGossipBuilder;
