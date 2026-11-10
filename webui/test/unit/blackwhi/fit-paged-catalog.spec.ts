/* STORE-04.2: paginated FIT contract — no global count or synthetic store data.
 * SPDX-License-Identifier: EPL-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeFitCatalogPage, fetchPagedFitCatalog } from '../../../src/blackwhi/fit/live-catalog';

const product = {
    contract: 'blackwhi.store.catalog.product.v1', productId: 'org.maobits.example',
    artifactType: 'fit-package', displayName: 'Example', publisherNamespace: 'org.maobits',
    registryRelease: { contract: 'blackwhi.fit.registry.catalog.v1', packageId: 'org.maobits.example',
        version: '1.0.0', state: 'published', sha256: 'a'.repeat(64), publishedAt: '2026-11-09T20:00:00Z' }
};
const cursor = 'aGVsbG9fY3Vyc29y';
const page = { contract: 'blackwhi.store.fit.products.page.v1', readOnly: true,
    sourceContract: 'blackwhi.fit.registry.catalog.page.v1', coverage: 'cursor-page',
    limit: 25, returnedCount: 1, hasMore: true, nextCursor: cursor, products: [product] };

describe('STORE-04.2 native FIT paging', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('accepts a bounded next page without declaring a full-catalog count', () => {
        const result = decodeFitCatalogPage(page);
        expect(result.returnedCount).toBe(1);
        expect(result.hasMore).toBe(true);
        expect(result.nextCursor).toBe(cursor);
        expect(result).not.toHaveProperty('totalSize');
    });
    it('rejects pagination metadata inconsistent with the wire contract', () => {
        expect(() => decodeFitCatalogPage({ ...page, hasMore: false })).toThrow();
        expect(() => decodeFitCatalogPage({ ...page, returnedCount: 2 })).toThrow();
        expect(() => decodeFitCatalogPage({ ...page, limit: 51 })).toThrow();
        expect(() => decodeFitCatalogPage({ ...page, readOnly: false })).toThrow();
        expect(() => decodeFitCatalogPage({ ...page, secret: 'private' })).toThrow();
        expect(() => decodeFitCatalogPage({ ...page, products: [{ ...product, registryRelease: {
            ...product.registryRelease, state: 'submitted' } }] })).toThrow();
    });
    it('requests only the proxied Store page and passes an opaque cursor', async () => {
        const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200,
            headers: new Headers({ 'content-type': 'application/json' }), text: async () => JSON.stringify(page) });
        vi.stubGlobal('fetch', fetcher);
        await expect(fetchPagedFitCatalog(cursor)).resolves.toHaveProperty('hasMore', true);
        expect(fetcher).toHaveBeenCalledWith(
            `/api/blackwhi/fit/v1/products/page?limit=25&cursor=${cursor}`,
            expect.objectContaining({ credentials: 'omit', redirect: 'error' }));
        await expect(fetchPagedFitCatalog('../outside')).rejects.toMatchObject({ code: 'STORE_CURSOR_INVALID' });
    });
});
