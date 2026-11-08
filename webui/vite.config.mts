/// <reference types="vitest/config" />
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, PluginOption } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

const outRootDir = path.join(import.meta.dirname, 'dist');

// Same-origin DEV proxy for the *original* Open VSX browser API and the FIT projection.
// It is configured ONLY with an explicit loopback Spring origin; FIT remains opt-in.
// Proxy /user and /admin as API routes, but never /user-settings or /admin-dashboard
// (those are React pages that must remain served by Vite).
const liveFitEnabled = process.env.VITE_BLACKWHI_STORE_FIT_LIVE === '1';
const springOrigin = process.env.BLACKWHI_STORE_SPRING_ORIGIN ?? '';
const proxyEnabled = springOrigin.length > 0;
if ((liveFitEnabled && !proxyEnabled) || (proxyEnabled &&
    (!/^http:\/\/127\.0\.0\.1:(?:[1-9][0-9]{1,4})$/.test(springOrigin) ||
        Number(springOrigin.split(':').at(-1)) > 65535))) {
    throw new Error('BLACKWHI_STORE_SPRING_ORIGIN must be an explicit loopback HTTP origin with a port');
}
const springProxy = {
    target: springOrigin,
    changeOrigin: false,
    secure: true
};

export default defineConfig(() => ({
    plugins: [react(), visualizer() as PluginOption],
    server: {
        host: true,
        port: 3000,
        ...(proxyEnabled ? {
            proxy: {
                // API requests stay on the original web origin, including FIT.
                '/api/': springProxy,
                // Spring's original account endpoint; avoid capturing SPA /user-settings.
                '^/user(?:/|\\?|$)': springProxy,
                // Original identity and administration endpoints.
                '^/login-providers(?:/|\\?|$)': springProxy,
                '^/login(?:/|\\?|$)': springProxy,
                '^/logout(?:/|\\?|$)': springProxy,
                '^/admin(?:/|\\?|$)': springProxy
            }
        } : {})
    },
    preview: {
        port: 3000
    },
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src')
        }
    },
    publicDir: 'static',
    test: {
        include: ['test/unit/**/*.spec.{ts,tsx}'],
        environment: 'jsdom',
        setupFiles: ['./test/setup.ts'],
        // Give userEvent/waitFor-heavy tests more room than the 5s default on a loaded machine.
        testTimeout: 15000,
        // Spawning a fork per CPU all at once (each booting jsdom + React) can itself blow past
        // vitest's own worker-startup timeout under load; capping concurrency avoids that pileup.
        maxWorkers: '50%',
        server: {
            deps: {
                // their ESM builds import directory paths Node's resolver rejects; let vite bundle them
                inline: ['@mui/x-charts', '@mui/x-data-grid', '@mui/x-date-pickers']
            }
        }
    },
    // lightningcss (Vite 8's default CSS transformer) ships no prebuilt binary for ppc64le,
    // and its minifier isn't needed once postcss is handling transforms - see
    // https://github.com/eclipse-openvsx/openvsx/issues/2051
    css: {
        transformer: 'postcss' as const
    },
    build: {
        target: 'es2020',
        minify: true,
        cssMinify: false,
        sourcemap: true,
        outDir: outRootDir,
        emptyOutDir: true,
        chunkSizeWarningLimit: 800,
        rollupOptions: {
            output: {
                entryFileNames: 'bundle-[hash].js',
                assetFileNames: '[name]-[hash][extname]',
                chunkFileNames: 'chunk-[name]-[hash].js'
            }
        }
    }
}));
