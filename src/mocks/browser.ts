/**
 * MSW service worker setup for Storybook (browser environment).
 *
 * The worker is started in .storybook/preview.ts via msw-storybook-addon's
 * `initialize()` call. This file just exports the configured worker instance
 * so the addon can start/stop it around stories.
 */
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
