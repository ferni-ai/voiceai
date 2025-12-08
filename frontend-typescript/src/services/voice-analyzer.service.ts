/**
 * Voice Analyzer Service
 * 
 * Real-time audio analysis for synesthesia effects.
 * Extracts amplitude, frequency, and speech patterns for visual sync.
 * 
 * @module @ferni/voice-analyzer
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('VoiceAnalyzer');

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceMetrics {
  /** Overall amplitude (0-1) */
  amplitude: number;
  
  /** Smoothed amplitude for glow effects */
  smoothedAmplitude: number;
  
  /** Frequency band levels (low, mid, high) */
  frequencies: {
    low: number;     // 20-250Hz (bass)
    mid: number;     // 250-2000Hz (voice)
    high: number;    // 2000-8000Hz (sibilance)
  };
  
  /** Speech detection */
  isSpeaking: boolean;
  
  /** Speaking confidence (0-1) */
  speakingConfidence: number;
  
  /** Estimated emotion from voice energy */
  energyLevel: 'calm' | 'normal' | 'energetic' | 'excited';
  
  /** Time since last speech (ms) */
  silenceDuration: number;
}

export interface AnalyzerConfig {
  /** FFT size for frequency analysis */
  fftSize?: number;
  
  /** Smoothing factor (0-1, higher = smoother) */
  smoothingFactor?: number;
  
  /** Speech detection threshold (0-1) */
  speechThreshold?: number;
  
  /** Update rate in ms */
  updateInterval?: number;
}

type VoiceCallback = (metrics: VoiceMetrics) => void;

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: Required<AnalyzerConfig> = {
  fftSize: 256,
  smoothingFactor: 0.8,
  speechThreshold: 0.08,
  updateInterval: 16, // ~60fps
};

// ============================================================================
// VOICE ANALYZER
// ============================================================================

export class VoiceAnalyzer {
  private config: Required<AnalyzerConfig>;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  
  // Analysis state
  private dataArray: Uint8Array | null = null;
  private frequencyArray: Uint8Array | null = null;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  
  // Metrics
  private currentMetrics: VoiceMetrics;
  private smoothedAmplitude: number = 0;
  private lastSpeechTime: number = 0;
  private speechHistory: boolean[] = [];
  
  // Callbacks
  private callbacks: Set<VoiceCallback> = new Set();
  
  constructor(config: AnalyzerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentMetrics = this.createEmptyMetrics();
    
    log.debug('VoiceAnalyzer created', { config: this.config });
  }
  
  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================
  
