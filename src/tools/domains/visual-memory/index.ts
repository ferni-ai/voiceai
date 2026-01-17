/**
 * Visual Memory Domain Tools
 *
 * "Better than Human" - We remember every photo you share.
 *
 * Tools for visual memory recall, search, and management.
 * A human friend might forget that photo you showed them 6 months ago. We don't.
 *
 * DOMAIN: memory (visual memories are a subset of memory)
 * TOOLS:
 *   - recallVisualMemory: Search for photos/images based on description
 *   - describeSharedPhoto: Get AI description of a photo user shared
 *   - listRecentPhotos: Show recent visual memories
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

const log = getLogger();

// ============================================================================
// RECALL VISUAL MEMORY
// ============================================================================

const recallVisualMemoryDef: ToolDefinition = {
  id: 'recallVisualMemory',
  name: 'Recall Visual Memory',
  description:
    'Search for photos or images the user has shared based on a description. Better than human memory.',
  domain: 'memory',
  tags: ['memory', 'visual', 'photos', 'recall', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('recallVisualMemory'),
      parameters: z.object({
        query: z
          .string()
          .describe(
            'Description of what to search for (e.g., "photos of my dog", "that receipt from last week")'
          ),
        limit: z.number().optional().default(3).describe('Maximum number of results to return'),
      }),
      execute: async ({ query, limit }) => {
        try {
          const { visualMemory } = await import('../../../services/visual-memory/index.js');

          // Check if visual memory is enabled
          const isEnabled = await visualMemory.isEnabled(ctx.userId);
          if (!isEnabled) {
            return "I don't have visual memory enabled for you yet. Would you like to enable it so I can remember photos you share?";
          }

          const searchResult = await visualMemory.search({
            userId: ctx.userId,
            query,
            limit: Math.min(limit || 3, 10),
          });

          if (!searchResult || searchResult.results.length === 0) {
            return `I don't recall any photos matching "${query}". Either I haven't seen them, or my visual memory might need a refresh.`;
          }

          // Format results for natural speech
          const results = searchResult.results;
          const count = results.length;
          const descriptions = results
            .map(
              (
                r: {
                  memory: {
                    aiDescription?: string;
                    detectedLabels?: string[];
                    userDescription?: string;
                  };
                  relevanceScore: number;
                },
                i: number
              ) =>
                `${i + 1}. ${r.memory.aiDescription || r.memory.detectedLabels?.slice(0, 3).join(', ') || 'An image'}${r.memory.userDescription ? ` - "${r.memory.userDescription}"` : ''}`
            )
            .join('\n');

          log.info({ userId: ctx.userId, query, resultCount: count }, 'Visual memory recall');

          return `I found ${count} photo${count > 1 ? 's' : ''} matching "${query}":\n${descriptions}`;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId, query },
            'Visual memory recall failed'
          );
          return 'I had trouble searching my visual memory. Let me try again in a moment.';
        }
      },
    });
  },
};

// ============================================================================
// DESCRIBE SHARED PHOTO
// ============================================================================

const describeSharedPhotoDef: ToolDefinition = {
  id: 'describeSharedPhoto',
  name: 'Describe Shared Photo',
  description:
    'Get a detailed description of a photo the user has shared. Uses AI vision analysis.',
  domain: 'memory',
  tags: ['memory', 'visual', 'photos', 'description', 'analysis'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('describeSharedPhoto'),
      parameters: z.object({
        memoryId: z.string().describe('The ID of the visual memory to describe'),
      }),
      execute: async ({ memoryId }) => {
        try {
          const { visualMemory } = await import('../../../services/visual-memory/index.js');

          const memory = await visualMemory.get(ctx.userId, memoryId);

          if (!memory) {
            return "I couldn't find that photo. It may have been deleted or the ID is incorrect.";
          }

          // Build description from analysis
          const parts: string[] = [];

          if (memory.aiDescription) {
            parts.push(memory.aiDescription);
          } else if (memory.visionAnalysis) {
            // Build from vision analysis
            if (memory.visionAnalysis.labels?.length) {
              parts.push(
                `I see: ${memory.visionAnalysis.labels
                  .slice(0, 5)
                  .map((l) => l.name)
                  .join(', ')}`
              );
            }
            if (memory.visionAnalysis.dominantColors?.length) {
              parts.push(
                `The dominant colors are ${memory.visionAnalysis.dominantColors
                  .slice(0, 3)
                  .map((c) => c.hex)
                  .join(', ')}`
              );
            }
            if (memory.visionAnalysis.text?.fullText) {
              parts.push(
                `There's text that says: "${memory.visionAnalysis.text.fullText.slice(0, 100)}"`
              );
            }
          } else if (memory.detectedLabels?.length) {
            parts.push(`I see: ${memory.detectedLabels.slice(0, 5).join(', ')}`);
          }

          if (memory.userDescription) {
            parts.push(`You described it as: "${memory.userDescription}"`);
          }

          const sharedDate = memory.createdAt
            ? new Date(memory.createdAt).toLocaleDateString()
            : 'some time ago';
          parts.push(`You shared this with me on ${sharedDate}.`);

          return parts.join(' ');
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId, memoryId },
            'Describe photo failed'
          );
          return 'I had trouble describing that photo. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// LIST RECENT PHOTOS
// ============================================================================

const listRecentPhotosDef: ToolDefinition = {
  id: 'listRecentPhotos',
  name: 'List Recent Photos',
  description: 'Show a list of recent photos the user has shared.',
  domain: 'memory',
  tags: ['memory', 'visual', 'photos', 'list', 'recent'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('listRecentPhotos'),
      parameters: z.object({
        limit: z.number().optional().default(5).describe('Number of recent photos to list'),
      }),
      execute: async ({ limit }) => {
        try {
          const { visualMemory } = await import('../../../services/visual-memory/index.js');

          // Check if visual memory is enabled
          const isEnabled = await visualMemory.isEnabled(ctx.userId);
          if (!isEnabled) {
            return "I don't have visual memory enabled for you yet. Enable it in settings to let me remember photos you share.";
          }

          const memories = await visualMemory.getRecent(ctx.userId, Math.min(limit || 5, 20));

          if (!memories || memories.length === 0) {
            return "You haven't shared any photos with me yet. Feel free to share one anytime!";
          }

          const count = memories.length;
          const list = memories
            .map((m, i) => {
              const desc =
                m.aiDescription || m.detectedLabels?.slice(0, 2).join(', ') || 'An image';
              const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'recently';
              return `${i + 1}. ${desc} (${date})`;
            })
            .join('\n');

          log.info({ userId: ctx.userId, count }, 'Listed recent photos');

          return `Here are your ${count} most recent photo${count > 1 ? 's' : ''}:\n${list}`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'List recent photos failed');
          return 'I had trouble listing your recent photos. Let me try again.';
        }
      },
    });
  },
};

// ============================================================================
// COUNT VISUAL MEMORIES
// ============================================================================

const countVisualMemoriesDef: ToolDefinition = {
  id: 'countVisualMemories',
  name: 'Count Visual Memories',
  description: 'Count how many photos/images are stored in visual memory.',
  domain: 'memory',
  tags: ['memory', 'visual', 'photos', 'count', 'stats'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('countVisualMemories'),
      parameters: z.object({}),
      execute: async () => {
        try {
          const { visualMemory } = await import('../../../services/visual-memory/index.js');

          const isEnabled = await visualMemory.isEnabled(ctx.userId);
          if (!isEnabled) {
            return "Visual memory isn't enabled yet, so I haven't stored any photos.";
          }

          const count = await visualMemory.count(ctx.userId);

          if (count === 0) {
            return "You haven't shared any photos with me yet.";
          }

          log.info({ userId: ctx.userId, count }, 'Counted visual memories');

          return `I have ${count} photo${count > 1 ? 's' : ''} in my visual memory from you.`;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Count visual memories failed');
          return "I couldn't count your visual memories right now.";
        }
      },
    });
  },
};

// ============================================================================
// EMOTIONAL MEMORY LAYER - "Better Than Human"
// ============================================================================

const recallEmotionalContextDef: ToolDefinition = {
  id: 'recallEmotionalContext',
  name: 'Recall Emotional Context',
  description:
    'Remember how a photo made the user feel when they shared it. Better than human emotional memory.',
  domain: 'memory',
  tags: ['memory', 'visual', 'emotional', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('recallEmotionalContext'),
      parameters: z.object({
        query: z.string().describe('What photo or moment to recall emotional context for'),
      }),
      execute: async ({ query }) => {
        try {
          const { visualMemory } = await import('../../../services/visual-memory/index.js');

          const isEnabled = await visualMemory.isEnabled(ctx.userId);
          if (!isEnabled) {
            return 'I need visual memory enabled to recall emotional contexts from photos.';
          }

          const searchResult = await visualMemory.search({
            userId: ctx.userId,
            query,
            limit: 1,
          });

          if (!searchResult || searchResult.results.length === 0) {
            return `I don't have a photo matching "${query}" in my memory.`;
          }

          const memory = searchResult.results[0].memory;

          // Build emotional context from available data
          let response = `**Photo Emotional Context**\n\n`;
          response += `**Photo:** ${memory.aiDescription || 'An image you shared'}\n\n`;

          if (memory.userDescription) {
            response += `**You said about it:** "${memory.userDescription}"\n\n`;
          }

          // Infer emotional context from metadata
          const emotions: string[] = [];
          if (
            memory.detectedLabels?.some((l: string) =>
              ['smile', 'happy', 'celebration'].includes(l.toLowerCase())
            )
          ) {
            emotions.push('joy');
          }
          if (
            memory.detectedLabels?.some((l: string) =>
              ['family', 'people', 'group'].includes(l.toLowerCase())
            )
          ) {
            emotions.push('connection');
          }

          if (emotions.length > 0) {
            response += `**Emotional tone:** ${emotions.join(', ')}\n\n`;
          }

          response += `---\n\n`;
          response += `*This is "Better Than Human" memory—I remember not just what you showed me, but the moment you shared it.*`;

          log.info({ userId: ctx.userId, query }, 'Recalled emotional context for photo');

          return response;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId, query },
            'Recall emotional context failed'
          );
          return "I couldn't recall the emotional context right now.";
        }
      },
    });
  },
};

const findMomentsOfJoyDef: ToolDefinition = {
  id: 'findMomentsOfJoy',
  name: 'Find Moments of Joy',
  description: 'Search visual memories for moments that captured joy, celebration, or happiness',
  domain: 'memory',
  tags: ['memory', 'visual', 'emotional', 'joy', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('findMomentsOfJoy'),
      parameters: z.object({
        timeframe: z.enum(['recent', 'all']).optional().describe('Timeframe to search'),
      }),
      execute: async ({ timeframe }) => {
        try {
          const { visualMemory } = await import('../../../services/visual-memory/index.js');

          const isEnabled = await visualMemory.isEnabled(ctx.userId);
          if (!isEnabled) {
            return 'Enable visual memory to let me remember your moments of joy.';
          }

          // Search for joy-related images
          const searchResult = await visualMemory.search({
            userId: ctx.userId,
            query: 'happy celebration smile joy party fun together',
            limit: 5,
          });

          if (!searchResult || searchResult.results.length === 0) {
            return "I don't have many photos from you yet. Share your happy moments, and I'll remember them forever.";
          }

          const joyfulMemories = searchResult.results;
          let response = `**Moments of Joy I Remember**\n\n`;

          for (let i = 0; i < joyfulMemories.length; i++) {
            const m = joyfulMemories[i].memory;
            const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'recently';
            response += `${i + 1}. ${m.aiDescription || 'A joyful moment'} (${date})\n`;
          }

          response += `\n---\n\n`;
          response += `*A human friend might forget these moments. I never will.*`;

          log.info({ userId: ctx.userId, count: joyfulMemories.length }, 'Found moments of joy');

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, 'Find moments of joy failed');
          return "I couldn't search for joyful moments right now.";
        }
      },
    });
  },
};

const rememberWhenDef: ToolDefinition = {
  id: 'rememberWhen',
  name: 'Remember When',
  description: 'Nostalgic recall - find photos from a specific time period or event',
  domain: 'memory',
  tags: ['memory', 'visual', 'nostalgia', 'better-than-human'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('rememberWhen'),
      parameters: z.object({
        moment: z
          .string()
          .describe('What moment or period to remember (e.g., "last birthday", "that trip to...")'),
      }),
      execute: async ({ moment }) => {
        try {
          const { visualMemory } = await import('../../../services/visual-memory/index.js');

          const isEnabled = await visualMemory.isEnabled(ctx.userId);
          if (!isEnabled) {
            return 'Enable visual memory so I can help you remember when...';
          }

          const searchResult = await visualMemory.search({
            userId: ctx.userId,
            query: moment,
            limit: 5,
          });

          if (!searchResult || searchResult.results.length === 0) {
            return `I don't have photos from "${moment}" in my memory. Maybe you haven't shared those yet?`;
          }

          const memories = searchResult.results;
          let response = `**Remember When... ${moment}**\n\n`;

          for (let i = 0; i < memories.length; i++) {
            const m = memories[i].memory;
            const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'a while back';
            response += `${i + 1}. ${m.aiDescription || 'A moment from that time'} (${date})\n`;
            if (m.userDescription) {
              response += `   _"${m.userDescription}"_\n`;
            }
          }

          response += `\n---\n\n`;
          response += `*These moments are safe with me. Would you like to tell me more about any of them?*`;

          log.info(
            { userId: ctx.userId, moment, count: memories.length },
            'Nostalgic recall completed'
          );

          return response;
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId, moment }, 'Remember when failed');
          return "I couldn't search my memory right now.";
        }
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const visualMemoryTools: ToolDefinition[] = [
  recallVisualMemoryDef,
  describeSharedPhotoDef,
  listRecentPhotosDef,
  countVisualMemoriesDef,
  // Emotional memory layer
  recallEmotionalContextDef,
  findMomentsOfJoyDef,
  rememberWhenDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'memory', // Part of memory domain
  visualMemoryTools
);

export {
  recallVisualMemoryDef,
  describeSharedPhotoDef,
  listRecentPhotosDef,
  countVisualMemoriesDef,
};

export default getToolDefinitions;
