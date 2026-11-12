/* BlackWhi Store - isolated FIT tests for the native Open VSX integration.
 * SPDX-License-Identifier: EPL-2.0
 */
import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        include: ['test/unit/blackwhi/**/*.spec.{ts,tsx}'],
        environment: 'jsdom',
        // Preserve the native test teardown: React cleanup and singleton cache reset.
        setupFiles: ['./test/setup.ts', './test/unit/blackwhi/setup.ts']
    }
});
