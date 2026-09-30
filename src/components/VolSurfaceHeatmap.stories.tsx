import type { Meta, StoryObj } from '@storybook/react';
import { VolSurfaceHeatmap } from './VolSurfaceHeatmap';

const meta: Meta<typeof VolSurfaceHeatmap> = {
  title: 'Components/VolSurfaceHeatmap',
  component: VolSurfaceHeatmap,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'IV surface grid across moneyness (80–120%) and expiry (7–180D). Hover each cell for the exact IV. Selected expiry row is highlighted.',
      },
    },
  },
  argTypes: {
    baseVol: { control: { type: 'range', min: 0.2, max: 2.0, step: 0.05 } },
    selectedExpiryDays: { control: { type: 'select', options: [7, 14, 30, 60, 90, 180] } },
  },
};
export default meta;

type Story = StoryObj<typeof VolSurfaceHeatmap>;

export const DefaultXLM: Story = {
  args: { baseVol: 0.82 },
};

export const WithSelectedExpiry30D: Story = {
  args: { baseVol: 0.82, selectedExpiryDays: 30 },
};

export const LowVolatility: Story = {
  args: { baseVol: 0.25, selectedExpiryDays: 7 },
};

export const HighVolatility: Story = {
  args: { baseVol: 1.80 },
};

/** Extreme base vol — tests colour scale at the limits */
export const ExtremeHigh: Story = {
  args: { baseVol: 3.0 },
};

export const ExtremeShort7D: Story = {
  args: { baseVol: 0.65, selectedExpiryDays: 7 },
};
