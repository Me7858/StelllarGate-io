import type { Meta, StoryObj } from '@storybook/react';
import { ConfirmDialog } from './ConfirmDialog';
import { fn } from '@storybook/test';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Dialogs/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Final confirmation gate before a trade or destructive action. Centered on desktop, bottom-anchored on compact screens. Escape and backdrop click cancel.',
      },
    },
  },
  args: {
    open: true,
    onConfirm: fn(),
    onCancel: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  args: {
    title: 'Confirm action',
    description: 'This default dialog is used for static visual checks and smoke tests.',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
  },
};

export const BuyCall: Story = {
  args: {
    title: 'Buy XLM Call',
    description: 'Purchase 100 contracts of the 0.12 strike 30-day call at $0.0045 each. Total cost: $45.00.',
    confirmLabel: 'Buy 100 contracts',
    cancelLabel: 'Cancel',
  },
};

export const WriteCall: Story = {
  args: {
    title: 'Write XLM Call',
    description: 'Sell 50 contracts of the 0.14 strike 14-day call. Collateral required: $700.00.',
    confirmLabel: 'Write 50 contracts',
    cancelLabel: 'Cancel',
  },
};

/** Destructive action — confirm button is red */
export const ClosePosition: Story = {
  args: {
    title: 'Close position?',
    description: 'Close 100 contracts of XLM 0.12 CALL at market price. Estimated P&L: +$17.00.',
    confirmLabel: 'Close position',
    cancelLabel: 'Keep open',
    destructive: true,
  },
};

/** With extra details children */
export const WithDetails: Story = {
  args: {
    title: 'Execute strategy',
    description: 'Open a Long Straddle on XLM: buy both ATM call and put.',
    confirmLabel: 'Execute 4 legs',
    cancelLabel: 'Cancel',
    children: (
      <div style={{ background: 'var(--bg-overlay)', padding: '10px 12px', marginBottom: 4, fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: 'var(--text-lo)' }}>Call leg</span>
          <span style={{ color: 'var(--call)', fontFamily: 'var(--font-mono)' }}>Buy 0.12 CALL × 2</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-lo)' }}>Put leg</span>
          <span style={{ color: 'var(--put)', fontFamily: 'var(--font-mono)' }}>Buy 0.12 PUT × 2</span>
        </div>
      </div>
    ),
  },
};

/** Closed — dialog not rendered */
export const Closed: Story = {
  args: {
    open: false,
    title: 'This should not be visible',
    description: 'If you see this the closed state is broken.',
  },
};

/** Interaction: Escape key fires onCancel */
export const EscapeToCancel: Story = {
  args: {
    title: 'Confirm action',
    description: 'Press Escape to cancel.',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const panel = canvas.getByRole('dialog');
    panel.focus();
    await userEvent.keyboard('{Escape}');
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};

/** Interaction: clicking confirm fires onConfirm */
export const ConfirmClick: Story = {
  args: {
    title: 'Confirm buy',
    description: 'Click confirm to proceed.',
    confirmLabel: 'Confirm buy',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button', { name: /confirm buy/i });
    await userEvent.click(btn);
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};

/** Interaction: clicking cancel fires onCancel */
export const CancelClick: Story = {
  args: {
    title: 'Confirm close',
    description: 'Click cancel to keep the position open.',
    cancelLabel: 'Keep open',
    destructive: true,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole('button', { name: /keep open/i });
    await userEvent.click(btn);
    await expect(args.onCancel).toHaveBeenCalledTimes(1);
  },
};
