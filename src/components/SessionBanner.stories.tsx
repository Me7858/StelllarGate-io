import type { Meta, StoryObj } from '@storybook/react';
import { SessionBanner } from './SessionBanner';
import { useWalletStore } from '../lib/store/wallet';

// Seed helpers run inside decorators so store is always initialized
function seedExpired() {
  useWalletStore.setState({
    token: 'expired-mock-token',
    tokenExpiresAt: Date.now() - 1000,   // in the past
    sessionExpired: true,
    address: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZUE2CGKV8F1V5K8LDSF3',
  });
}

function seedExpiringSoon() {
  useWalletStore.setState({
    token: 'soon-token',
    tokenExpiresAt: Date.now() + 5 * 60 * 1000,  // 5 min
    sessionExpired: false,
    address: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZUE2CGKV8F1V5K8LDSF3',
  });
}

function seedActive() {
  useWalletStore.setState({
    token: 'valid-token',
    tokenExpiresAt: Date.now() + 60 * 60 * 1000,  // 1h
    sessionExpired: false,
    address: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZUE2CGKV8F1V5K8LDSF3',
  });
}

const meta: Meta<typeof SessionBanner> = {
  title: 'Components/SessionBanner',
  component: SessionBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Persistent banner shown when the session has expired (red) or is expiring within 10 minutes (amber). Hidden when the session is valid.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof SessionBanner>;

/** Session already expired — red banner with "Sign in" CTA */
export const Expired: Story = {
  decorators: [
    (Story) => {
      seedExpired();
      return <Story />;
    },
  ],
};

/** Session expiring within 10 minutes — amber warning */
export const ExpiringSoon: Story = {
  decorators: [
    (Story) => {
      seedExpiringSoon();
      return <Story />;
    },
  ],
};

/** Valid session — banner renders nothing */
export const Hidden: Story = {
  decorators: [
    (Story) => {
      seedActive();
      return <Story />;
    },
  ],
};

/** Not signed in — renders nothing */
export const NotSignedIn: Story = {
  decorators: [
    (Story) => {
      useWalletStore.setState({ token: null, tokenExpiresAt: null, sessionExpired: false, address: null });
      return <Story />;
    },
  ],
};
