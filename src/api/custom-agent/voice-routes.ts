/**
 * Custom Agent Voice Routes
 *
 * Handles voice upload, cloning, and preview operations.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { flagOn } from '../../config/env-flag.js';
import { base64JsonBodyBytes } from '../bounded-body.js';
import { parseBody } from '../helpers.js';
import {
  getCustomAgent,
  updateAgentVoice,
} from '../../services/custom-agent/custom-agent-persistence-service.js';
import {
  processVoiceUpload,
  createVoiceClone as createCartesiaVoiceClone,
  generateVoicePreview,
  MAX_FILE_SIZE_BYTES,
} from '../../services/custom-agent/voice-clone-service.js';
import type { CustomAgentVoice } from '../../types/custom-agent-api.js';
import { isStockCustomAgentVoiceId } from '../../services/custom-agent/custom-agent-voice-policy.js';
import type { VoiceUploadBody, VoiceCloneBody } from './types.js';
import { sendJson, getQualityFeedback } from './helpers.js';

const log = createLogger({ module: 'CustomAgentVoiceRoutes' });

/**
 * Voice cloning is off until there is a consent design: today anyone's voice
 * could be cloned from any uploaded file, with no consent step. While
 * VOICE_CLONE_CREATION is off, the upload and clone routes refuse before they
 * read the body, look up the agent, store anything or call the provider.
 */
function refusedVoiceClone(res: ServerResponse, route: 'upload' | 'clone'): boolean {
  if (flagOn('VOICE_CLONE_CREATION')) return false;
  log.info({ route }, 'Voice clone request refused: VOICE_CLONE_CREATION is off');
  sendJson(res, 403, { error: 'voice_clone_unavailable' });
  return true;
}

/**
 * POST /api/custom-agents/:agentId/voice/upload - Upload voice sample
 */
export async function handleVoiceUpload(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  if (refusedVoiceClone(res, 'upload')) return true;
  // base64 audio up to the voice clone service's own file cap.
  const body = await parseBody<VoiceUploadBody>(req, {
    maxBytes: base64JsonBodyBytes(MAX_FILE_SIZE_BYTES),
  });

  if (!body.audio) {
    sendJson(res, 400, { error: 'Audio data is required' });
    return true;
  }

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  try {
    // Decode base64 audio
    const audioBuffer = Buffer.from(body.audio, 'base64');
    const mimeType = body.mimeType || 'audio/webm';
    const filename = body.filename || `voice-sample-${Date.now()}.webm`;

    // Process the upload for quality analysis
    const uploadResult = await processVoiceUpload(
      agentId,
      [
        {
          filename,
          buffer: audioBuffer.buffer.slice(
            audioBuffer.byteOffset,
            audioBuffer.byteOffset + audioBuffer.byteLength
          ),
          mimeType,
        },
      ],
      userId
    );

    // processVoiceUpload holds the only copy of the sample, privately. This is a
    // reference to that upload, never a URL anyone can fetch.
    const audioUrl = `upload://${uploadResult.uploadId}`;

    // Update agent with pending status and upload info
    await updateAgentVoice(userId, agentId, {
      type: 'cloned',
      audioSampleUrl: audioUrl,
      status: 'pending',
    });

    log.info({ userId, agentId, audioUrl, quality: uploadResult.quality }, 'Voice sample uploaded');
    sendJson(res, 200, {
      audioUrl,
      uploadId: uploadResult.uploadId,
      qualityScore: uploadResult.segments[0]?.qualityScore || 0.8,
      quality: uploadResult.quality,
      totalDuration: uploadResult.totalDuration,
      feedback: getQualityFeedback(uploadResult.quality),
    });
  } catch (error) {
    log.error({ error: String(error), userId, agentId }, 'Voice upload failed');
    sendJson(res, 500, { error: 'Failed to upload voice sample' });
  }
  return true;
}

/**
 * POST /api/custom-agents/:agentId/voice/clone - Create voice clone
 */
