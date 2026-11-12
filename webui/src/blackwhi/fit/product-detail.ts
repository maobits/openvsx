/* BlackWhi Store - STORE-02: same-origin, strictly bounded FIT product detail transport.
 * SPDX-License-Identifier: EPL-2.0
 */
import { FitCatalogError, type FitStoreProduct } from './live-catalog';

export const FIT_DETAIL_CONTRACT = 'blackwhi.store.fit.product.detail.v1';
export const FIT_DETAIL_EXACT_CONTRACT = 'blackwhi.store.fit.product.detail.v2';
const ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const VERSION = /^[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PATH = /^(docs|assets)\/[A-Za-z0-9._/-]{1,208}$/;
const SECTIONS = [
    'release', 'identity', 'overview', 'categories', 'tags', 'packageSize',
    'documentation', 'apiReference', 'examples', 'dependencies', 'compatibility',
    'security', 'versions', 'distribution', 'media', 'links', 'community', 'support', 'business'
] as const;

export interface FitAsset { path: string; sha256: string; bytes: number }
export interface FitLink { kind: string; label: string; url: string }
export interface FitProfile {
    contract: 'blackwhi.fit.product.profile.v1' | 'blackwhi.fit.product.profile.v2';
    // Draft type supports browser-only local preview; public decodeFitProductDetail still rejects non-approved v2.
    editorial?: { state: 'approved' | 'review-required';
        fieldStatus: Record<'publisher' | 'links' | 'support' | 'license' | 'icon', string>;
        rightsReview: { reviewer: string | null; reviewedDate: string | null; publisherAuthorized: boolean;
            licenseTextReviewed: boolean; redistributionRightsConfirmed: boolean } };
    release: { packageId: string; version: string; artifactSha256: string };
    identity: { displayName: string; publisherName: string; publisherNamespace: string; productType: string };
    overview: { summary: string; description: string; features: string[] };
    categories: { primary: string; subcategory: string | null; secondary: string[]; taxonomyContract: string };
    tags: string[];
    packageSize: { downloadBytes: number; unpackedBytes: number; entryCount: number;
        documentationBytes: number; mediaBytes: number; contentFootprintBytes: number };
    documentation: { readme: FitAsset; quickStart: FitAsset; changelog: FitAsset; licenseText: FitAsset; apiGuide?: FitAsset | null };
    apiReference: { functions: Array<{ module: string; symbol: string; summary: string; returns: string;
        parameters: Array<{ name: string; type: string; description: string }> }>;
        notApplicableReason: string | null };
    examples: Array<{ title: string; module: string; symbol: string; description: string }>;
    dependencies: Array<{ id: string; version: string; manifestSha256: string }>;
    compatibility: { engine: { id: string; starlarkVersion: string; protocol: number; registryVersion: string }; platforms: string[] };
    security: { authority: 'blackwhi-registry'; declaredCapabilities: unknown[]; requestedPermissions: string[] };
    versions: { releaseNotes: FitAsset };
    distribution: { channel: 'blackwhi-registry'; filename: string };
    media: { icon: FitAsset | null; cover: FitAsset | null; screenshots: FitAsset[]; diagrams: FitAsset[]; videos: FitLink[] };
    links: FitLink[];
    community: { contributions: string; reviewsManagedByStore: boolean };
    support: { model: string; contactLinks: FitLink[] };
    business: { model: string; distribution: string; licenseExpression: string; licenseDocument: FitAsset; externalServices: FitLink[] };
}
export interface FitProductDetail {
    contract: typeof FIT_DETAIL_CONTRACT | typeof FIT_DETAIL_EXACT_CONTRACT;
    readOnly: true;
    coverage: 'latest-50-releases' | 'exact-release';
    product: FitStoreProduct;
    profileStatus: 'complete' | 'not-provided';
    profile: FitProfile | Record<string, never>;
}
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isAsset = (v: unknown): v is FitAsset => isObject(v) && isString(v.path) && PATH.test(v.path) &&
    !v.path.split('/').some(p => !p || p === '.' || p === '..') &&
    (v.path.startsWith('docs/') ? /\.(md|txt)$/.test(v.path) : /\.(png|jpe?g|webp)$/.test(v.path)) &&
    isString(v.sha256) && SHA256.test(v.sha256) &&
    Number.isInteger(v.bytes) && (v.bytes as number) > 0 && (v.bytes as number) <= 2 * 1024 * 1024;
const fail = (): never => { throw new FitCatalogError('STORE_DETAIL_INVALID', 502); };
const safeLink = (raw: unknown): boolean => {
    if (!isObject(raw) || !isString(raw.label) || !isString(raw.kind) || !isString(raw.url) ||
        raw.url.length > 2048 || /[\\\s]/.test(raw.url)) return false;
    try {
        const url = new URL(raw.url);
        return url.protocol === 'https:' && !url.username && !url.password &&
            url.hostname.includes('.') && !url.hostname.endsWith('.local') &&
            !/^[0-9.]+$/.test(url.hostname) && (!url.port || url.port === '443');
    } catch { return false; }
};
const validLinks = (input: unknown): boolean => Array.isArray(input) && input.length <= 40 && input.every(safeLink);

/** v2 drafts never cross the public transport boundary. This is not Registry trust verification. */
const isApprovedV2 = (profile: Record<string, unknown>): boolean => {
    if (!isObject(profile.editorial) || profile.editorial.state !== 'approved' ||
        !isObject(profile.editorial.fieldStatus) || !isObject(profile.editorial.rightsReview)) return false;
    const fields = profile.editorial.fieldStatus;
    const review = profile.editorial.rightsReview;
    if (Object.keys(profile.editorial).length !== 3 || Object.keys(fields).length !== 5 ||
        Object.keys(review).length !== 5 || fields.publisher !== 'provided' || fields.license !== 'provided' ||
        !isString(review.reviewer) || review.reviewer.length < 2 ||
        !isString(review.reviewedDate) || !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedDate) ||
        review.publisherAuthorized !== true || review.licenseTextReviewed !== true ||
        review.redistributionRightsConfirmed !== true) return false;
    if (!isObject(profile.identity) || !isString(profile.identity.publisherName) ||
        !isObject(profile.business) || !isString(profile.business.licenseExpression) ||
        /unknown|pending|unspecified|tbd|test-only/i.test(profile.business.licenseExpression) ||
        !isString(profile.business.model) || !isString(profile.business.distribution) ||
        !isObject(profile.support) || !isObject(profile.media) || !Array.isArray(profile.links)) return false;
    const expected: Record<string, boolean> = {
        publisher: true, license: true,
        links: profile.links.length > 0,
        support: profile.support.model !== 'none', icon: profile.media.icon !== null
    };
    return Object.keys(expected).every(key =>
        fields[key] === 'provided' ? expected[key] :
        fields[key] === 'not-provided' || fields[key] === 'not-applicable' ? !expected[key] :
        false);
};