  /**
   * Start analyzing audio from microphone
   */
  async startMicrophone(): Promise<void> {
    if (this.isRunning) return;
    
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      await this.setupAnalyzer(this.stream);
      
      log.info('Started microphone analysis');
      
    } catch (error) {
      log.error('Failed to access microphone', error);
      throw error;
    }
  }
  
  /**
   * Start analyzing audio from an existing stream (e.g., LiveKit track)
   */
  async startFromStream(stream: MediaStream): Promise<void> {
    if (this.isRunning) return;
    
    this.stream = stream;
    await this.setupAnalyzer(stream);
    
    log.info('Started stream analysis');
  }
  
  /**
   * Start analyzing audio from an audio element
   */
  async startFromElement(audioElement: HTMLAudioElement): Promise<void> {
    if (this.isRunning) return;
    
    try {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.configureAnalyser();
      
      const source = this.audioContext.createMediaElementSource(audioElement);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      this.startAnalysisLoop();
      
      log.info('Started element analysis');
      
    } catch (error) {
      log.error('Failed to analyze audio element', error);
      throw error;
    }
  }
  
  /**
   * Stop analysis
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isRunning = false;
    this.currentMetrics = this.createEmptyMetrics();
    
    log.info('Stopped analysis');
  }
  
  // ==========================================================================
  // SETUP
  // ==========================================================================
  
  private async setupAnalyzer(stream: MediaStream): Promise<void> {
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.configureAnalyser();
    
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    
    this.startAnalysisLoop();
  }
  
  private configureAnalyser(): void {
    if (!this.analyser) return;
    
    this.analyser.fftSize = this.config.fftSize;
    this.analyser.smoothingTimeConstant = this.config.smoothingFactor;
    
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    this.frequencyArray = new Uint8Array(bufferLength);
  }
  
  private startAnalysisLoop(): void {
    this.isRunning = true;
    
    this.updateInterval = setInterval(() => {
      this.analyze();
    }, this.config.updateInterval);
  }
  
  // ==========================================================================
  // ANALYSIS
  // ==========================================================================
  
  private analyze(): void {
    if (!this.analyser || !this.dataArray || !this.frequencyArray) return;
    
    // Get time domain data (waveform)
    this.analyser.getByteTimeDomainData(this.dataArray);
    
    // Get frequency data
    this.analyser.getByteFrequencyData(this.frequencyArray);
    
    // Calculate amplitude
    const amplitude = this.calculateAmplitude();
    
    // Smooth amplitude
    this.smoothedAmplitude = this.smoothedAmplitude * 0.9 + amplitude * 0.1;
    
    // Calculate frequency bands
    const frequencies = this.calculateFrequencyBands();
    
    // Detect speech
    const isSpeaking = this.detectSpeech(amplitude, frequencies);
    
    // Update silence duration
    const now = Date.now();
    if (isSpeaking) {
      this.lastSpeechTime = now;
    }
    const silenceDuration = now - this.lastSpeechTime;
    
    // Calculate speaking confidence
    const speakingConfidence = this.calculateSpeakingConfidence();
    
    // Estimate energy level
    const energyLevel = this.estimateEnergyLevel(amplitude, frequencies);
    
    // Update metrics
    this.currentMetrics = {
      amplitude,
      smoothedAmplitude: this.smoothedAmplitude,
      frequencies,
      isSpeaking,
      speakingConfidence,
      energyLevel,
      silenceDuration,
    };
    
    // Notify callbacks
    this.notifyCallbacks();
  }
  
  private calculateAmplitude(): number {
    if (!this.dataArray) return 0;
    
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const value = (this.dataArray[i] - 128) / 128;
      sum += value * value;
    }
    
    return Math.sqrt(sum / this.dataArray.length);
  }
  
  private calculateFrequencyBands(): { low: number; mid: number; high: number } {
    if (!this.frequencyArray || !this.audioContext) {
      return { low: 0, mid: 0, high: 0 };
    }
    
    const nyquist = this.audioContext.sampleRate / 2;
    const binSize = nyquist / this.frequencyArray.length;
    
    // Define band ranges
    const lowEnd = Math.floor(250 / binSize);
    const midEnd = Math.floor(2000 / binSize);
    const highEnd = Math.floor(8000 / binSize);
    
    let lowSum = 0, midSum = 0, highSum = 0;
    
    for (let i = 0; i < this.frequencyArray.length; i++) {
      const value = this.frequencyArray[i] / 255;
      
      if (i < lowEnd) {
        lowSum += value;
      } else if (i < midEnd) {
        midSum += value;
      } else if (i < highEnd) {
        highSum += value;
      }
    }
    
    return {
      low: lowSum / Math.max(1, lowEnd),
      mid: midSum / Math.max(1, midEnd - lowEnd),
      high: highSum / Math.max(1, highEnd - midEnd),
    };
  }
  
  private detectSpeech(amplitude: number, frequencies: { mid: number }): boolean {
    // Speech is primarily in the mid frequency range
    const speechEnergy = (amplitude * 0.4) + (frequencies.mid * 0.6);
    const isSpeaking = speechEnergy > this.config.speechThreshold;
    
    // Update history
    this.speechHistory.push(isSpeaking);
    if (this.speechHistory.length > 10) {
      this.speechHistory.shift();
    }
    
    return isSpeaking;
  }
  
  private calculateSpeakingConfidence(): number {
    if (this.speechHistory.length === 0) return 0;
    
    const speakingCount = this.speechHistory.filter(s => s).length;
    return speakingCount / this.speechHistory.length;
  }
  
  private estimateEnergyLevel(
    amplitude: number, 
    frequencies: { low: number; mid: number; high: number }
  ): 'calm' | 'normal' | 'energetic' | 'excited' {
    const totalEnergy = amplitude + (frequencies.low * 0.3) + (frequencies.mid * 0.5) + (frequencies.high * 0.2);
    
    if (totalEnergy < 0.1) return 'calm';
    if (totalEnergy < 0.3) return 'normal';
    if (totalEnergy < 0.5) return 'energetic';
    return 'excited';
  }
  
  // ==========================================================================
  // CALLBACKS
  // ==========================================================================
  
  /**
   * Subscribe to metrics updates
   */
  onUpdate(callback: VoiceCallback): () => void {
    this.callbacks.add(callback);
    
    return () => {
      this.callbacks.delete(callback);
    };
  }
  
  private notifyCallbacks(): void {
    for (const callback of this.callbacks) {
      try {
        callback(this.currentMetrics);
      } catch (error) {
        log.warn('Callback error', { error });
      }
    }
  }
  
  // ==========================================================================
  // GETTERS
  // ==========================================================================
  
  /**
   * Get current metrics
   */
  getMetrics(): VoiceMetrics {
    return { ...this.currentMetrics };
  }
  
  /**
   * Get current amplitude (0-1)
   */
  getAmplitude(): number {
    return this.currentMetrics.amplitude;
  }
  
  /**
   * Get smoothed amplitude (0-1)
   */
  getSmoothedAmplitude(): number {
    return this.currentMetrics.smoothedAmplitude;
  }
  
  /**
   * Check if currently speaking
   */
  getIsSpeaking(): boolean {
    return this.currentMetrics.isSpeaking;
  }
  
  /**
   * Check if analyzer is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
  
  // ==========================================================================
  // HELPERS
  // ==========================================================================
  
  private createEmptyMetrics(): VoiceMetrics {
    return {
      amplitude: 0,
      smoothedAmplitude: 0,
      frequencies: { low: 0, mid: 0, high: 0 },
      isSpeaking: false,
      speakingConfidence: 0,
      energyLevel: 'calm',
      silenceDuration: Infinity,
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let voiceAnalyzerInstance: VoiceAnalyzer | null = null;

export function getVoiceAnalyzer(config?: AnalyzerConfig): VoiceAnalyzer {
  if (!voiceAnalyzerInstance) {
    voiceAnalyzerInstance = new VoiceAnalyzer(config);
  }
  return voiceAnalyzerInstance;
}

export function resetVoiceAnalyzer(): void {
  if (voiceAnalyzerInstance) {
    voiceAnalyzerInstance.stop();
  }
  voiceAnalyzerInstance = null;
}

