/**
 * Voice Clone Service for Custom Agents
 *
 * Handles voice cloning via Cartesia API for custom agent creation.
 * Supports:
 * - Audio upload processing
 * - Voice clone creation
 * - Voice preview generation
 * - Clone quality assessment
 *
 * @module services/custom-agent/voice-clone
 */

import { getLogger } from '../../utils/safe-logger.js';
import { getRateLimiter } from '../../tools/rate-limiter.js';
import type {
  ClonedVoice,
  VoiceUploadResponse,
  CreateVoiceCloneResponse,
} from '../../types/custom-agent.js';
import {
  uploadAudioToGcs,
  downloadAudioFromGcs,
  deleteAudioFromGcs,
  isGcsConfigured,
  type UploadResult,
} from './gcs-storage-service.js';

const log = getLogger().child({ module: 'VoiceCloneService' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_BASE_URL = 'https://api.cartesia.ai';

/**
 * Quality thresholds for voice cloning
 */
const QUALITY_THRESHOLDS = {
  /** Absolute minimum (10 seconds) */
  minimum: 10,
  /** Fair quality (30 seconds) */
  fair: 30,
  /** Good quality (60 seconds) */
  good: 60,
  /** Excellent quality (180 seconds / 3 minutes) */
  excellent: 180,
};

/**
 * Maximum file size per upload (50MB)
 */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Supported audio formats
 */
const SUPPORTED_FORMATS = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg'];

// ============================================================================
// TYPES
// ============================================================================

interface AudioAnalysis {
  /** Duration in seconds */
  duration: number;
  /** Estimated speech duration (excluding silence) */
  speechDuration: number;
  /** Quality score (0-1) */
  qualityScore: number;
  /** Sample rate */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Warning messages */
  warnings: string[];
}

interface ProcessedUpload {
  /** Unique upload ID */
  uploadId: string;
  /** Original filename */
  filename: string;
  /** Audio analysis */
  analysis: AudioAnalysis;
  /** Storage URL (GCS public URL or temp URL) */
  storageUrl: string;
  /** GCS file path (for downloads) */
  gcsFilePath?: string;
  /** When uploaded */
  uploadedAt: Date;
}

interface CartesiaVoiceCloneResponse {
  id: string;
  name: string;
  description?: string;
  is_public: boolean;
  created_at: string;
  embedding?: number[];
}

// ============================================================================
// AUDIO PROCESSING
// ============================================================================

/**
 * Analyze audio file for voice cloning suitability
 */
export async function analyzeAudio(audioBuffer: ArrayBuffer): Promise<AudioAnalysis> {
  // In production, this would use a proper audio analysis library
  // For now, we estimate based on file size and header info

  const dataView = new DataView(audioBuffer);
  const warnings: string[] = [];

  // Try to detect WAV header
  let sampleRate = 44100;
  let channels = 1;
  let duration = 0;

  try {
    // Check for WAV header
    const riff = String.fromCharCode(
      dataView.getUint8(0),
      dataView.getUint8(1),
      dataView.getUint8(2),
      dataView.getUint8(3)
    );

    if (riff === 'RIFF') {
      // Parse WAV header
      sampleRate = dataView.getUint32(24, true);
      channels = dataView.getUint16(22, true);
      const bitsPerSample = dataView.getUint16(34, true);
      const dataSize = dataView.getUint32(40, true);

      // Calculate duration
      const bytesPerSample = bitsPerSample / 8;
      const totalSamples = dataSize / (bytesPerSample * channels);
      duration = totalSamples / sampleRate;
    } else {
      // Estimate duration from file size for other formats
      // Rough estimate: ~128kbps for MP3
      duration = (audioBuffer.byteLength * 8) / (128 * 1000);
      warnings.push('Could not parse audio header, duration is estimated');
    }
  } catch (error) {
    // Fallback estimation
    duration = (audioBuffer.byteLength * 8) / (128 * 1000);
    warnings.push('Audio header parsing failed, using estimated values');
  }

  // Estimate speech duration (assume 70% is actual speech)
  const speechDuration = duration * 0.7;

  // Calculate quality score based on duration
  let qualityScore = 0;
  if (speechDuration >= QUALITY_THRESHOLDS.excellent) {
    qualityScore = 1.0;
  } else if (speechDuration >= QUALITY_THRESHOLDS.good) {
    qualityScore = 0.8;
  } else if (speechDuration >= QUALITY_THRESHOLDS.fair) {
    qualityScore = 0.6;
  } else if (speechDuration >= QUALITY_THRESHOLDS.minimum) {
    qualityScore = 0.4;
  } else {
    qualityScore = speechDuration / QUALITY_THRESHOLDS.minimum;
    warnings.push(
      `Audio duration (${speechDuration.toFixed(1)}s) is below minimum (${QUALITY_THRESHOLDS.minimum}s)`
    );
  }

  // Adjust quality based on sample rate
  if (sampleRate < 16000) {
    qualityScore *= 0.8;
    warnings.push('Low sample rate may affect voice quality');
  }

  return {
    duration,
    speechDuration,
    qualityScore,
    sampleRate,
    channels,
    warnings,
  };
}

/**
 * Get quality rating from score
 */
function getQualityRating(totalDuration: number): 'poor' | 'fair' | 'good' | 'excellent' {
  if (totalDuration >= QUALITY_THRESHOLDS.excellent) return 'excellent';
  if (totalDuration >= QUALITY_THRESHOLDS.good) return 'good';
  if (totalDuration >= QUALITY_THRESHOLDS.fair) return 'fair';
  return 'poor';
}

// ============================================================================
// UPLOAD HANDLING
// ============================================================================

/**
 * In-memory storage for pending uploads metadata
 * Audio buffers are stored in GCS when available, or in-memory as fallback
 */
const pendingUploads = new Map<string, ProcessedUpload[]>();

/**
 * In-memory storage for audio buffers (fallback when GCS is not configured)
 */
const audioBuffers = new Map<string, ArrayBuffer>();

/**
 * Process uploaded audio files for voice cloning
 * Uploads files to GCS when available, falls back to in-memory storage
 */
export async function processVoiceUpload(
  agentId: string,
  files: Array<{ filename: string; buffer: ArrayBuffer; mimeType: string }>,
  userId = 'anonymous'
): Promise<VoiceUploadResponse> {
  log.info(
    { agentId, fileCount: files.length, gcsConfigured: isGcsConfigured() },
    'Processing voice upload'
  );

  const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const processed: ProcessedUpload[] = [];
  const segments: VoiceUploadResponse['segments'] = [];

  let totalDuration = 0;

  for (const file of files) {
    // Validate file type
    if (!SUPPORTED_FORMATS.includes(file.mimeType)) {
      log.warn({ mimeType: file.mimeType }, 'Unsupported audio format');
      continue;
    }

    // Validate file size
    if (file.buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      log.warn({ size: file.buffer.byteLength }, 'File too large');
      continue;
    }

    // Analyze audio
    const analysis = await analyzeAudio(file.buffer);

    // Generate buffer key for retrieval
    const bufferKey = `${uploadId}_${file.filename}`;
    let storageUrl: string;
    let gcsFilePath: string | undefined;

    // Try to upload to GCS, fall back to in-memory storage
    if (isGcsConfigured()) {
      const gcsResult = await uploadAudioToGcs(
        file.buffer,
        userId,
        agentId,
        file.filename,
        'voiceClone',
        true
      );

      if (gcsResult) {
        storageUrl = gcsResult.publicUrl;
        gcsFilePath = gcsResult.filePath;
        log.debug({ filename: file.filename, publicUrl: storageUrl }, 'Audio uploaded to GCS');
      } else {
        // Fallback to in-memory if GCS upload fails
        storageUrl = `temp://${uploadId}/${file.filename}`;
        audioBuffers.set(bufferKey, file.buffer);
        log.warn({ filename: file.filename }, 'GCS upload failed, using in-memory storage');
      }
    } else {
      // No GCS configured, use in-memory storage
      storageUrl = `temp://${uploadId}/${file.filename}`;
      audioBuffers.set(bufferKey, file.buffer);
      log.debug({ filename: file.filename }, 'Using in-memory storage (no GCS configured)');
    }

    processed.push({
      uploadId: bufferKey,
      filename: file.filename,
      analysis,
      storageUrl,
      gcsFilePath,
      uploadedAt: new Date(),
    });

    segments.push({
      filename: file.filename,
      duration: analysis.duration,
      speechDuration: analysis.speechDuration,
      qualityScore: analysis.qualityScore,
    });

    totalDuration += analysis.speechDuration;
  }

  // Store metadata for later retrieval
  pendingUploads.set(uploadId, processed);

  // Schedule cleanup after 1 hour
  setTimeout(
    async () => {
      const uploadsToClean = pendingUploads.get(uploadId);
      if (uploadsToClean) {
        for (const upload of uploadsToClean) {
          // Clean up in-memory buffer
          audioBuffers.delete(upload.uploadId);
          // Clean up GCS file if it exists
          if (upload.gcsFilePath) {
            await deleteAudioFromGcs(upload.gcsFilePath);
          }
        }
      }
      pendingUploads.delete(uploadId);
      log.debug({ uploadId }, 'Cleaned up pending upload and audio files');
    },
    60 * 60 * 1000
  );

  log.info({ uploadId, totalDuration, segmentCount: segments.length }, 'Voice upload processed');

  return {
    uploadId,
    totalDuration,
    quality: getQualityRating(totalDuration),
    segments,
  };
}

// ============================================================================
// VOICE CLONING
// ============================================================================

/**
 * Create a voice clone using Cartesia API
 */
export async function createVoiceClone(
  agentId: string,
  userId: string,
  uploadId: string,
  voiceName?: string
): Promise<CreateVoiceCloneResponse> {
  log.info({ agentId, userId, uploadId }, 'Creating voice clone');

  // Retrieve pending upload
  const uploads = pendingUploads.get(uploadId);
  if (!uploads || uploads.length === 0) {
    throw new Error('Upload not found or expired');
  }

  // Calculate total duration
  const totalDuration = uploads.reduce((sum, u) => sum + u.analysis.speechDuration, 0);
  if (totalDuration < QUALITY_THRESHOLDS.minimum) {
    throw new Error(
      `Insufficient audio. Need at least ${QUALITY_THRESHOLDS.minimum}s, got ${totalDuration.toFixed(1)}s`
    );
  }

  // Prepare the clone request
  const cloneName = voiceName || `ferni_custom_${userId}_${agentId}`;

  try {
    // Call Cartesia API - audio buffers are retrieved internally from GCS or memory
    const response = await callCartesiaCloneAPI(cloneName, uploads);

    // Clean up pending uploads and audio buffers/GCS files
    pendingUploads.delete(uploadId);
    for (const upload of uploads) {
      // Clean up in-memory buffer
      audioBuffers.delete(upload.uploadId);
      // Clean up GCS file if it exists
      if (upload.gcsFilePath) {
        await deleteAudioFromGcs(upload.gcsFilePath);
      }
    }

    // Detect if the response is simulated (voice ID starts with voice_sim_)
    const isSimulated = response.id.startsWith('voice_sim_');

    log.info(
      {
        agentId,
        voiceId: response.id,
        qualityScore: uploads[0].analysis.qualityScore,
        isSimulated,
      },
      'Voice clone created'
    );

    return {
      voiceId: response.id,
      status: 'ready',
      qualityScore: uploads.reduce((sum, u) => sum + u.analysis.qualityScore, 0) / uploads.length,
      isSimulated,
    };
  } catch (error) {
    log.error({ error: String(error), agentId }, 'Voice clone creation failed');
    throw new Error('Failed to create voice clone');
  }
}

/**
 * Get audio buffer for an upload - either from in-memory storage or GCS
 */
async function getAudioBuffer(upload: ProcessedUpload): Promise<ArrayBuffer | null> {
  // Try in-memory first
  const memoryBuffer = audioBuffers.get(upload.uploadId);
  if (memoryBuffer) {
    return memoryBuffer;
  }

  // Try GCS if file path is available
  if (upload.gcsFilePath) {
    const gcsBuffer = await downloadAudioFromGcs(upload.gcsFilePath);
    if (gcsBuffer) {
      // Create a new ArrayBuffer from the GCS buffer to ensure correct type
      const arrayBuffer = new ArrayBuffer(gcsBuffer.length);
      const view = new Uint8Array(arrayBuffer);
      view.set(gcsBuffer);
      return arrayBuffer;
    }
  }

  log.warn({ uploadId: upload.uploadId }, 'Could not retrieve audio buffer');
  return null;
}

/**
 * Call Cartesia Voice Clone API
 *
 * Uses Cartesia's instant voice cloning API which requires just 10 seconds of audio.
 * Docs: https://docs.cartesia.ai/api-reference/voices/clone
 */
async function callCartesiaCloneAPI(
  name: string,
  uploads: ProcessedUpload[]
): Promise<CartesiaVoiceCloneResponse> {
  // Rate limiting for expensive voice clone operations
  const rateLimiter = getRateLimiter('cartesia-voice-clone');
  if (!rateLimiter.tryAcquire()) {
    log.warn('Cartesia voice clone API rate limited');
    throw new Error('Rate limited - voice clone operation. Please try again in a few seconds.');
  }

  // If no API key, return simulated response for development
  if (!CARTESIA_API_KEY) {
    log.warn('CARTESIA_API_KEY not set, using simulated voice clone');
    return {
      id: `voice_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name,
      description: `Custom voice for ${name} (simulated)`,
      is_public: false,
      created_at: new Date().toISOString(),
    };
  }

  try {
    // Build FormData for Cartesia API
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', `Custom voice for ${name}`);
    formData.append('language', 'en');

    // Add audio clips - retrieve from GCS or in-memory
    let clipsAdded = 0;
    for (const upload of uploads) {
      const buffer = await getAudioBuffer(upload);
      if (buffer) {
        // Convert ArrayBuffer to Blob
        const blob = new Blob([buffer], { type: 'audio/wav' });
        formData.append('clip', blob, upload.filename);
        clipsAdded++;
      }
    }

    if (clipsAdded === 0) {
      throw new Error('No audio clips available for voice clone');
    }

    log.info({ name, clipCount: clipsAdded }, 'Calling Cartesia voice clone API');

    const response = await fetch(`${CARTESIA_BASE_URL}/voices/clone/clip`, {
      method: 'POST',
      headers: {
        'X-API-Key': CARTESIA_API_KEY,
        'Cartesia-Version': '2024-06-10',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'Cartesia API error');
      throw new Error(`Cartesia API error: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as CartesiaVoiceCloneResponse;
    log.info({ voiceId: result.id, name: result.name }, 'Voice clone created successfully');

    return result;
  } catch (error) {
    log.error({ error: String(error), name }, 'Failed to call Cartesia API');

    // Fallback to simulated response in case of network errors
    if (process.env.NODE_ENV !== 'production') {
      log.warn('Falling back to simulated voice clone');
      return {
        id: `voice_fallback_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        name,
        description: `Custom voice for ${name} (fallback)`,
        is_public: false,
        created_at: new Date().toISOString(),
      };
    }

    throw error;
  }
}

// ============================================================================
// VOICE PREVIEW
// ============================================================================

/**
 * Generate a preview of the cloned voice using Cartesia TTS
 */
export async function generateVoicePreview(
  voiceId: string,
  text: string
): Promise<{ audioUrl: string; durationSeconds: number; audioBase64?: string }> {
  log.info({ voiceId, textLength: text.length }, 'Generating voice preview');

  // Rate limiting for TTS preview operations
  const rateLimiter = getRateLimiter('cartesia');
  if (!rateLimiter.tryAcquire()) {
    log.warn('Cartesia TTS API rate limited');
    throw new Error('Rate limited - TTS preview. Please try again shortly.');
  }

  // If no API key, return simulated response
  if (!CARTESIA_API_KEY) {
    log.warn('CARTESIA_API_KEY not set, returning simulated preview');
    return {
      audioUrl: `preview://${voiceId}/${Date.now()}.mp3`,
      durationSeconds: text.length * 0.05,
    };
  }

  try {
    const response = await fetch(`${CARTESIA_BASE_URL}/tts/bytes`, {
      method: 'POST',
      headers: {
        'X-API-Key': CARTESIA_API_KEY,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        voice: { mode: 'id', id: voiceId },
        transcript: text,
        output_format: { container: 'mp3', encoding: 'mp3', sample_rate: 44100 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, error: errorText }, 'Cartesia TTS API error');
      throw new Error(`TTS API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // Estimate duration based on audio size (~128kbps MP3)
    const durationSeconds = (audioBuffer.byteLength * 8) / (128 * 1000);

    log.info({ voiceId, durationSeconds }, 'Voice preview generated');

    return {
      audioUrl: `data:audio/mp3;base64,${audioBase64}`,
      durationSeconds,
      audioBase64,
    };
  } catch (error) {
    log.error({ error: String(error), voiceId }, 'Failed to generate voice preview');

    // Fallback for development
    if (process.env.NODE_ENV !== 'production') {
      return {
        audioUrl: `preview://${voiceId}/${Date.now()}.mp3`,
        durationSeconds: text.length * 0.05,
      };
    }

    throw error;
  }
}

// ============================================================================
// VOICE MANAGEMENT
// ============================================================================

/**
 * Get voice clone details
 */
export async function getVoiceClone(voiceId: string): Promise<ClonedVoice | null> {
  log.debug({ voiceId }, 'Getting voice clone details');

  if (!CARTESIA_API_KEY) {
    return null;
  }

  // In production, fetch from Cartesia API
  // const response = await fetch(`${CARTESIA_BASE_URL}/voices/${voiceId}`, {
  //   headers: { 'X-API-Key': CARTESIA_API_KEY },
  // });

  // Simulated response
  return {
    cartesiaVoiceId: voiceId,
    createdAt: new Date(),
    sourceAudioDuration: 60,
    sourceAudioCount: 3,
    qualityScore: 0.85,
    status: 'ready',
  };
}

/**
 * Delete a voice clone
 */
export async function deleteVoiceClone(voiceId: string): Promise<boolean> {
  log.info({ voiceId }, 'Deleting voice clone');

  if (!CARTESIA_API_KEY) {
    return false;
  }

  // In production, call Cartesia API:
  // await fetch(`${CARTESIA_BASE_URL}/voices/${voiceId}`, {
  //   method: 'DELETE',
  //   headers: { 'X-API-Key': CARTESIA_API_KEY },
  // });

  return true;
}

// ============================================================================
// VOICE LIBRARY
// ============================================================================

/**
 * Voice library entry
 */
export interface VoiceLibraryEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  previewUrl: string;
  provider: 'cartesia';
  voiceId: string;
}

/**
 * Voice library categories for selection
 */
export const VOICE_LIBRARY_CATEGORIES = [
  'Warm & Nurturing',
  'Wise & Steady',
  'Energetic & Uplifting',
  'Calm & Soothing',
  'Professional & Confident',
  'Young & Friendly',
  'Elderly & Wise',
] as const;

/**
 * Get available voices from library
 */
export async function getVoiceLibrary(category?: string): Promise<VoiceLibraryEntry[]> {
  // In production, this would fetch from Cartesia's voice library
  // and filter to suitable voices for custom agents

  const library: VoiceLibraryEntry[] = [
    {
      id: 'warm-grandma-1',
      name: 'Rose',
      description: 'Warm, nurturing elderly woman with Southern accent',
      category: 'Warm & Nurturing',
      tags: ['elderly', 'southern', 'warm', 'grandmother'],
      previewUrl: '/voices/previews/rose.mp3',
      provider: 'cartesia',
      voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    },
    {
      id: 'wise-grandpa-1',
      name: 'Walter',
      description: 'Calm, wise elderly man with gentle demeanor',
      category: 'Wise & Steady',
      tags: ['elderly', 'calm', 'wise', 'grandfather'],
      previewUrl: '/voices/previews/walter.mp3',
      provider: 'cartesia',
      voiceId: 'f114a467-c40a-4db8-964d-aaba89cd08fa',
    },
    {
      id: 'nurturing-mom-1',
      name: 'Sarah',
      description: 'Warm, supportive middle-aged woman',
      category: 'Warm & Nurturing',
      tags: ['nurturing', 'supportive', 'mother'],
      previewUrl: '/voices/previews/sarah.mp3',
      provider: 'cartesia',
      voiceId: '694f9389-aac1-45b6-b726-9d9369183238',
    },
    {
      id: 'mentor-dad-1',
      name: 'James',
      description: 'Steady, encouraging middle-aged man',
      category: 'Professional & Confident',
      tags: ['confident', 'encouraging', 'mentor'],
      previewUrl: '/voices/previews/james.mp3',
      provider: 'cartesia',
      voiceId: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    },
    {
      id: 'calm-therapist-1',
      name: 'Dr. Chen',
      description: 'Calm, soothing professional voice',
      category: 'Calm & Soothing',
      tags: ['professional', 'calm', 'therapist'],
      previewUrl: '/voices/previews/dr-chen.mp3',
      provider: 'cartesia',
      voiceId: '2ee87190-8f84-4925-97da-e52547f9462c',
    },
  ];

  if (category) {
    return library.filter((v) => v.category === category);
  }

  return library;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { QUALITY_THRESHOLDS, SUPPORTED_FORMATS, MAX_FILE_SIZE_BYTES };
