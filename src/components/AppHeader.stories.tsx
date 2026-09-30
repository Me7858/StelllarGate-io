import type { Meta, StoryObj } from '@storybook/react';
import { AppHeader } from './AppHeader';
import { AllProviders, seedWalletStore } from '../mocks/storybook-contexts';
import { mockAccount } from '../mocks/handlers';

const meta: Meta<typeof AppHeader> = {
  title: 'Components/AppHeader',
  component: AppHeader,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'App-wide header with logo, nav tabs, balance display, and transaction tracker button. Balance shows from BackendDataContext.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof AppHeader>;

/** Signed in with positive balance */
export const SignedIn: Story = {
  decorators: [
    (Story) => {
      seedWalletStore();
      return (
        <AllProviders backendOverrides={{ account: mockAccount }}>
          <Story />
        </AllProviders>
      );
    },
  ],
};

/** Signed in with locked collateral */
export const WithLockedCollateral: Story = {
  decorators: [
    (Story) => {
      seedWalletStore();
      return (
        <AllProviders
          backendOverrides={{
            account: { ...mockAccount, balance: 15_000, collateral_locked: 8_200 },
          }}
        >
          <Story />
        </AllProviders>
      );
    },
  ],
};

/** Not signed in — balance shows $0.00 */
export const NotSignedIn: Story = {
  decorators: [
    (Story) => (
      <AllProviders backendOverrides={{ account: null }}>
        <Story />
      </AllProviders>
    ),
  ],
};

/** Large balance — tests number formatting */
export const LargeBalance: Story = {
  decorators: [
    (Story) => {
      seedWalletStore();
      return (
        <AllProviders
          backendOverrides={{
            account: { ...mockAccount, balance: 1_234_567.89, collateral_locked: 345_678.90 },
          }}
        >
          <Story />
        </AllProviders>
      );
    },
  ],
};
