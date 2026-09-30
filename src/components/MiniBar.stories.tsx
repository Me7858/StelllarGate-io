import type { Meta, StoryObj } from '@storybook/react';
import { MiniBar } from './MiniBar';

const meta: Meta<typeof MiniBar> = {
  title: 'Components/MiniBar',
  component: MiniBar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Inline mini-bar for volume / open interest. Shows a clearly marked N/A when value is null — no mock values ever shown.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof MiniBar>;

export const Default: Story = {
  args: { value: 1500, max: 5000, name: 'Volume' },
};

export const FullBar: Story = {
  args: { value: 5000, max: 5000, name: 'Open Interest' },
};

export const LowValue: Story = {
  args: { value: 50, max: 5000, name: 'Volume' },
};

export const NotAvailable: Story = {
  args: { value: null, max: 5000, name: 'Volume' },
};

export const ZeroMax: Story = {
  args: { value: 100, max: 0, name: 'Volume' },
};

/** Very large OI number — tests formatting (k suffix) */
export const LargeNumber: Story = {
  args: { value: 12345, max: 50000, name: 'Open Interest', label: '12.3k' },
};

/** With explicit label override */
export const WithLabel: Story = {
  args: { value: 2500, max: 5000, name: 'Volume', label: '2.5k' },
};

export const NaN: Story = {
  args: { value: Number.NaN, max: 5000, name: 'Volume' },
};
