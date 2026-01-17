/**
 * React Celebration Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Celebration, FerniProvider, useCelebration } from '../../../packages/ferni-react/src';
import type { CelebrationProps, CelebrationType } from '../../../packages/ferni-react/src';

const meta: Meta<CelebrationProps> = {
  title: 'React/Celebration',
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: { type: 'select' },
      options: ['smallWin', 'bigWin', 'milestone', 'streak', 'teamUnlock'],
    },
    particleCount: {
      control: { type: 'range', min: 20, max: 200, step: 10 },
    },
    duration: {
      control: { type: 'range', min: 500, max: 5000, step: 100 },
    },
  },
};

export default meta;
type Story = StoryObj<CelebrationProps>;

// Interactive demo component
const CelebrationDemo = ({ type = 'smallWin' }: { type?: CelebrationType }) => {
  const [trigger, setTrigger] = useState(false);
  
  const handleClick = () => {
    setTrigger(true);
    setTimeout(() => setTrigger(false), 100);
  };

  return (
    <div style={{ padding: '24px', textAlign: 'center' }}>
      <Celebration type={type} trigger={trigger} />
      <button
        onClick={handleClick}
        style={{
          padding: '16px 32px',
          fontSize: '16px',
          fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
          fontWeight: 600,
          color: 'white',
          background: '#4a6741',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(74, 103, 65, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Celebrate! 🎉
      </button>
      <p style={{ 
        marginTop: '16px', 
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#5C544A',
        fontSize: '14px',
      }}>
        Type: <strong style={{ textTransform: 'capitalize' }}>{type}</strong>
      </p>
    </div>
  );
};

export const SmallWin: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <CelebrationDemo type="smallWin" />
      </FerniProvider>
    );
    return container;
  },
};

export const BigWin: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <CelebrationDemo type="bigWin" />
      </FerniProvider>
    );
    return container;
  },
};

export const Milestone: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <CelebrationDemo type="milestone" />
      </FerniProvider>
    );
    return container;
  },
};

export const Streak: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <CelebrationDemo type="streak" />
      </FerniProvider>
    );
    return container;
  },
};

export const TeamUnlock: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <CelebrationDemo type="teamUnlock" />
      </FerniProvider>
    );
    return container;
  },
};

export const AllTypes: Story = {
  render: () => {
    const container = document.createElement('div');
    const types: CelebrationType[] = ['smallWin', 'bigWin', 'milestone', 'streak', 'teamUnlock'];
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '24px',
          padding: '24px'
        }}>
          {types.map((type) => (
            <CelebrationDemo key={type} type={type} />
          ))}
        </div>
      </FerniProvider>
    );
    return container;
  },
};
