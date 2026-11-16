/* BlackWhi Store - Registry-authored rights evidence in the native Open VSX FIT detail.
 * SPDX-License-Identifier: EPL-2.0
 * This client reads only public, reviewed and SHA-bound legal sidecars.
 */
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Link, Stack, Typography } from '@mui/material';
import { FitCatalogError } from './live-catalog';
import type { FitProfile } from './product-detail';

const ID = /^[a-z][a-z0-9.-]{1,120}$/;
const VERSION = /^[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?$/;
const SHA = /^[a-f0-9]{64}$/;
const KEY = /^(?:application-license|third-party-notices|dependency-license:[a-z][a-z0-9.-]{1,120}@[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8})$/;
const MANIFEST_FIELDS = [
    'contract', 'source', 'readOnly', 'id', 'version', 'artifactSha256', 'manifestSha256',
    'licenseExpression', 'businessModel', 'distribution', 'publisherOrigin',
    'independentlyRightsReviewed', 'documents'
];
const SELF_MANIFEST_FIELDS = [...MANIFEST_FIELDS, 'reviewMode'];
const DOC_FIELDS = ['key', 'sha256', 'bytes'];
const MODELS = new Set(['free-open-source', 'freeware', 'open-core', 'commercial', 'external-saas', 'educational']);
const DISTRIBUTIONS = new Set(['free', 'external-terms', 'restricted']);
const ORIGINS = new Set(['official', 'third-party']);

export interface RegistryLegalDocument {
    key: string;
    sha256: string;
    bytes: number;
}
export interface RegistryLegalManifest {
    contract: 'blackwhi.store.fit.legal.public.v1';
    source: 'blackwhi-fit-registry';
    readOnly: true;
    id: string;
    version: string;
    artifactSha256: string;
    manifestSha256: string;
    licenseExpression: string;
    businessModel: string;
    distribution: string;
    publisherOrigin: 'official' | 'third-party';
    independentlyRightsReviewed: boolean;
    reviewMode?: 'single-maintainer';
    documents: RegistryLegalDocument[];
}
const object = (raw: unknown): raw is Record<string, unknown> =>
    raw !== null && typeof raw === 'object' && !Array.isArray(raw);
const exactKeys = (raw: Record<string, unknown>, keys: string[]) =>
    Object.keys(raw).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(raw, key));
const invalid = (): never => { throw new FitCatalogError('FIT_LEGAL_RESPONSE_INVALID', 502); };

/** Exact release binding; do not trust unreviewed metadata or a response for another version. */
export function decodeRegistryLegalManifest(
    raw: unknown, packageId: string, version: string, artifactSha256: string
): RegistryLegalManifest {
    if (!ID.test(packageId) || packageId.includes('..') || !VERSION.test(version) || !SHA.test(artifactSha256))
        return invalid();
    const reviewed = object(raw) && ((exactKeys(raw, MANIFEST_FIELDS) && raw.independentlyRightsReviewed === true) ||
        (exactKeys(raw, SELF_MANIFEST_FIELDS) && raw.independentlyRightsReviewed === false &&
            raw.reviewMode === 'single-maintainer'));
    if (!reviewed || !object(raw) ||
        raw.contract !== 'blackwhi.store.fit.legal.public.v1' ||
        raw.source !== 'blackwhi-fit-registry' || raw.readOnly !== true ||
        raw.id !== packageId || raw.version !== version || raw.artifactSha256 !== artifactSha256 ||
        typeof raw.manifestSha256 !== 'string' || !SHA.test(raw.manifestSha256) ||
        typeof raw.licenseExpression !== 'string' ||
        !/^[A-Za-z0-9.+()\- ]{2,128}$/.test(raw.licenseExpression) ||
        typeof raw.businessModel !== 'string' || !MODELS.has(raw.businessModel) ||
        typeof raw.distribution !== 'string' || !DISTRIBUTIONS.has(raw.distribution) ||
        typeof raw.publisherOrigin !== 'string' || !ORIGINS.has(raw.publisherOrigin) ||
        !Array.isArray(raw.documents) || raw.documents.length < 2 || raw.documents.length > 32)
        return invalid();
    let total = 0;
    let previous = '';
    let hasLicense = false;
    let hasNotices = false;
    for (const document of raw.documents) {
        if (!object(document) || !exactKeys(document, DOC_FIELDS) ||
            typeof document.key !== 'string' || !KEY.test(document.key) || document.key.includes('..') ||
            document.key <= previous || typeof document.sha256 !== 'string' || !SHA.test(document.sha256) ||
            typeof document.bytes !== 'number' || !Number.isInteger(document.bytes) ||
            document.bytes < 1 || document.bytes > 32 * 1024)
            return invalid();
        previous = document.key;
        total += document.bytes;
        if (total > 48 * 1024) return invalid();
        hasLicense ||= document.key === 'application-license';
        hasNotices ||= document.key === 'third-party-notices';
    }
    if (!hasLicense || !hasNotices) return invalid();
    return raw as unknown as RegistryLegalManifest;
}

