import type { Meta, StoryObj } from '@storybook/react';
import { HeatCell } from './HeatCell';
import { buildSequentialScale, buildDivergingScale } from '../lib/heatScale';

const ivValues = [0.40, 0.55, 0.68, 0.72, 0.83, 0.95, 1.10];
const ivScale = buildSequentialScale(ivValues);

const thetaValues = [-0.005, -0.002, -0.001, 0, 0.001];
const thetaScale = buildDivergingScale(thetaValues);

const meta: Meta<typeof HeatCell> = {
  title: 'Components/HeatCell',
  component: HeatCell,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A heat-colored table cell. Text is always the primary channel; color is a secondary signal. Colorblind-safe palette with ≥4.5:1 contrast.',
      },
    },
  },
  argTypes: {
    value:   { control: { type: 'number' } },
    display: { control: 'text' },
    active:  { control: 'boolean' },
    title:   { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof HeatCell>;

/** Heat off — just plain text */
export const Inactive: Story = {
  args: {
    value: 0.72,
    display: '72.0',
    scale: ivScale,
    active: false,
    title: 'IV 72%',
  },
};

/** Low end of the IV sequential scale */
export const LowIV: Story = {
  args: {
    value: ivValues[0],
    display: '40.0',
    scale: ivScale,
    active: true,
    title: 'IV 40%',
  },
};

/** Mid-range IV */
export const MidIV: Story = {
  args: {
    value: 0.72,
    display: '72.0',
    scale: ivScale,
    active: true,
    title: 'IV 72%',
  },
};

/** High end of the IV sequential scale */
export const HighIV: Story = {
  args: {
    value: ivValues[ivValues.length - 1],
    display: '110.0',
    scale: ivScale,
    active: true,
    title: 'IV 110%',
  },
};

/** Negative theta (diverging scale, red end) */
export const NegativeTheta: Story = {
  args: {
    value: -0.004,
    display: '-0.004',
    scale: thetaScale,
    active: true,
    title: 'Θ -0.004',
  },
};

/** Near-zero theta (neutral) */
export const NeutralTheta: Story = {
  args: {
    value: 0,
    display: '0.000',
    scale: thetaScale,
    active: true,
    title: 'Θ 0',
  },
};

/** No scale provided — fallback to plain text */
export const NoScale: Story = {
  args: {
    value: 0.5,
    display: '50.0',
    scale: null,
    active: true,
  },
};

/** Extreme value well outside the scale range */
export const ExtremeValue: Story = {
  args: {
    value: 9.99,
    display: '999.9',
    scale: ivScale,
    active: true,
    title: 'IV 999%',
  },
};
