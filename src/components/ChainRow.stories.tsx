import type { Meta, StoryObj } from '@storybook/react';
import { ChainRow } from './ChainRow';
import type { ChainRowData } from '../lib/chainRows';
import { fn } from '@storybook/test';

const baseRow: ChainRowData = {
  strike: 0.118,
  call: { premium: 0.0045, delta: 0.50, gamma: 0.28, theta: -0.00058, vega: 0.021, iv: 0.83 },
  put:  { premium: 0.0043, delta: -0.50, gamma: 0.28, theta: -0.00055, vega: 0.021, iv: 0.84 },
  itmCall: false,
  itmPut:  false,
};

const meta: Meta<typeof ChainRow> = {
  title: 'Components/ChainRow',
  component: ChainRow,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A single row in the options chain table. Bid/ask cells flash green/red on price updates (disabled in stories for snapshot stability). ITM side gets a tinted background.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ background: 'var(--bg-raised)', padding: 0 }}>
        {/* Simulate the chain header + row wrapper */}
        <div style={{ overflowX: 'auto' }}>
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    fmtStrike: (k: number) => `$${k.toFixed(4)}`,
    onTrade: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof ChainRow>;

export const ATM: Story = {
  args: { row: baseRow, isAtm: true },
};

export const OTM: Story = {
  args: { row: baseRow, isAtm: false },
};

export const CallITM: Story = {
  args: {
    row: {
      ...baseRow,
      strike: 0.105,
      itmCall: true,
      itmPut: false,
      call: { ...baseRow.call, premium: 0.0142, delta: 0.78, iv: 0.79 },
    },
    isAtm: false,
  },
};

export const PutITM: Story = {
  args: {
    row: {
      ...baseRow,
      strike: 0.130,
      itmCall: false,
      itmPut: true,
      put: { ...baseRow.put, premium: 0.0118, delta: -0.72, iv: 0.91 },
    },
    isAtm: false,
  },
};

/** Very small premiums (near-zero price) */
export const NearZeroPremium: Story = {
  args: {
    row: {
      ...baseRow,
      strike: 0.200,
      call: { ...baseRow.call, premium: 0.00001, delta: 0.01, iv: 1.20 },
      put:  { ...baseRow.put,  premium: 0.00001, delta: -0.01, iv: 1.22 },
    },
    isAtm: false,
  },
};

/** Extreme IV — stress-tests IV cell display */
export const ExtremeIV: Story = {
  args: {
    row: {
      ...baseRow,
      call: { ...baseRow.call, iv: 3.50 },
      put:  { ...baseRow.put,  iv: 3.62 },
    },
    isAtm: false,
  },
};

/** BTC scale strikes — tests strike formatter at large numbers */
export const BTCScale: Story = {
  args: {
    row: {
      strike: 62_500,
      call: { premium: 1250.50, delta: 0.50, gamma: 0.000012, theta: -42.10, vega: 89.50, iv: 0.62 },
      put:  { premium: 1248.30, delta: -0.50, gamma: 0.000012, theta: -41.80, vega: 89.20, iv: 0.63 },
      itmCall: false,
      itmPut: false,
    },
    isAtm: true,
    fmtStrike: (k: number) => `$${k.toLocaleString()}`,
  },
};
