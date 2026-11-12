/********************************************************************************
 * Copyright (c) 2026 Contributors to the Eclipse Foundation
 * SPDX-License-Identifier: EPL-2.0
 *
 * BlackWhi STORE-02.1 - Professional FIT detail inside the native Open VSX UI.
 * Registry publication is not a signature verification or installation grant.
 ********************************************************************************/
import { FunctionComponent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouteLink, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, Divider, Link, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { PageContainer } from '../../components/page-container';
import { TagChip, cardSurface } from '../../components/page-primitives';
import { NotFound } from '../../not-found';
import { FIT_NATIVE_ENABLED, useNativeFitCatalog } from '../../blackwhi/fit/native-fit-catalog';
import {
    fetchFitProductDetail,
    fetchFitTextResource,
    fitResourceEndpoint,
    type FitAsset,
    type FitLink,
    type FitProfile
} from '../../blackwhi/fit/product-detail';

import {
    loadLocalFitEditorialPreview,
    localFitPreviewEnabled,
    releaseLocalFitPreview,
    type LocalFitEditorialPreview
} from '../../blackwhi/fit/local-editorial-preview';

const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
const DOCS = [
    ['readme', 'README'],
    ['quickStart', 'Quick start'],
    ['changelog', 'Changelog'],
    ['licenseText', 'License'],
    ['apiGuide', 'API guide']
] as const;
type DocKind = (typeof DOCS)[number][0];
const readable = (name: string): string => name.replace(/[-_]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
const bytesLabel = (bytes: number): string =>
    bytes < 1024
        ? `${bytes} B`
        : bytes < 1048576
          ? `${(bytes / 1024).toFixed(1)} KiB`
          : `${(bytes / 1048576).toFixed(2)} MiB`;

/** Deliberately use the original Store theme, navbar, footer and responsive page container. */
const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
    <Paper
        component='section'
        id={id}
        elevation={0}
        sx={theme => ({
            ...cardSurface(theme),
            p: { xs: 2, sm: 3 },
            scrollMarginTop: '6rem',
            overflowWrap: 'anywhere'
        })}>
        <Typography component='h2' variant='h6' sx={{ mb: 2, fontWeight: 700 }}>
            {title}
        </Typography>
        {children}
    </Paper>
);
const DetailRows = ({ entries }: { entries: Array<[string, ReactNode]> }) => (
    <Box
        component='dl'
        sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'minmax(150px,1fr) minmax(0,2fr)' },
            columnGap: 3,
            rowGap: 1.5,
            m: 0
        }}>
        {entries.map(([label, value]) => (
            <Box key={label} sx={{ display: 'contents' }}>
                <Typography component='dt' variant='body2' color='text.secondary'>
                    {label}
                </Typography>
                <Typography component='dd' variant='body2' sx={{ m: 0, overflowWrap: 'anywhere' }}>
                    {value}
                </Typography>
            </Box>
        ))}
    </Box>
);
const Items = ({ items }: { items: string[] }) =>
    items.length ? (
        <Box component='ul' sx={{ pl: 2.5, my: 1 }}>
            {items.map((item, index) => (
                <Typography key={`${index}:${item}`} component='li' sx={{ mb: 0.75 }}>
                    {item}
                </Typography>
            ))}
        </Box>
    ) : (
        <Typography color='text.secondary'>No entries declared.</Typography>
    );
const ExternalLinks = ({ links }: { links: FitLink[] }) =>
    links.length ? (
        <Stack spacing={1}>
            {links.map((link, index) => (
                <Link
                    key={`${index}:${link.url}`}
                    href={link.url}
                    target='_blank'
                    rel='noopener noreferrer nofollow'
                    sx={{ overflowWrap: 'anywhere' }}>
                    {link.label} ↗
                </Link>
            ))}
        </Stack>
    ) : (
        <Typography color='text.secondary'>No links supplied.</Typography>
    );

