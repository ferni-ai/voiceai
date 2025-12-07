/**
 * Avatar Component Stories
 * 
 * Persona and user avatars following Ferni's design system.
 */

import type { Meta, StoryObj } from '@storybook/html';

interface AvatarProps {
  name: string;
  personaId?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  status?: 'online' | 'speaking' | 'listening' | 'offline';
}

const PERSONA_COLORS: Record<string, { primary: string; secondary: string }> = {
  ferni: { primary: '#4a6741', secondary: '#3d5a35' },
  jack: { primary: '#9a7b5a', secondary: '#7d6348' },
  peter: { primary: '#3a6b73', secondary: '#2d5359' },
  alex: { primary: '#5a6b8a', secondary: '#4a5a73' },
  maya: { primary: '#a67a6a', secondary: '#8a635a' },
  jordan: { primary: '#c4856a', secondary: '#a86d55' },
  nayan: { primary: '#8a7a6a', secondary: '#6a5a4a' },
};

const SIZES = {
  sm: { size: 32, font: 12, status: 8 },
  md: { size: 48, font: 16, status: 12 },
  lg: { size: 64, font: 20, status: 14 },
  xl: { size: 96, font: 28, status: 18 },
};

const createAvatar = (props: AvatarProps): HTMLElement => {
  const container = document.createElement('div');
  const sizeConfig = SIZES[props.size || 'md'];
  const colors = props.personaId 
    ? PERSONA_COLORS[props.personaId] || PERSONA_COLORS.ferni
    : { primary: '#7a6f63', secondary: '#5a4d43' };
  
  const initials = props.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  
  const statusColors: Record<string, string> = {
    online: '#4a6741',
    speaking: '#c4856a',
    listening: '#3a6b73',
    offline: '#9a8b7a',
  };
  
  container.innerHTML = `
    <div class="ferni-avatar" style="
      position: relative;
      display: inline-flex;
      ${props.status === 'speaking' ? 'animation: pulse 1.5s ease-in-out infinite;' : ''}
    ">
      <div style="
        width: ${sizeConfig.size}px;
        height: ${sizeConfig.size}px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
        font-weight: 600;
        font-size: ${sizeConfig.font}px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        ${props.status === 'speaking' ? `
          box-shadow: 0 0 0 3px white, 0 0 0 5px ${colors.primary};
        ` : ''}
      ">
        ${initials}
      </div>
      
      ${props.showStatus && props.status ? `
        <div style="
          position: absolute;
          bottom: 0;
          right: 0;
          width: ${sizeConfig.status}px;
          height: ${sizeConfig.status}px;
          border-radius: 50%;
          background: ${statusColors[props.status]};
          border: 2px solid white;
          ${props.status === 'speaking' ? 'animation: statusPulse 1s ease-in-out infinite;' : ''}
        "></div>
      ` : ''}
    </div>
    
    <style>
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      @keyframes statusPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    </style>
  `;
  
  return container;
};

const meta: Meta<AvatarProps> = {
  title: 'Components/Avatar',
  tags: ['autodocs'],
  render: (args) => createAvatar(args),
  argTypes: {
    name: { control: 'text' },
    personaId: {
      control: { type: 'select' },
      options: ['ferni', 'jack', 'peter', 'alex', 'maya', 'jordan', 'nayan'],
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    showStatus: { control: 'boolean' },
    status: {
      control: { type: 'select' },
      options: ['online', 'speaking', 'listening', 'offline'],
    },
  },
};

export default meta;
type Story = StoryObj<AvatarProps>;

export const Default: Story = {
  args: {
    name: 'Ferni',
    personaId: 'ferni',
    size: 'md',
  },
};

export const WithStatus: Story = {
  args: {
    name: 'Ferni',
    personaId: 'ferni',
    size: 'lg',
    showStatus: true,
    status: 'online',
  },
};

export const Speaking: Story = {
  args: {
    name: 'Ferni',
    personaId: 'ferni',
    size: 'xl',
    showStatus: true,
    status: 'speaking',
  },
};

export const TeamMembers: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 16px; flex-wrap: wrap; align-items: center;';
    
    const personas = [
      { name: 'Ferni', personaId: 'ferni' },
      { name: 'Jack Bogle', personaId: 'jack' },
      { name: 'Peter Lynch', personaId: 'peter' },
      { name: 'Alex Chen', personaId: 'alex' },
      { name: 'Maya Santos', personaId: 'maya' },
      { name: 'Jordan Taylor', personaId: 'jordan' },
      { name: 'Nayan Patel', personaId: 'nayan' },
    ];
    
    personas.forEach(p => {
      container.appendChild(createAvatar({ ...p, size: 'lg', showStatus: true, status: 'online' }));
    });
    
    return container;
  },
};

export const Sizes: Story = {
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 16px; align-items: center;';
    
    const sizes: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl'];
    
    sizes.forEach(size => {
      container.appendChild(createAvatar({ name: 'Ferni', personaId: 'ferni', size }));
    });
    
    return container;
  },
};

