import type { Meta, StoryObj } from '@storybook/react';
import { ExportButton } from './ExportButton';
import { fn } from '@storybook/test';

const meta: Meta<typeof ExportButton> = {
  title: 'Components/ExportButton',
  component: ExportButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'CSV export trigger button. Minimal styling; complements data-dense tables.',
      },
    },
  },
  args: {
    onClick: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof ExportButton>;

export const Default: Story = {
  args: {},
};

export const CustomLabel: Story = {
  args: { label: 'Download Trade History' },
};

export const LongLabel: Story = {
  args: { label: 'Export Full Portfolio History with Greeks — CSV Format' },
};