/** Documents are retrieved via Spring's bounded, hash-checked resource endpoint. */
const NativeFitDocuments = ({
    profile,
    id,
    version,
    preview
}: {
    profile: FitProfile;
    id: string;
    version: string;
    preview?: LocalFitEditorialPreview;
}) => {
    const available = DOCS.filter(([name]) => !!profile.documentation[name]);
    const [tab, setTab] = useState<DocKind>('readme');
    const asset: FitAsset | null | undefined = profile.documentation[tab];
    const [text, setText] = useState('');
    const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
    useEffect(() => {
        const controller = new AbortController();
        setText('');
        setStatus('loading');
        if (asset && preview) {
            const localText = preview.documents[asset.path];
            if (localText === undefined) setStatus('error');
            else {
                setText(localText);
                setStatus('ready');
            }
        } else if (asset) {
            fetchFitTextResource(id, version, asset, controller.signal).then(
                value => {
                    if (!controller.signal.aborted) {
                        setText(value);
                        setStatus('ready');
                    }
                },
                () => {
                    if (!controller.signal.aborted) setStatus('error');
                }
            );
        }
        return () => controller.abort();
    }, [id, version, asset?.path, preview]);
    const html = useMemo(() => DOMPurify.sanitize(md.render(text)), [text]);
    return (
        <Stack spacing={2}>
            <Box role='tablist' aria-label='Product documentation' sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {available.map(([name, label]) => (
                    <Button
                        key={name}
                        role='tab'
                        aria-selected={tab === name}
                        variant={tab === name ? 'contained' : 'outlined'}
                        size='small'
                        onClick={() => setTab(name)}>
                        {label}
                    </Button>
                ))}
            </Box>
            {status === 'loading' ? (
                <Typography role='status'>Loading verified document…</Typography>
            ) : status === 'error' ? (
                <Alert severity='error'>Document integrity could not be verified.</Alert>
            ) : (
                <Box
                    component='article'
                    sx={{
                        lineHeight: 1.8,
                        overflowX: 'auto',
                        '& pre': { overflowX: 'auto', p: 2, bgcolor: 'action.hover', borderRadius: 1 },
                        '& img': { maxWidth: '100%' },
                        '& code': { overflowWrap: 'anywhere' }
                    }}
                    dangerouslySetInnerHTML={{ __html: html }}
                />
            )}
        </Stack>
    );
};

