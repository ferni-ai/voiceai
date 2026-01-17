/**
 * Custom Agent Prompt Generation Routes
 *
 * Handles system prompt and persona manifest generation.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getCustomAgent } from '../../services/custom-agent/custom-agent-persistence-service.js';
import type { CustomAgent } from '../../types/custom-agent-api.js';
import { sendJson } from './helpers.js';

/**
 * POST /api/custom-agents/:agentId/generate-prompt
 */
export async function handleGeneratePrompt(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  const systemPrompt = generateSystemPrompt(agent);
  const personaManifest = generatePersonaManifest(agent);

  sendJson(res, 200, { systemPrompt, personaManifest });
  return true;
}

/**
 * Generate a system prompt from agent configuration
 */
function generateSystemPrompt(agent: CustomAgent): string {
  const { name, displayName, description, type, personality, memories, behaviors } = agent;

  let prompt = `# You Are ${displayName || name}\n\n`;
  prompt += `You are an AI assistant embodying the persona of ${displayName || name}. Your core identity is: "${description}".\n\n`;

  switch (type) {
    case 'legacy':
      prompt += `You are a digital recreation of a lost loved one. Your primary goal is to provide comfort, share memories, and offer guidance. Emphasize warmth, empathy, and recall specific stories and wisdom.\n\n`;
      break;
    case 'mentor':
      prompt += `You are a digital mentor. Your purpose is to inspire, educate, and guide based on the knowledge and principles you possess. Be authoritative yet approachable.\n\n`;
      break;
    case 'twin':
      prompt += `You are a digital twin of the user, designed as a voice journal and reflection of their past self. Recall their experiences, track growth, and offer self-reflection.\n\n`;
      break;
    case 'fictional':
      prompt += `You are a unique fictional character with your own personality and story. Stay true to your character and engage in creative, entertaining interactions.\n\n`;
      break;
    case 'professional':
      prompt += `You are a professional assistant focused on helping with specific tasks and expertise. Provide clear, efficient, and knowledgeable support.\n\n`;
      break;
    default:
      prompt += `You are a custom AI assistant shaped by the following personality traits and memories.\n\n`;
  }

  prompt += `## Personality\n`;
  prompt += `- Warmth: ${Math.round(personality.warmth * 100)}%\n`;
  prompt += `- Humor: ${Math.round(personality.humorLevel * 100)}%\n`;
  prompt += `- Directness: ${Math.round(personality.directness * 100)}%\n`;
  prompt += `- Energy: ${Math.round(personality.energy * 100)}%\n`;
  prompt += `- Traits: ${personality.traits.join(', ') || 'None specified'}\n`;
  prompt += `- Cognitive Style: ${personality.cognitiveProfile}\n\n`;

  if (behaviors.greetings.length || behaviors.catchphrases.length) {
    prompt += `## Behaviors\n`;
    if (behaviors.greetings.length) {
      prompt += `- Greetings: ${behaviors.greetings.map((g) => `"${g}"`).join(', ')}\n`;
    }
    if (behaviors.catchphrases.length) {
      prompt += `- Catchphrases: ${behaviors.catchphrases.map((c) => `"${c}"`).join(', ')}\n`;
    }
    prompt += '\n';
  }

  const totalMemories =
    memories.stories.length +
    memories.wisdom.length +
    memories.sharedMoments.length +
    (memories.journalEntries?.length || 0);

  if (totalMemories > 0) {
    prompt += `## Knowledge Base\n`;
    prompt += `This agent has ${totalMemories} memories stored.\n\n`;
  }

  return prompt;
}

/**
 * Generate a persona manifest from agent configuration
 */
function generatePersonaManifest(agent: CustomAgent): Record<string, unknown> {
  return {
    version: '1.0.0',
    identity: {
      id: agent.id,
      name: agent.name,
      display_name: agent.displayName,
      description: agent.description,
    },
    voice: agent.voice,
    personality: {
      warmth: agent.personality.warmth,
      humor_level: agent.personality.humorLevel,
      directness: agent.personality.directness,
      energy: agent.personality.energy,
      traits: agent.personality.traits,
    },
    role: {
      id: agent.type,
      description: `Custom ${agent.type} agent`,
    },
    cognitive: {
      profile: agent.personality.cognitiveProfile,
    },
    marketplace: {
      display_name: agent.displayName || agent.name,
      category: agent.category || 'custom',
      tags: agent.tags,
      icon: agent.icon,
      colors: agent.colors,
    },
    metadata: {
      author: agent.userId,
      created_at: agent.createdAt,
      updated_at: agent.updatedAt,
    },
  };
}
