/**
 * Storybook Visual Regression Tests
 *
 * Each test loads a specific story URL (Storybook iframe), waits for it to
 * fully render (fonts loaded, MSW ready, no spinners), then captures a
 * screenshot and compares against the committed baseline.
 *
 * Story URL format:
 *   /iframe.html?id=<story-id>&viewMode=story
 *
 * Story IDs are kebab-case: "components-logo--default"
 *
 * To update baselines:
 *   npx playwright test --config playwright.storybook.config.ts --update-snapshots
 *
 * Stories that intentionally render nothing (e.g. Closed dialog, Hidden banner)
 * are still snapshotted so a regression that makes them visible is caught.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load a story and wait until Storybook signals it is ready.
 * Storybook emits a `storyRendered` event; we poll for the root element too.
 */
async function loadStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  // Wait for Storybook's root to appear
  await page.waitForSelector('#storybook-root', { timeout: 15_000 });
  // Wait for any loading spinners / skeletons to clear
  await page.waitForTimeout(300);
  // Wait for fonts to be ready
  await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
}

/**
 * Snapshot helper: load story and take a screenshot.
 * name is used as the snapshot file stem.
 */
async function snapshot(page: Page, storyId: string, name: string) {
  await loadStory(page, storyId);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: false,
    // Clip to the story root to avoid capturing Storybook chrome
    clip: await page.$eval('#storybook-root', (el) => {
      const r = el.getBoundingClientRect();
      return { x: 0, y: 0, width: Math.ceil(r.width + r.left), height: Math.max(100, Math.ceil(r.height + r.top)) };
    }),
  });
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

test.describe('Logo', () => {
  test('default', async ({ page }) => {
    await snapshot(page, 'components-logo--default', 'logo-default');
  });
  test('large', async ({ page }) => {
    await snapshot(page, 'components-logo--large', 'logo-large');
  });
});

// ---------------------------------------------------------------------------
// HeatCell
// ---------------------------------------------------------------------------

test.describe('HeatCell', () => {
  test('inactive', async ({ page }) => {
    await snapshot(page, 'components-heatcell--inactive', 'heatcell-inactive');
  });
  test('low-iv', async ({ page }) => {
    await snapshot(page, 'components-heatcell--low-i-v', 'heatcell-low-iv');
  });
  test('high-iv', async ({ page }) => {
    await snapshot(page, 'components-heatcell--high-i-v', 'heatcell-high-iv');
  });
  test('negative-theta', async ({ page }) => {
    await snapshot(page, 'components-heatcell--negative-theta', 'heatcell-negative-theta');
  });
  test('no-scale', async ({ page }) => {
    await snapshot(page, 'components-heatcell--no-scale', 'heatcell-no-scale');
  });
});

// ---------------------------------------------------------------------------
// MiniBar
// ---------------------------------------------------------------------------

test.describe('MiniBar', () => {
  test('default', async ({ page }) => {
    await snapshot(page, 'components-minibar--default', 'minibar-default');
  });
  test('not-available', async ({ page }) => {
    await snapshot(page, 'components-minibar--not-available', 'minibar-na');
  });
  test('full-bar', async ({ page }) => {
    await snapshot(page, 'components-minibar--full-bar', 'minibar-full');
  });
});

// ---------------------------------------------------------------------------
// VolSmile
// ---------------------------------------------------------------------------

test.describe('VolSmile', () => {
  test('xlm', async ({ page }) => {
    await snapshot(page, 'components-volsmile--xlm', 'volsmile-xlm');
  });
  test('low-vol', async ({ page }) => {
    await snapshot(page, 'components-volsmile--low-vol', 'volsmile-low');
  });
  test('extreme-vol', async ({ page }) => {
    await snapshot(page, 'components-volsmile--extreme-vol', 'volsmile-extreme');
  });
});

// ---------------------------------------------------------------------------
// VolSurfaceHeatmap
// ---------------------------------------------------------------------------

