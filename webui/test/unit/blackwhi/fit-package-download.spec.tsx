/* BlackWhi Store native published FIT download tests. SPDX-License-Identifier: EPL-2.0 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '../support/test-providers';
import { FitPackageDetail } from '../../../src/pages/extension-detail/fit-package-detail';
import { fetchFitProductDetail, type FitProductDetail } from '../../../src/blackwhi/fit/product-detail';

const id = 'com.blackwhi.std.validation.core';
const version = '0.1.0';
const product = {
    contract: 'blackwhi.store.catalog.product.v1',
    productId: id,
    artifactType: 'fit-package',
    publisherNamespace: 'com.blackwhi.std.validation',
    displayName: 'Validation Core',
    registryRelease: {
        contract: 'blackwhi.fit.registry.catalog.v1',
        packageId: id,
        version,
        sha256: 'a'.repeat(64),
        state: 'published',
        publishedAt: '2026-11-12T01:52:22.870Z'
    }
};

vi.mock('../../../src/blackwhi/fit/native-fit-catalog', async importOriginal => ({
    ...(await importOriginal<typeof import('../../../src/blackwhi/fit/native-fit-catalog')>()),
    FIT_NATIVE_ENABLED: true,
    useNativeFitCatalog: () => ({ data: { products: [product] }, isLoading: false, isError: false })
}));
vi.mock('../../../src/blackwhi/fit/product-detail', async importOriginal => ({
    ...(await importOriginal<typeof import('../../../src/blackwhi/fit/product-detail')>()),
    fetchFitProductDetail: vi.fn()
}));
const mock = vi.mocked(fetchFitProductDetail);
const route = `/fit-package/${id}/versions/${version}`;
function show() {
    return renderWithProviders(
        <Routes>
            <Route path='/fit-package/:packageId/versions/:version' element={<FitPackageDetail />} />
        </Routes>,
        { route }
    );
}
afterEach(() => mock.mockReset());

describe('Published FIT archive download in native Store', () => {
    it('allows obtaining published artifact despite pending editorial profile', async () => {
        mock.mockResolvedValue({
            contract: 'blackwhi.store.fit.product.detail.v2',
            readOnly: true,
            coverage: 'exact-release',
            product,
            profileStatus: 'not-provided',
            profile: {}
        } as FitProductDetail);
        show();
        const download = await screen.findByRole('link', { name: `Download ${id} version ${version} FIT package` });
        expect(download).toHaveAttribute('href', `/api/blackwhi/fit/v2/products/${id}/versions/${version}/download`);
        expect(screen.getByText(/its professional FIT-01 profile has not been supplied/i)).toBeInTheDocument();
    });
    it('does not offer download when exact Registry SHA does not match catalog release', async () => {
        mock.mockResolvedValue({
            contract: 'blackwhi.store.fit.product.detail.v2',
            readOnly: true,
            coverage: 'exact-release',
            product: {
                ...product,
                registryRelease: { ...product.registryRelease, sha256: 'b'.repeat(64) }
            },
            profileStatus: 'not-provided',
            profile: {}
        } as FitProductDetail);
        show();
        await screen.findByText(/Store and Registry release SHA-256 values do not match/i);
        expect(screen.queryByRole('link', { name: /Download .* FIT package/i })).not.toBeInTheDocument();
    });
});
