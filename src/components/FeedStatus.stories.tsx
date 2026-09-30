import type { Meta, StoryObj } from '@storybook/react';
import { FeedStatusPill, ProvenanceBadge, useSpotProvenance } from './FeedStatus';
import { MockSpotFeedProvider } from '../mocks/storybook-contexts';

// ──────────────────────────────────────────────────────────────────────────────
// FeedStatusPill
// ──────────────────────────────────────────────────────────────────────────────

const pillMeta: Meta<typeof FeedStatusPill> = {
  title: 'Components/FeedStatus/FeedStatusPill',
  component: FeedStatusPill,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Compact status indicator (Live / Stale / Reconnecting / Offline) with a coloured dot. Debounced so sub-second reconnects do not flicker.',
      },
    },
  },
};
export default pillMeta;

type PillStory = StoryObj<typeof FeedStatusPill>;

export const Live: PillStory = {
  decorators: [
    (Story) => (
      <MockSpotFeedProvider overrides={{ status: 'open', data: { prices: { XLM: 0.1182 }, vols: { XLM: 0.83 } } }}>
        <Story />
      </MockSpotFeedProvider>
    ),
  ],
};

export const Connecting: PillStory = {
  decorators: [
    (Story) => (
      <MockSpotFeedProvider overrides={{ status: 'connecting', data: null }}>
        <Story />
      </MockSpotFeedProvider>
    ),
  ],
};

export const Stale: PillStory = {
  decorators: [
    (Story) => (
      <MockSpotFeedProvider overrides={{ status: 'stale' }}>
        <Story />
      </MockSpotFeedProvider>
    ),
  ],
};

export const Offline: PillStory = {
  decorators: [
    (Story) => (
      <MockSpotFeedProvider overrides={{ status: 'closed', data: null }}>
        <Story />
      </MockSpotFeedProvider>
    ),
  ],
};
