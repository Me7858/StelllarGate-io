import type { Meta, StoryObj } from '@storybook/react';
import { BottomSheet } from './BottomSheet';
import { fn } from '@storybook/test';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof BottomSheet> = {
  title: 'Components/BottomSheet',
  component: BottomSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
    docs: {
      description: {
        component:
          'Mobile bottom sheet — handles visual viewport tracking (on-screen keyboard), drag-to-dismiss, focus trap, Escape-to-close, and iOS safe-area padding.',
      },
    },
  },
  args: {
    onClose: fn(),
    ariaLabel: 'Order ticket',
  },
};
export default meta;

type Story = StoryObj<typeof BottomSheet>;

const SampleContent = (
  <div style={{ padding: '16px 20px' }}>
    <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-hi)' }}>
      Buy XLM Call · 0.12 strike
    </h2>
    <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 16 }}>
      30-day expiry · 100 contracts · Est. cost: $45.00
    </p>
    <button style={{
      width: '100%', padding: '12px 0', background: 'var(--call)',
      border: 'none', color: 'var(--bg)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
    }}>
      Confirm Buy
    </button>
  </div>
);

export const Open: Story = {
  args: { open: true, children: SampleContent },
};

export const Closed: Story = {
  args: { open: false, children: SampleContent },
};

/** Sheet suspended (a confirm dialog is layered above it) */
export const Suspended: Story = {
  args: { open: true, suspended: true, children: SampleContent },
};

/** Long scrollable content */
export const ScrollableContent: Story = {
  args: {
    open: true,
    children: (
      <div style={{ padding: '16px 20px' }}>
        {Array.from({ length: 20 }, (_, i) => (
          <p key={i} style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 12 }}>
            Content row {i + 1} — verify this scrolls without pushing content below the bottom.
          </p>
        ))}
      </div>
    ),
  },
};

/** Interaction: Escape key closes the sheet */
export const CloseOnEscape: Story = {
  args: { open: true, children: SampleContent },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Focus the sheet so Escape is received
    const sheet = canvasElement.querySelector('[role="dialog"]');
    if (sheet instanceof HTMLElement) sheet.focus();
    await userEvent.keyboard('{Escape}');
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};