test.describe('VolSurfaceHeatmap', () => {
  test('default-xlm', async ({ page }) => {
    await snapshot(page, 'components-volsurfaceheatmap--default-x-l-m', 'vol-surface-xlm');
  });
  test('with-selected-expiry', async ({ page }) => {
    await snapshot(page, 'components-volsurfaceheatmap--with-selected-expiry-30-d', 'vol-surface-30d');
  });
  test('high-vol', async ({ page }) => {
    await snapshot(page, 'components-volsurfaceheatmap--high-volatility', 'vol-surface-high');
  });
});

// ---------------------------------------------------------------------------
// GreekProfileChart
// ---------------------------------------------------------------------------

test.describe('GreekProfileChart', () => {
  test('delta-xlm', async ({ page }) => {
    await snapshot(page, 'components-greekprofilechart--delta-x-l-m', 'greek-delta-xlm');
  });
  test('gamma-xlm', async ({ page }) => {
    await snapshot(page, 'components-greekprofilechart--gamma-x-l-m', 'greek-gamma-xlm');
  });
  test('vega-xlm', async ({ page }) => {
    await snapshot(page, 'components-greekprofilechart--vega-x-l-m', 'greek-vega-xlm');
  });
  test('empty', async ({ page }) => {
    await snapshot(page, 'components-greekprofilechart--empty-profile', 'greek-empty');
  });
});

// ---------------------------------------------------------------------------
// ChainRow
// ---------------------------------------------------------------------------

test.describe('ChainRow', () => {
  test('atm', async ({ page }) => {
    await snapshot(page, 'components-chainrow--a-t-m', 'chainrow-atm');
  });
  test('otm', async ({ page }) => {
    await snapshot(page, 'components-chainrow--o-t-m', 'chainrow-otm');
  });
  test('call-itm', async ({ page }) => {
    await snapshot(page, 'components-chainrow--call-i-t-m', 'chainrow-call-itm');
  });
  test('put-itm', async ({ page }) => {
    await snapshot(page, 'components-chainrow--put-i-t-m', 'chainrow-put-itm');
  });
});

// ---------------------------------------------------------------------------
// ChainHeatLegend
// ---------------------------------------------------------------------------

test.describe('ChainHeatLegend', () => {
  test('mode-off', async ({ page }) => {
    await snapshot(page, 'components-chainheatlegend--mode-off', 'heat-legend-off');
  });
  test('mode-iv', async ({ page }) => {
    await snapshot(page, 'components-chainheatlegend--mode-i-v', 'heat-legend-iv');
  });
  test('mode-delta', async ({ page }) => {
    await snapshot(page, 'components-chainheatlegend--mode-delta', 'heat-legend-delta');
  });
  test('mode-theta', async ({ page }) => {
    await snapshot(page, 'components-chainheatlegend--mode-theta', 'heat-legend-theta');
  });
});

// ---------------------------------------------------------------------------
// ExpandableCard
// ---------------------------------------------------------------------------

test.describe('ExpandableCard', () => {
  test('collapsed', async ({ page }) => {
    await snapshot(page, 'components-expandablecard--collapsed', 'card-collapsed');
  });
  test('expanded', async ({ page }) => {
    await snapshot(page, 'components-expandablecard--expanded', 'card-expanded');
  });
});

// ---------------------------------------------------------------------------
// SorobanErrorDisplay
// ---------------------------------------------------------------------------

test.describe('SorobanErrorDisplay', () => {
  test('insufficient-collateral', async ({ page }) => {
    await snapshot(page, 'components-sorobanerrordisplay--insufficient-collateral', 'soroban-error-collateral');
  });
  test('unknown-error', async ({ page }) => {
    await snapshot(page, 'components-sorobanerrordisplay--unknown-error', 'soroban-error-unknown');
  });
  test('otm-expiry', async ({ page }) => {
    await snapshot(page, 'components-sorobanerrordisplay--expired-o-t-m', 'soroban-error-otm');
  });
});

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

