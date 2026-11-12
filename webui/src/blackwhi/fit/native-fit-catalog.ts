/* BlackWhi Store - native FIT integration into the original Open VSX UI.
 * SPDX-License-Identifier: EPL-2.0
 * Read-only, explicit type distinction. No VSIX impersonation or synthetic downloads.
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { FitStoreProduct, fetchPagedFitCatalog } from './live-catalog';
import { SortBy, SortOrder } from '../../extension-registry-types';

export const FIT_CATEGORY = 'FIT Packages' as const;
export const FIT_NATIVE_ENABLED = import.meta.env.DEV && import.meta.env.VITE_BLACKWHI_STORE_FIT_LIVE === '1';

export function useNativeFitCatalog() {
    const query = useInfiniteQuery({
        queryKey: ['blackwhi', 'fit', 'native-public-catalog-page-v1'],
        initialPageParam: null as string | null,
        queryFn: ({ pageParam, signal }) => fetchPagedFitCatalog(pageParam, signal),
        getNextPageParam: (last, pages) =>
            last.hasMore && last.nextCursor && !pages.slice(0, -1).some(page => page.nextCursor === last.nextCursor)
                ? last.nextCursor
                : undefined,
        enabled: FIT_NATIVE_ENABLED,
        retry: false,
        staleTime: 30_000
    });
    // One native catalog, incrementally backed by the public Registry. No fabricated global count.
    return {
        ...query,
        data: query.data
            ? {
                  products: query.data.pages.flatMap(page => page.products),
                  loadedReleases: query.data.pages.reduce((total, page) => total + page.returnedCount, 0)
              }
            : undefined
    };
}

/**
 * Search and sorting currently operate only on fetched cursor pages; this is
 * NOT full-catalog server-side search. Results are explicitly marked as partial.
 * Ratings/download counts are unavailable and must never be invented.
 */
export function filterNativeFitProducts(
    products: readonly FitStoreProduct[],
    query: string,
    category: string,
    sortBy: SortBy,
    sortOrder: SortOrder
): FitStoreProduct[] {
    if (category !== '' && category !== FIT_CATEGORY) return [];
    if (sortBy === 'rating' || sortBy === 'downloadCount') return [];
    const term = query.trim().toLocaleLowerCase();
    const unique = new Map<string, FitStoreProduct>();
    // Multiple versions are catalog releases; a product card must appear once.
    for (const product of products) {
        const previous = unique.get(product.productId);
        if (
            !previous ||
            Date.parse(product.registryRelease.publishedAt) > Date.parse(previous.registryRelease.publishedAt)
        ) {
            unique.set(product.productId, product);
        }
    }
    const filtered = [...unique.values()].filter(
        product =>
            !term ||
            `${product.displayName} ${product.productId} ${product.publisherNamespace}`
                .toLocaleLowerCase()
                .includes(term)
    );
    if (sortBy === 'timestamp') {
        filtered.sort((a, b) => Date.parse(a.registryRelease.publishedAt) - Date.parse(b.registryRelease.publishedAt));
        if (sortOrder === 'desc') filtered.reverse();
    } else {
        // Relevance across two registries is not comparable yet. FIT items retain
        // upstream order rather than claiming a calculated cross-type score.
        if (sortOrder === 'asc') filtered.reverse();
    }
    return filtered;
}
