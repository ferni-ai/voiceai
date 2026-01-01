/**
 * Behavior Domain Tools
 *
 * Functions that change HOW Ferni speaks, not WHAT Ferni does.
 * These enable the bidirectional behavior loop where the LLM can:
 * - Shift into different presence modes
 * - Control pacing and pauses
 * - Show visible processing
 * - Hold intentional silence
 * - Express non-verbal presence
 *
 * DOMAIN: behavior
 * TOOLS:
 *   - shiftMode: Change presence mode (presence, deep_listening, processing, etc.)
 *   - adjustPacing: Control speech rhythm (slower/faster, pause duration)
 *   - processing: Take visible thinking time with context-aware phrases
 *   - holdSpace: Create intentional meaningful silence
 *   - expressPresence: Show non-verbal presence (breath, hum, nod, etc.)
 *
 * @module BehaviorTools
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import type {
  BehaviorMode,
  PresenceExpression,
  SilenceDuration,
} from '../../../types/behavior-types.js';
import {
  createModeShiftSignal,
  createPacingChangeSignal,
  createHoldSpaceSignal,
  createProcessingSignal,
} from '../../../services/behavior/index.js';
import {
  composeProcessingExpression,
  formatProcessingAsSSML,
} from '../../../intelligence/processing-intelligence.js';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'BehaviorTools' });

// ============================================================================
// SCHEMAS
// ============================================================================

export const shiftModeSchema = z.object({
  mode: z
    .enum([
      'presence',
      'deep_listening',
      'processing',
      'celebration',
      'holding_space',
      'energy_match',
      'grounding',
    ])
    .describe('The presence mode to shift into'),
  reason: z.string().optional().describe('Optional reason for the mode shift'),
});

export const adjustPacingSchema = z.object({
  speed: z.enum(['slower', 'normal', 'faster']).describe('Speech speed adjustment'),
  pauses: z.enum(['shorter', 'normal', 'longer']).optional().describe('Pause duration'),
  reason: z.string().optional().describe('Optional reason for pacing change'),
});

export const processingSchema = z.object({
  type: z.enum(['thinking', 'emotional', 'tool_call', 'memory_recall']).describe('Processing type'),
  weight: z
    .enum(['light', 'medium', 'heavy'])
    .optional()
    .default('medium')
    .describe('Processing weight'),
  reason: z.string().optional().describe('Optional reason for processing'),
});

export const holdSpaceSchema = z.object({
  duration: z.enum(['brief', 'medium', 'extended']).describe('How long to hold space'),
  reason: z.string().optional().describe('Why you are holding space'),
});

export const expressPresenceSchema = z.object({
  type: z
    .enum(['breath', 'hum', 'nod', 'sigh', 'soft_sound'])
    .describe('Type of non-verbal expression'),
  intensity: z
    .enum(['subtle', 'visible'])
    .optional()
    .default('subtle')
    .describe('Expression intensity'),
});

// ============================================================================
// SSML MAPPINGS
// ============================================================================

const MODE_SSML: Record<BehaviorMode, string> = {
  presence: '<break time="500ms"/>',
  deep_listening: '<speed ratio="0.9"/><break time="400ms"/>',
  processing: '<break time="300ms"/><emotion value="contemplative"/>',
  celebration: '<emotion value="excited"/><speed ratio="1.05"/>',
  holding_space: '<break time="600ms"/><emotion value="gentle"/>',
  energy_match: '',
  grounding: '<speed ratio="0.85"/><emotion value="calm"/>',
};

const PRESENCE_SSML: Record<PresenceExpression, string> = {
  breath: '<break time="400ms"/><phoneme alphabet="ipa" ph="hh">...</phoneme><break time="300ms"/>',
  hum: '<break time="200ms"/>Mmm.<break time="400ms"/>',
  nod: '<break time="200ms"/>',
  sigh: '<break time="300ms"/><emotion value="gentle"/>Ahh.<break time="400ms"/>',
  soft_sound: '<break time="200ms"/>Mm.<break time="300ms"/>',
};

const SILENCE_DURATIONS_MS: Record<SilenceDuration, number> = {
  brief: 3000,
  medium: 5000,
  extended: 8000,
};

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const shiftModeDef: ToolDefinition = {
  id: 'shiftMode',
  name: 'Shift Mode',
  description:
    'Change your presence mode. Modes affect HOW you speak: presence (minimal words), ' +
    'deep_listening (slow, receptive), processing (visibly thinking), celebration (upbeat), ' +
    'holding_space (after heavy content), energy_match (match user), grounding (calming).',
  domain: 'behavior',
  category: 'core',
  tags: ['behavior', 'presence', 'mode'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Change your presence mode. Use presence for minimal words, ' +
        'deep_listening for slow receptive speech, processing when visibly thinking, ' +
        'celebration for upbeat energy, holding_space after heavy content, ' +
        'energy_match to match user, grounding for calm centering.',
      parameters: shiftModeSchema,
      execute: async ({ mode, reason }) => {
        log.info({ mode, reason, agentId: ctx.agentId }, 'Shifting behavior mode');

        // Emit signal to frontend via sendDataMessage
        const signal = createModeShiftSignal(mode as BehaviorMode, reason);
        // Note: sendDataMessage would need to be injected via ctx.services or toolCtx
        // For now, we return the signal data for the agent to handle

        return {
          success: true,
          mode,
          ssml: MODE_SSML[mode as BehaviorMode],
          signal,
        };
      },
    });
  },
};

export const adjustPacingDef: ToolDefinition = {
  id: 'adjustPacing',
  name: 'Adjust Pacing',
  description:
    'Control your speech rhythm. Use slower/faster speed and shorter/longer pauses ' +
    'based on the emotional context of the conversation.',
  domain: 'behavior',
  category: 'core',
  tags: ['behavior', 'pacing', 'rhythm'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Control your speech rhythm. Adjust speed (slower/normal/faster) and ' +
        'pause duration (shorter/normal/longer) based on emotional context.',
      parameters: adjustPacingSchema,
      execute: async ({ speed, pauses = 'normal', reason }) => {
        log.info({ speed, pauses, reason, agentId: ctx.agentId }, 'Adjusting pacing');

        const signal = createPacingChangeSignal(speed, reason);

        return {
          success: true,
          speed,
          pauses,
          signal,
        };
      },
    });
  },
};

export const processingDef: ToolDefinition = {
  id: 'processing',
  name: 'Processing',
  description:
    'Take visible thinking time. Types: thinking (general), emotional (processing feelings), ' +
    'tool_call (waiting for tool), memory_recall (searching memory). ' +
    'Weight: light/medium/heavy affects pause duration and phrase selection.',
  domain: 'behavior',
  category: 'core',
  tags: ['behavior', 'processing', 'thinking'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Take visible thinking time. Use thinking for general thought, ' +
        'emotional for processing feelings, tool_call when waiting for tools, ' +
        'memory_recall when searching memory. Weight affects phrase selection.',
      parameters: processingSchema,
      execute: async ({ type, weight = 'medium', reason }) => {
        log.info({ type, weight, reason, agentId: ctx.agentId }, 'Processing');

        // Compose the processing expression using unified intelligence
        const result = composeProcessingExpression({
          trigger: type as 'thinking' | 'emotional' | 'tool_call' | 'memory_recall',
          weight: weight as 'light' | 'medium' | 'heavy',
          hourOfDay: new Date().getHours(),
          personaId: ctx.agentId,
        });

        // Format as SSML
        const ssml = formatProcessingAsSSML(result);

        // Create signal
        const signal = createProcessingSignal(true, type);

        return {
          success: true,
          phrase: result.phrase,
          ssml,
          prePause: result.prePause,
          postPause: result.postPause,
          signal,
        };
      },
    });
  },
};

export const holdSpaceDef: ToolDefinition = {
  id: 'holdSpace',
  name: 'Hold Space',
  description:
    'Create intentional meaningful silence. Use after heavy content to let things land. ' +
    'Duration: brief (3s), medium (5s), extended (8s).',
  domain: 'behavior',
  category: 'core',
  tags: ['behavior', 'silence', 'presence'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Create intentional meaningful silence. Use brief (3s) for short pauses, ' +
        'medium (5s) after emotional content, extended (8s) after heavy shares.',
      parameters: holdSpaceSchema,
      execute: async ({ duration, reason }) => {
        const durationMs = SILENCE_DURATIONS_MS[duration as SilenceDuration];

        log.info({ duration, durationMs, reason, agentId: ctx.agentId }, 'Holding space');

        const signal = createHoldSpaceSignal(durationMs, reason);

        return {
          success: true,
          duration: durationMs, // Return milliseconds for frontend
          ssml: `<break time="${durationMs}ms"/>`,
          signal,
        };
      },
    });
  },
};

export const expressPresenceDef: ToolDefinition = {
  id: 'expressPresence',
  name: 'Express Presence',
  description:
    'Show non-verbal presence. Types: breath (audible breath), hum (soft hum), ' +
    'nod (acknowledgment), sigh (gentle sigh), soft_sound (mm sound).',
  domain: 'behavior',
  category: 'core',
  tags: ['behavior', 'presence', 'non-verbal'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Show non-verbal presence. Use breath for audible breathing, hum for soft "mmm", ' +
        'nod for acknowledgment, sigh for gentle release, soft_sound for "mm".',
      parameters: expressPresenceSchema,
      execute: async ({ type, intensity = 'subtle' }) => {
        log.info({ type, intensity, agentId: ctx.agentId }, 'Expressing presence');

        const signal = {
          type: 'expression' as const,
          expression: type,
          timestamp: Date.now(),
        };

        return {
          success: true,
          type,
          ssml: PRESENCE_SSML[type as PresenceExpression],
          signal,
        };
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const behaviorTools: ToolDefinition[] = [
  shiftModeDef,
  adjustPacingDef,
  processingDef,
  holdSpaceDef,
  expressPresenceDef,
];

// Legacy export for backwards compatibility
export const behaviorToolDefinitions = {
  shiftMode: shiftModeDef,
  adjustPacing: adjustPacingDef,
  processing: processingDef,
  holdSpace: holdSpaceDef,
  expressPresence: expressPresenceDef,
};

// ============================================================================
// EXPORTS
// ============================================================================

// Registry-compatible exports
export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'behavior',
  behaviorTools
);

// Default export for registry loader
export default getToolDefinitions;
