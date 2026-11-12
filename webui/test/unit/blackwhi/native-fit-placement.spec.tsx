/* Copyright (c) 2026 Contributors to the Eclipse Foundation. SPDX-License-Identifier: EPL-2.0 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../support/test-providers';
import { ExtensionList } from '../../../src/components/extension-list';
import { CuratedSections } from '../../../src/pages/home/curated-sections';
import { ExtensionRegistryService } from '../../../src/extension-registry-service';
import { SearchEntry, SearchResult } from '../../../src/extension-registry-types';
import { FitStoreProduct } from '../../../src/blackwhi/fit/live-catalog';

const fit = (id: string, title: string): FitStoreProduct => ({
    contract: 'blackwhi.store.catalog.product.v1',
    productId: id,
    artifactType: 'fit-package',
    displayName: title,
    publisherNamespace: 'studio',
    registryRelease: {
        contract: 'blackwhi.fit.registry.catalog.v1',
        packageId: id,
        version: '1.0.0',
        sha256: 'b'.repeat(64),
        state: 'published',
        publishedAt: '2026-05-01T00:00:00Z'
    }
});
const products = [fit('studio.fit-trainer', 'Workout Planner'), fit('studio.fit-stats', 'Training Analytics')];

vi.mock('../../../src/blackwhi/fit/native-fit-catalog', async importOriginal => {
    const original = await importOriginal<typeof import('../../../src/blackwhi/fit/native-fit-catalog')>();
    return {
        ...original,
        FIT_NATIVE_ENABLED: true,
        useNativeFitCatalog: () => ({
            data: { products, contract: 'blackwhi.store.fit.products.v1' },
            isLoading: false,
            isError: false
        })
    };
});

const extensions: SearchEntry[] = Array.from({ length: 7 }, (_, idx) => ({
    namespace: 'open-vsx',
    name: `ext${idx}`,
    displayName: `Extension ${idx}`,
    version: '1.0.0',
    files: {},
    url: '',
    allVersions: [],
    deprecated: false
}));
const result: SearchResult = { offset: 0, totalSize: extensions.length, extensions };

describe('native FIT placement in the existing Open VSX screens', () => {
    it('uses the original ExtensionList for a FIT-only category without querying VSIX', async () => {
        const search = vi.fn().mockResolvedValue(result);
        const onUpdate = vi.fn();
        renderWithProviders(
            <ExtensionList
                filter={{
                    query: 'workout',
                    category: 'FIT Packages',
                    sortBy: 'relevance',
                    sortOrder: 'desc',
                    size: 30,
                    offset: 0
                }}
                onUpdate={onUpdate}
            />,
            { mainContext: { service: { search } as unknown as ExtensionRegistryService } }
        );
        expect(await screen.findByRole('link', { name: 'Workout Planner' })).toHaveAttribute(
            'href',
            '/fit-package/studio.fit-trainer'
        );
        expect(screen.queryByRole('link', { name: 'Extension 0' })).not.toBeInTheDocument();
        await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(1));
        expect(search).not.toHaveBeenCalled();
    });

    it('shows real FIT products within the existing seven-card Recently updated row', async () => {
        const search = vi.fn().mockResolvedValue(result);
        renderWithProviders(<CuratedSections sections={[{ title: 'Recently updated', sortBy: 'timestamp' }]} />, {
            mainContext: { service: { search } as unknown as ExtensionRegistryService }
        });
        const row = await screen.findByRole('region', { name: 'Recently updated' });
        await waitFor(() => expect(within(row).getAllByRole('link')).toHaveLength(7));
        expect(within(row).getByRole('link', { name: 'Workout Planner' })).toBeInTheDocument();
        expect(within(row).getByRole('link', { name: 'Training Analytics' })).toBeInTheDocument();
        expect(within(row).getByRole('link', { name: 'Extension 4' })).toBeInTheDocument();
        expect(within(row).queryByRole('link', { name: 'Extension 6' })).not.toBeInTheDocument();
        expect(search).toHaveBeenCalledOnce();
    });
});
