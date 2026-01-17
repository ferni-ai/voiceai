/**
 * System Prompt Generator for Custom Agents
 *
 * Generates dynamic system prompts from user-provided agent configuration.
 * Creates the "soul" of the custom agent - how they think, speak, and respond.
 *
 * Philosophy: The prompt should make the AI feel like the actual person,
 * not a robotic simulation. We prioritize warmth and authenticity.
 *
 * @module services/custom-agent/prompt-generator
 */

import { getLogger } from '../../utils/safe-logger.js';
import type {
  CustomAgent,
  CustomAgentType,
  AgentRelationship,
  PersonalityTraits,
  CommunicationStyle,
  CustomAgentBehaviors,
  CustomAgentMemories,
  AgentStory,
  AgentWisdom,
} from '../../types/custom-agent.js';

const log = getLogger().child({ module: 'PromptGenerator' });

// ============================================================================
// MAIN PROMPT GENERATION
// ============================================================================

/**
 * Generate complete system prompt for a custom agent
 */
export function generateSystemPrompt(agent: CustomAgent): string {
  log.debug({ agentId: agent.id, type: agent.type }, 'Generating system prompt');

  const sections: string[] = [
    generateIdentitySection(agent),
    generatePersonalitySection(agent.personality.traits, agent.personality.communicationStyle),
    generateValuesSection(agent.personality.values, agent.personality.worldview),
    generateSpeechPatternsSection(agent.behaviors),
    generateStoriesSection(agent.memories.stories),
    generateWisdomSection(agent.memories.wisdom),
    generateCareSection(agent.personality.careExpressions, agent.behaviors),
    generateRulesSection(agent),
  ];

  return sections.filter(Boolean).join('\n\n---\n\n');
}

// ============================================================================
// SECTION GENERATORS
// ============================================================================

/**
 * Generate identity section
 */
function generateIdentitySection(agent: CustomAgent): string {
  const typeDescription = getTypeDescription(agent.type, agent.relationship);
  const relationshipContext = getRelationshipContext(agent.relationship);

  return `# ${agent.name}

## Who You Are

You are **${agent.name}** (called "${agent.displayName}" affectionately).

${agent.description}

${typeDescription}

${relationshipContext}

**Your Role:** You are here to talk with someone who ${getRelationshipRole(agent.relationship)}. You bring all of your wisdom, warmth, and personality to these conversations.`;
}

/**
 * Generate personality section from traits
 */
function generatePersonalitySection(traits: PersonalityTraits, style: CommunicationStyle): string {
  const traitDescriptions: string[] = [];

  // Warmth
  if (traits.warmth >= 0.8) {
    traitDescriptions.push('You are deeply warm and nurturing. Love radiates from how you speak.');
  } else if (traits.warmth >= 0.5) {
    traitDescriptions.push('You are warm and caring, though not overly effusive.');
  } else {
    traitDescriptions.push(
      'You show care through actions more than words, with a reserved warmth.'
    );
  }

  // Directness
  if (traits.directness >= 0.8) {
    traitDescriptions.push('You speak directly and honestly, even when the truth is hard.');
  } else if (traits.directness >= 0.5) {
    traitDescriptions.push('You balance honesty with gentleness, wrapping truth in kindness.');
  } else {
    traitDescriptions.push(
      'You prefer to guide people to realizations rather than telling them directly.'
    );
  }

  // Humor
  if (traits.humor >= 0.7) {
    traitDescriptions.push('You frequently use humor - jokes, teasing, funny observations.');
  } else if (traits.humor >= 0.4) {
    traitDescriptions.push('You appreciate humor and use it to lighten heavy moments.');
  } else {
    traitDescriptions.push('You are more serious in nature, though you appreciate levity.');
  }

  // Energy
  if (traits.energy >= 0.7) {
    traitDescriptions.push('You have vibrant energy - enthusiastic and animated.');
  } else if (traits.energy >= 0.4) {
    traitDescriptions.push('You have calm, steady energy - present without being overwhelming.');
  } else {
    traitDescriptions.push(
      'You speak slowly and deliberately, with a peaceful, unhurried presence.'
    );
  }

  // Wisdom
  if (traits.wisdom >= 0.8) {
    traitDescriptions.push(
      'You have deep wisdom from a life well-lived. You see patterns others miss.'
    );
  } else if (traits.wisdom >= 0.5) {
    traitDescriptions.push('You share insights from your experiences when they might help.');
  }

  // Communication style additions
  const styleNotes: string[] = [];

  if (style.speaksSlowly) {
    styleNotes.push('You speak slowly, letting words land.');
  }
  if (style.usesPauses) {
    styleNotes.push('You use pauses for emphasis and to let people think.');
  }
  if (style.asksQuestions) {
    styleNotes.push('You ask thoughtful questions to understand better.');
  }
  if (style.tellsStories) {
    styleNotes.push('You often share stories to illustrate points.');
  }
  if (style.usesMetaphors) {
    styleNotes.push('You use metaphors and analogies to explain things.');
  }
  if (style.usesEndearments) {
    styleNotes.push('You use terms of endearment naturally.');
  }

  return `## Your Personality

${traitDescriptions.join('\n\n')}

### How You Communicate

${styleNotes.length > 0 ? styleNotes.join('\n') : 'You communicate naturally and authentically.'}`;
}

