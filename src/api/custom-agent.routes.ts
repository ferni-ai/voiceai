/**
 * Custom Agent Handler
 *
 * Adapts the Express-style router to the raw HTTP server format
 * used by the UI server.
 *
 * @module custom-agent-handler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import {
  createCustomAgent,
  getCustomAgent,
  listCustomAgents,
  updateCustomAgent,
  deleteCustomAgent,
  addMemoryToAgent,
  removeMemoryFromAgent,
  updateAgentVoice,
} from '../services/custom-agent/custom-agent-persistence.service.js';
import {
  processVoiceUpload,
  createVoiceClone as createCartesiaVoiceClone,
  generateVoicePreview,
} from '../services/custom-agent/voice-clone.service.js';
import { uploadAudioToGcs, isGcsConfigured } from '../services/custom-agent/gcs-storage.service.js';
import type {
  CreateCustomAgentRequest,
  CustomAgent,
  CustomAgentVoice,
} from '../types/custom-agent-api.js';

const log = getLogger().child({ module: 'CustomAgentHandler' });

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parses JSON body from request
 */
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : ({} as T));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Sends JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Extracts meaningful keywords from content text
 */
function extractKeywords(content: string): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'up',
    'down',
    'out',
    'off',
    'over',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'i',
    'me',
    'my',
    'myself',
    'we',
    'our',
    'ours',
    'ourselves',
    'you',
    'your',
    'yours',
    'yourself',
    'yourselves',
    'he',
    'him',
    'his',
    'himself',
    'she',
    'her',
    'hers',
    'herself',
    'it',
    'its',
    'itself',
    'they',
    'them',
    'their',
    'theirs',
    'themselves',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'am',
  ]);

  // Extract words, filter stop words, and get unique meaningful keywords
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Return unique keywords, up to 10
  return [...new Set(words)].slice(0, 10);
}

/**
 * Returns human-readable feedback based on voice quality score
 */
function getQualityFeedback(quality: string): string {
  switch (quality) {
    case 'excellent':
      return 'Great audio quality! Your voice clone will sound natural.';
    case 'good':
      return 'Good audio quality. Consider adding more samples for better accuracy.';
    case 'fair':
    case 'needs_more':
      return 'Need more audio. Please record at least 10 seconds of clear speech.';
    case 'poor':
      return 'Audio quality is low. Try recording in a quieter environment.';
    default:
      return 'Audio uploaded successfully.';
  }
}

/**
 * Gets user ID from request headers or query params
 */
function getUserId(req: IncomingMessage, parsedUrl: URL): string | null {
  // Check x-user-id header
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId && typeof headerUserId === 'string') {
    return headerUserId;
  }

  // Check query param (for dev/testing)
  const queryUserId = parsedUrl.searchParams.get('user_id');
  if (queryUserId) return queryUserId;

  // Dev mode
  const adminKey = parsedUrl.searchParams.get('admin_key');
  if (adminKey === 'dev-mode' && process.env.NODE_ENV !== 'production') {
    return 'dev-user-123';
  }

  return null;
}

/**
 * Extracts path segments from a URL path
 * e.g., '/api/custom-agents/agent123/voice' -> ['agent123', 'voice']
 */
