import type { Meta, StoryObj } from '@storybook/react';
import { ErrorBoundary } from './ErrorBoundary';

/** A child that throws unconditionally on render */
function AlwaysThrows(): React.ReactElement {
  throw new Error('Test: intentional render error for ErrorBoundary story');
}

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'React class-based error boundary. Catches render errors in its subtree, reports to Sentry, and renders either a fallback prop or a default red banner.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<typeof ErrorBoundary>;

/** Boundary is not triggered — shows normal children */
export const WithHealthyChild: Story = {
  args: {
    children: (
      <div style={{ padding: 16, border: '1px solid var(--border-default)', color: 'var(--text-hi)' }}>
        Component rendered successfully
      </div>
    ),
  },
};

/** Boundary catches a throw — default fallback */
export const DefaultFallback: Story = {
  args: {
    children: <AlwaysThrows />,
  },
};

/** Boundary catches a throw — custom fallback */
export const CustomFallback: Story = {
  args: {
    children: <AlwaysThrows />,
    fallback: (
      <div style={{
        padding: '16px 20px',
        background: 'var(--atm-dim)',
        border: '1px solid var(--atm)',
        color: 'var(--atm)',
        fontSize: 13,
      }}>
        ⚠ Custom fallback: chart could not render. Please reload.
      </div>
    ),
  },
};
