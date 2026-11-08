/********************************************************************************
 * Copyright (c) 2026 Contributors to the Eclipse Foundation
 * SPDX-License-Identifier: EPL-2.0
 ********************************************************************************/
import { FunctionComponent } from 'react';
import { Link as RouteLink, useParams } from 'react-router';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { PageContainer } from '../../components/page-container';
import { TagChip, cardSurface } from '../../components/page-primitives';
import { NotFound } from '../../not-found';
import { useNativeFitCatalog } from '../../blackwhi/fit/native-fit-catalog';
import { FitStoreProduct } from '../../blackwhi/fit/live-catalog';

/** Native Open VSX detail view for a distinct FIT artifact. No download or trust grant. */
export const FitPackageDetail: FunctionComponent = () => {
    const { packageId } = useParams();
    const { data, isLoading, isError } = useNativeFitCatalog();
    if (isLoading) return <PageContainer><Typography role='status'>Loading product…</Typography></PageContainer>;
    if (isError) return <PageContainer><Typography role='alert'>FIT Registry unavailable.</Typography></PageContainer>;
    const product: FitStoreProduct | undefined = data?.products
        .filter(item => item.productId === packageId)
        .sort((a, b) => Date.parse(b.registryRelease.publishedAt) - Date.parse(a.registryRelease.publishedAt))[0];
    if (!product) return <NotFound />;
    const release = product.registryRelease;
    return (
        <PageContainer component='main'>
            <Stack spacing={3}>
                <Box>
                    <Typography component={RouteLink} to='/search?category=FIT%20Packages'
                        sx={{ color: 'secondary.main', textDecoration: 'none', fontSize: '0.875rem' }}>
                        ← Browse packages
                    </Typography>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems='flex-start'>
                    <Paper elevation={0} sx={theme => ({ ...cardSurface(theme), width: 92, height: 92,
                        display: 'grid', placeItems: 'center', fontSize: '2rem', fontWeight: 800,
                        color: 'secondary.main', flexShrink: 0 })}>FIT</Paper>
                    <Box>
                        <TagChip accent>FIT package</TagChip>
                        <Typography component='h1' variant='h4' sx={{ fontWeight: 700, mt: 1 }}>{product.displayName}</Typography>
                        <Typography color='text.secondary'>{product.publisherNamespace} · {release.version}</Typography>
                        {release.state === 'deprecated' && <Typography color='warningAccent'>Deprecated release</Typography>}
                    </Box>
                </Stack>
                <Paper elevation={0} sx={theme => ({ ...cardSurface(theme), p: 3 })}>
                    <Stack spacing={2}>
                        <Typography component='h2' variant='h6'>Registry information</Typography>
                        <Typography>Package ID: {product.productId}</Typography>
                        <Typography>Release date: {new Date(release.publishedAt).toLocaleDateString()}</Typography>
                        <Box><Typography color='text.secondary'>SHA-256 declared by the Registry</Typography>
                            <Typography component='code' sx={{ overflowWrap: 'anywhere', fontFamily: 'monospace' }}>
                                {release.sha256}
                            </Typography>
                        </Box>
                        <Typography color='text.secondary' variant='body2'>
                            Read-only listing. The displayed digest does not independently verify a signature or
                            authorize installation, download, or execution.
                        </Typography>
                    </Stack>
                </Paper>
            </Stack>
        </PageContainer>
    );
};
