import type { Meta, StoryObj } from '@storybook/react';
import { ExpandableCard } from './ExpandableCard';

const meta: Meta<typeof ExpandableCard> = {
  title: 'Components/ExpandableCard',
  component: ExpandableCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Mobile replacement for a desktop table row. The entire header (≥56px) is the toggle; secondary columns are in the expandable body.',
      },
    },
  },
  argTypes: {
    defaultOpen: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof ExpandableCard>;

const DetailsContent = (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-lo)' }}>Delta</span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>+0.423</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-lo)' }}>Gamma</span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>0.018</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-lo)' }}>Theta / day</span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--put)' }}>−$0.24</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-lo)' }}>Vega / 1%</span>
      <span style={{ fontFamily: 'var(--font-mono)' }}>$0.87</span>
    </div>
  </div>
);

export const Collapsed: Story = {
  args: {
    title: 'XLM 0.12 CALL 30D',
    subtitle: '100 contracts · long',
    trailing: <span style={{ color: 'var(--call)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>+$17.00</span>,
    details: DetailsContent,
    defaultOpen: false,
  },
};

export const Expanded: Story = {
  args: {
    ...Collapsed.args,
    defaultOpen: true,
  },
};

export const NoDetails: Story = {
  args: {
    title: 'Flat position — no secondary data',
    trailing: <span style={{ fontFamily: 'var(--font-mono)' }}>$0.00</span>,
  },
};

export const NegativePnL: Story = {
  args: {
    title: 'XLM 0.10 PUT 14D',
    subtitle: '50 contracts · short',
    trailing: <span style={{ color: 'var(--put)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>−$142.50</span>,
    details: DetailsContent,
    defaultOpen: false,
  },
};

/** Long title that should truncate gracefully */
export const LongTitle: Story = {
  args: {
    title: 'BTC 67420 CALL BUTTERFLY SPREAD — SEP-30 / OCT-14 / OCT-30 30D 60D 90D',
    subtitle: 'Very long subtitle that should still render without overflowing its container',
    trailing: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>+$1,234,567.89</span>,
    details: DetailsContent,
    defaultOpen: false,
  },
};
