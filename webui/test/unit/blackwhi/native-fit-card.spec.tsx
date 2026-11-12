/* Copyright (c) 2026 Contributors to the Eclipse Foundation. SPDX-License-Identifier: EPL-2.0 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../support/test-providers';
import { ExtensionCard } from '../../../src/components/extension-card';
import { FitStoreProduct } from '../../../src/blackwhi/fit/live-catalog';

const fitProduct: FitStoreProduct = {
    contract: 'blackwhi.store.catalog.product.v1',
    productId: 'studio.fit-trainer',
    artifactType: 'fit-package',
    displayName: 'Workout Planner',
    publisherNamespace: 'studio',
    registryRelease: {
        contract: 'blackwhi.fit.registry.catalog.v1',
        packageId: 'studio.fit-trainer',
        version: '1.2.0',
        sha256: 'b'.repeat(64),
        state: 'published',
        publishedAt: '2026-05-01T00:00:00Z'
    }
};

describe('FIT in the original Open VSX ExtensionCard', () => {
    it('uses the native card surface and a typed detail route, never a VSIX route', () => {
        renderWithProviders(<ExtensionCard fitProduct={fitProduct} />);
        const link = screen.getByRole('link', { name: 'Workout Planner' });
        expect(link).toHaveAttribute('href', '/fit-package/studio.fit-trainer');
        expect(screen.getByText('Workout Planner')).toBeInTheDocument();
        expect(screen.getByText('1.2.0')).toBeInTheDocument();
        expect(screen.getByText('studio')).toBeInTheDocument();
        expect(screen.getByText('FIT package')).toBeInTheDocument();
        expect(screen.queryByTestId('StarIcon')).not.toBeInTheDocument();
    });
});