export function fitDetailPath(id: string, version: string): string {
    if (!ID.test(id) || !VERSION.test(version)) return fail();
    return `/fit-package/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
}
export function fitDetailEndpoint(id: string, version: string): string {
    if (!ID.test(id) || !VERSION.test(version)) return fail();
    return `/api/blackwhi/fit/v2/products/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
}
export function fitResourceEndpoint(id: string, version: string, path: string): string {
    if (!isAsset({ path, sha256: 'a'.repeat(64), bytes: 1 })) return fail();
    return `${fitDetailEndpoint(id, version)}/resource?path=${encodeURIComponent(path)}`;
}

export function decodeFitProductDetail(input: unknown, id: string, version: string): FitProductDetail {
    if (!isObject(input) || !((input.contract === FIT_DETAIL_CONTRACT && input.coverage === 'latest-50-releases') ||
           (input.contract === FIT_DETAIL_EXACT_CONTRACT && input.coverage === 'exact-release')) || input.readOnly !== true || !isObject(input.product) ||
        !isObject(input.product.registryRelease) || input.product.productId !== id ||
        input.product.registryRelease.packageId !== id || input.product.registryRelease.version !== version ||
        !isString(input.product.registryRelease.sha256) || !SHA256.test(input.product.registryRelease.sha256) ||
        !['published', 'deprecated'].includes(String(input.product.registryRelease.state)) ||
        !['complete', 'not-provided'].includes(String(input.profileStatus)) || !isObject(input.profile)) return fail();
    const profile = input.profile;
    if (input.profileStatus === 'not-provided') {
        if (Object.keys(profile).length !== 0) return fail();
    } else {
        const v2 = profile.contract === 'blackwhi.fit.product.profile.v2';
        if (Object.keys(profile).length !== SECTIONS.length + (v2 ? 2 : 1) ||
            !SECTIONS.every(key => key in profile) ||
            !(v2 || profile.contract === 'blackwhi.fit.product.profile.v1') ||
            (v2 && !isApprovedV2(profile)) ||
            !isObject(profile.release) || profile.release.packageId !== id || profile.release.version !== version ||
            profile.release.artifactSha256 !== input.product.registryRelease.sha256 ||
            !isObject(profile.identity) || !isString(profile.identity.displayName) ||
            !isString(profile.identity.publisherName) || !isObject(profile.overview) ||
            !isString(profile.overview.description) || !Array.isArray(profile.overview.features) ||
            !isObject(profile.documentation) || !isAsset(profile.documentation.readme) ||
            !isAsset(profile.documentation.quickStart) || !isAsset(profile.documentation.changelog) ||
            !isAsset(profile.documentation.licenseText) || !isObject(profile.media) ||
            !(v2 ? profile.media.icon === null || isAsset(profile.media.icon) : isAsset(profile.media.icon)) ||
            !isObject(profile.security) || profile.security.authority !== 'blackwhi-registry' ||
            !validLinks(profile.links) || !isObject(profile.media) || !validLinks(profile.media.videos) ||
            !isObject(profile.support) || !validLinks(profile.support.contactLinks) ||
            !isObject(profile.business) || !validLinks(profile.business.externalServices) ||
            !isAsset(profile.business.licenseDocument)) return fail();
    }
    return input as unknown as FitProductDetail;
}

