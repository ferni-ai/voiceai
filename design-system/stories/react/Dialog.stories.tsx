/**
 * React Dialog Component Stories
 */

import type { Meta, StoryObj } from '@storybook/html';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogHeader, DialogBody, DialogFooter, Button, FerniProvider } from '../../../packages/ferni-react/src';
import type { DialogProps } from '../../../packages/ferni-react/src';

const meta: Meta<DialogProps> = {
  title: 'React/Dialog',
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
  },
};

export default meta;
type Story = StoryObj<DialogProps>;

// Interactive dialog demo
const DialogDemo = ({ 
  size = 'md',
  title = 'Dialog Title',
  children = 'Dialog content goes here.'
}: { 
  size?: 'sm' | 'md' | 'lg' | 'xl';
  title?: string;
  children?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ padding: '24px' }}>
      <Button onClick={() => setOpen(true)}>Open Dialog</Button>
      
      <Dialog open={open} onClose={() => setOpen(false)} size={size}>
        <DialogHeader>
          <h2 style={{ margin: 0 }}>{title}</h2>
        </DialogHeader>
        <DialogBody>
          {children}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>
            Confirm
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};

export const Default: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <DialogDemo />
      </FerniProvider>
    );
    return container;
  },
};

export const Small: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <DialogDemo 
          size="sm" 
          title="Quick Note"
          children="This is a small dialog for quick confirmations."
        />
      </FerniProvider>
    );
    return container;
  },
};

export const Large: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <DialogDemo 
          size="lg" 
          title="Team Selection"
          children={
            <div>
              <p style={{ marginTop: 0 }}>Choose your Ferni team members:</p>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '12px',
                marginTop: '16px'
              }}>
                {['Ferni', 'Peter', 'Alex', 'Maya', 'Jordan', 'Nayan'].map((name) => (
                  <label key={name} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    padding: '12px',
                    background: '#F5F1E8',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}>
                    <input type="checkbox" defaultChecked={name === 'Ferni'} />
                    {name}
                  </label>
                ))}
              </div>
            </div>
          }
        />
      </FerniProvider>
    );
    return container;
  },
};

export const WithForm: Story = {
  render: () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <DialogDemo 
          title="Create Goal"
          children={
            <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '6px',
                  fontWeight: 500,
                  fontSize: '14px'
                }}>
                  Goal Name
                </label>
                <input 
                  type="text" 
                  placeholder="e.g., Exercise more"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid rgba(44, 37, 32, 0.15)',
                    borderRadius: '8px',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '6px',
                  fontWeight: 500,
                  fontSize: '14px'
                }}>
                  Why is this important to you?
                </label>
                <textarea 
                  placeholder="Tell me more..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid rgba(44, 37, 32, 0.15)',
                    borderRadius: '8px',
                    fontSize: '15px',
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </form>
          }
        />
      </FerniProvider>
    );
    return container;
  },
};

export const Confirmation: Story = {
  render: () => {
    const container = document.createElement('div');
    
    const ConfirmationDemo = () => {
      const [open, setOpen] = useState(false);

      return (
        <div style={{ padding: '24px' }}>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            Delete Account
          </Button>
          
          <Dialog open={open} onClose={() => setOpen(false)} size="sm">
            <DialogHeader>
              <h2 style={{ margin: 0, color: '#a05454' }}>Are you sure?</h2>
            </DialogHeader>
            <DialogBody>
              <p style={{ margin: 0, color: '#5C544A' }}>
                This action cannot be undone. All your data will be permanently deleted.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setOpen(false)}>
                Delete
              </Button>
            </DialogFooter>
          </Dialog>
        </div>
      );
    };
    
    const root = createRoot(container);
    root.render(
      <FerniProvider>
        <ConfirmationDemo />
      </FerniProvider>
    );
    return container;
  },
};
