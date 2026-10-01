import type { Meta, StoryObj } from '@storybook/react';
import { SorobanErrorDisplay } from './SorobanErrorDisplay';
import { fn } from '@storybook/test';
import { within, userEvent, expect } from '@storybook/test';

const meta: Meta<typeof SorobanErrorDisplay> = {
  title: 'Components/SorobanErrorDisplay',
  component: SorobanErrorDisplay,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Displays a Soroban / Stellar transaction error with a human-readable message, suggested fix, and a one-click diagnostics copy button.',
      },
    },
  },
  args: {
    onDismiss: fn(),
  },
};
export default meta;

type Story = StoryObj<typeof SorobanErrorDisplay>;

/** Known contract error — maps to a human-readable message */
export const InsufficientCollateral: Story = {
  args: {
    raw: 'Error(Contract, #1)',
    txHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc123de',
  },
};

/** Position already closed — warning severity */
export const PositionAlreadyClosed: Story = {
  args: {
    raw: 'Error(Contract, #3)',
    txHash: 'deadbeef1234deadbeef1234deadbeef1234deadbeef1234deadbeef1234deadbeef',
  },
};

/** OTM expiry — info severity */
export const ExpiredOTM: Story = {
  args: {
    raw: 'Error(Contract, #6)',
  },
};

/** Unknown / unresolved error — shows raw text + expand toggle */
export const UnknownError: Story = {
  args: {
    raw: 'OperationFailed: simulation_failed_with_errors(["Error(Value, InvalidInput)"])',
    txHash: 'cafebabe9876cafebabe9876cafebabe9876cafebabe9876cafebabe9876cafebabe',
  },
};

/** No dismiss button */
export const NoDismiss: Story = {
  args: {
    raw: 'Error(Contract, #7)',
    onDismiss: undefined,
  },
};

/** Transaction sequence error */
export const SequenceError: Story = {
  args: {
    raw: 'txBAD_SEQ',
    txHash: '1111222233334444111122223333444411112222333344441111222233334444ffff',
  },
};

/** Interaction test: expand raw error and check content is visible */
export const ExpandRawError: Story = {
  args: {
    raw: 'Simulation threw: some_deeply_internal_error_that_is_not_mapped_to_human_text',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const showBtn = canvas.getByRole('button', { name: /show raw/i });
    await userEvent.click(showBtn);
    await expect(canvas.getByText(/Simulation threw/i)).toBeInTheDocument();
  },
};
