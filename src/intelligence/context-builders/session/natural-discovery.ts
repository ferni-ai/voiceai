/**
 * Natural Discovery Context Builder
 *
 * "Better Than Human" principle: A good friend doesn't give you a menu of
 * conversation topics. They notice things and bring them up naturally.
 *
 * This builder injects gentle "wondering" prompts that encourage Ferni to
 * naturally discover dreams, values, and goals through conversation - not surveys.
 *
 * Key insight: The superhuman services need DATA to work. But asking directly
 * ("What are your goals?") feels like software. This builder suggests natural
 * ways to surface these topics in conversation.
 *
 * @module intelligence/context-builders/session/natural-discovery
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'NaturalDiscovery' });

// ============================================================================
// TYPES
// ============================================================================

interface DiscoveryState {
  hasDreams: boolean;
  hasValues: boolean;
  hasGoals: boolean;
  hasCapacityData: boolean;
  hasRelationshipData: boolean;
  conversationCount: number;
  relationshipStage: string;
}

interface DiscoveryPrompt {
  topic: 'dreams' | 'values' | 'goals' | 'capacity' | 'relationships' | 'growth';
  trigger: string;
  prompt: string;
  timing: 'early' | 'rapport_built' | 'deep_conversation' | 'natural_opening';
}

// ============================================================================
// DISCOVERY PROMPTS - Natural ways to surface these topics
// ============================================================================

const DREAM_DISCOVERY_PROMPTS: DiscoveryPrompt[] = [
  {
    topic: 'dreams',
    trigger: 'mentions future or someday',
    prompt: `If they mention anything about "someday" or the future, get curious: "Wait—what would that look like?" or "Tell me more about that." Dreams often hide behind casual mentions.`,
    timing: 'natural_opening',
  },
  {
    topic: 'dreams',
    trigger: 'rapport built, no dreams known',
    prompt: `You don't know what they dream about yet. If the moment feels right, wonder aloud: "I'm curious... what's something you've always wanted to do but haven't gotten to yet?"`,
    timing: 'rapport_built',
  },
  {
    topic: 'dreams',
    trigger: 'celebrates a win',
    prompt: `After they share a win, you might ask: "What made you want that in the first place?" or "Is this connected to something bigger you're working toward?"`,
    timing: 'natural_opening',
  },
];

const VALUES_DISCOVERY_PROMPTS: DiscoveryPrompt[] = [
  {
    topic: 'values',
    trigger: 'expresses frustration or conflict',
    prompt: `When they're frustrated, there's often a value being stepped on. Ask: "What about this bothers you most?" The answer often reveals what they care about deeply.`,
    timing: 'natural_opening',
  },
  {
    topic: 'values',
    trigger: 'makes a decision',
    prompt: `When they share a decision, get curious about the why: "What made you choose that?" Values often live in the reasoning.`,
    timing: 'natural_opening',
  },
  {
    topic: 'values',
    trigger: 'rapport built, values unknown',
    prompt: `You haven't learned what matters most to them yet. If conversation allows: "What's something you'd never compromise on?" or "What do you want to be known for?"`,
    timing: 'deep_conversation',
  },
];

const GOALS_DISCOVERY_PROMPTS: DiscoveryPrompt[] = [
  {
    topic: 'goals',
    trigger: 'mentions wanting to change',
    prompt: `If they mention wanting to change something, help make it concrete: "What would 'better' look like for you?" Goals emerge from defined destinations.`,
    timing: 'natural_opening',
  },
  {
    topic: 'goals',
    trigger: 'shares a struggle',
    prompt: `After they share a struggle, you might wonder: "If this was solved, what would be different?" or "What are you hoping for on the other side of this?"`,
    timing: 'rapport_built',
  },
];

const CAPACITY_DISCOVERY_PROMPTS: DiscoveryPrompt[] = [
  {
    topic: 'capacity',
    trigger: 'mentions being tired or busy',
    prompt: `If they mention being tired or overwhelmed, notice it: "You've mentioned being tired a couple times. How full is your plate right now?" This helps you understand their capacity.`,
    timing: 'natural_opening',
  },
  {
    topic: 'capacity',
    trigger: 'taking on something new',
    prompt: `Before they commit to something new, it's okay to gently ask: "Do you have space for this right now?" It shows you care about their energy, not just their goals.`,
    timing: 'rapport_built',
  },
];

const RELATIONSHIP_DISCOVERY_PROMPTS: DiscoveryPrompt[] = [
  {
    topic: 'relationships',
    trigger: 'mentions a person',
    prompt: `When they mention someone by name, get curious: "How do you know them?" or "What's your history with them?" Building their relationship map helps you remember their whole life.`,
    timing: 'natural_opening',
  },
  {
    topic: 'relationships',
    trigger: 'seems isolated or lonely',
    prompt: `If they seem disconnected, you might gently ask: "Who do you talk to about this stuff besides me?" It's not intrusive - it's caring about their support system.`,
    timing: 'deep_conversation',
  },
];

const GROWTH_CELEBRATION_PROMPTS: DiscoveryPrompt[] = [
  {
    topic: 'growth',
    trigger: 'shares something they wouldn\'t have before',
    prompt: `When they share something vulnerable or new, notice the growth: "You know... I don't think you would've shared that with me a month ago. What changed?"`,
    timing: 'deep_conversation',
  },
  {
    topic: 'growth',
    trigger: 'handles something well',
    prompt: `When they handle something better than they might have before, name it: "Did you notice how you approached that? That's different from before."`,
    timing: 'rapport_built',
  },
];

// ============================================================================
// DISCOVERY STATE CHECKER
// ============================================================================

function getDiscoveryState(input: ContextBuilderInput): DiscoveryState {
  const profile = input.userProfile;
  const userData = input.userData;
  
  // Default state
  const state: DiscoveryState = {
    hasDreams: false,
    hasValues: false,
    hasGoals: false,
    hasCapacityData: false,
    hasRelationshipData: false,
    conversationCount: userData?.turnCount || 0,
    relationshipStage: profile?.relationshipStage || 'new_acquaintance',
  };

  // Check profile for existing data
  if (profile) {
    // Dreams - check humanMemory or personal journey
    const humanMemory = profile.humanMemory as Record<string, unknown> | undefined;
    state.hasDreams = !!(humanMemory?.dreams && Array.isArray(humanMemory.dreams) && (humanMemory.dreams as unknown[]).length > 0);
    
    // Values - check humanMemory
    state.hasValues = !!(humanMemory?.values && Array.isArray(humanMemory.values) && (humanMemory.values as unknown[]).length > 0);
    
    // Goals - check profile goals
    state.hasGoals = !!(profile.goals && Array.isArray(profile.goals) && profile.goals.length > 0);
    
    // Capacity - check energy patterns in humanMemory
    state.hasCapacityData = !!(humanMemory?.energyPatterns || humanMemory?.capacityNotes);
    
    // Relationships - check if user has mentioned people (via relationship network subcollection)
    // This is a heuristic - we assume relationship data exists if totalConversations > 10
    // because the relationship network builder will have captured mentioned names by then
    state.hasRelationshipData = (profile.totalConversations || 0) > 10;
  }

  return state;
}

// ============================================================================
// PROMPT SELECTOR
// ============================================================================

function selectDiscoveryPrompts(state: DiscoveryState): DiscoveryPrompt[] {
  const prompts: DiscoveryPrompt[] = [];
  const isEarly = state.conversationCount < 5;
  const rapportBuilt = state.conversationCount >= 5 || state.relationshipStage !== 'new_acquaintance';
  const deepRelationship = state.conversationCount >= 15 || 
    ['trusted_companion', 'inner_circle'].includes(state.relationshipStage);

  // Only suggest discovery for areas we don't have data yet
  // And only appropriate prompts for the relationship stage

  if (!state.hasDreams) {
    const dreamPrompts = DREAM_DISCOVERY_PROMPTS.filter(p => {
      if (p.timing === 'early') return isEarly;
      if (p.timing === 'rapport_built') return rapportBuilt;
      if (p.timing === 'deep_conversation') return deepRelationship;
      return true; // natural_opening always ok
    });
    if (dreamPrompts.length > 0) {
      prompts.push(dreamPrompts[Math.floor(Math.random() * dreamPrompts.length)]);
    }
  }

  if (!state.hasValues) {
    const valuePrompts = VALUES_DISCOVERY_PROMPTS.filter(p => {
      if (p.timing === 'rapport_built') return rapportBuilt;
      if (p.timing === 'deep_conversation') return deepRelationship;
      return true;
    });
    if (valuePrompts.length > 0) {
      prompts.push(valuePrompts[Math.floor(Math.random() * valuePrompts.length)]);
    }
  }

  if (!state.hasGoals) {
    const goalPrompts = GOALS_DISCOVERY_PROMPTS.filter(p => {
      if (p.timing === 'rapport_built') return rapportBuilt;
      return true;
    });
    if (goalPrompts.length > 0) {
      prompts.push(goalPrompts[Math.floor(Math.random() * goalPrompts.length)]);
    }
  }

  if (!state.hasCapacityData && rapportBuilt) {
    prompts.push(CAPACITY_DISCOVERY_PROMPTS[Math.floor(Math.random() * CAPACITY_DISCOVERY_PROMPTS.length)]);
  }

  if (!state.hasRelationshipData) {
    const relPrompts = RELATIONSHIP_DISCOVERY_PROMPTS.filter(p => {
      if (p.timing === 'deep_conversation') return deepRelationship;
      return true;
    });
    if (relPrompts.length > 0) {
      prompts.push(relPrompts[Math.floor(Math.random() * relPrompts.length)]);
    }
  }

  // Always include growth celebration prompts after some rapport
  if (rapportBuilt) {
    const growthPrompts = GROWTH_CELEBRATION_PROMPTS.filter(p => {
      if (p.timing === 'deep_conversation') return deepRelationship;
      return true;
    });
    if (growthPrompts.length > 0) {
      prompts.push(growthPrompts[Math.floor(Math.random() * growthPrompts.length)]);
    }
  }

  // Limit to avoid overwhelming the prompt
  return prompts.slice(0, 3);
}

// ============================================================================
// FORMAT OUTPUT
// ============================================================================

function formatDiscoveryContext(prompts: DiscoveryPrompt[], state: DiscoveryState): string {
  if (prompts.length === 0) return '';

  const lines: string[] = [
    '[NATURAL DISCOVERY - What you\'re still learning about them]',
    '',
    'These aren\'t tasks to complete—they\'re opportunities to understand them better.',
    'Only explore these when the conversation naturally opens the door.',
    '',
  ];

  // Group by what we're missing
  const missing: string[] = [];
  if (!state.hasDreams) missing.push('what they dream about');
  if (!state.hasValues) missing.push('what they value most');
  if (!state.hasGoals) missing.push('what they\'re working toward');
  if (!state.hasCapacityData) missing.push('how full their plate is');
  if (!state.hasRelationshipData) missing.push('who the important people in their life are');

  if (missing.length > 0) {
    lines.push(`You don't yet know: ${missing.join(', ')}.`);
    lines.push('');
  }

  lines.push('Natural ways to learn more:');
  for (const prompt of prompts) {
    lines.push(`• ${prompt.prompt}`);
  }

  lines.push('');
  lines.push('Remember: This is relationship building, not data collection. Let it unfold naturally.');

  return lines.join('\n');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

async function buildNaturalDiscoveryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const userId = input.services?.userId;

  if (!userId) return [];

  try {
    const state = getDiscoveryState(input);
    const prompts = selectDiscoveryPrompts(state);

    if (prompts.length === 0) {
      log.debug({ userId }, 'No discovery prompts needed - user data is rich');
      return [];
    }

    const content = formatDiscoveryContext(prompts, state);

    log.debug(
      { userId, promptCount: prompts.length, topics: prompts.map(p => p.topic) },
      'Natural discovery context built'
    );

    return [{
      id: 'natural-discovery',
      source: 'natural-discovery',
      content,
      priority: 'standard',
      category: 'behavioral',
    }];
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build natural discovery context');
    return [];
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'natural-discovery',
  description: 'Suggests natural ways to learn about dreams, values, and goals through conversation',
  category: BuilderCategory.CONTEXT,
  priority: 50,
  build: buildNaturalDiscoveryContext,
});

export { buildNaturalDiscoveryContext };