function getPathSegments(pathname: string): string[] {
  return pathname.replace('/api/custom-agents', '').split('/').filter(Boolean);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handles custom agent routes
 */
export async function handleCustomAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';
  const segments = getPathSegments(pathname);

  // Get user ID
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendJson(res, 401, { error: 'Authentication required' });
    return true;
  }

  try {
    // POST /api/custom-agents - Create agent
    if (method === 'POST' && segments.length === 0) {
      const body = await parseBody<CreateCustomAgentRequest>(req);

      if (!body.name?.trim()) {
        sendJson(res, 400, { error: 'Name is required' });
        return true;
      }
      if (!body.description?.trim()) {
        sendJson(res, 400, { error: 'Description is required' });
        return true;
      }
      if (!['legacy', 'mentor', 'twin', 'fictional', 'professional'].includes(body.type)) {
        sendJson(res, 400, { error: 'Invalid agent type' });
        return true;
      }

      const agent = await createCustomAgent(userId, body);
      log.info({ userId, agentId: agent.id }, 'Custom agent created');
      sendJson(res, 201, agent);
      return true;
    }

    // GET /api/custom-agents - List agents
    if (method === 'GET' && segments.length === 0) {
      const agents = await listCustomAgents(userId);
      sendJson(res, 200, agents);
      return true;
    }

    // GET /api/custom-agents/:agentId - Get specific agent
    if (method === 'GET' && segments.length === 1) {
      const agentId = segments[0];
      const agent = await getCustomAgent(userId, agentId);

      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      sendJson(res, 200, agent);
      return true;
    }

    // PUT /api/custom-agents/:agentId - Update agent
    if (method === 'PUT' && segments.length === 1) {
      const agentId = segments[0];
      const body = await parseBody<Partial<CustomAgent>>(req);

      const agent = await updateCustomAgent(userId, agentId, body);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      log.info({ userId, agentId }, 'Custom agent updated');
      sendJson(res, 200, agent);
      return true;
    }

    // DELETE /api/custom-agents/:agentId - Delete agent
    if (method === 'DELETE' && segments.length === 1) {
      const agentId = segments[0];
      const success = await deleteCustomAgent(userId, agentId);

      if (!success) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      log.info({ userId, agentId }, 'Custom agent deleted');
      res.writeHead(204);
      res.end();
      return true;
    }

    // ========================================================================
    // STATUS ROUTES
    // ========================================================================

    // PUT /api/custom-agents/:agentId/status - Toggle agent status
    if (method === 'PUT' && segments.length === 2 && segments[1] === 'status') {
      const agentId = segments[0];
      const body = await parseBody<{ status: 'active' | 'paused' | 'draft' }>(req);

      if (!body.status || !['active', 'paused', 'draft'].includes(body.status)) {
        sendJson(res, 400, { error: 'Valid status is required (active, paused, draft)' });
        return true;
      }

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      // Validate agent is ready to be activated
      if (body.status === 'active') {
        const validationErrors: string[] = [];

        if (!agent.voice?.voiceId) {
          validationErrors.push('Voice is not configured');
        }
        if (agent.voice?.status !== 'ready') {
          validationErrors.push('Voice is not ready');
        }
        if (!agent.description || agent.description.length < 10) {
          validationErrors.push('Description is too short');
        }

        if (validationErrors.length > 0) {
          sendJson(res, 400, {
            error: 'Agent cannot be activated',
            validationErrors,
          });
          return true;
        }
      }

      const updated = await updateCustomAgent(userId, agentId, { status: body.status });
      if (!updated) {
        sendJson(res, 500, { error: 'Failed to update status' });
        return true;
      }

      log.info({ userId, agentId, status: body.status }, 'Agent status updated');
      sendJson(res, 200, {
        message: `Agent ${body.status === 'active' ? 'activated' : body.status === 'paused' ? 'paused' : 'set to draft'}`,
        status: body.status,
      });
      return true;
    }

    // POST /api/custom-agents/:agentId/activate - Quick activate agent
    if (method === 'POST' && segments.length === 2 && segments[1] === 'activate') {
      const agentId = segments[0];

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      // Validate agent is ready to be activated
      const validationErrors: string[] = [];

      if (!agent.voice?.voiceId) {
        validationErrors.push('Voice is not configured');
      }
      if (agent.voice?.status !== 'ready') {
        validationErrors.push('Voice is not ready');
      }
      if (!agent.description || agent.description.length < 10) {
        validationErrors.push('Description is too short');
      }

      if (validationErrors.length > 0) {
        sendJson(res, 400, {
          error: 'Agent cannot be activated',
          validationErrors,
          readyStatus: {
            hasVoice: !!agent.voice?.voiceId,
            voiceReady: agent.voice?.status === 'ready',
            hasDescription: (agent.description?.length || 0) >= 10,
          },
        });
        return true;
      }

      const updated = await updateCustomAgent(userId, agentId, { status: 'active' });
      if (!updated) {
        sendJson(res, 500, { error: 'Failed to activate agent' });
        return true;
      }

      log.info({ userId, agentId }, 'Agent activated');
      sendJson(res, 200, {
        message: 'Agent activated and ready for conversations',
        status: 'active',
      });
      return true;
    }

    // ========================================================================
    // VOICE ROUTES
    // ========================================================================

    // POST /api/custom-agents/:agentId/voice/upload - Upload voice sample
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'upload'
    ) {
      const agentId = segments[0];

      // Accept base64 encoded audio in body
      const body = await parseBody<{ audio: string; mimeType: string; filename?: string }>(req);

      if (!body.audio) {
        sendJson(res, 400, { error: 'Audio data is required' });
        return true;
      }

      // Verify agent exists
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

        // Upload to GCS if configured
        let audioUrl: string;
        if (isGcsConfigured()) {
          const gcsResult = await uploadAudioToGcs(
            audioBuffer,
            userId,
            agentId,
            filename,
            'voiceClone',
            true
          );
          audioUrl = gcsResult?.publicUrl || `local://${userId}/${agentId}/${filename}`;
        } else {
          // Fallback URL for dev without GCS
          audioUrl = `local://${userId}/${agentId}/${filename}`;
          log.warn('GCS not configured, using local reference URL');
        }

        // Update agent with pending status and upload info
        await updateAgentVoice(userId, agentId, {
          type: 'cloned',
          audioSampleUrl: audioUrl,
          status: 'pending',
        });

        log.info(
          { userId, agentId, audioUrl, quality: uploadResult.quality },
          'Voice sample uploaded'
        );
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

    // POST /api/custom-agents/:agentId/voice/clone - Create voice clone
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'clone'
    ) {
      const agentId = segments[0];
      const body = await parseBody<{ uploadId?: string; userName: string }>(req);

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
          message: cloneResult.isSimulated
            ? 'Voice clone created (simulated)'
            : 'Voice clone created',
          voice,
          isSimulated: cloneResult.isSimulated,
        });
      } catch (error) {
        log.error({ error: String(error), userId, agentId }, 'Voice clone creation failed');
        sendJson(res, 500, { error: 'Failed to create voice clone' });
      }
      return true;
    }

    // PUT /api/custom-agents/:agentId/voice/select-premade - Select pre-made voice
    if (
      method === 'PUT' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'select-premade'
    ) {
      const agentId = segments[0];
      const body = await parseBody<{ voiceId: string }>(req);

      if (!body.voiceId) {
        sendJson(res, 400, { error: 'Voice ID is required' });
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

    // GET /api/custom-agents/:agentId/voice/status - Poll voice clone status
    if (
      method === 'GET' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'status'
    ) {
      const agentId = segments[0];

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

      // If processing, simulate progress (in real implementation, check Cartesia API)
      if (voiceStatus.status === 'processing') {
        // Check if we have a voiceId - if so, it's likely ready
        if (agent.voice?.voiceId) {
          // Update status to ready
          await updateAgentVoice(userId, agentId, { status: 'ready' });
          voiceStatus.status = 'ready';
          voiceStatus.isReady = true;
        }
      }

      sendJson(res, 200, voiceStatus);
      return true;
    }

    // POST /api/custom-agents/:agentId/voice/preview - Generate voice preview
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'preview'
    ) {
      const agentId = segments[0];
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

    // ========================================================================
    // VOICE JOURNAL ROUTES (Digital Twin feature)
    // ========================================================================

    // POST /api/custom-agents/:agentId/journal/entry - Record journal entry
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'journal' &&
      segments[2] === 'entry'
    ) {
      const agentId = segments[0];
      const body = await parseBody<{
        audio: string; // base64 encoded audio
        mimeType?: string;
        mood?: string;
        context?: string;
      }>(req);

      if (!body.audio) {
        sendJson(res, 400, { error: 'Audio data is required' });
        return true;
      }

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      // Only allow journal entries for Digital Twin agents
      if (agent.type !== 'twin') {
        sendJson(res, 400, { error: 'Voice journal is only available for Digital Twin agents' });
        return true;
      }

      try {
        const { uploadVoiceJournalEntry } =
          await import('../services/custom-agent/gcs-storage.service.js');
        const { transcribeAudioBuffer, extractMetadata } =
          await import('../services/custom-agent/memory-capture.service.js');

        // Decode base64 audio
        const audioBuffer = Buffer.from(body.audio, 'base64');
        const mimeType = body.mimeType || 'audio/webm';
        const timestamp = new Date().toISOString();

        // Upload to GCS
        let audioUrl: string | null = null;
        const entryId = `journal_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const uploadResult = await uploadVoiceJournalEntry(audioBuffer, userId, agentId, entryId);

        if (uploadResult) {
          audioUrl = uploadResult.publicUrl;
          log.info({ audioUrl }, 'Journal audio uploaded to GCS');
        } else {
          log.warn('GCS upload failed, continuing without audio URL');
        }

        // Transcribe audio
        const transcript = await transcribeAudioBuffer(
          audioBuffer.buffer.slice(
            audioBuffer.byteOffset,
            audioBuffer.byteOffset + audioBuffer.byteLength
          ),
          mimeType
        );

        // Extract metadata from transcript
        const metadata = await extractMetadata(transcript, 'journal_entry');

        // Create journal entry
        const journalEntry = {
          id: entryId,
          content: transcript,
          audioUrl,
          title: metadata.title || `Journal Entry - ${new Date().toLocaleDateString()}`,
          mood: body.mood || metadata.emotions?.[0] || 'reflective',
          context: body.context,
          themes: metadata.themes || [],
          emotions: metadata.emotions || [],
          keywords: metadata.keyPhrases || [],
          summary: metadata.summary,
          timestamp,
          createdAt: new Date(),
        };

        // Add to agent's journal entries
        const updated = await addMemoryToAgent(
          userId,
          agentId,
          'journalEntries' as never,
          journalEntry
        );

        if (!updated) {
          sendJson(res, 500, { error: 'Failed to save journal entry' });
          return true;
        }

        log.info({ userId, agentId, entryId: journalEntry.id }, 'Journal entry created');
        sendJson(res, 201, {
          message: 'Journal entry recorded',
          entry: journalEntry,
          transcriptLength: transcript.length,
        });
      } catch (error) {
        log.error({ error: String(error), userId, agentId }, 'Journal entry creation failed');
        sendJson(res, 500, { error: 'Failed to create journal entry' });
      }
      return true;
    }

    // GET /api/custom-agents/:agentId/journal/entries - List journal entries
    if (
      method === 'GET' &&
      segments.length === 3 &&
      segments[1] === 'journal' &&
      segments[2] === 'entries'
    ) {
      const agentId = segments[0];
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '10', 10);

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      const entries = (agent.memories.journalEntries || [])
        .sort((a, b) => {
          // Use createdAt for sorting since timestamp might not exist on all entries
          const aEntry = a as { createdAt?: Date | string };
          const bEntry = b as { createdAt?: Date | string };
          const aTime = aEntry.createdAt ? new Date(aEntry.createdAt).getTime() : 0;
          const bTime = bEntry.createdAt ? new Date(bEntry.createdAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, limit);

      sendJson(res, 200, {
        entries,
        total: agent.memories.journalEntries?.length || 0,
        limit,
      });
      return true;
    }

    // ========================================================================
    // MEMORY ROUTES
    // ========================================================================

    // POST /api/custom-agents/:agentId/memories - Add memory
    if (method === 'POST' && segments.length === 2 && segments[1] === 'memories') {
      const agentId = segments[0];
      const body = await parseBody<{
        type: string;
        content: string;
        audioUrl?: string;
        title?: string;
        phrase?: string;
        context?: string;
        mood?: string;
        keywords?: string[];
        themes?: string[];
        emotions?: string[];
      }>(req);

      if (!body.type || !body.content) {
        sendJson(res, 400, { error: 'Type and content are required' });
        return true;
      }

      const validTypes = ['story', 'wisdom', 'sharedMoment', 'journalEntry'];
      if (!validTypes.includes(body.type)) {
        sendJson(res, 400, { error: 'Invalid memory type' });
        return true;
      }

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      const typeMap: Record<string, string> = {
        story: 'stories',
        wisdom: 'wisdom',
        sharedMoment: 'sharedMoments',
        journalEntry: 'journalEntries',
      };

      // Use provided keywords/themes/emotions or extract from content
      const memory = {
        content: body.content,
        audioUrl: body.audioUrl,
        title: body.title,
        phrase: body.phrase,
        context: body.context,
        mood: body.mood,
        themes: body.themes || [],
        emotions: body.emotions || [],
        keywords: body.keywords || extractKeywords(body.content),
      };

      const updated = await addMemoryToAgent(userId, agentId, typeMap[body.type] as never, memory);

      if (!updated) {
        sendJson(res, 500, { error: 'Failed to add memory' });
        return true;
      }

      log.info({ userId, agentId, type: body.type }, 'Memory added');
      sendJson(res, 201, { message: 'Memory added', memory });
      return true;
    }

    // GET /api/custom-agents/:agentId/memories - List memories
    if (method === 'GET' && segments.length === 2 && segments[1] === 'memories') {
      const agentId = segments[0];
      const memoryType = parsedUrl.searchParams.get('type');

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      let memories: unknown[] = [];

      if (memoryType) {
        const typeMap: Record<string, keyof typeof agent.memories> = {
          story: 'stories',
          wisdom: 'wisdom',
          sharedMoment: 'sharedMoments',
          journalEntry: 'journalEntries',
        };
        const key = typeMap[memoryType];
        if (key && agent.memories[key]) {
          memories = agent.memories[key] as unknown[];
        }
      } else {
        memories = [
          ...agent.memories.stories,
          ...agent.memories.wisdom,
          ...agent.memories.sharedMoments,
          ...(agent.memories.journalEntries || []),
        ];
      }

      sendJson(res, 200, memories);
      return true;
    }

    // DELETE /api/custom-agents/:agentId/memories/:memoryId - Delete memory
    if (method === 'DELETE' && segments.length === 3 && segments[1] === 'memories') {
      const agentId = segments[0];
      const memoryId = segments[2];
      const memoryType = parsedUrl.searchParams.get('type');

      if (!memoryType) {
        sendJson(res, 400, { error: 'Memory type is required' });
        return true;
      }

      const typeMap: Record<string, string> = {
        story: 'stories',
        wisdom: 'wisdom',
        sharedMoment: 'sharedMoments',
        journalEntry: 'journalEntries',
      };

      const internalType = typeMap[memoryType];
      if (!internalType) {
        sendJson(res, 400, { error: 'Invalid memory type' });
        return true;
      }

      const updated = await removeMemoryFromAgent(userId, agentId, internalType as never, memoryId);

      if (!updated) {
        sendJson(res, 404, { error: 'Agent or memory not found' });
        return true;
      }

      log.info({ userId, agentId, memoryId }, 'Memory deleted');
      res.writeHead(204);
      res.end();
      return true;
    }

    // ========================================================================
    // PROMPT GENERATION
    // ========================================================================

    // POST /api/custom-agents/:agentId/generate-prompt
    if (method === 'POST' && segments.length === 2 && segments[1] === 'generate-prompt') {
      const agentId = segments[0];

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

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Custom agent route error');
    sendJson(res, 500, {
      error: 'Internal server error',
      message: (error as Error).message,
    });
    return true;
  }
}

// ============================================================================
// PROMPT GENERATION HELPERS
// ============================================================================

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
