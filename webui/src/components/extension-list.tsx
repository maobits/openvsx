/********************************************************************************
 * Copyright (c) 2019 TypeFox and others
 * Copyright (c) 2026 Contributors to the Eclipse Foundation
 *
 * See the NOTICE file(s) distributed with this work for additional
 * information regarding copyright ownership.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * https://www.eclipse.org/legal/epl-2.0
 *
 * SPDX-License-Identifier: EPL-2.0
 ********************************************************************************/

import { FunctionComponent, useEffect, useMemo, useRef } from 'react';
import { ExtensionGrid } from './page-primitives';
import { ExtensionCard } from './extension-card';
import { ExtensionListLoadError } from './extension-list-load-error';
import { ExtensionFilter } from '../extension-registry-service';
import { useExtensionResultsCursor } from '../hooks/use-extension-results-cursor';
import { useInfiniteSearch } from '../hooks/use-infinite-search';
import { useInView } from '../hooks/use-in-view';
import { FIT_CATEGORY, FIT_NATIVE_ENABLED, filterNativeFitProducts, useNativeFitCatalog } from '../blackwhi/fit/native-fit-catalog';
import { Box, Button, Typography } from '@mui/material';

export const ExtensionList: FunctionComponent<ExtensionListProps> = ({ filter, onUpdate }) => {
    const {
        data,
        isError,
        isLoading,
        isFetching,
        isFetchingNextPage,
        isFetchNextPageError,
        hasNextPage,
        fetchNextPage,
        refetch
    } = useInfiniteSearch(filter);
    const native = useNativeFitCatalog();
    const fitOnly = FIT_NATIVE_ENABLED && filter.category === FIT_CATEGORY;
    const fitProducts = FIT_NATIVE_ENABLED ? filterNativeFitProducts(
        native.data?.products ?? [], filter.query, filter.category, filter.sortBy, filter.sortOrder
    ) : [];
    const sentinelRef = useRef<HTMLDivElement>(null);
    const nearEnd = useInView(sentinelRef, { once: false, rootMargin: '200px', enabled: hasNextPage });

    const extensions = useMemo(() => data?.pages.flatMap(page => page.extensions) ?? [], [data]);
    const totalSize = data?.pages[0]?.totalSize ?? 0;
    const grid = useExtensionResultsCursor(extensions.length + fitProducts.length);

    // Report the result count to the parent (shown in the search header).
    useEffect(() => {
        onUpdate((fitOnly ? 0 : totalSize) + fitProducts.length);
    }, [totalSize, fitProducts.length, fitOnly, onUpdate]);

    // Fresh filter: put the cursor back on the first card so Enter opens it.
    useEffect(() => {
        grid.reset();
    }, [filter.query, filter.category, filter.sortBy, filter.sortOrder, grid.reset]);

    const pageSize = filter.size;
    const loading = (!fitOnly && (isLoading || isFetchingNextPage)) ||
        (FIT_NATIVE_ENABLED && native.isLoading && !data);
    // Load failures show inline rather than in the error dialog; a failed refetch keeps its results.
    const firstPageFailed = !fitOnly && isError && !data && !isFetching;
    const nextPageFailed = isFetchNextPageError && !isFetching;

    // Cards already in the query cache when this list mounts (e.g. returning via
    // browser back) render in place without replaying the entrance fade, so the
    // page looks as if it was never unmounted. Cards that load afterwards still fade.
    const restoredCount = useRef(loading ? 0 : extensions.length).current;

    // Index-keyed slots (the list only appends): loading slots render as
    // skeletons that become cards in place, so the fade isn't restarted.
    const slotCount = extensions.length + fitProducts.length + (loading ? pageSize : 0);
    const cards = Array.from({ length: slotCount }, (_, idx) => {
        const extension = extensions[idx];
        const fitProduct = idx >= extensions.length ? fitProducts[idx - extensions.length] : undefined;
        return (
            <ExtensionCard
                key={idx}
                extension={extension}
                fitProduct={fitProduct}
                appear={idx >= restoredCount}
                fadeDelayMs={Math.min(idx % pageSize, 5) * 200}
                {...(extension || fitProduct ? grid.itemProps(idx) : {})}
            />
        );
    });

    // The observer only reports changes, so re-check whenever a page lands: a sentinel still in
    // view must trigger the next one. Waiting out any fetch avoids cancelling it. A failed page
    // leaves nothing here changed, so it waits for the retry button instead of looping.
    const loadedCount = extensions.length;
    useEffect(() => {
        if (nearEnd && hasNextPage && !isFetching && !isFetchNextPageError) {
            void fetchNextPage();
        }
    }, [nearEnd, hasNextPage, isFetching, isFetchNextPageError, loadedCount, fetchNextPage]);

    return (
        <div>
            <ExtensionGrid {...grid.containerProps}>{cards}</ExtensionGrid>
            {FIT_NATIVE_ENABLED && native.isError && (
                <Box role='status' sx={{ mt: 2, color: 'warningAccent' }}>
                    <Typography variant='body2'>FIT Registry temporarily unavailable; extension results are unaffected.</Typography>
                </Box>
            )}
            {firstPageFailed && (
                <ExtensionListLoadError message='We couldn’t load extensions at this time.' onRetry={() => refetch()} />
            )}
            {nextPageFailed && (
                <ExtensionListLoadError
                    showDivider
                    message='We couldn’t load more extensions at this time.'
                    onRetry={() => fetchNextPage()}
                />
            )}
            {fitOnly && !native.isLoading && !native.isError && fitProducts.length === 0 && (
                <Typography sx={{ my: 3, color: 'text.secondary' }}>
                    {filter.sortBy === 'rating' || filter.sortBy === 'downloadCount'
                        ? 'Rating and download rankings are not available for FIT packages yet.'
                        : 'No public FIT packages match the currently loaded releases.'}
                </Typography>
            )}
            {FIT_NATIVE_ENABLED && native.hasNextPage && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Button variant='outlined' disabled={native.isFetchingNextPage}
                        onClick={() => void native.fetchNextPage()}>
                        {native.isFetchingNextPage ? 'Loading FIT releases…' : 'Load more FIT packages'}
                    </Button>
                    <Typography variant='body2' color='text.secondary'>
                        FIT results and filters currently cover loaded releases only; more pages are available.
                    </Typography>
                </Box>
            )}
            {FIT_NATIVE_ENABLED && native.isFetchNextPageError && (
                <ExtensionListLoadError message='Could not load the next FIT page.'
                    onRetry={() => void native.fetchNextPage()} />
            )}
            <div ref={sentinelRef} />
        </div>
    );
};

export interface ExtensionListProps {
    filter: ExtensionFilter;
    onUpdate: (resultNumber: number) => void;
}