export async function handleVoiceClone(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  if (refusedVoiceClone(res, 'clone')) return true;
  const body = await parseBody<VoiceCloneBody>(req);

  if (!body.userName) {
    sendJson(res, 400, { error: 'User name is required' });
    return true;
  }

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  try {
    // Call Cartesia API via our voice clone service
    const cloneResult = await createCartesiaVoiceClone(
      agentId,
      userId,
      body.uploadId || `upload_${agentId}`,
      `${body.userName}_${agent.name}`
    );

    // Build voice object with real Cartesia voice ID
    const voice: CustomAgentVoice = {
      type: 'cloned',
      voiceId: cloneResult.voiceId,
      audioSampleUrl: agent.voice?.audioSampleUrl,
      status: 'ready',
      settings: {
        speed: 1.0,
        stability: 0.8,
        similarityBoost: 0.75,
      },
      preferences: {
        formality: 'match_context',
        greeting: `Hi, this is ${body.userName}.`,
        traits: { patience: 3, assertiveness: 3, friendliness: 3 },
      },
    };

    await updateAgentVoice(userId, agentId, voice);

    log.info(
      { userId, agentId, voiceId: voice.voiceId, isSimulated: cloneResult.isSimulated },
      'Voice clone created'
    );
    sendJson(res, 200, {
      message: cloneResult.isSimulated ? 'Voice clone created (simulated)' : 'Voice clone created',
      voice,
      isSimulated: cloneResult.isSimulated,
    });
  } catch (error) {
    log.error({ error: String(error), userId, agentId }, 'Voice clone creation failed');
    sendJson(res, 500, { error: 'Failed to create voice clone' });
  }
  return true;
}

/**
 * PUT /api/custom-agents/:agentId/voice/select-premade - Select pre-made voice
 */
export async function handleSelectPremadeVoice(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const body = await parseBody<{ voiceId: string }>(req);

  if (!body.voiceId) {
    sendJson(res, 400, { error: 'Voice ID is required' });
    return true;
  }
  // Only a stock library voice: never a made-up id marked ready, a retired clone or a persona's voice.
  if (!isStockCustomAgentVoiceId(body.voiceId)) {
    log.warn(
      { userId, agentId, voiceId: String(body.voiceId).slice(0, 64) },
      'Unknown pre-made voice refused'
    );
    sendJson(res, 400, { error: 'unknown_voice' });
    return true;
  }

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  const voice: CustomAgentVoice = {
    type: 'selected',
    voiceId: body.voiceId,
    status: 'ready',
    settings: {
      speed: 1.0,
      stability: 0.7,
      similarityBoost: 0.7,
      emotion: 'neutral',
    },
  };

  await updateAgentVoice(userId, agentId, voice);

  log.info({ userId, agentId, voiceId: body.voiceId }, 'Pre-made voice selected');
  sendJson(res, 200, { message: 'Voice selected', voice });
  return true;
}

/**
 * GET /api/custom-agents/:agentId/voice/status - Poll voice clone status
 */
export async function handleGetVoiceStatus(
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

  const voiceStatus = {
    status: agent.voice?.status || 'pending',
    type: agent.voice?.type || 'none',
    voiceId: agent.voice?.voiceId || null,
    hasAudioSample: !!agent.voice?.audioSampleUrl,
    isReady: agent.voice?.status === 'ready' && !!agent.voice?.voiceId,
    settings: agent.voice?.settings || {},
  };

  // If processing, check if ready
  if (voiceStatus.status === 'processing' && agent.voice?.voiceId) {
    await updateAgentVoice(userId, agentId, { status: 'ready' });
    voiceStatus.status = 'ready';
    voiceStatus.isReady = true;
  }

  sendJson(res, 200, voiceStatus);
  return true;
}

/**
 * POST /api/custom-agents/:agentId/voice/preview - Generate voice preview
 */
export async function handleVoicePreview(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const body = await parseBody<{ text?: string }>(req);

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  if (!agent.voice?.voiceId) {
    sendJson(res, 400, { error: 'Agent has no voice configured' });
    return true;
  }

  try {
    const previewText =
      body.text || `Hello, I'm ${agent.displayName || agent.name}. It's nice to meet you.`;
    const preview = await generateVoicePreview(agent.voice.voiceId, previewText);

    log.info({ userId, agentId, voiceId: agent.voice.voiceId }, 'Voice preview generated');
    sendJson(res, 200, {
      audioUrl: preview.audioUrl,
      durationSeconds: preview.durationSeconds,
      text: previewText,
    });
  } catch (error) {
    log.error({ error: String(error), userId, agentId }, 'Voice preview generation failed');
    sendJson(res, 500, { error: 'Failed to generate voice preview' });
  }
  return true;
}
