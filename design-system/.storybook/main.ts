import type { StorybookConfig } from '@storybook/html-vite';

const config: StorybookConfig = {
  stories: [
    '../stories/**/*.mdx',
    '../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    '../stories/react/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  // Storybook 9+ ships controls, actions, backgrounds, viewport and interactions in core;
  // docs (MDX + autodocs via the `autodocs` story tag) is the separate addon-docs.
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/html-vite',
    options: {},
  },
  staticDirs: ['../dist', '../assets'],
};

export default config;

