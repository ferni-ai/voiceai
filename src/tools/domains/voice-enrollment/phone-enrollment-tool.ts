/**
 * Phone Voice Enrollment Tool
 *
 * Enables Ferni to offer and complete voice enrollment for callers
 * during phone conversations. This is especially useful for sponsored
 * identities (family members) who may not use the web app.
 *
 * Usage:
 * - Ferni offers voice enrollment to known callers who aren't enrolled
 * - Collects 3 voice samples during natural conversation
 * - Creates voice profile linked to sponsored identity
 *
 * @module tools/domains/voice-enrollment/phone-enrollment-tool
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';

const log = getLogger().child({ module: 'phone-enrollment-tool' });

// ============================================================================
// TOOL CREATORS
// ============================================================================

/**
 * Create the start voice enrollment tool.
 */
function createStartEnrollmentTool(_ctx: ToolContext): Tool {
  return {
    description: `Start voice enrollment for the current phone caller. Use this when:
- A caller is recognized by phone number but hasn't enrolled their voice
- The caller agrees to voice enrollment when you offer
- You want to help them have a more personalized experience

Parameters:
- callerName (string): The caller's name
- identityId (string): The sponsored identity ID from the inbound call context`,
    parameters: {
      type: 'object',
      properties: {
        callerName: { type: 'string', description: "The caller's name" },
        identityId: {
          type: 'string',
          description: 'The sponsored identity ID from the inbound call context',
        },
      },
      required: ['callerName', 'identityId'],
    },
    execute: async (args: { callerName: string; identityId: string }): Promise<unknown> => {
      const { callerName, identityId } = args;

      if (!identityId) {
        return {
          success: false,
          message:
            "I don't have your identity linked yet. Let's try again later when I know who you are.",
        };
      }

      try {
        const { startPhoneVoiceEnrollment } =
          await import('../../../services/identity/sponsored-identity.js');

        const result = await startPhoneVoiceEnrollment(identityId);

        if (!result.success) {
          log.warn({ identityId, error: result.error }, 'Failed to start phone voice enrollment');
          return {
            success: false,
            message:
              result.error === 'Voice already enrolled'
                ? `${callerName}, I already know your voice! I'll recognize you next time.`
                : "Something went wrong starting the voice enrollment. Let's try another time.",
          };
        }

        log.info({ identityId, callerName }, '🎤 Started phone voice enrollment');

        return {
          success: true,
          message: result.prompts[0],
          data: {
            enrollmentStarted: true,
            identityId,
            prompts: result.prompts.slice(1),
          },
        };
      } catch (error) {
        log.error({ error: String(error), identityId }, 'Error starting phone enrollment');
        return {
          success: false,
          message: "I had some trouble getting started. Let's skip the voice enrollment for now.",
        };
      }
    },
  };
}

/**
 * Create the record voice sample tool.
 */
function createRecordSampleTool(_ctx: ToolContext): Tool {
  return {
    description: `Record a voice sample during phone enrollment. The system captures audio automatically, but use this to explicitly mark when a good sample was collected.

Parameters:
- identityId (string): The sponsored identity ID
- sampleQuality (string): Either 'good' or 'retry'`,
    parameters: {
      type: 'object',
      properties: {
        identityId: { type: 'string', description: 'The sponsored identity ID' },
        sampleQuality: {
          type: 'string',
          enum: ['good', 'retry'],
          description: 'Whether the sample was good quality',
        },
      },
      required: ['identityId', 'sampleQuality'],
    },
    execute: async (args: {
      identityId: string;
      sampleQuality: 'good' | 'retry';
    }): Promise<unknown> => {
      const { identityId, sampleQuality } = args;

      if (!identityId) {
        return {
          success: false,
          message: 'No active enrollment session.',
        };
      }

      if (sampleQuality === 'retry') {
        return {
          success: true,
          message: "Let's try that again. Can you say something else?",
        };
      }

      const { hasActiveEnrollment } =
        await import('../../../services/identity/sponsored-identity.js');

      if (!hasActiveEnrollment(identityId)) {
        return {
          success: false,
          message: 'No active voice enrollment. Would you like to start one?',
        };
      }

      return {
        success: true,
        message: 'Great! That sounded clear. Keep going!',
        data: { sampleRecorded: true },
      };
    },
  };
}

/**
 * Create the finish enrollment tool.
 */
function createFinishEnrollmentTool(_ctx: ToolContext): Tool {
  return {
    description: `Complete or cancel voice enrollment for the current caller.

Parameters:
- identityId (string): The sponsored identity ID
- action (string): Either 'complete' or 'cancel'
- reason (string, optional): Reason for cancellation`,
    parameters: {
      type: 'object',
      properties: {
        identityId: { type: 'string', description: 'The sponsored identity ID' },
        action: {
          type: 'string',
          enum: ['complete', 'cancel'],
          description: 'Whether to complete or cancel',
        },
        reason: { type: 'string', description: 'Reason for cancellation' },
      },
      required: ['identityId', 'action'],
    },
    execute: async (args: {
      identityId: string;
      action: 'complete' | 'cancel';
      reason?: string;
    }): Promise<unknown> => {
      const { identityId, action, reason } = args;

      if (!identityId) {
        return {
          success: false,
          message: 'No active enrollment session.',
        };
      }

      const { cancelPhoneVoiceEnrollment, hasActiveEnrollment } =
        await import('../../../services/identity/sponsored-identity.js');

      if (!hasActiveEnrollment(identityId)) {
        return {
          success: true,
          message: "No enrollment in progress. We're all set!",
        };
      }

      if (action === 'cancel') {
        cancelPhoneVoiceEnrollment(identityId);
        log.info({ identityId, reason }, 'Cancelled phone voice enrollment');
        return {
          success: true,
          message:
            "No problem! We can set up voice recognition another time. I'll still recognize you by your phone number.",
        };
      }

      return {
        success: true,
        message:
          "I'm still learning your voice. Let's chat a bit more so I can get to know how you sound.",
      };
    },
  };
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const startPhoneEnrollmentDef: ToolDefinition = {
  id: 'startPhoneVoiceEnrollment',
  name: 'Start Phone Voice Enrollment',
  description:
    'Start voice enrollment for the current phone caller who is recognized but not voice-enrolled',
  domain: 'voice-enrollment',
  category: 'core',
  tags: ['voice', 'enrollment', 'phone', 'identity'],
  create: createStartEnrollmentTool,
};

const recordVoiceSampleDef: ToolDefinition = {
  id: 'recordPhoneVoiceSample',
  name: 'Record Phone Voice Sample',
  description: 'Record a voice sample during phone enrollment',
  domain: 'voice-enrollment',
  category: 'core',
  tags: ['voice', 'enrollment', 'phone'],
  create: createRecordSampleTool,
};

const finishPhoneEnrollmentDef: ToolDefinition = {
  id: 'finishPhoneVoiceEnrollment',
  name: 'Finish Phone Voice Enrollment',
  description: 'Complete or cancel voice enrollment for the current caller',
  domain: 'voice-enrollment',
  category: 'core',
  tags: ['voice', 'enrollment', 'phone'],
  create: createFinishEnrollmentTool,
};

// ============================================================================
// EXPORTS
// ============================================================================

export function getToolDefinitions(): ToolDefinition[] {
  return [startPhoneEnrollmentDef, recordVoiceSampleDef, finishPhoneEnrollmentDef];
}

export const definitions = getToolDefinitions();
