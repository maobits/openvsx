/* SPDX-License-Identifier: EPL-2.0 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { decodeFitCatalog, fetchLiveFitCatalog, FitCatalogError, FIT_STORE_API } from '../../../src/blackwhi/fit/live-catalog';

const release = {
    contract: 'blackwhi.fit.registry.catalog.v1',
    packageId: 'org.blackwhi.fit.real', version: '1.0.0',
    sha256: 'a'.repeat(64), state: 'published', publishedAt: '2026-11-06T15:00:00Z'
};
const product = {
    contract: 'blackwhi.store.catalog.product.v1', productId: release.packageId,
    artifactType: 'fit-package', displayName: 'Program',
    publisherNamespace: 'org.blackwhi.fit', registryRelease: release
};
const catalog = {
    contract: 'blackwhi.store.fit.products.v1', readOnly: true,
    sourceContract: 'blackwhi.fit.registry.catalog.v1',
    coverage: 'latest-50-releases', returnedCount: 1, products: [product]
};

describe('BlackWhi FIT live catalog transport contract', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('accepts a precisely shaped read-only projection', () => {
        expect(decodeFitCatalog(catalog).products[0].registryRelease.version).toBe('1.0.0');
    });
    it('rejects tampered release integrity, counts and authority', () => {
        expect(() => decodeFitCatalog({ ...catalog, returnedCount: 50 })).toThrow(FitCatalogError);
        expect(() => decodeFitCatalog({ ...catalog, readOnly: false })).toThrow(FitCatalogError);
        expect(() => decodeFitCatalog({ ...catalog, products: [{ ...product,
            registryRelease: { ...release, sha256: 'INVALID' } }] })).toThrow(FitCatalogError);
    });
    it('requests same-origin Store Spring API; never reads directly from the Registry', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        }));
        vi.stubGlobal('fetch', fetcher);
        await expect(fetchLiveFitCatalog()).resolves.toMatchObject({ returnedCount: 1 });
        expect(fetcher).toHaveBeenCalledWith(FIT_STORE_API, expect.objectContaining({
            method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error'
        }));
    });
    it('fails closed if backend is unavailable, misconfigured or returns an HTML error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network')));
        await expect(fetchLiveFitCatalog()).rejects.toMatchObject({ code: 'STORE_API_UNREACHABLE' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>', {
            status: 404, headers: { 'Content-Type': 'text/html' }
        })));
        await expect(fetchLiveFitCatalog()).rejects.toMatchObject({ code: 'STORE_RESPONSE_INVALID' });
    });
    it('preserves an explicit safe backend error status without claiming an empty catalog', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            contract: 'blackwhi.store.fit.error.v1', code: 'FIT_REGISTRY_NOT_CONFIGURED'
        }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
        await expect(fetchLiveFitCatalog()).rejects.toMatchObject({
            code: 'FIT_REGISTRY_NOT_CONFIGURED', status: 503
        });
    });
});
