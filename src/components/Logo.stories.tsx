import type { Meta, StoryObj } from '@storybook/react';
import { Logo } from './Logo';

const meta: Meta<typeof Logo> = {
  title: 'Components/Logo',
  component: Logo,
  parameters: {
    layout: 'centered',
    docs: { description: { component: 'Zenith triangle logo mark. Scales via the `size` prop.' } },
  },
  argTypes: {
    size: { control: { type: 'range', min: 8, max: 128, step: 4 } },
  },
};
export default meta;

type Story = StoryObj<typeof Logo>;

export const Default: Story = {
  args: { size: 24 },
};

export const Small: Story = {
  args: { size: 12 },
};

export const Large: Story = {
  args: { size: 64 },
};

export const ExtraLarge: Story = {
  args: { size: 128 },
};
