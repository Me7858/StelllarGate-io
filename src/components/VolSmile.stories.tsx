import type { Meta, StoryObj } from '@storybook/react';
import { VolSmile } from './VolSmile';

const meta: Meta<typeof VolSmile> = {
  title: 'Components/VolSmile',
  component: VolSmile,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'SVG line chart of the implied volatility smile across moneyness (70–130%). Left skew + wings model typical crypto IV behaviour.',
      },
    },
  },
  argTypes: {
    baseVol: { control: { type: 'range', min: 0.1, max: 2.5, step: 0.05 } },
    width:   { control: { type: 'range', min: 150, max: 800, step: 10 } },
    height:  { control: { type: 'range', min: 60, max: 300, step: 10 } },
  },
};
export default meta;

type Story = StoryObj<typeof VolSmile>;

export const XLM: Story = {
  args: { baseVol: 0.82 },
};

export const BTC: Story = {
  args: { baseVol: 0.65 },
};

export const SOL: Story = {
  args: { baseVol: 0.91 },
};

/** Very low vol — nearly flat smile, wing structure should still appear */
export const LowVol: Story = {
  args: { baseVol: 0.15 },
};

/** Extreme volatility (tail-risk event) */
export const ExtremeVol: Story = {
  args: { baseVol: 2.50 },
};

/** Narrow panel width — responsive re-render */
export const NarrowPanel: Story = {
  args: { baseVol: 0.82, width: 200, height: 90 },
};

/** Wide panel */
export const WidePanel: Story = {
  args: { baseVol: 0.65, width: 600, height: 160 },
};
