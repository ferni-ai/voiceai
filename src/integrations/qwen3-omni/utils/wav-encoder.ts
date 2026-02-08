/**
 * WAV Encoder/Decoder Utilities
 *
 * Lightweight PCM ↔ WAV conversion for Qwen3-Omni audio I/O.
 * WAV is just PCM + a 44-byte header. These operations are <0.1ms.
 *
 * Used by:
 * - RealtimeModel: Encodes user audio (PCM → WAV → base64) for Qwen3-Omni input
 * - RealtimeModel: Decodes Qwen3-Omni audio output (base64 → WAV → PCM) for LiveKit
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'WavEncoder' });

// =============================================================================
// CONSTANTS
// =============================================================================

/** Standard WAV header size in bytes */
const WAV_HEADER_SIZE = 44;

/** Default audio parameters matching Qwen3-Omni expectations */
const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_BITS_PER_SAMPLE = 16;
const DEFAULT_NUM_CHANNELS = 1;

// =============================================================================
// ENCODING: PCM → WAV
// =============================================================================

export interface PcmToWavOptions {
  /** Sample rate in Hz (default: 24000) */
  sampleRate?: number;
  /** Bits per sample (default: 16) */
  bitsPerSample?: number;
  /** Number of channels (default: 1 = mono) */
  numChannels?: number;
}

/**
 * Convert raw PCM audio data to WAV format.
 *
 * Prepends a 44-byte RIFF/WAV header to the raw PCM data.
 * This is a pure memory operation — no compression, no encoding.
 *
 * @param pcmData - Raw PCM audio samples (Int16 LE for 16-bit)
 * @param options - Audio format parameters
 * @returns Complete WAV file as Uint8Array
 */
export function pcmToWav(pcmData: Uint8Array, options: PcmToWavOptions = {}): Uint8Array {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const bitsPerSample = options.bitsPerSample ?? DEFAULT_BITS_PER_SAMPLE;
  const numChannels = options.numChannels ?? DEFAULT_NUM_CHANNELS;

  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const fileSize = WAV_HEADER_SIZE + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const output = new Uint8Array(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true); // File size minus RIFF header
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Copy PCM data after header
  output.set(pcmData, WAV_HEADER_SIZE);

  return output;
}

/**
 * Convert PCM data to a base64-encoded WAV data URL.
 *
 * This is the format Qwen3-Omni expects for audio input:
 * "data:audio/wav;base64,UklGR..."
 *
 * @param pcmData - Raw PCM audio samples
 * @param options - Audio format parameters
 * @returns Base64 data URL string
 */
export function pcmToWavDataUrl(pcmData: Uint8Array, options: PcmToWavOptions = {}): string {
  const wav = pcmToWav(pcmData, options);
  const base64 = uint8ArrayToBase64(wav);
  return `data:audio/wav;base64,${base64}`;
}

// =============================================================================
// DECODING: WAV → PCM
// =============================================================================

export interface WavMetadata {
  sampleRate: number;
  bitsPerSample: number;
  numChannels: number;
  dataSize: number;
  audioFormat: number;
}

/**
 * Extract raw PCM data from a WAV file.
 *
 * Strips the 44-byte header and returns raw audio samples.
 *
 * @param wavData - Complete WAV file as Uint8Array
 * @returns Object with PCM data and metadata
 */
export function wavToPcm(wavData: Uint8Array): {
  pcmData: Uint8Array;
  metadata: WavMetadata;
} {
  if (wavData.length < WAV_HEADER_SIZE) {
    throw new Error(
      `Invalid WAV: file too small (${wavData.length} bytes, need at least ${WAV_HEADER_SIZE})`
    );
  }

  const view = new DataView(wavData.buffer, wavData.byteOffset, wavData.byteLength);

  // Validate RIFF header
  const riff = readString(view, 0, 4);
  if (riff !== 'RIFF') {
    throw new Error(`Invalid WAV: expected RIFF header, got "${riff}"`);
  }

  const wave = readString(view, 8, 4);
  if (wave !== 'WAVE') {
    throw new Error(`Invalid WAV: expected WAVE format, got "${wave}"`);
  }

  // Parse fmt sub-chunk
  const audioFormat = view.getUint16(20, true);
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);

  // Find data sub-chunk (may not be at offset 36 if there are extra chunks)
  let dataOffset = 36;
  let dataSize = 0;

  while (dataOffset < wavData.length - 8) {
    const chunkId = readString(view, dataOffset, 4);
    const chunkSize = view.getUint32(dataOffset + 4, true);

    if (chunkId === 'data') {
      dataSize = chunkSize;
      dataOffset += 8; // Skip chunk header to get to data
      break;
    }

    // Skip this chunk (header + data, padded to even size)
    dataOffset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataSize === 0) {
    throw new Error('Invalid WAV: no data chunk found');
  }

  const pcmData = wavData.slice(dataOffset, dataOffset + dataSize);

  return {
    pcmData,
    metadata: {
      sampleRate,
      bitsPerSample,
      numChannels,
      dataSize,
      audioFormat,
    },
  };
}

/**
 * Decode a base64-encoded WAV data URL to raw PCM.
 *
 * Handles format: "data:audio/wav;base64,UklGR..."
 *
 * @param dataUrl - Base64 WAV data URL
 * @returns Object with PCM data and metadata
 */
export function wavDataUrlToPcm(dataUrl: string): {
  pcmData: Uint8Array;
  metadata: WavMetadata;
} {
  const base64Data = extractBase64FromDataUrl(dataUrl);
  const wavData = base64ToUint8Array(base64Data);
  return wavToPcm(wavData);
}

// =============================================================================
// INT16 HELPERS (for LiveKit AudioFrame compatibility)
// =============================================================================

/**
 * Convert Int16Array (LiveKit AudioFrame format) to Uint8Array (byte buffer).
 *
 * LiveKit's AudioFrame stores samples as Int16Array.
 * WAV files store 16-bit PCM as little-endian bytes.
 *
 * @param samples - Audio samples as Int16Array
 * @returns Byte representation of the samples
 */
export function int16ToBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

/**
 * Convert byte buffer back to Int16Array for LiveKit AudioFrame.
 *
 * @param bytes - Raw PCM bytes (16-bit LE)
 * @returns Audio samples as Int16Array
 */
export function bytesToInt16(bytes: Uint8Array): Int16Array {
  // Ensure 2-byte alignment
  if (bytes.byteOffset % 2 !== 0) {
    const aligned = new Uint8Array(bytes.length);
    aligned.set(bytes);
    return new Int16Array(aligned.buffer, 0, aligned.length / 2);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
}

// =============================================================================
// BASE64 UTILITIES
// =============================================================================

/**
 * Encode Uint8Array to base64 string.
 * Uses Node.js Buffer for performance.
 */
export function uint8ArrayToBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64');
}

/**
 * Decode base64 string to Uint8Array.
 * Uses Node.js Buffer for performance.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Extract base64 payload from a data URL.
 *
 * Handles: "data:audio/wav;base64,UklGR..." → "UklGR..."
 * Also handles raw base64 without the data URL prefix.
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex !== -1 && dataUrl.startsWith('data:')) {
    return dataUrl.slice(commaIndex + 1);
  }
  // Assume raw base64
  return dataUrl;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function readString(view: DataView, offset: number, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += String.fromCharCode(view.getUint8(offset + i));
  }
  return result;
}
