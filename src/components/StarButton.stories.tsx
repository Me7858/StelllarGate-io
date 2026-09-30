import type { Meta, StoryObj } from '@storybook/react';
import { StarButton } from './StarButton';
import { AllProviders, seedWalletStore } from '../mocks/storybook-contexts';
import { fn } from '@storybook/test';
import { within, userEvent, expect } from '@storybook/test';
import { handlers } from '../mocks/handlers';

const meta: Meta<typeof StarButton> = {
  title: 'Components/StarButton',
  component: StarButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Watchlist toggle button (star/unstar). Disabled and locked at 40% opacity when no wallet is connected.',
      },
    },
    msw: { handlers },
  },
};
export default meta;

type Story = StoryObj<typeof StarButton>;

/** Not connected — star is greyed out and non-interactive */
export const NotConnected: Story = {
  args: { sym: 'XLM' },
  decorators: [
    (Story) => (
      <AllProviders backendOverrides={{ watchlist: [] }}>
        <Story />
      </AllProviders>
    ),
  ],
};

/** Connected, not favorited */
export const ConnectedUnfavorited: Story = {
  args: { sym: 'SOL' },
  decorators: [
    (Story) => {
      seedWalletStore();
      return (
        <AllProviders backendOverrides={{ watchlist: [] }}>
          <Story />
        </AllProviders>
      );
    },
  ],
};

/** Connected, already in watchlist */
export const ConnectedFavorited: Story = {
  args: { sym: 'XLM' },
  decorators: [
    (Story) => {
      seedWalletStore();
      return (
        <AllProviders backendOverrides={{ watchlist: [{ wallet_address: 'G...', underlying: 'XLM', added_at: '' }] }}>
          <Story />
        </AllProviders>
      );
    },
  ],
};

/** Interaction: click unfavorited star — button becomes pending */
export const ToggleWatchlist: Story = {
  args: { sym: 'SOL' },
  decorators: [
    (Story) => {
      seedWalletStore();
      return (
        <AllProviders backendOverrides={{ watchlist: [] }}>
          <Story />
        </AllProviders>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button');
    await expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    // After click the button is in pending state briefly
  },
};
