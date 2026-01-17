/**
 * React Toast Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Toast, Toaster, toast, Button, FerniProvider } from '../../../packages/ferni-react/src';

const meta: Meta = {
  title: 'React/Toast',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

// Toast demo component
const ToastDemo = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Toaster />
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Button onClick={() => toast.success('Saved!')}>
          Success Toast
        </Button>
        <Button 
          variant="secondary"
          onClick={() => toast.info('Just a moment...')}
        >
          Info Toast
        </Button>
        <Button 
          variant="secondary"
          onClick={() => toast.warning('Add a name first')}
        >
          Warning Toast
        </Button>
        <Button 
          variant="destructive"
          onClick={() => toast.error("Couldn't connect. Try again?")}
        >
          Error Toast
        </Button>
      </div>
    </div>
  );
};

export const Interactive: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <ToastDemo />
      </FerniProvider>
    );
    return container;
  },
};

export const Success: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <Toaster />
          <Button onClick={() => toast.success('Saved!')}>
            Show Success
          </Button>
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const AllTypes: Story = {
  render: () => {
    const container = document.createElement('div');
    
    const AllTypesDemo = () => {
      const showAll = () => {
        toast.success('Great job!');
        setTimeout(() => toast.info('Processing...'), 300);
        setTimeout(() => toast.warning('Check your input'), 600);
        setTimeout(() => toast.error("Something went wrong"), 900);
      };

      return (
        <div style={{ padding: '24px' }}>
          <Toaster />
          <Button onClick={showAll}>
            Show All Toast Types
          </Button>
          <p style={{ 
            marginTop: '16px', 
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#5C544A',
            fontSize: '14px'
          }}>
            Click to see all 4 toast types stacked
          </p>
        </div>
      );
    };
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <AllTypesDemo />
      </FerniProvider>
    );
    return container;
  },
};

export const BrandVoice: Story = {
  render: () => {
    const container = document.createElement('div');
    
    const BrandVoiceDemo = () => {
      return (
        <div style={{ padding: '24px' }}>
          <Toaster />
          <h3 style={{ 
            margin: '0 0 16px',
            fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
            color: '#2C2520'
          }}>
            Toast Copy Guidelines
          </h3>
          <p style={{ 
            marginBottom: '16px',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#5C544A',
            fontSize: '14px',
            lineHeight: 1.6
          }}>
            Toasts should use warm, human language. Short phrases, contractions, no "please" or "successfully".
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => toast.success('Saved!')}>
              "Saved!"
            </Button>
            <Button size="sm" onClick={() => toast.success(`Got it!`)}>
              "Got it!"
            </Button>
            <Button size="sm" onClick={() => toast.info('Just a moment...')}>
              "Just a moment..."
            </Button>
            <Button size="sm" onClick={() => toast.warning('Add a name first')}>
              "Add a name first"
            </Button>
            <Button size="sm" onClick={() => toast.error("Couldn't save. Try again?")}>
              "Couldn't save. Try again?"
            </Button>
          </div>
        </div>
      );
    };
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <BrandVoiceDemo />
      </FerniProvider>
    );
    return container;
  },
};
