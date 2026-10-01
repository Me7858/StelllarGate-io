import type { Meta, StoryObj } from '@storybook/react';
import { GreekProfileChart } from './GreekProfileChart';
import type { ProfilePoint, GreekKey } from '../lib/quantWorker';

// Synthetic profile across ±30% spot range for a long call position
function makeCallProfile(currentSpot: number, count = 61): ProfilePoint[] {
  return Array.from({ length: count }, (_, i) => {
    const spot = currentSpot * (0.70 + i * (0.60 / (count - 1)));
    const moneyness = spot / currentSpot;
    return {
      spot,
      delta: Math.min(0.99, Math.max(0.01, 0.5 + 2.2 * (moneyness - 1))),
      gamma: 0.15 * Math.exp(-6 * (moneyness - 1) ** 2),
      vega:  0.08 * Math.exp(-4 * (moneyness - 1) ** 2),
    };
  });
}

const xlmProfile = makeCallProfile(0.1182);
const btcProfile = makeCallProfile(62_450);

const meta: Meta<typeof GreekProfileChart> = {
  title: 'Components/GreekProfileChart',
  component: GreekProfileChart,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'SVG line chart showing how Δ, Γ, or ν changes as spot moves ±30% from current. Current spot marked with dashed line.',
      },
    },
  },
  argTypes: {
    greek: {
      control: { type: 'select' },
      options: ['delta', 'gamma', 'vega'] satisfies GreekKey[],
    },
    width:  { control: { type: 'range', min: 200, max: 800, step: 20 } },
    height: { control: { type: 'range', min: 80, max: 320, step: 20 } },
  },
};
export default meta;

type Story = StoryObj<typeof GreekProfileChart>;

export const DeltaXLM: Story = {
  args: { profile: xlmProfile, greek: 'delta', currentSpot: 0.1182 },
};

export const GammaXLM: Story = {
  args: { profile: xlmProfile, greek: 'gamma', currentSpot: 0.1182 },
};

export const VegaXLM: Story = {
  args: { profile: xlmProfile, greek: 'vega', currentSpot: 0.1182 },
};

/** Large price — verifies axis label formatting at BTC scale */
export const DeltaBTC: Story = {
  args: { profile: btcProfile, greek: 'delta', currentSpot: 62_450 },
};

/** Empty profile — shows "No positions" placeholder */
export const EmptyProfile: Story = {
  args: { profile: [], greek: 'delta', currentSpot: 0.1182 },
};

/** Small canvas */
export const Compact: Story = {
  args: { profile: xlmProfile, greek: 'delta', currentSpot: 0.1182, width: 280, height: 100 },
};
