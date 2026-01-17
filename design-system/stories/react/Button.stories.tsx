/**
 * React Button Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, FerniProvider } from '../../../packages/ferni-react/src';
import type { ButtonProps } from '../../../packages/ferni-react/src';

const meta: Meta<ButtonProps> = {
  title: 'React/Button',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'ghost', 'destructive'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg'],
    },
    disabled: { control: 'boolean' },
    loading: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<ButtonProps>;

export const Primary: Story = {
  render: (args) => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <Button variant="primary" {...args}>
            Primary Button
          </Button>
        </div>
      </FerniProvider>
    );
    return container;
  },
  args: {
    variant: 'primary',
    size: 'md',
  },
};

export const Secondary: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <Button variant="secondary">Secondary Button</Button>
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const Ghost: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <Button variant="ghost">Ghost Button</Button>
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const Destructive: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <Button variant="destructive">Delete</Button>
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const AllVariants: Story = {
  render: () => {
    const container = document.createElement('div');
    const variants = ['primary', 'secondary', 'ghost', 'destructive'] as const;
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ display: 'flex', gap: '12px', padding: '24px', flexWrap: 'wrap' }}>
          {variants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant.charAt(0).toUpperCase() + variant.slice(1)}
            </Button>
          ))}
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    const sizes = ['sm', 'md', 'lg'] as const;
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '24px' }}>
          {sizes.map((size) => (
            <Button key={size} size={size}>
              Size {size.toUpperCase()}
            </Button>
          ))}
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const States: Story = {
  render: () => {
    const container = document.createElement('div');
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', padding: '24px' }}>
          <Button>Normal</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const WithIcon: Story = {
  render: () => {
    const container = document.createElement('div');
    
    // Simple SVG icons
    const PlusIcon = () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );
    
    const ArrowIcon = () => (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    );
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ display: 'flex', gap: '12px', padding: '24px' }}>
          <Button>
            <PlusIcon /> Add Item
          </Button>
          <Button variant="secondary">
            Continue <ArrowIcon />
          </Button>
        </div>
      </FerniProvider>
    );
    return container;
  },
};

export const ButtonGroup: Story = {
  render: () => {
    const container = document.createElement('div');
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <div style={{ padding: '24px' }}>
          <div style={{ 
            display: 'inline-flex', 
            background: '#F5F1E8', 
            padding: '4px', 
            borderRadius: '10px',
            gap: '4px'
          }}>
            <Button size="sm" variant="primary">Day</Button>
            <Button size="sm" variant="ghost">Week</Button>
            <Button size="sm" variant="ghost">Month</Button>
          </div>
        </div>
      </FerniProvider>
    );
    return container;
  },
};
