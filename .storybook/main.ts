import type { StorybookConfig } from '@storybook/nextjs';

const config: StorybookConfig = {
  // All component stories under src/components/
  stories: ['../src/components/**/*.stories.@(ts|tsx)'],

  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
    'msw-storybook-addon',
  ],

  framework: {
    name: '@storybook/nextjs',
    options: {},
  },

  // Serve public/ so MSW service worker (mockServiceWorker.js) and any
  // other static assets are available during story rendering.
  staticDirs: ['../public'],

  docs: {
    autodocs: 'tag',
  },

  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) =>
        prop.parent ? !/node_modules/.test(prop.parent.fileName) : true,
    },
  },
};

export default config;
