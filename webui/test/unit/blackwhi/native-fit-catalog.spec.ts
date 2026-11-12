/* BlackWhi Store native search projection tests. SPDX-License-Identifier: EPL-2.0 */
import { describe, expect, it } from 'vitest';
import { filterNativeFitProducts, FIT_CATEGORY } from '../../../src/blackwhi/fit/native-fit-catalog';
import { FitStoreProduct } from '../../../src/blackwhi/fit/live-catalog';

const release = (productId: string, version: string, date: string, name: string): FitStoreProduct => ({
    contract: 'blackwhi.store.catalog.product.v1',
    productId,
    artifactType: 'fit-package',
    displayName: name,
    publisherNamespace: 'studio',
    registryRelease: {
        contract: 'blackwhi.fit.registry.catalog.v1',
        packageId: productId,
        version,
        sha256: 'a'.repeat(64),
        state: 'published',
        publishedAt: date
    }
});

const products = [
    release('studio.fit-trainer', '1.0.0', '2026-01-01T00:00:00Z', 'Workout Planner'),
    release('studio.fit-trainer', '1.1.0', '2026-05-01T00:00:00Z', 'Workout Planner'),
    release('studio.fit-stats', '2.0.0', '2026-02-01T00:00:00Z', 'Training Analytics')
];

describe('native FIT catalog projection into original Open VSX', () => {
    it('shows one card per product, selecting its latest release', () => {
        const found = filterNativeFitProducts(products, '', '', 'timestamp', 'desc');
        expect(found).toHaveLength(2);
        expect(found[0].registryRelease.version).toBe('1.1.0');
    });
    it('uses the native search query on ID, title and publisher', () => {
        expect(filterNativeFitProducts(products, 'analytics', '', 'relevance', 'desc').map(p => p.productId)).toEqual([
            'studio.fit-stats'
        ]);
        expect(filterNativeFitProducts(products, 'studio.fit-trainer', '', 'relevance', 'desc')).toHaveLength(1);
    });
    it('keeps the FIT category distinct from VSIX categories', () => {
        expect(filterNativeFitProducts(products, '', FIT_CATEGORY, 'relevance', 'desc')).toHaveLength(2);
        expect(filterNativeFitProducts(products, '', 'Linters', 'relevance', 'desc')).toHaveLength(0);
    });
    it('does not manufacture rating/download rankings for FIT', () => {
        expect(filterNativeFitProducts(products, '', '', 'rating', 'desc')).toEqual([]);
        expect(filterNativeFitProducts(products, '', '', 'downloadCount', 'desc')).toEqual([]);
    });
    it('supports chronological ordering without mutating the contract data', () => {
        const found = filterNativeFitProducts(products, '', '', 'timestamp', 'asc');
        expect(found.map(p => p.productId)).toEqual(['studio.fit-stats', 'studio.fit-trainer']);
        expect(products[0].registryRelease.version).toBe('1.0.0');
    });
});
