/* BlackWhi Store - isolated FIT tests for the native Open VSX integration.
 * SPDX-License-Identifier: EPL-2.0
 */
import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./test/unit/blackwhi/setup.ts']
    }
});
