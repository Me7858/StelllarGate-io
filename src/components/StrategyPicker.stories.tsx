import type { Meta, StoryObj } from '@storybook/react';
import { StrategyPicker } from './StrategyPicker';
import { fn } from '@storybook/test';
import { within, userEvent, expect } from '@storybook/test';
import { STRATEGY_TEMPLATES } from '../lib/strategies';

const meta: Meta<typeof StrategyPicker> = {
  title: 'Components/StrategyPicker',
  component: StrategyPicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'List of multi-leg strategy templates. Selected strategy is highlighted.',
      },
    },
  },
  args: {
    onSelect: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof StrategyPicker>;

export const NoneSelected: Story = {
  args: { selectedId: null },
};

export const StraddleSelected: Story = {
  args: { selectedId: 'straddle' },
};

export const BullCallSpreadSelected: Story = {
  args: { selectedId: 'bull-call-spread' },
};

/** Interaction: selecting a strategy fires onSelect with the template object */
export const SelectStrategy: Story = {
  args: { selectedId: null },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Click the first strategy (Long Straddle)
    const btn = canvas.getByText('Long Straddle').closest('button')!;
    await userEvent.click(btn);
    await expect(args.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'straddle' }),
    );
  },
};