const NativeFitProfile = ({
    profile,
    packageId,
    version,
    releaseSha,
    publishedAt,
    state,
    preview
}: {
    profile: FitProfile;
    packageId: string;
    version: string;
    releaseSha: string;
    publishedAt: string;
    state: string;
    preview?: LocalFitEditorialPreview;
}) => {
    const resource = (asset: FitAsset) =>
        preview ? (preview.assetUrls[asset.path] ?? '') : fitResourceEndpoint(packageId, version, asset.path);
    const sectionLabels: Array<[string, string]> = [
        ['overview', 'Overview'],
        ['categories', 'Categories'],
        ['tags', 'Tags'],
        ['size', 'Package size'],
        ['documentation', 'Documentation'],
        ['api', 'API reference'],
        ['examples', 'Examples'],
        ['dependencies', 'Dependencies'],
        ['compatibility', 'Compatibility'],
        ['security', 'Security'],
        ['versions', 'Versions'],
        ['distribution', 'Distribution'],
        ['media', 'Media'],
        ['links', 'Useful links'],
        ['community', 'Community'],
        ['support', 'Support'],
        ['business', 'Business model & licensing']
    ];
    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '215px minmax(0, 1fr)' },
                alignItems: 'start',
                gap: 3
            }}>
            <Paper
                component='nav'
                aria-label='Product sections'
                elevation={0}
                sx={theme => ({
                    ...cardSurface(theme),
                    p: 1.5,
                    display: 'flex',
                    flexDirection: { xs: 'row', lg: 'column' },
                    flexWrap: { xs: 'wrap', lg: 'nowrap' },
                    position: { lg: 'sticky' },
                    top: { lg: 96 },
                    maxHeight: { lg: 'calc(100vh - 112px)' },
                    overflowY: 'auto',
                    gap: 0.25
                })}>
                {sectionLabels.map(([key, label]) => (
                    <Link
                        key={key}
                        href={`#fit-${key}`}
                        underline='hover'
                        sx={{
                            px: 1,
                            py: 0.75,
                            fontSize: '0.8125rem',
                            color: 'text.secondary',
                            borderRadius: 1,
                            '&:hover': { bgcolor: 'action.hover' }
                        }}>
                        {label}
                    </Link>
                ))}
            </Paper>
            <Stack spacing={2.5} sx={{ minWidth: 0 }}>
                <Section id='fit-overview' title='Overview'>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{profile.overview.description}</Typography>
                    <Typography variant='subtitle1' sx={{ mt: 2, fontWeight: 700 }}>
                        Features
                    </Typography>
                    <Items items={profile.overview.features} />
                </Section>
                <Section id='fit-categories' title='Categories'>
                    <DetailRows
                        entries={[
                            ['Primary', readable(profile.categories.primary)],
                            [
                                'Subcategory',
                                profile.categories.subcategory
                                    ? readable(profile.categories.subcategory)
                                    : 'Not specified'
                            ],
                            ['Secondary', profile.categories.secondary.join(', ') || 'None declared']
                        ]}
                    />
                </Section>
                <Section id='fit-tags' title='Tags'>
                    <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
                        {profile.tags.map(tag => (
                            <Chip key={tag} size='small' label={tag} />
                        ))}
                        {!profile.tags.length && <Typography color='text.secondary'>No tags supplied.</Typography>}
                    </Stack>
                </Section>
                <Section id='fit-size' title='Package size'>
                    <DetailRows
                        entries={[
                            ['Download size', bytesLabel(profile.packageSize.downloadBytes)],
                            ['Unpacked size', bytesLabel(profile.packageSize.unpackedBytes)],
                            ['Archive entries', profile.packageSize.entryCount],
                            ['Documentation', bytesLabel(profile.packageSize.documentationBytes)],
                            ['Media', bytesLabel(profile.packageSize.mediaBytes)],
                            ['Content footprint', bytesLabel(profile.packageSize.contentFootprintBytes)]
                        ]}
                    />
                </Section>
                <Section id='fit-documentation' title='Documentation'>
                    <NativeFitDocuments
                        key={`${packageId}@${version}`}
                        profile={profile}
                        id={packageId}
                        version={version}
                        preview={preview}
                    />
                </Section>
                <Section id='fit-api' title='API reference'>
                    {profile.apiReference.functions.length ? (
                        <Stack spacing={2}>
                            {profile.apiReference.functions.map(fn => (
                                <Box key={`${fn.module}:${fn.symbol}`}>
                                    <Typography component='h3' variant='subtitle1' fontWeight={700}>
                                        {fn.symbol}()
                                    </Typography>
                                    <Typography color='text.secondary' variant='body2'>
                                        {fn.module}
                                    </Typography>
                                    <Typography sx={{ my: 1 }}>{fn.summary}</Typography>
                                    <DetailRows
                                        entries={[
                                            ...fn.parameters.map(
                                                p => [`${p.name} · ${p.type}`, p.description] as [string, ReactNode]
                                            ),
                                            ['Returns', fn.returns]
                                        ]}
                                    />
                                    <Divider sx={{ mt: 2 }} />
                                </Box>
                            ))}
                        </Stack>
                    ) : (
                        <Typography>
                            {profile.apiReference.notApplicableReason ?? 'No API symbols provided.'}
                        </Typography>
                    )}
                </Section>
                <Section id='fit-examples' title='Examples'>
                    {profile.examples.length ? (
                        <Stack spacing={2}>
                            {profile.examples.map((ex, i) => (
                                <Box key={`${i}:${ex.title}`}>
                                    <Typography variant='subtitle1' fontWeight={700}>
                                        {ex.title}
                                    </Typography>
                                    <Typography>{ex.description}</Typography>
                                    <Typography variant='body2' color='text.secondary'>
                                        {ex.module} · {ex.symbol}()
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    ) : (
                        <Typography color='text.secondary'>No examples provided.</Typography>
                    )}
                </Section>
                <Section id='fit-dependencies' title='Dependencies'>
                    {profile.dependencies.length ? (
                        <Stack spacing={2}>
                            {profile.dependencies.map(dep => (
                                <Box key={dep.id}>
                                    <Typography fontWeight={700}>
                                        {dep.id}@{dep.version}
                                    </Typography>
                                    {dep.id === packageId && dep.version === version && (
                                        <Typography variant='body2' color='text.secondary'>
                                            Bundled library in this FIT-03 program; not a separate remote dependency
                                            edge.
                                        </Typography>
                                    )}
                                    <Typography
                                        component='code'
                                        variant='body2'
                                        sx={{ overflowWrap: 'anywhere', color: 'text.secondary' }}>
                                        Manifest SHA-256: {dep.manifestSha256}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    ) : (
                        <Typography>No external FIT libraries declared in this release.</Typography>
                    )}
                </Section>
                <Section id='fit-compatibility' title='Compatibility'>
                    <DetailRows
                        entries={[
                            ['FIT engine', profile.compatibility.engine.id],
                            ['Starlark version', profile.compatibility.engine.starlarkVersion],
                            ['Protocol', profile.compatibility.engine.protocol],
                            ['Registry version', profile.compatibility.engine.registryVersion],
                            ['Platforms', profile.compatibility.platforms.join(', ') || 'Not specified']
                        ]}
                    />
                </Section>
                <Section id='fit-security' title='Security'>
                    <DetailRows
                        entries={[
                            ['Authority', profile.security.authority],
                            ['Registry release status', state],
                            ['Registry-declared SHA-256', releaseSha],
                            ['Declared capabilities', profile.security.declaredCapabilities.length],
                            [
                                'Requested permissions',
                                profile.security.requestedPermissions.join(', ') || 'None declared'
                            ]
                        ]}
                    />
                    <Alert severity='info' sx={{ mt: 2 }}>
                        A published release is not independent signature verification, installation approval or a grant
                        of requested permissions.
                    </Alert>
                </Section>
                <Section id='fit-versions' title='Versions'>
                    <DetailRows
                        entries={[
                            ['Selected version', version],
                            ['Published', new Date(publishedAt).toLocaleString()],
                            [
                                'Release notes',
                                <Link
                                    key='release-notes'
                                    href={resource(profile.versions.releaseNotes)}
                                    target='_blank'
                                    rel='noopener noreferrer'>
                                    Read verified resource ↗
                                </Link>
                            ]
                        ]}
                    />
                    <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
                        The version selector lists releases already loaded in the native catalog, not the entire version
                        history.
                    </Typography>
                </Section>
                <Section id='fit-distribution' title='Distribution'>
                    <DetailRows
                        entries={[
                            ['Channel', profile.distribution.channel],
                            ['Artifact', profile.distribution.filename],
                            ['Release version', version]
                        ]}
                    />
                    <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
                        Secure download and installation require a separate verified distribution contract.
                    </Typography>
                </Section>
                <Section id='fit-media' title='Media gallery'>
                    {profile.media.cover && (
                        <Box
                            component='img'
                            src={resource(profile.media.cover)}
                            alt='Product cover'
                            sx={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 2, mb: 2 }}
                        />
                    )}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 2 }}>
                        {[...profile.media.screenshots, ...profile.media.diagrams].map(asset => (
                            <Link key={asset.path} href={resource(asset)} target='_blank' rel='noopener noreferrer'>
                                <Box
                                    component='img'
                                    src={resource(asset)}
                                    alt={`Product resource ${asset.path}`}
                                    loading='lazy'
                                    sx={{ width: '100%', maxHeight: 230, objectFit: 'contain' }}
                                />
                            </Link>
                        ))}
                    </Box>
                    <ExternalLinks links={profile.media.videos} />
                </Section>
                <Section id='fit-links' title='Useful links'>
                    <ExternalLinks links={profile.links} />
                </Section>
                <Section id='fit-community' title='Community'>
                    <DetailRows
                        entries={[
                            ['Contributions', readable(profile.community.contributions)],
                            [
                                'Reviews',
                                profile.community.reviewsManagedByStore
                                    ? 'Managed separately by Store; no reviews are inferred.'
                                    : 'No Store review contract is enabled.'
                            ]
                        ]}
                    />
                </Section>
                <Section id='fit-support' title='Support'>
                    <Typography sx={{ mb: 1 }}>{readable(profile.support.model)}</Typography>
                    <ExternalLinks links={profile.support.contactLinks} />
                </Section>
                <Section id='fit-business' title='Business model & licensing'>
                    <DetailRows
                        entries={[
                            ['Model', readable(profile.business.model)],
                            ['Distribution terms', readable(profile.business.distribution)],
                            ['SPDX/license expression', profile.business.licenseExpression],
                            [
                                'License document',
                                <Link
                                    key='license-document'
                                    href={resource(profile.business.licenseDocument)}
                                    target='_blank'
                                    rel='noopener noreferrer'>
                                    Read provided license ↗
                                </Link>
                            ]
                        ]}
                    />
                    <Box sx={{ mt: 2 }}>
                        <ExternalLinks links={profile.business.externalServices} />
                    </Box>
                    <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
                        Commercial use and redistribution rights depend on the actual license and documented terms.
                    </Typography>
                </Section>
            </Stack>
        </Box>
    );
};

/** Native route: /fit-package/:packageId and /fit-package/:packageId/versions/:version. */
export const FitPackageDetail: FunctionComponent = () => {
    const { packageId, version: requestedVersion } = useParams<{ packageId: string; version?: string }>();
    const navigate = useNavigate();
    const catalog = useNativeFitCatalog();
    // Opt-in browser-only local draft; never changes the Store API's approval status.
    const previewRequested = localFitPreviewEnabled();
    const [localPreview, setLocalPreview] = useState<LocalFitEditorialPreview | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const previewGeneration = useRef(0);
    useEffect(
        () => () => {
            if (localPreview) releaseLocalFitPreview(localPreview);
        },
        [localPreview]
    );
    useEffect(() => {
        previewGeneration.current += 1;
        setLocalPreview(null);
        setPreviewError('');
        setPreviewBusy(false);
    }, [packageId, requestedVersion]);
    const releases = useMemo(
        () =>
            (catalog.data?.products ?? [])
                .filter(p => p.productId === packageId)
                .sort((a, b) => Date.parse(b.registryRelease.publishedAt) - Date.parse(a.registryRelease.publishedAt)),
        [catalog.data, packageId]
    );
    const selectedVersion = requestedVersion ?? releases[0]?.registryRelease.version;
    const selectedFromCatalog = releases.find(p => p.registryRelease.version === selectedVersion);
    const details = useQuery({
        queryKey: ['blackwhi', 'fit', 'native-product-detail', packageId, selectedVersion],
        queryFn: ({ signal }) => fetchFitProductDetail(packageId!, selectedVersion!, signal),
        enabled: FIT_NATIVE_ENABLED && !!packageId && !!selectedVersion,
        retry: false,
        staleTime: 30_000
    });

    // Explicit version URLs resolve via Registry exact lookup even beyond every loaded page.
    if (!requestedVersion && catalog.isLoading)
        return (
            <PageContainer component='main'>
                <Typography role='status'>Loading FIT releases…</Typography>
            </PageContainer>
        );
    if (!requestedVersion && catalog.isError)
        return (
            <PageContainer component='main'>
                <Alert severity='error'>The FIT Registry is unavailable.</Alert>
            </PageContainer>
        );
    const selected = selectedFromCatalog ?? details.data?.product;
    if (!selected || !packageId || !selectedVersion) {
        if (requestedVersion && (details.isLoading || details.isPending)) {
            return (
                <PageContainer component='main'>
                    <Typography role='status'>Loading exact FIT release…</Typography>
                </PageContainer>
            );
        }
        if (requestedVersion && details.isError) {
            return (
                <PageContainer component='main'>
                    <Alert severity='error'>The exact FIT release could not be verified.</Alert>
                </PageContainer>
            );
        }
        return <NotFound />;
    }
    const release = selected.registryRelease;
    const responseMatchesRegistry =
        !details.data ||
        !selectedFromCatalog ||
        details.data.product.registryRelease.sha256 === selectedFromCatalog.registryRelease.sha256;
    const activePreview =
        previewRequested &&
        responseMatchesRegistry &&
        details.data?.profileStatus === 'not-provided' &&
        localPreview?.profile.release.packageId === packageId &&
        localPreview.profile.release.version === selectedVersion &&
        localPreview.profile.release.artifactSha256 === release.sha256
            ? localPreview
            : undefined;
    const profile =
        activePreview?.profile ??
        (responseMatchesRegistry && details.data?.profileStatus === 'complete'
            ? (details.data.profile as FitProfile)
            : undefined);
    const previewSelect = async (files: FileList | null): Promise<void> => {
        if (!files || !selected || !previewRequested) return;
        const generation = ++previewGeneration.current;
        setLocalPreview(null);
        setPreviewError('');
        setPreviewBusy(true);
        try {
            const checked = await loadLocalFitEditorialPreview(files, selected);
            if (generation !== previewGeneration.current) {
                releaseLocalFitPreview(checked);
                return;
            }
            setLocalPreview(checked);
        } catch (error) {
            if (generation === previewGeneration.current) {
                setPreviewError(error instanceof Error ? error.message : 'Invalid local editorial folder.');
            }
        } finally {
            if (generation === previewGeneration.current) setPreviewBusy(false);
        }
    };
    return (
        <PageContainer component='main'>
            <Stack spacing={3}>
                <Box>
                    <Link
                        component={RouteLink}
                        to='/search?category=FIT%20Packages'
                        underline='hover'
                        sx={{ fontSize: '0.875rem' }}>
                        ← Browse packages
                    </Link>
                </Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} alignItems='flex-start' spacing={3}>
                    <Paper
                        elevation={0}
                        sx={theme => ({
                            ...cardSurface(theme),
                            flexShrink: 0,
                            width: 92,
                            height: 92,
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden'
                        })}>
                        {profile?.media.icon ? (
                            <Box
                                component='img'
                                src={fitResourceEndpoint(packageId, selectedVersion, profile.media.icon.path)}
                                alt={`Icon for ${profile.identity.displayName}`}
                                sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            />
                        ) : (
                            <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: 'secondary.main' }}>
                                FIT
                            </Typography>
                        )}
                    </Paper>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <TagChip accent>FIT package</TagChip>
                        <Typography component='h1' variant='h4' sx={{ fontWeight: 700, mt: 1 }}>
                            {profile?.identity.displayName ?? selected.displayName}
                        </Typography>
                        <Typography color='text.secondary'>
                            {profile?.identity.publisherName ?? selected.publisherNamespace} · v{selectedVersion}
                        </Typography>
                        {release.state === 'deprecated' && (
                            <Typography color='warning.main'>Deprecated release</Typography>
                        )}
                        {profile && <Typography sx={{ mt: 1.5 }}>{profile.overview.summary}</Typography>}
                        {details.data &&
                            responseMatchesRegistry &&
                            ['published', 'deprecated'].includes(release.state) && (
                                <Stack direction='row' spacing={1} sx={{ mt: 2 }} alignItems='center' flexWrap='wrap'>
                                    <Button
                                        variant='contained'
                                        component='a'
                                        href={`/api/blackwhi/fit/v2/products/${encodeURIComponent(packageId)}/versions/${encodeURIComponent(selectedVersion)}/download`}
                                        aria-label={`Download ${packageId} version ${selectedVersion} FIT package`}>
                                        Download .fitpkg
                                    </Button>
                                    <Typography variant='caption' color='text.secondary'>
                                        Published Registry archive · independent verification required before
                                        installation.
                                    </Typography>
                                </Stack>
                            )}
                    </Box>
                    {releases.length > 1 && (
                        <Stack spacing={0.5} sx={{ minWidth: 130 }}>
                            <Typography variant='caption' color='text.secondary'>
                                Registry release
                            </Typography>
                            <Select
                                size='small'
                                value={selectedVersion}
                                aria-label='Registry release'
                                onChange={e =>
                                    navigate(
                                        `/fit-package/${encodeURIComponent(packageId)}/versions/${encodeURIComponent(e.target.value)}`
                                    )
                                }>
                                {!releases.some(p => p.registryRelease.version === selectedVersion) && (
                                    <MenuItem value={selectedVersion}>{selectedVersion} (exact version)</MenuItem>
                                )}
                                {releases.map(p => (
                                    <MenuItem key={p.registryRelease.version} value={p.registryRelease.version}>
                                        {p.registryRelease.version}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Stack>
                    )}
                </Stack>
                <Alert severity='info' icon={false}>
                    Public Registry release information and optional SHA-256-bound editorial resources. Downloading a
                    published .fitpkg does not independently verify its Ed25519 signature, approve its editorial
                    profile, execute code or authorize installation. Use a pinned trust policy before running packages.
                </Alert>
                {details.isLoading && <Typography role='status'>Loading exact-version product details…</Typography>}
                {details.isError && (
                    <Alert severity='error' role='alert'>
                        This release detail could not be validated against the Store API.
                        <Button size='small' sx={{ ml: 1 }} onClick={() => void details.refetch()}>
                            Retry
                        </Button>
                    </Alert>
                )}
                {!responseMatchesRegistry && (
                    <Alert severity='error' role='alert'>
                        The Store and Registry release SHA-256 values do not match. No editorial details are displayed.
                    </Alert>
                )}
                {previewRequested && responseMatchesRegistry && details.data?.profileStatus === 'not-provided' && (
                    <Paper elevation={0} sx={theme => ({ ...cardSurface(theme), p: 3 })}>
                        <Alert severity='warning' role='note' sx={{ mb: 2 }}>
                            <strong>LOCAL EDITORIAL DRAFT — REVIEW REQUIRED — NOT APPROVED.</strong> This preview reads
                            files only in your browser. No files are uploaded, no Store publication or Registry rights
                            are changed, and license/redistribution claims have not received an independent editorial
                            review.
                        </Alert>
                        <Typography sx={{ mb: 1 }}>
                            Select the local editorial candidate folder containing <code>fit-product.json</code> and
                            <code> docs/</code>. The browser checks the exact Registry artifact SHA-256 and the SHA-256
                            of every displayed document/image before showing the native product sections.
                        </Typography>
                        <input
                            type='file'
                            multiple
                            aria-label='Select local FIT editorial folder'
                            ref={element => {
                                if (element) {
                                    element.setAttribute('webkitdirectory', '');
                                    element.setAttribute('directory', '');
                                }
                            }}
                            onChange={event => {
                                void previewSelect(event.currentTarget.files);
                            }}
                        />
                        {previewBusy && <Typography role='status'>Verifying local editorial resources…</Typography>}
                        {previewError && (
                            <Alert severity='error' role='alert' sx={{ mt: 2 }}>
                                {previewError}
                            </Alert>
                        )}
                        {activePreview && (
                            <Alert severity='success' sx={{ mt: 2 }}>
                                Local files matched the published Registry digest and their declared document hashes.
                                This is still an unapproved draft, not a public Store profile.
                            </Alert>
                        )}
                    </Paper>
                )}
                {responseMatchesRegistry &&
                    details.data &&
                    details.data.profileStatus === 'not-provided' &&
                    !activePreview && (
                        <Section id='fit-registry' title='Registry information'>
                            <Typography sx={{ mb: 2 }}>
                                The release is published, but its professional FIT-01 profile has not been supplied. No
                                license, documentation, ratings, image, or review status has been invented.
                            </Typography>
                            <DetailRows
                                entries={[
                                    ['Package ID', selected.productId],
                                    ['Version', selectedVersion],
                                    ['Registry state', release.state],
                                    ['Published', new Date(release.publishedAt).toLocaleString()],
                                    ['Registry SHA-256', release.sha256]
                                ]}
                            />
                        </Section>
                    )}
                {profile && (
                    <NativeFitProfile
                        profile={profile}
                        packageId={packageId}
                        version={selectedVersion}
                        releaseSha={release.sha256}
                        publishedAt={release.publishedAt}
                        state={release.state}
                        preview={activePreview}
                    />
                )}
            </Stack>
        </PageContainer>
    );
};
