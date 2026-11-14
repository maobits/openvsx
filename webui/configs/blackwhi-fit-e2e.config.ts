/* SPDX-License-Identifier: EPL-2.0
 * BlackWhi Store staging-only native FIT browser acceptance.
 * This config NEVER targets open-vsx.org or starts/mutates a server.
 */
import { defineConfig, devices } from '@playwright/test';
import { homedir } from 'node:os';
import path from 'node:path';

const reportRoot = path.join(homedir(), '.local', 'state', 'blackwhi-store', 'deploy-03', 'browser-e2e');
const BASE = 'http://127.0.0.1:43180';

export default defineConfig({
    testDir: '../test/e2e/blackwhi',
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    timeout: 45_000,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(reportRoot, 'html-report') }]],
    outputDir: path.join(reportRoot, 'test-results'),
    use: {
        baseURL: BASE,
        acceptDownloads: true,
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off'
    },
    projects: [
        { name: 'chrome-desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
        {
            name: 'chrome-mobile',
            use: {
                browserName: 'chromium',
                channel: 'chrome',
                viewport: { width: 390, height: 844 },
                isMobile: true,
                hasTouch: true,
                deviceScaleFactor: 1
            }
        },
        {
            name: 'chrome-tablet',
            use: {
                browserName: 'chromium',
                channel: 'chrome',
                viewport: { width: 820, height: 1180 },
                isMobile: true,
                hasTouch: true,
                deviceScaleFactor: 1
            }
        }
    ]
});