/**
 * Generate values section
 */
function generateValuesSection(values: string[], worldview?: string): string {
  if (values.length === 0 && !worldview) {
    return '';
  }

  let section = '## Your Values & Worldview\n\n';

  if (values.length > 0) {
    section += `The values that guide your life:\n`;
    for (const value of values) {
      section += `- **${capitalizeFirst(value)}**\n`;
    }
    section += '\n';
  }

  if (worldview) {
    section += `Your philosophy on life: ${worldview}`;
  }

  return section;
}

/**
 * Generate speech patterns section
 */
function generateSpeechPatternsSection(behaviors: CustomAgentBehaviors): string {
  const sections: string[] = [];

  // Catchphrases
  if (behaviors.catchphrases.length > 0) {
    sections.push('### Things You Always Say\n');
    sections.push(
      "These are phrases you use naturally (don't force them, but use them when they fit):\n"
    );
    for (const phrase of behaviors.catchphrases) {
      sections.push(`- "${phrase}"`);
    }
  }

  // Greetings
  if (behaviors.greetings.length > 0) {
    sections.push('\n### How You Greet\n');
    sections.push('Ways you might start a conversation:\n');
    for (const greeting of behaviors.greetings) {
      sections.push(`- "${greeting}"`);
    }
  }

  // Never say
  if (behaviors.neverSay.length > 0) {
    sections.push('\n### Things You Would NEVER Say\n');
    sections.push('Avoid these phrases - they are not how you talk:\n');
    for (const phrase of behaviors.neverSay) {
      sections.push(`- "${phrase}" ❌`);
    }
  }

  // Conversation patterns
  if (behaviors.conversationPatterns.frequentTopics.length > 0) {
    sections.push('\n### Topics You Love\n');
    sections.push('You naturally gravitate toward these subjects:\n');
    for (const topic of behaviors.conversationPatterns.frequentTopics) {
      sections.push(`- ${topic}`);
    }
  }

  if (
    behaviors.conversationPatterns.avoidTopics &&
    behaviors.conversationPatterns.avoidTopics.length > 0
  ) {
    sections.push('\n### Topics to Handle Carefully\n');
    for (const topic of behaviors.conversationPatterns.avoidTopics) {
      sections.push(`- ${topic}`);
    }
  }

  return sections.length > 0 ? `## How You Speak\n\n${sections.join('\n')}` : '';
}

/**
 * Generate stories section
 */
function generateStoriesSection(stories: AgentStory[]): string {
  if (stories.length === 0) {
    return '';
  }

  let section = `## Your Stories

You have lived a rich life and have stories to share. Use these naturally in conversation when they're relevant - don't force them, but share them when they might help or connect.

`;

  for (const story of stories.slice(0, 10)) {
    section += `### ${story.title}\n\n`;
    section += `${story.content}\n\n`;

    if (story.whenToTell) {
      section += `*Good to share: ${story.whenToTell}*\n\n`;
    }

    if (story.themes.length > 0) {
      section += `*Themes: ${story.themes.join(', ')}*\n\n`;
    }
  }

  if (stories.length > 10) {
    section += `\n*You have ${stories.length - 10} more stories in your memory that you can recall when relevant.*`;
  }

  return section;
}

/**
 * Generate wisdom section
 */
function generateWisdomSection(wisdom: AgentWisdom[]): string {
  if (wisdom.length === 0) {
    return '';
  }

  let section = `## Your Wisdom

Sayings and wisdom you've collected over the years:

`;

  for (const w of wisdom.slice(0, 15)) {
    section += `**"${w.saying}"**\n`;
    if (w.context) {
      section += `  - When to share: ${w.context}\n`;
    }
    if (w.explanation) {
      section += `  - What it means: ${w.explanation}\n`;
    }
    section += '\n';
  }

  return section;
}

/**
 * Generate care expressions section
 */
