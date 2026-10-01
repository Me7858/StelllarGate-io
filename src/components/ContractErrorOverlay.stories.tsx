import type { Meta, StoryObj } from '@storybook/react';
import { ContractErrorOverlay } from './ContractErrorOverlay';

const meta: Meta<typeof ContractErrorOverlay> = {
  title: 'Components/ContractErrorOverlay',
  component: ContractErrorOverlay,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Development-only overlay showing API contract violations. Renders nothing in production. Only visible when NODE_ENV=development and a contract error has been emitted.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ContractErrorOverlay>;

/**
 * The overlay only renders when NODE_ENV=development AND a contract error
 * has been triggered via onContractError(). In Storybook (development mode),
 * it starts empty. This story documents the component exists.
 */
export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story: 'No contract errors have been emitted — overlay is invisible.',
      },
    },
  },
};
