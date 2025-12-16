#!/usr/bin/env npx tsx
/**
 * Ferni MCP Server for Claude Code Integration
 *
 * This MCP server allows Claude Code to communicate with Ferni,
 * enabling voice narration of Claude's progress and bidirectional
 * task coordination.
 *
 * Tools provided:
 *   - narrate: Have Ferni speak something aloud
 *   - report_progress: Update Ferni on task progress
 *   - request_voice_input: Ask user for voice input via Ferni
 *   - get_current_task: Get the current task from Ferni
 *
 * Usage:
 *   Add to ~/.claude.json:
 *   {
 *     "mcpServers": {
 *       "ferni": {
 *         "command": "npx",
 *         "args": ["tsx", "/path/to/ferni-mcp-server.ts"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// MCP server is at apps/cli/src/mcp/, so go up 4 levels to project root
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..');

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

interface FerniState {
  currentTask: string | null;
  taskQueue: string[];
  lastNarration: string | null;
  lastNarrationTime: number | null;
  voiceInputPending: boolean;
  voiceInputResult: string | null;
  progressUpdates: Array<{
    message: string;
    timestamp: number;
    type: 'info' | 'success' | 'warning' | 'error';
  }>;
}

// State file for persistence and cross-process communication
const STATE_DIR = join(PROJECT_ROOT, '.ferni-mcp');
const STATE_FILE = join(STATE_DIR, 'state.json');
const NARRATION_FILE = join(STATE_DIR, 'narration.json');

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
}

function loadState(): FerniState {
  ensureStateDir();
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      // Corrupted state, return default
    }
  }
  return {
    currentTask: null,
    taskQueue: [],
    lastNarration: null,
    lastNarrationTime: null,
    voiceInputPending: false,
    voiceInputResult: null,
    progressUpdates: [],
  };
}

function saveState(state: FerniState): void {
  ensureStateDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ============================================================================
// NARRATION QUEUE (Read by voice-claude.ts)
// ============================================================================

interface NarrationMessage {
  id: string;
  text: string;
  type: 'narration' | 'progress' | 'question' | 'completion';
  timestamp: number;
  processed: boolean;
}

function queueNarration(text: string, type: NarrationMessage['type']): string {
  ensureStateDir();

  let queue: NarrationMessage[] = [];
  if (existsSync(NARRATION_FILE)) {
    try {
      queue = JSON.parse(readFileSync(NARRATION_FILE, 'utf-8'));
    } catch {
      queue = [];
    }
  }

  const message: NarrationMessage = {
    id: `narr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    text,
    type,
    timestamp: Date.now(),
    processed: false,
  };

  queue.push(message);

  // Keep only last 100 messages
  if (queue.length > 100) {
    queue = queue.slice(-100);
  }

  writeFileSync(NARRATION_FILE, JSON.stringify(queue, null, 2));

  return message.id;
}

// ============================================================================
// MCP SERVER
// ============================================================================

const server = new Server(
  {
    name: 'ferni-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'narrate',
        description:
          'Have Ferni speak something aloud to the user. Use this to provide voice feedback, explanations, or updates. Ferni will say exactly what you provide in a natural, conversational way.',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'The text for Ferni to speak aloud',
            },
            emotion: {
              type: 'string',
              enum: ['neutral', 'excited', 'thoughtful', 'concerned', 'encouraging'],
              description: 'Optional emotion to convey (default: neutral)',
            },
          },
          required: ['text'],
        },
      },
      {
        name: 'report_progress',
        description:
          'Report progress on the current task to Ferni. Use this to keep the user informed about what you are doing, especially for long-running tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Brief progress update message',
            },
            percentage: {
              type: 'number',
              description: 'Optional completion percentage (0-100)',
            },
            status: {
              type: 'string',
              enum: ['in_progress', 'completed', 'blocked', 'error'],
              description: 'Current status of the task',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'request_voice_input',
        description:
          'Ask Ferni to get voice input from the user. Use this when you need clarification or a decision from the user. Ferni will ask the question and return the user response.',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to ask the user',
            },
            context: {
              type: 'string',
              description: 'Optional context to help Ferni frame the question',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'get_current_task',
        description:
          'Get the current task from Ferni. Use this at the start of a session to understand what the user wants you to work on.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'task_complete',
        description:
          'Mark the current task as complete and notify Ferni. Ferni will provide a summary to the user.',
        inputSchema: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'Brief summary of what was accomplished',
            },
            next_steps: {
              type: 'string',
              description: 'Optional suggested next steps',
            },
          },
          required: ['summary'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const state = loadState();

  switch (name) {
    case 'narrate': {
      const { text, emotion = 'neutral' } = args as { text: string; emotion?: string };

      // Queue for Ferni to speak
      const id = queueNarration(text, 'narration');

      state.lastNarration = text;
      state.lastNarrationTime = Date.now();
      saveState(state);

      return {
        content: [
          {
            type: 'text',
            text: `Queued narration (id: ${id}): "${text}" [emotion: ${emotion}]`,
          },
        ],
      };
    }

    case 'report_progress': {
      const { message, percentage, status = 'in_progress' } = args as {
        message: string;
        percentage?: number;
        status?: string;
      };

      // Queue progress narration
      const progressText =
        percentage !== undefined
          ? `Progress update: ${message} (${percentage}% complete)`
          : `Progress update: ${message}`;

      const id = queueNarration(progressText, 'progress');

      state.progressUpdates.push({
        message,
        timestamp: Date.now(),
        type: status === 'error' ? 'error' : status === 'completed' ? 'success' : 'info',
      });

      // Keep only last 50 updates
      if (state.progressUpdates.length > 50) {
        state.progressUpdates = state.progressUpdates.slice(-50);
      }

      saveState(state);

      return {
        content: [
          {
            type: 'text',
            text: `Progress reported (id: ${id}): ${message}${percentage !== undefined ? ` [${percentage}%]` : ''} [${status}]`,
          },
        ],
      };
    }

    case 'request_voice_input': {
      const { question, context } = args as { question: string; context?: string };

      // Queue question for Ferni to ask
      const fullQuestion = context ? `${context} ${question}` : question;

      const id = queueNarration(fullQuestion, 'question');

      state.voiceInputPending = true;
      state.voiceInputResult = null;
      saveState(state);

      // Note: In a full implementation, we'd wait for voice input here
      // For now, we return immediately and the voice-claude bridge handles async response

      return {
        content: [
          {
            type: 'text',
            text: `Voice input requested (id: ${id}). Ferni is asking: "${fullQuestion}"`,
          },
        ],
      };
    }

    case 'get_current_task': {
      const task = state.currentTask;

      if (task) {
        return {
          content: [
            {
              type: 'text',
              text: `Current task: ${task}`,
            },
          ],
        };
      }

      // Check task queue
      if (state.taskQueue.length > 0) {
        const nextTask = state.taskQueue.shift()!;
        state.currentTask = nextTask;
        saveState(state);

        return {
          content: [
            {
              type: 'text',
              text: `New task from queue: ${nextTask}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: 'No current task. Waiting for user input via Ferni.',
          },
        ],
      };
    }

    case 'task_complete': {
      const { summary, next_steps } = args as { summary: string; next_steps?: string };

      // Queue completion narration
      const completionText = next_steps
        ? `Great news! ${summary} If you'd like, here are some next steps: ${next_steps}`
        : `All done! ${summary}`;

      const id = queueNarration(completionText, 'completion');

      state.currentTask = null;
      saveState(state);

      return {
        content: [
          {
            type: 'text',
            text: `Task marked complete (id: ${id}). Summary: ${summary}`,
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

// List resources (state and narration queue)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'ferni://state',
        name: 'Ferni State',
        description: 'Current state of the Ferni voice assistant',
        mimeType: 'application/json',
      },
      {
        uri: 'ferni://narration-queue',
        name: 'Narration Queue',
        description: 'Queue of messages for Ferni to speak',
        mimeType: 'application/json',
      },
    ],
  };
});

// Read resources
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'ferni://state') {
    const state = loadState();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(state, null, 2),
        },
      ],
    };
  }

  if (uri === 'ferni://narration-queue') {
    ensureStateDir();
    let queue: NarrationMessage[] = [];
    if (existsSync(NARRATION_FILE)) {
      try {
        queue = JSON.parse(readFileSync(NARRATION_FILE, 'utf-8'));
      } catch {
        queue = [];
      }
    }
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(queue, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Ferni MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
