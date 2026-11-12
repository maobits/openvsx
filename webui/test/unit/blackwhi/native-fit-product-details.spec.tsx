/* Copyright (c) 2026 Contributors to the Eclipse Foundation. SPDX-License-Identifier: EPL-2.0 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '../support/test-providers';
import { FitPackageDetail } from '../../../src/pages/extension-detail/fit-package-detail';
import {
    fetchFitProductDetail,
    type FitProfile,
    type FitProductDetail
} from '../../../src/blackwhi/fit/product-detail';

const id = 'org.maobits.my-first-training-app';
const sha = 'a'.repeat(64);
const releases = ['1.0.0', '0.9.0'].map((version, i) => ({
    contract: 'blackwhi.store.catalog.product.v1',
    productId: id,
    artifactType: 'fit-package',
    publisherNamespace: 'org.maobits',
    displayName: 'my first training app',
    registryRelease: {
        contract: 'blackwhi.fit.registry.catalog.v1',
        packageId: id,
        version,
        sha256: sha,
        state: 'published',
        publishedAt: `2026-11-0${8 - i}T12:00:00Z`
    }
}));

vi.mock('../../../src/blackwhi/fit/native-fit-catalog', async importOriginal => ({
    ...(await importOriginal<typeof import('../../../src/blackwhi/fit/native-fit-catalog')>()),
    FIT_NATIVE_ENABLED: true,
    useNativeFitCatalog: () => ({ data: { products: releases }, isLoading: false, isError: false })
}));
vi.mock('../../../src/blackwhi/fit/product-detail', async importOriginal => ({
    ...(await importOriginal<typeof import('../../../src/blackwhi/fit/product-detail')>()),
    fetchFitProductDetail: vi.fn(),
    fetchFitTextResource: vi.fn().mockResolvedValue('# Verified README')
}));
const fetchMock = vi.mocked(fetchFitProductDetail);

const profile: FitProfile = {
    contract: 'blackwhi.fit.product.profile.v1',
    release: { packageId: id, version: '1.0.0', artifactSha256: sha },
    identity: {
        displayName: 'First training FIT',
        publisherName: 'Maobits',
        publisherNamespace: 'org.maobits',
        productType: 'application'
    },
    overview: {
        summary: 'Verified training summary',
        description: 'A real FIT learning application.',
        features: ['Exercises with FIT']
    },
    categories: { primary: 'education', subcategory: null, secondary: [], taxonomyContract: 'fit-taxonomy.v1' },
    tags: ['learning'],
    packageSize: {
        downloadBytes: 2048,
        unpackedBytes: 4096,
        entryCount: 3,
        documentationBytes: 512,
        mediaBytes: 128,
        contentFootprintBytes: 4224
    },
    documentation: {
        readme: { path: 'docs/README.md', sha256: sha, bytes: 17 },
        quickStart: { path: 'docs/QUICKSTART.md', sha256: sha, bytes: 17 },
        changelog: { path: 'docs/CHANGELOG.md', sha256: sha, bytes: 17 },
        licenseText: { path: 'docs/LICENSE.txt', sha256: sha, bytes: 17 }
    },
    apiReference: { functions: [], notApplicableReason: 'No public API' },
    examples: [],
    dependencies: [],
    compatibility: {
        engine: { id: 'blackwhi-fit', starlarkVersion: 'v1', protocol: 1, registryVersion: '1' },
        platforms: ['linux']
    },
    security: { authority: 'blackwhi-registry', declaredCapabilities: [], requestedPermissions: [] },
    versions: { releaseNotes: { path: 'docs/CHANGELOG.md', sha256: sha, bytes: 17 } },
    distribution: { channel: 'blackwhi-registry', filename: 'training.fitpkg' },
    media: {
        icon: { path: 'assets/icon.png', sha256: sha, bytes: 128 },
        cover: null,
        screenshots: [],
        diagrams: [],
        videos: []
    },
    links: [],
    community: { contributions: 'closed', reviewsManagedByStore: false },
    support: { model: 'community', contactLinks: [] },
    business: {
        model: 'freeware',
        distribution: 'free',
        licenseExpression: 'MIT',
        licenseDocument: { path: 'docs/LICENSE.txt', sha256: sha, bytes: 17 },
        externalServices: []
    }
};

function renderPage(route: string) {
    return renderWithProviders(
        <Routes>
            <Route path='/fit-package/:packageId' element={<FitPackageDetail />} />
            <Route path='/fit-package/:packageId/versions/:version' element={<FitPackageDetail />} />
        </Routes>,
        { route }
    );
}

afterEach(() => {
    fetchMock.mockReset();
});

describe('STORE-02 professional profile in the native Open VSX detail route', () => {
    it('uses Registry facts and does not fabricate missing profile metadata', async () => {
        fetchMock.mockResolvedValue({
            contract: 'blackwhi.store.fit.product.detail.v1',
            readOnly: true,
            coverage: 'latest-50-releases',
            product: releases[0],
            profileStatus: 'not-provided',
            profile: {}
        } as unknown as FitProductDetail);
        renderPage(`/fit-package/${id}`);
        expect(await screen.findByText(/its professional FIT-01 profile has not been/i)).toBeInTheDocument();
        expect(screen.getByText(sha)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Browse packages/ })).toHaveAttribute(
            'href',
            '/search?category=FIT%20Packages'
        );
        expect(screen.queryByRole('heading', { name: /Business model/i })).not.toBeInTheDocument();
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(id, '1.0.0', expect.anything()));
    });
    it('resolves an old exact version outside the initially loaded catalog page', async () => {
        const historical = { ...releases[0], registryRelease: { ...releases[0].registryRelease,
            version: '0.8.0', publishedAt: '2025-01-01T12:00:00Z' } };
        fetchMock.mockResolvedValue({
            contract: 'blackwhi.store.fit.product.detail.v2', readOnly: true,
            coverage: 'exact-release', product: historical, profileStatus: 'not-provided', profile: {}
        } as unknown as FitProductDetail);
        renderPage(`/fit-package/${id}/versions/0.8.0`);
        expect(await screen.findByText(/its professional FIT-01 profile has not been/i)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText('0.8.0 (exact version)')).toBeInTheDocument());
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(id, '0.8.0', expect.anything()));
    });
    it('renders the professional FIT sections inside the native route, with the exact version', async () => {
        fetchMock.mockResolvedValue({
            contract: 'blackwhi.store.fit.product.detail.v1',
            readOnly: true,
            coverage: 'latest-50-releases',
            product: releases[0],
            profileStatus: 'complete',
            profile
        } as unknown as FitProductDetail);
        renderPage(`/fit-package/${id}/versions/1.0.0`);
        expect(await screen.findByRole('heading', { name: 'Business model & licensing' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Documentation' })).toBeInTheDocument();
        expect(screen.getByText('First training FIT')).toBeInTheDocument();
        expect(screen.getByText('MIT')).toBeInTheDocument();
        expect(screen.queryByText('Open VSX Registry')).not.toBeInTheDocument();
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(id, '1.0.0', expect.anything()));
    });
});
