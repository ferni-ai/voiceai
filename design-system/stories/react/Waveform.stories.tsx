/**
 * React Waveform Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Waveform, FerniProvider } from '../../../packages/ferni-react/src';
import type { WaveformProps, WaveformState, PersonaId } from '../../../packages/ferni-react/src';

const meta: Meta<WaveformProps> = {
  title: 'React/Waveform',
  tags: ['autodocs'],
  argTypes: {
    persona: {
      control: { type: 'select' },
      options: ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'],
    },
    state: {
      control: { type: 'select' },
      options: ['idle', 'listening', 'speaking', 'thinking'],
    },
    intensity: {
      control: { type: 'range', min: 0, max: 1, step: 0.1 },
    },
    height: {
      control: { type: 'range', min: 20, max: 200, step: 10 },
    },
    barCount: {
      control: { type: 'range', min: 5, max: 30, step: 1 },
    },
  },
};

export default meta;
type Story = StoryObj<WaveformProps>;

// Animated waveform that simulates audio
const AnimatedWaveform = ({ 
  persona = 'ferni', 
  state = 'speaking',
  height = 60 
}: { 
  persona?: PersonaId; 
  state?: WaveformState;
  height?: number;
}) => {
  const [intensity, setIntensity] = useState(0.5);

  useEffect(() => {
    if (state !== 'speaking') {
      setIntensity(state === 'idle' ? 0.1 : 0.3);
      return;
    }

    const interval = setInterval(() => {
      // Simulate audio intensity variations
      setIntensity(0.3 + Math.random() * 0.6);
    }, 100);

    return () => clearInterval(interval);
  }, [state]);

  return (
    <div style={{ textAlign: 'center' }}>
      <Waveform 
        persona={persona} 
        state={state} 
        intensity={intensity}
        height={height}
      />
      <p style={{ 
        marginTop: '12px', 
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '13px',
        textTransform: 'capitalize',
        color: '#5C544A'
      }}>
        {state} ({Math.round(intensity * 100)}%)
      </p>
    </div>
  );
};

export const Speaking: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <AnimatedWaveform state="speaking" />
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const Listening: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <AnimatedWaveform state="listening" />
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const Idle: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <AnimatedWaveform state="idle" />
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const AllPersonas: Story = {
  render: () => {
    const container = document.createElement('div');
    const personas: PersonaId[] = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'];
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '32px',
          padding: '24px'
        }}>
          {personas.map((persona) => (
            <div key={persona} style={{ textAlign: 'center' }}>
              <h4 style={{ 
                margin: '0 0 12px', 
                fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
                textTransform: 'capitalize',
                color: '#2C2520'
              }}>
                {persona}
              </h4>
              <AnimatedWaveform persona={persona} state="speaking" height={50} />
            </div>
          ))}
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const AllStates: Story = {
  render: () => {
    const container = document.createElement('div');
    const states: WaveformState[] = ['idle', 'listening', 'speaking', 'thinking'];
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '24px',
          padding: '24px'
        }}>
          {states.map((state) => (
            <AnimatedWaveform key={state} state={state} />
          ))}
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const Heights: Story = {
  render: () => {
    const container = document.createElement('div');
    const heights = [30, 50, 80, 120];
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ 
          display: 'flex', 
          gap: '48px',
          alignItems: 'flex-end',
          padding: '24px'
        }}>
          {heights.map((height) => (
            <div key={height} style={{ textAlign: 'center' }}>
              <AnimatedWaveform height={height} state="speaking" />
              <p style={{ 
                marginTop: '8px', 
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '12px',
                color: '#8A847A'
              }}>
                {height}px
              </p>
            </div>
          ))}
        </div>
      </FerniProvider>
    );
    return container;
  },
};
