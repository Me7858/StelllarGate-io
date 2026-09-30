import type { Preview, Decorator } from '@storybook/react';
import { initialize, mswLoader } from 'msw-storybook-addon';

// Pull in all global styles — Tailwind directives, CSS custom properties,
// component classes (.chain-row, .zn-card, .skeleton, .flash-up, etc.)
import '../src/app/globals.css';

// ---------------------------------------------------------------------------
// MSW — start the service worker before any story renders.
// onUnhandledRequest: 'bypass' avoids noise from Storybook's own fetches.
// ---------------------------------------------------------------------------
initialize({ onUnhandledRequest: 'bypass' });

// ---------------------------------------------------------------------------
// Font bridge + animation kill-switch
//
// next/font emits scoped CSS variables (--font-plex-sans, etc.) at build
// time; they are unavailable in Storybook's webpack bundle.  This block
// maps those variables to the Google Fonts family names loaded by
// preview-head.html, and disables transitions/animations for snapshot
// stability.
// ---------------------------------------------------------------------------
(function injectZenithPreviewStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('zenith-preview-styles')) return;

  const style = document.createElement('style');
  style.id = 'zenith-preview-styles';
  style.textContent = `
    /* Map next/font CSS variables to Google Fonts families (preview-head.html) */
    :root {
      --font-plex-sans: 'IBM Plex Sans';
      --font-jetbrains-mono: 'JetBrains Mono';
      --font-fraunces: 'Fraunces';
    }

    /* Kill transitions / animations for visual-diff and snapshot stability */
    .sb-show-main *,
    .sb-show-main *::before,
    .sb-show-main *::after {
      transition-duration: 0ms !important;
      animation-duration: 0ms !important;
      animation-delay: 0ms !important;
    }
  `;
  document.head.appendChild(style);
})();

// ---------------------------------------------------------------------------
// Viewports — mobile preset exposed alongside tablet/desktop
// ---------------------------------------------------------------------------
const VIEWPORTS = {
  mobile: {
    name: 'Mobile (375)',
    styles: { width: '375px', height: '812px' },
    type: 'mobile' as const,
  },
  mobileLg: {
    name: 'Mobile L (430)',
    styles: { width: '430px', height: '932px' },
    type: 'mobile' as const,
  },
  tablet: {
    name: 'Tablet (768)',
    styles: { width: '768px', height: '1024px' },
    type: 'tablet' as const,
  },
  desktop: {
    name: 'Desktop (1440)',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop' as const,
  },
};

// ---------------------------------------------------------------------------
// Decorator — wraps every story in a div that applies the app's surface
// colours and font so components render against the correct dark background.
//
// Using a Decorator typed from @storybook/react so the return value is
// compatible (React.ReactNode).  We cannot write JSX in a .ts file, so the
// decorator uses React.createElement instead.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require('react') as typeof import('react');

const withZenithTheme: Decorator = (Story) => {
  return React.createElement(
    'div',
    {
      style: {
        background: 'var(--bg)',
        color: 'var(--text-hi)',
        fontFamily: 'var(--font-sans)',
        // Ensure CSS custom properties cascade to all story children even
        // when the story is rendered outside a full page layout
        colorScheme: 'dark',
        padding: '16px',
        minHeight: '1px',
      },
    },
    React.createElement(Story),
  );
};

// ---------------------------------------------------------------------------
// Preview configuration
// ---------------------------------------------------------------------------
const preview: Preview = {
  // Expose mswLoader so MSW handlers declared in story parameters work
  loaders: [mswLoader],

  decorators: [withZenithTheme],

  parameters: {
    // Center every story in the canvas (overridable per-story)
    layout: 'centered',

    // Viewport addon — default to mobile for mobile-first testing
    viewport: {
      viewports: VIEWPORTS,
      defaultViewport: 'mobile',
    },

    // Accessibility — run axe checks on every story.
    // failingRules: 'all' causes the test-runner to fail on any violation.
    a11y: {
      config: {},
      options: {
        checks: {
          'color-contrast': { options: { noScroll: true } },
        },
        restoreScroll: true,
      },
      // Setting manual:false means checks run automatically (not only on
      // explicit test-runner assertions).  Combined with the test-runner's
      // --failOnViolation flag this gives CI gate behaviour.
      manual: false,
    },

    // Auto-detect event handler props for the Actions panel
    actions: { argTypesRegex: '^on[A-Z].*' },

    // Controls — expand nested args, match colour/date pickers automatically
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
      expanded: true,
    },

    // Backgrounds — mirror the app's warm-dark surface scale
    backgrounds: {
      default: 'bg',
      values: [
        { name: 'bg',          value: '#14130f' },
        { name: 'bg-raised',   value: '#1a1812' },
        { name: 'bg-elevated', value: '#221f17' },
        { name: 'bg-overlay',  value: '#2c2820' },
        { name: 'white',       value: '#ffffff' },
      ],
    },

    // Dark docs theme to match the app; @storybook/addon-essentials ships it
    docs: {
      // Use the built-in dark theme provided by Storybook
      // (avoids a hard import of @storybook/theming at preview init time)
      theme: undefined,
    },
  },
};

// Named export required by some Storybook integrations (test-runner, etc.)
export const loaders = [mswLoader];

export default preview;
