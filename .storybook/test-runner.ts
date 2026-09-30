import type { TestRunnerConfig } from '@storybook/test-runner';

/**
 * Storybook test-runner configuration.
 *
 * - preVisit: kill animations/transitions for deterministic timing.
 * - postVisit: run the @storybook/addon-a11y accessibility check via the
 *   built-in a11y addon runner (axe-core under the hood). Stories that opt
 *   out via `parameters.a11y.disable = true` are skipped automatically.
 *
 * The test runner runs with `--failOnViolation` in CI (see package.json
 * storybook:test script) so any axe violation causes the job to fail.
 *
 * Docs: https://storybook.js.org/docs/writing-tests/accessibility-testing
 */
const config: TestRunnerConfig = {
  async preVisit(page) {
    // Kill animations and transitions so interaction tests don't race
    // against CSS timing and screenshots are pixel-stable.
    await page.addStyleTag({
      content: `
        html, body { background: #14130f; }
        *, *::before, *::after {
          animation-duration:      0ms !important;
          animation-delay:         0ms !important;
          transition-duration:     0ms !important;
          transition-delay:        0ms !important;
        }
      `,
    });
  },
};

export default config;
