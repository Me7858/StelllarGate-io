import type { Meta, StoryObj } from '@storybook/react';
import { SignInSummary } from './SignInSummary';
import { fn } from '@storybook/test';
import { within, userEvent, expect } from '@storybook/test';
import type { ParsedChallenge } from '../lib/auth/challengeValidator';

const structuredChallenge: ParsedChallenge = {
  walletAddress: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZUE2CGKV8F1V5K8LDSF3',
  uri: 'https://app.zenith.finance',
  domain: 'app.zenith.finance',
  version: '1',
  nonce: 'n0nc3r4nd0m1234567890',
  issuedAt: new Date('2026-09-29T18:00:00Z'),
  expirationTime: new Date('2026-09-29T18:30:00Z'),
  rawMessage:
    'Zenith wants you to sign in with your Stellar account:\nGCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZUE2CGKV8F1V5K8LDSF3\n\nURI: https://app.zenith.finance\nVersion: 1\nNonce: n0nc3r4nd0m1234567890\nIssued At: 2026-09-29T18:00:00Z\nExpiration Time: 2026-09-29T18:30:00Z',
};

const legacyChallenge: ParsedChallenge = {
  ...structuredChallenge,
  version: 'legacy',
  rawMessage: 'Sign in to Zenith — nonce: abc123xyz (legacy format)',
};

const meta: Meta<typeof SignInSummary> = {
  title: 'Components/SignInSummary',
  component: SignInSummary,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal dialog shown before asking Freighter to sign the authentication challenge. Shows structured or legacy challenge details with proceed/cancel.',
      },
    },
  },
  args: {
    onProceed: fn(),
    onCancel: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof SignInSummary>;

export const Structured: Story = {
  args: {
    challenge: structuredChallenge,
    proceeding: false,
  },
};

export const Legacy: Story = {
  args: {
    challenge: legacyChallenge,
    proceeding: false,
  },
};

/** Signing in progress — buttons disabled */
export const Proceeding: Story = {
  args: {
    challenge: structuredChallenge,
    proceeding: true,
  },
};

/** Interaction: click Cancel fires onCancel */
export const CancelFlow: Story = {
  args: {
    challenge: structuredChallenge,
    proceeding: false,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const cancelBtn = canvas.getByRole('button', { name: /cancel/i });
    await userEvent.click(cancelBtn);
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};

/** Interaction: click Sign & Continue fires onProceed */
export const ProceedFlow: Story = {
  args: {
    challenge: structuredChallenge,
    proceeding: false,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const proceedBtn = canvas.getByRole('button', { name: /sign & continue/i });
    await userEvent.click(proceedBtn);
    await expect(args.onProceed).toHaveBeenCalledTimes(1);
  },
};
