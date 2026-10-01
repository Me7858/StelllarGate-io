import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { AllProviders, seedWalletStore } from '../mocks/storybook-contexts';
import { mockAccount, handlers } from '../mocks/handlers';
import { http, HttpResponse, delay } from 'msw';

/**
 * DepositWithdrawModal stories.
 *
 * The modal has deep on-chain dependencies (Horizon account lookup,
 * Soroban vault contract calls). In Storybook we:
 *   1. Seed the wallet store so the modal sees a signed-in state.
 *   2. Mock the BackendDataContext with account balance.
 *   3. Use MSW to intercept Horizon/vault API calls and return canned data.
 *   4. Mock the account-readiness hook via the MSW stellar API mock.
 *
 * Interactive vault submission calls are not exercised here — use
 * integration tests (Playwright) for those flows.
 */

// Lazy import to avoid crashing Storybook when the file has heavy side effects
import { DepositWithdrawModal } from './DepositWithdrawModal';

const stellarHandlers = [
  // Horizon account lookup — sufficient balance and trustline
  http.get('https://horizon-testnet.stellar.org/accounts/*', async () => {
    await delay(200);
    return HttpResponse.json({
      id: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZUE2CGKV8F1V5K8LDSF3',
      sequence: '12345678',
      balances: [
        { asset_type: 'native', balance: '15.5000000' },
        { asset_type: 'credit_alphanum12', asset_code: 'USDC', asset_issuer: 'GBR...', balance: '1000.0000000' },
      ],
      subentry_count: 2,
    });
  }),
  // Vault history
  http.get('**/vault/history*', async () => {
    await delay(100);
    return HttpResponse.json({ events: [] });
  }),
];

const meta: Meta<typeof DepositWithdrawModal> = {
  title: 'Dialogs/DepositWithdrawModal',
  component: DepositWithdrawModal,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers: [...handlers, ...stellarHandlers] },
    docs: {
      description: {
        component:
          'Deposit / Withdraw collateral modal. Talks to the Soroban vault contract via Freighter. Not interactive in stories — use Playwright for the full on-chain flow.',
      },
    },
  },
  args: {
    onClose: fn(),
    onSuccess: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof DepositWithdrawModal>;

export const DepositMode: Story = {
  args: { initialMode: 'deposit' },
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

export const WithdrawMode: Story = {
  args: { initialMode: 'withdraw' },
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

/** No wallet connected — shows locked UI */
export const NotConnected: Story = {
  args: { initialMode: 'deposit' },
  decorators: [
    (Story) => (
      <AllProviders backendOverrides={{ account: null }}>
        <Story />
      </AllProviders>
    ),
  ],
};

/** Zero balance — withdraw should be blocked */
export const ZeroBalance: Story = {
  args: { initialMode: 'withdraw' },
  decorators: [
    (Story) => {
      seedWalletStore();
      return (
        <AllProviders
          backendOverrides={{
            account: { ...mockAccount, balance: 0, collateral_locked: 0 },
          }}
        >
          <Story />
        </AllProviders>
      );
    },
  ],
};