export function registryLegalEndpoint(packageId: string, version: string): string {
    if (!ID.test(packageId) || packageId.includes('..') || !VERSION.test(version)) return invalid();
    return `/api/blackwhi/fit/v2/products/${encodeURIComponent(packageId)}/versions/${encodeURIComponent(version)}/legal`;
}
export function registryLegalDocumentEndpoint(packageId: string, version: string, key: string): string {
    if (!KEY.test(key) || key.includes('..')) return invalid();
    return `${registryLegalEndpoint(packageId, version)}/documents/${encodeURIComponent(key)}`;
}

/** A 404 is absence, not an endorsement. Other failures are shown as errors. */
export async function fetchRegistryLegalManifest(
    packageId: string, version: string, artifactSha256: string, signal?: AbortSignal
): Promise<RegistryLegalManifest | null> {
    let response: Response;
    try {
        response = await fetch(registryLegalEndpoint(packageId, version), {
            method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
            headers: { Accept: 'application/json' }, signal
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new FitCatalogError('FIT_LEGAL_SERVICE_UNREACHABLE', 0);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new FitCatalogError('FIT_LEGAL_SERVICE_ERROR', response.status);
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return invalid();
    const body = await response.text();
    if (body.length < 2 || body.length > 24_000) return invalid();
    let decoded: unknown;
    try { decoded = JSON.parse(body); } catch { return invalid(); }
    return decodeRegistryLegalManifest(decoded, packageId, version, artifactSha256);
}

/** Embedded in the fork's existing "Business model & licensing" section. */
export function FitRegistryLegalEvidence({
    packageId, version, releaseSha, profile, preview = false
}: {
    packageId: string;
    version: string;
    releaseSha: string;
    profile?: FitProfile;
    preview?: boolean;
}) {
    const query = useQuery({
        queryKey: ['blackwhi', 'fit', 'registry-legal-evidence', packageId, version, releaseSha],
        queryFn: ({ signal }) => fetchRegistryLegalManifest(packageId, version, releaseSha, signal),
        enabled: !preview && ID.test(packageId) && VERSION.test(version) && SHA.test(releaseSha),
        retry: false,
        staleTime: 30_000,
        refetchOnWindowFocus: false
    });
    if (preview) return <Alert severity='warning'>Local editorial preview: no Registry legal approval is asserted.</Alert>;
    if (query.isPending || query.isLoading) return <Typography role='status'>Checking public Registry legal evidence…</Typography>;
    if (query.isError) return <Alert severity='error' role='alert'>Registry legal evidence is unavailable or could not be verified.</Alert>;
    if (!query.data) return <Alert severity='info'>No reviewed Registry legal documents are publicly available for this version.</Alert>;
    const legal = query.data;
    if (profile && (profile.business.licenseExpression !== legal.licenseExpression ||
        profile.business.model !== legal.businessModel || profile.business.distribution !== legal.distribution)) {
        return <Alert severity='error' role='alert'>Editorial and Registry legal declarations disagree. Legal documents are withheld.</Alert>;
    }
    return (
        <Stack spacing={1.5} sx={{ mt: 2 }}>
            <Alert severity={legal.independentlyRightsReviewed ? 'success' : 'warning'} icon={false}>
                {legal.independentlyRightsReviewed
                    ? 'Independently reviewed legal evidence is available for this exact published Registry release.'
                    : 'Publisher self-review (single maintainer). No independent rights review has occurred.'}
                {' '}This does not authorize execution, installation, or any entitlement.
            </Alert>
            <Box component='dl' sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '170px 1fr' }, gap: 1 }}>
                <Typography component='dt' variant='body2' color='text.secondary'>Registry SPDX</Typography>
                <Typography component='dd' variant='body2' sx={{ m: 0 }}>{legal.licenseExpression}</Typography>
                <Typography component='dt' variant='body2' color='text.secondary'>Publisher origin</Typography>
                <Typography component='dd' variant='body2' sx={{ m: 0 }}>{legal.publisherOrigin}</Typography>
                <Typography component='dt' variant='body2' color='text.secondary'>Manifest SHA-256</Typography>
                <Typography component='dd' variant='caption' sx={{ m: 0, overflowWrap: 'anywhere' }}>
                    <code>{legal.manifestSha256}</code>
                </Typography>
            </Box>
            <Typography variant='subtitle2'>Registry-verified legal documents</Typography>
            <Stack spacing={0.5}>
                {legal.documents.map(doc => (
                    <Link key={doc.key}
                        href={registryLegalDocumentEndpoint(packageId, version, doc.key)}
                        target='_blank' rel='noopener noreferrer' sx={{ overflowWrap: 'anywhere' }}>
                        {doc.key.replace(/[-:]/g, ' ')} ↗
                    </Link>
                ))}
            </Stack>
            <Typography variant='caption' color='text.secondary'>
                Every document is checked against its declared SHA-256 by the Spring bridge when requested.
                Commercial use and redistribution remain subject to the actual terms.
            </Typography>
        </Stack>
    );
}