export async function fetchFitProductDetail(id: string, version: string, signal?: AbortSignal): Promise<FitProductDetail> {
    const endpoint = fitDetailEndpoint(id, version);
    let response: Response;
    try {
        response = await fetch(endpoint, { method: 'GET', credentials: 'omit', cache: 'no-store',
            redirect: 'error', headers: { Accept: 'application/json' }, signal });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new FitCatalogError('STORE_API_UNREACHABLE', 0);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return fail();
    const raw = await response.text();
    if (raw.length > 290_000) return fail();
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return fail(); }
    if (!response.ok) {
        const code = isObject(data) && data.contract === 'blackwhi.store.fit.error.v1' &&
            isString(data.code) && /^[A-Z_]{3,64}$/.test(data.code) ? data.code : 'STORE_API_ERROR';
        throw new FitCatalogError(code, response.status);
    }
    // Exact-version requests must never silently fall back to the legacy catalog window.
    // Keep the v1 decoder for historical callers; enforce v2 at this transport boundary.
    if (!isObject(data) || data.contract !== FIT_DETAIL_EXACT_CONTRACT ||
        data.coverage !== 'exact-release') return fail();
    return decodeFitProductDetail(data, id, version);
}

export async function fetchFitTextResource(id: string, version: string, asset: FitAsset, signal?: AbortSignal): Promise<string> {
    if (!isAsset(asset) || !asset.path.startsWith('docs/') || asset.bytes > 512 * 1024) return fail();
    let response: Response;
    try {
        response = await fetch(fitResourceEndpoint(id, version, asset.path), { method: 'GET', credentials: 'omit',
            cache: 'no-store', redirect: 'error', signal });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new FitCatalogError('STORE_API_UNREACHABLE', 0);
    }
    if (!response.ok || !/^text\/plain(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return fail();
    const raw = await response.text();
    if (new TextEncoder().encode(raw).length !== asset.bytes) return fail();
    // The Spring BFF rechecks SHA-256 before responding, so we never trust asset paths directly.
    return raw;
}