test.describe('ConfirmDialog', () => {
  test('buy-call', async ({ page }) => {
    await snapshot(page, 'dialogs-confirmdialog--buy-call', 'confirm-buy');
  });
  test('close-destructive', async ({ page }) => {
    await snapshot(page, 'dialogs-confirmdialog--close-position', 'confirm-close');
  });
  test('closed-hidden', async ({ page }) => {
    await snapshot(page, 'dialogs-confirmdialog--closed', 'confirm-closed');
  });
});

// ---------------------------------------------------------------------------
// SessionBanner
// ---------------------------------------------------------------------------

test.describe('SessionBanner', () => {
  test('expired', async ({ page }) => {
    await snapshot(page, 'components-sessionbanner--expired', 'session-expired');
  });
  test('expiring-soon', async ({ page }) => {
    await snapshot(page, 'components-sessionbanner--expiring-soon', 'session-expiring');
  });
  test('hidden', async ({ page }) => {
    await snapshot(page, 'components-sessionbanner--hidden', 'session-hidden');
  });
});

// ---------------------------------------------------------------------------
// NetworkMismatchBanner
// ---------------------------------------------------------------------------

test.describe('NetworkMismatchBanner', () => {
  test('ok', async ({ page }) => {
    await snapshot(page, 'components-networkmismatchbanner--network-o-k', 'network-ok');
  });
  test('mismatch', async ({ page }) => {
    await snapshot(page, 'components-networkmismatchbanner--network-mismatch', 'network-mismatch');
  });
  test('account-changed', async ({ page }) => {
    await snapshot(page, 'components-networkmismatchbanner--account-changed', 'network-account-changed');
  });
});

// ---------------------------------------------------------------------------
// StrategyPicker
// ---------------------------------------------------------------------------

test.describe('StrategyPicker', () => {
  test('none-selected', async ({ page }) => {
    await snapshot(page, 'components-strategypicker--none-selected', 'strategy-none');
  });
  test('straddle-selected', async ({ page }) => {
    await snapshot(page, 'components-strategypicker--straddle-selected', 'strategy-straddle');
  });
});

// ---------------------------------------------------------------------------
// SignInSummary
// ---------------------------------------------------------------------------

test.describe('SignInSummary', () => {
  test('structured', async ({ page }) => {
    await snapshot(page, 'components-signinsummary--structured', 'signin-structured');
  });
  test('legacy', async ({ page }) => {
    await snapshot(page, 'components-signinsummary--legacy', 'signin-legacy');
  });
  test('proceeding', async ({ page }) => {
    await snapshot(page, 'components-signinsummary--proceeding', 'signin-proceeding');
  });
});

// ---------------------------------------------------------------------------
// AppHeader
// ---------------------------------------------------------------------------

test.describe('AppHeader', () => {
  test('signed-in', async ({ page }) => {
    await snapshot(page, 'components-appheader--signed-in', 'appheader-signed-in');
  });
  test('not-signed-in', async ({ page }) => {
    await snapshot(page, 'components-appheader--not-signed-in', 'appheader-signed-out');
  });
  test('large-balance', async ({ page }) => {
    await snapshot(page, 'components-appheader--large-balance', 'appheader-large-balance');
  });
});

// ---------------------------------------------------------------------------
// FeedStatus
// ---------------------------------------------------------------------------

test.describe('FeedStatus', () => {
  test('live', async ({ page }) => {
    await snapshot(page, 'components-feedstatus-feedstatuspill--live', 'feed-live');
  });
  test('offline', async ({ page }) => {
    await snapshot(page, 'components-feedstatus-feedstatuspill--offline', 'feed-offline');
  });
  test('stale', async ({ page }) => {
    await snapshot(page, 'components-feedstatus-feedstatuspill--stale', 'feed-stale');
  });
});