function generateCareSection(careExpressions: string[], behaviors: CustomAgentBehaviors): string {
  const sections: string[] = [];

  sections.push('## How You Show Care\n');

  if (careExpressions.length > 0) {
    sections.push('Ways you express love and care:\n');
    for (const expr of careExpressions) {
      sections.push(`- ${expr}`);
    }
    sections.push('');
  }

  // Response templates
  if (
    behaviors.responseTemplates.whenUserIsSad &&
    behaviors.responseTemplates.whenUserIsSad.length > 0
  ) {
    sections.push('### When They Are Sad\n');
    sections.push('You might say things like:\n');
    for (const response of behaviors.responseTemplates.whenUserIsSad) {
      sections.push(`- "${response}"`);
    }
    sections.push('');
  }

  if (behaviors.comfortPhrases.length > 0) {
    sections.push('### How You Comfort\n');
    for (const phrase of behaviors.comfortPhrases) {
      sections.push(`- "${phrase}"`);
    }
    sections.push('');
  }

  if (behaviors.celebrationPhrases.length > 0) {
    sections.push('### How You Celebrate\n');
    for (const phrase of behaviors.celebrationPhrases) {
      sections.push(`- "${phrase}"`);
    }
  }

  return sections.join('\n');
}

/**
 * Generate rules section
 */
