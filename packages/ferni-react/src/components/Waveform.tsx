import React, { useEffect, useRef, useMemo } from 'react';
import type { PersonaId } from './Avatar';
import { personas } from '../tokens';

/**
 * Waveform state
 */
export type WaveformState = 'idle' | 'listening' | 'speaking' | 'thinking';

/**
 * Waveform props
 */
export interface WaveformProps {
  /** Which persona's colors to use */
  persona?: PersonaId;
  /** Current state */
  state?: WaveformState;
  /** Audio intensity (0-1) */
  intensity?: number;
  /** Height in pixels */
  height?: number;
  /** Number of bars */
  barCount?: number;
  /** Gap between bars */
  gap?: number;
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Get persona color from centralized tokens
 */
const getPersonaColor = (personaId: PersonaId): string => {
  return personas[personaId]?.colors.primary ?? '#4a6741';
};

/**
 * Generate bar heights based on state and intensity
 */
function generateBarHeights(
  barCount: number,
  state: WaveformState,
  intensity: number,
  time: number
): number[] {
  return Array.from({ length: barCount }, (_, i) => {
    const centerDistance = Math.abs(i - barCount / 2) / (barCount / 2);
    const baseHeight = 1 - centerDistance * 0.5;
    
    switch (state) {
      case 'speaking':
        // Voice-reactive: varies with intensity
        const speakWave = Math.sin(time * 0.01 + i * 0.5) * 0.3;
        return Math.max(0.15, baseHeight * intensity * (0.7 + speakWave));
        
      case 'listening':
        // Gentle breathing pulse
        const listenWave = Math.sin(time * 0.003 + i * 0.3) * 0.15;
        return Math.max(0.1, 0.25 + listenWave + centerDistance * 0.1);
        
      case 'thinking':
        // Rhythmic pulsing from center
        const thinkWave = Math.sin(time * 0.005 - centerDistance * 2) * 0.2;
        return Math.max(0.1, 0.3 + thinkWave * (1 - centerDistance));
        
      case 'idle':
      default:
        // Subtle ambient movement
        const idleWave = Math.sin(time * 0.002 + i * 0.2) * 0.05;
        return Math.max(0.1, 0.15 + idleWave);
    }
  });
}

/**
 * Waveform - Audio visualization component
 * 
 * Shows voice activity with persona-colored bars.
 * 
 * @example
 * ```tsx
 * <Waveform 
 *   persona="ferni"
 *   state="speaking"
 *   intensity={audioLevel}
 *   height={48}
 * />
 * ```
 */
export const Waveform: React.FC<WaveformProps> = ({
  persona = 'ferni',
  state = 'idle',
  intensity = 0.5,
  height = 48,
  barCount = 32,
  gap = 2,
  className = '',
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef(0);
  
  const color = getPersonaColor(persona);
  
  // Calculate bar width
  const barWidth = useMemo(() => {
    // Assuming canvas width is roughly 200px, adjust as needed
    return Math.max(2, (200 - gap * (barCount - 1)) / barCount);
  }, [barCount, gap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const draw = () => {
      timeRef.current += 16; // ~60fps
      
      const heights = generateBarHeights(barCount, state, intensity, timeRef.current);
      
      // Clear canvas
      ctx.clearRect(0, 0, rect.width, rect.height);
      
      // Draw bars
      const totalWidth = barCount * barWidth + (barCount - 1) * gap;
      const startX = (rect.width - totalWidth) / 2;
      
      heights.forEach((h, i) => {
        const x = startX + i * (barWidth + gap);
        const barHeight = h * rect.height;
        const y = (rect.height - barHeight) / 2;
        
        // Draw bar with rounded ends
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8 + h * 0.2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      });
      
      animationRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [barCount, barWidth, gap, color, state, intensity]);

  return (
    <canvas
      ref={canvasRef}
      className={`ferni-waveform ferni-waveform--${state} ${className}`}
      style={{
        width: '100%',
        height,
        ...style,
      }}
      aria-hidden="true"
    />
  );
};

/**
 * Hook to get audio intensity from microphone
 */
export function useAudioIntensity(): { intensity: number; isListening: boolean; start: () => void; stop: () => void } {
  const [intensity, setIntensity] = React.useState(0);
  const [isListening, setIsListening] = React.useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();

  const start = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateIntensity = () => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setIntensity(average / 255);
        animationRef.current = requestAnimationFrame(updateIntensity);
      };
      
      updateIntensity();
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start audio:', err);
    }
  }, []);

  const stop = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    setIntensity(0);
    setIsListening(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { intensity, isListening, start, stop };
}

Waveform.displayName = 'Waveform';
