import type { Meta, StoryObj } from '@storybook/html';
import { renderIcon, getIconsByCategory, searchIcons } from '../../icons';
import type { IconSize, IconCategory } from '../../icons';

const meta: Meta = {
  title: 'Components/Icon',
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: 'text',
      description: 'Icon name',
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    color: {
      control: 'color',
    },
  },
};

export default meta;

// Default Icon
export const Default: StoryObj = {
  args: {
    name: 'microphone',
    size: 'md',
  },
  render: (args) => {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '8px';
    
    container.innerHTML = renderIcon(args.name, args.size as IconSize, args.color);
    
    const label = document.createElement('span');
    label.textContent = args.name;
    label.style.fontFamily = 'Inter, system-ui, sans-serif';
    label.style.fontSize = '14px';
    container.appendChild(label);
    
    return container;
  },
};

// All Sizes
export const Sizes: StoryObj = {
  render: () => {
    const sizes: IconSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.gap = '24px';
    
    sizes.forEach(size => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      
      item.innerHTML = renderIcon('support', size);
      
      const label = document.createElement('span');
      label.textContent = size;
      label.style.fontFamily = 'Inter, system-ui, sans-serif';
      label.style.fontSize = '12px';
      label.style.color = '#8A847A';
      item.appendChild(label);
      
      container.appendChild(item);
    });
    
    return container;
  },
};

// Voice Icons Category
export const VoiceIcons: StoryObj = {
  render: () => {
    const icons = getIconsByCategory('voice');
    const container = document.createElement('div');
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(4, 1fr)';
    container.style.gap = '16px';
    
    icons.forEach(icon => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.padding = '16px';
      item.style.background = '#FAFAFA';
      item.style.borderRadius = '8px';
      
      item.innerHTML = renderIcon(icon.name, 'lg');
      
      const label = document.createElement('span');
      label.textContent = icon.name;
      label.style.fontFamily = 'Inter, system-ui, sans-serif';
      label.style.fontSize = '12px';
      label.style.color = '#8A847A';
      item.appendChild(label);
      
      container.appendChild(item);
    });
    
    return container;
  },
};

// AI Icons Category
export const AIIcons: StoryObj = {
  render: () => {
    const icons = getIconsByCategory('ai');
    const container = document.createElement('div');
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(4, 1fr)';
    container.style.gap = '16px';
    
    icons.forEach(icon => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.padding = '16px';
      item.style.background = '#FAFAFA';
      item.style.borderRadius = '8px';
      
      item.innerHTML = renderIcon(icon.name, 'lg', '#4a6741');
      
      const label = document.createElement('span');
      label.textContent = icon.name;
      label.style.fontFamily = 'Inter, system-ui, sans-serif';
      label.style.fontSize = '12px';
      label.style.color = '#8A847A';
      item.appendChild(label);
      
      container.appendChild(item);
    });
    
    return container;
  },
};

// Emotion Icons Category
export const EmotionIcons: StoryObj = {
  render: () => {
    const icons = getIconsByCategory('emotion');
    const container = document.createElement('div');
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(4, 1fr)';
    container.style.gap = '16px';
    
    icons.forEach(icon => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.padding = '16px';
      item.style.background = '#FAFAFA';
      item.style.borderRadius = '8px';
      
      item.innerHTML = renderIcon(icon.name, 'lg', '#a67a6a');
      
      const label = document.createElement('span');
      label.textContent = icon.name;
      label.style.fontFamily = 'Inter, system-ui, sans-serif';
      label.style.fontSize = '12px';
      label.style.color = '#8A847A';
      item.appendChild(label);
      
      container.appendChild(item);
    });
    
    return container;
  },
};

// Persona Icons
export const PersonaIcons: StoryObj = {
  render: () => {
    const personaColors: Record<string, string> = {
      ferni: '#4a6741',
      maya: '#a67a6a',
      peter: '#3a6b73',
      alex: '#5a6b8a',
      jordan: '#c4856a',
      nayan: '#b8956a',
    };
    
    const icons = getIconsByCategory('persona');
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.gap = '24px';
    
    icons.forEach(icon => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.padding = '16px';
      item.style.background = '#FAFAFA';
      item.style.borderRadius = '8px';
      
      const color = personaColors[icon.name] || '#8A847A';
      item.innerHTML = renderIcon(icon.name, 'xl', color);
      
      const label = document.createElement('span');
      label.textContent = icon.name;
      label.style.fontFamily = 'Inter, system-ui, sans-serif';
      label.style.fontSize = '14px';
      label.style.fontWeight = '500';
      label.style.color = color;
      label.style.textTransform = 'capitalize';
      item.appendChild(label);
      
      container.appendChild(item);
    });
    
    return container;
  },
};

// Icon Search
export const SearchIcons: StoryObj = {
  args: {
    query: 'voice',
  },
  render: (args) => {
    const icons = searchIcons(args.query);
    const container = document.createElement('div');
    
    const title = document.createElement('p');
    title.textContent = `Found ${icons.length} icons for "${args.query}"`;
    title.style.fontFamily = 'Inter, system-ui, sans-serif';
    title.style.marginBottom = '16px';
    container.appendChild(title);
    
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(6, 1fr)';
    grid.style.gap = '12px';
    
    icons.forEach(icon => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'center';
      item.style.gap = '4px';
      item.style.padding = '12px';
      item.style.background = '#FAFAFA';
      item.style.borderRadius = '8px';
      
      item.innerHTML = renderIcon(icon.name, 'md');
      
      const label = document.createElement('span');
      label.textContent = icon.name;
      label.style.fontFamily = 'Inter, system-ui, sans-serif';
      label.style.fontSize = '10px';
      label.style.color = '#8A847A';
      item.appendChild(label);
      
      grid.appendChild(item);
    });
    
    container.appendChild(grid);
    return container;
  },
};
