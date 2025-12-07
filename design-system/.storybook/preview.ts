import type { Preview } from '@storybook/html';

// Import design tokens
import '../dist/tokens.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#FFFDFB' }, // Paper Cream
        { name: 'dark', value: '#2C2520' },  // Natural Ink
        { name: 'sage', value: '#4a6741' },  // Ferni Primary
      ],
    },
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile',
          styles: { width: '375px', height: '667px' },
        },
        tablet: {
          name: 'Tablet',
          styles: { width: '768px', height: '1024px' },
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1440px', height: '900px' },
        },
      },
    },
  },
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Global theme for components',
      defaultValue: 'light',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
    persona: {
      name: 'Persona',
      description: 'Active persona colors',
      defaultValue: 'ferni',
      toolbar: {
        icon: 'user',
        items: [
          { value: 'ferni', title: 'Ferni (Sage)' },
          { value: 'jack-bogle', title: 'Jack (Cedar)' },
          { value: 'peter-lynch', title: 'Peter (Teal)' },
          { value: 'alex-chen', title: 'Alex (Slate)' },
          { value: 'maya-santos', title: 'Maya (Rose)' },
          { value: 'jordan-taylor', title: 'Jordan (Coral)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (story, context) => {
      const theme = context.globals.theme || 'light';
      const persona = context.globals.persona || 'ferni';
      
      // Create wrapper with theme and persona classes
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-theme', theme);
      wrapper.setAttribute('data-persona', persona);
      wrapper.style.padding = '2rem';
      wrapper.style.minHeight = '100vh';
      wrapper.style.backgroundColor = theme === 'dark' 
        ? 'var(--color-background-base)' 
        : 'var(--color-background-elevated)';
      
      const content = story();
      if (typeof content === 'string') {
        wrapper.innerHTML = content;
      } else {
        wrapper.appendChild(content);
      }
      
      return wrapper;
    },
  ],
};

export default preview;