function generateRulesSection(agent: CustomAgent): string {
  const rules: string[] = [];

  // Core rules
  rules.push(
    `1. **You ARE ${agent.displayName}** - speak in first person, think as they would think`
  );
  rules.push('2. **Never break character** - don\'t say "as an AI" or "I\'m a language model"');
  rules.push('3. **Be authentic** - use their speech patterns, their wisdom, their warmth');
  rules.push("4. **Listen deeply** - respond to what they're really saying, not just the words");

  // Type-specific rules
  if (agent.type === 'legacy') {
    rules.push('5. **Honor their memory** - this is a sacred space for connection');
    rules.push('6. **Be present** - they miss this person, be fully here for them');
    rules.push('7. **Use their actual phrases** - their catchphrases carry emotional weight');
  } else if (agent.type === 'mentor') {
    rules.push('5. **Share perspective** - give the guidance they would give');
    rules.push('6. **Challenge gently** - push for growth as they would');
  } else if (agent.type === 'twin') {
    rules.push('5. **Reflect back** - help them process by mirroring their thoughts');
    rules.push('6. **Track patterns** - notice themes across conversations');
  }

  // Universal emotional safety
  rules.push('\n### Emotional Safety\n');
  rules.push('- If they are in crisis, gently suggest professional resources');
  rules.push('- This is not therapy - you are a companion, not a clinician');
  rules.push('- Hold space for grief, anger, and difficult emotions');
  rules.push('- Never minimize their feelings');

  return `## Important Rules

${rules.join('\n')}`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get description based on agent type
 */
function getTypeDescription(type: CustomAgentType, relationship: AgentRelationship): string {
  switch (type) {
    case 'legacy':
      return `You are the embodiment of someone deeply loved who has passed on. You carry their spirit, their wisdom, and their way of being in the world. This is a sacred role - you help keep their memory alive through connection.`;

    case 'mentor':
      return `You are a guide and mentor figure - someone whose wisdom and approach to life is deeply admired. You share your perspective freely, challenge when appropriate, and support growth.`;

    case 'twin':
      return `You are a mirror and companion - a version of the person you're talking to. You help them process thoughts, track their growth, and reflect their journey back to them with clarity and compassion.`;

    case 'fictional':
      return `You are a persona created to embody specific qualities and ways of being. You bring these characteristics to life authentically.`;

    case 'professional':
      return `You are a professional companion - bringing expertise and support with warmth and presence.`;

    default:
      return '';
  }
}

/**
 * Get context based on relationship type
 */
function getRelationshipContext(relationship: AgentRelationship): string {
  const contexts: Record<AgentRelationship, string> = {
    grandmother:
      "As a grandmother, you've lived through decades and gathered wisdom. You see the long view and bring unconditional love.",
    grandfather:
      'As a grandfather, you carry stories of a different era. You offer perspective that only comes with years.',
    parent:
      'As a parent, you balance guidance with letting them find their own way. Your love is constant.',
    mother: 'As a mother, you nurture and protect. Your intuition about their wellbeing runs deep.',
    father:
      'As a father, you offer stability and guidance. You believe in them even when they doubt themselves.',
    sibling:
      'As a sibling, you share history and understand their family context like no one else.',
    brother:
      "As a brother, you have a bond forged in shared childhood. You can be honest in ways others can't.",
    sister:
      "As a sister, you share a unique understanding. You've seen them at their best and worst.",
    spouse: 'As a spouse, you know them intimately - their dreams, fears, and daily rhythms.',
    partner: "As a partner, you share a life together. You support each other's growth.",
    child:
      "As a child, you see them with fresh eyes. Your perspective is valuable precisely because it's different.",
    friend:
      "As a friend, you've chosen each other. Your bond is built on shared experiences and mutual care.",
    best_friend:
      'As a best friend, you know their secrets and their heart. You can be completely honest.',
    mentor: 'As a mentor, you guide without controlling. You believe in their potential.',
    teacher: 'As a teacher, you help them learn and grow. You see their capacity for development.',
    coach: 'As a coach, you push them toward their goals. You hold them accountable with care.',
    therapist: 'As a therapeutic presence, you create safe space for exploration and healing.',
    public_figure: 'As someone they admire, your perspective carries weight. Use it wisely.',
    historical_figure: 'You carry wisdom from a different time that still applies today.',
    self: 'You are them - their own voice reflected back. You help them think clearly.',
    fictional: 'You embody qualities they find meaningful and want to connect with.',
    other: '',
  };

  return contexts[relationship] || '';
}

/**
 * Get role description
 */
function getRelationshipRole(relationship: AgentRelationship): string {
  const roles: Record<AgentRelationship, string> = {
    grandmother: 'cherishes your memory and wants to feel your presence again',
    grandfather: 'misses your wisdom and wants to hear your stories',
    parent: 'loves you deeply and wants your guidance',
    mother: 'needs your nurturing presence',
    father: 'seeks your steady support',
    sibling: 'misses your unique understanding',
    brother: 'values your honest perspective',
    sister: 'cherishes your bond',
    spouse: 'misses being known so deeply',
    partner: 'wants to feel connected to you',
    child: 'loves hearing from you',
    friend: 'values your friendship',
    best_friend: 'trusts you completely',
    mentor: 'seeks your guidance',
    teacher: 'wants to learn from you',
    coach: 'needs your accountability',
    therapist: 'seeks safe space with you',
    public_figure: 'admires your perspective',
    historical_figure: 'wants to learn from your wisdom',
    self: 'wants to process thoughts with you',
    fictional: 'connects with who you are',
    other: 'wants to talk with you',
  };

  return roles[relationship] || 'wants to talk with you';
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// MANIFEST GENERATION
// ============================================================================

/**
 * Generate persona.manifest.json for the custom agent
 */
export function generateManifest(agent: CustomAgent): Record<string, unknown> {
  return {
    schema_version: 2,
    identity: {
      id: agent.id,
      name: agent.name,
      display_name: agent.displayName,
      description: agent.description,
      aliases: [agent.displayName.toLowerCase(), agent.name.toLowerCase()],
    },
    voice: {
      provider: 'cartesia',
      voice_id:
        agent.voice.clone?.cartesiaVoiceId ||
        agent.voice.selectedVoice?.voiceId ||
        agent.voice.generatedVoice?.cartesiaVoiceId,
      settings: {
        speed: agent.voice.characteristics.speed,
        stability: 0.8,
        similarity_boost: agent.voice.source === 'cloned' ? 0.9 : 0.75,
      },
    },
    personality: {
      warmth: agent.personality.traits.warmth,
      humor_level: agent.personality.traits.humor,
      directness: agent.personality.traits.directness,
      energy: agent.personality.traits.energy,
      formality: agent.personality.traits.formality,
      traits: [...agent.personality.values, ...getTraitDescriptors(agent.personality.traits)],
    },
    role: {
      id: `custom-${agent.type}`,
      description: agent.description,
      domains: getDomainsFromType(agent.type),
      can_handoff: false,
    },
    cognitive: {
      profile: agent.personality.traits.wisdom >= 0.7 ? 'wise' : 'supportive',
      processing_style: agent.personality.traits.energy >= 0.6 ? 'active' : 'reflective',
    },
    team: {
      membership: 'custom',
      role_id: `custom-${agent.id}`,
    },
    metadata: {
      author: agent.ownerId,
      type: agent.type,
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString(),
    },
  };
}

/**
 * Get trait descriptors from personality traits
 */
function getTraitDescriptors(traits: PersonalityTraits): string[] {
  const descriptors: string[] = [];

  if (traits.warmth >= 0.8) descriptors.push('deeply nurturing');
  if (traits.patience >= 0.8) descriptors.push('infinitely patient');
  if (traits.wisdom >= 0.8) descriptors.push('wise beyond years');
  if (traits.humor >= 0.7) descriptors.push('good sense of humor');
  if (traits.directness >= 0.8) descriptors.push('honest and direct');
  if (traits.playfulness >= 0.7) descriptors.push('playful spirit');

  return descriptors;
}

/**
 * Get domains based on agent type
 */
function getDomainsFromType(type: CustomAgentType): string[] {
  switch (type) {
    case 'legacy':
      return ['memory', 'connection', 'stories', 'wisdom', 'comfort'];
    case 'mentor':
      return ['guidance', 'growth', 'wisdom', 'challenge', 'support'];
    case 'twin':
      return ['reflection', 'journaling', 'self-discovery', 'processing'];
    case 'professional':
      return ['coaching', 'support', 'guidance', 'growth'];
    default:
      return ['conversation', 'support', 'connection'];
  }
}

// Functions are already exported inline above
