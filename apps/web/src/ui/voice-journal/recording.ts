/**
 * Voice Recording
 *
 * Audio recording, visualization, and transcription.
 *
 * @module voice-journal/recording
 */

import { createLogger } from '../../utils/logger.js';
import { soundUI } from '../sound.ui.js';
import {
  getModal,
  isRecording,
  setIsRecording,
  getRecordingStartTime,
  setRecordingStartTime,
  setRecordingDuration,
  getMediaRecorder,
  setMediaRecorder,
  getAudioChunks,
  clearAudioChunks,
  pushAudioChunk,
  getAnimationFrameId,
  setAnimationFrameId,
  getAudioContext,
  setAudioContext,
  getAnalyser,
  setAnalyser,
} from './state.js';
import { saveJournalEntry } from './save.js';

const log = createLogger('VoiceJournalRecording');

// ============================================================================
// AUDIO FORMAT DETECTION
// ============================================================================

/**
 * Get the best supported audio MIME type for MediaRecorder.
 * Safari doesn't support audio/webm, so we fall back to audio/mp4.
 */
export function getSupportedMimeType(): string {
  const mimeTypes = [
    'audio/webm;codecs=opus',  // Best quality, Chrome/Firefox
    'audio/webm',              // Chrome/Firefox fallback
    'audio/mp4',               // Safari
    'audio/ogg;codecs=opus',   // Firefox alternative
    'audio/wav',               // Universal fallback (larger files)
  ];

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  // Last resort - let browser choose
  return '';
}

// ============================================================================
// RECORDING CONTROLS
// ============================================================================

export async function toggleRecording(): Promise<void> {
  if (isRecording()) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

export async function startRecording(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const audioCtx = new AudioContext();
    setAudioContext(audioCtx);
    const source = audioCtx.createMediaStreamSource(stream);
    const analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);
    setAnalyser(analyserNode);

    // Detect best supported audio format (Safari uses mp4, Chrome/Firefox use webm)
    const mimeType = getSupportedMimeType();
    log.debug('Using audio MIME type:', mimeType);

    const recorder = new MediaRecorder(stream, { mimeType });
    setMediaRecorder(recorder);
    clearAudioChunks();

    recorder.ondataavailable = (e) => {
      pushAudioChunk(e.data);
    };

    recorder.onstop = async () => {
      const audioChunks = getAudioChunks();
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      await saveJournalEntry(audioBlob);
    };

    recorder.start();
    setIsRecording(true);
    setRecordingStartTime(Date.now());

    updateRecordingUI(true);
    startVisualization();

    soundUI.play('click');
  } catch (error) {
    log.error('Failed to start recording:', error);
    const { toast } = await import('../toast.ui.js');
    toast.error('Could not access microphone');
  }
}

export async function stopRecording(): Promise<void> {
  const mediaRecorder = getMediaRecorder();
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    return;
  }

  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((track) => track.stop());

  setIsRecording(false);
  setRecordingStartTime(null);

  updateRecordingUI(false);
  stopVisualization();

  soundUI.play('success');
}

// ============================================================================
// UI UPDATES
// ============================================================================

export function updateRecordingUI(recording: boolean): void {
  const modal = getModal();
  const btn = modal?.querySelector('#record-btn');
  const label = btn?.querySelector('.btn-label');

  if (recording) {
    btn?.classList.add('recording');
    if (label) label.textContent = 'Stop Recording';
  } else {
    btn?.classList.remove('recording');
    if (label) label.textContent = 'Start Recording';
  }
}

// ============================================================================
// VISUALIZATION
// ============================================================================

export function startVisualization(): void {
  const modal = getModal();
  const canvas = modal?.querySelector('#journal-visualizer') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  const timeDisplay = modal?.querySelector('#recorder-time');
  const analyser = getAnalyser();

  if (!canvas || !ctx || !analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  // Get accent color from CSS variable
  const computedStyle = getComputedStyle(document.documentElement);
  const accentColor = computedStyle.getPropertyValue('--color-accent').trim() || '#4a6741';

  function draw(): void {
    const currentAnalyser = getAnalyser();
    if (!isRecording() || !currentAnalyser || !ctx) return;

    currentAnalyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 60;

    // Draw center circle with accent color (10% opacity)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = `${accentColor}1a`; // 10% opacity
    ctx.fill();

    const barCount = 32;
    const step = Math.floor(bufferLength / barCount);

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step];
      const normalizedValue = value / 255;
      const barHeight = normalizedValue * 40;

      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barHeight);
      const y2 = centerY + Math.sin(angle) * (radius + barHeight);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      // Dynamic opacity based on audio level
      const opacity = Math.round((0.5 + normalizedValue * 0.5) * 255).toString(16).padStart(2, '0');
      ctx.strokeStyle = `${accentColor}${opacity}`;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    const recordingStartTime = getRecordingStartTime();
    if (recordingStartTime && timeDisplay) {
      const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
      setRecordingDuration(duration);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    setAnimationFrameId(requestAnimationFrame(draw));
  }

  draw();
}

export function stopVisualization(): void {
  const animationFrameId = getAnimationFrameId();
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    setAnimationFrameId(null);
  }

  const audioContext = getAudioContext();
  if (audioContext) {
    audioContext.close().catch((e) => {
      log.debug('AudioContext close error:', e);
    });
    setAudioContext(null);
    setAnalyser(null);
  }

  const modal = getModal();
  const timeDisplay = modal?.querySelector('#recorder-time');
  if (timeDisplay) {
    timeDisplay.textContent = '0:00';
  }

  const canvas = modal?.querySelector('#journal-visualizer') as HTMLCanvasElement;
  const ctx = canvas?.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const computedStyle = getComputedStyle(document.documentElement);
    const accentColor = computedStyle.getPropertyValue('--color-accent').trim() || '#4a6741';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
    ctx.fillStyle = `${accentColor}1a`;
    ctx.fill();
  }
}

// ============================================================================
// AUDIO UTILITIES
// ============================================================================

/**
 * Convert Blob to base64 string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

