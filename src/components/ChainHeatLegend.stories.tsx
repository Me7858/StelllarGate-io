import type { Meta, StoryObj } from '@storybook/react';
import { ChainHeatLegend, type HeatMode } from './ChainHeatLegend';
import { buildSequentialScale, buildDivergingScale } from '../lib/heatScale';
import { fn } from '@storybook/test';

const ivScale    = buildSequentialScale([0.40, 0.55, 0.68, 0.72, 0.83, 0.95, 1.10]);
const deltaScale = buildSequentialScale([0.01, 0.10, 0.25, 0.50, 0.72, 0.88, 0.99]);
const thetaScale = buildDivergingScale([-0.005, -0.002, -0.001, 0, 0.001]);

const meta: Meta<typeof ChainHeatLegend> = {
  title: 'Components/ChainHeatLegend',
  component: ChainHeatLegend,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Heat mode toggle + colour scale strip for the options chain. Four modes: Off / IV (sequential) / |Δ| (sequential) / Θ (diverging).',
      },
    },
  },
  args: {
    iv:       ivScale,
    absDelta: deltaScale,
    theta:    thetaScale,
    onChange: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof ChainHeatLegend>;

export const ModeOff: Story = {
  args: { heatMode: 'off' as HeatMode },
};

export const ModeIV: Story = {
  args: { heatMode: 'iv' as HeatMode },
};

export const ModeDelta: Story = {
  args: { heatMode: 'delta' as HeatMode },
};

export const ModeTheta: Story = {
  args: { heatMode: 'theta' as HeatMode },
};
