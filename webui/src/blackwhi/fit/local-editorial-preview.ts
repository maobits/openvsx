/* Copyright (c) 2026 Contributors to the Eclipse Foundation.
 * SPDX-License-Identifier: EPL-2.0
 * BlackWhi: browser-only, explicitly selected FIT-02 draft preview.
 * No upload, Store API mutation, publication approval or Registry trust grant.
 */
import type { FitProfile } from './product-detail';
import type { FitStoreProduct } from './live-catalog';

export interface LocalFitEditorialPreview {
    profile: FitProfile;
    documents: Readonly<Record<string, string>>;
    assetUrls: Readonly<Record<string, string>>;
}

const FIELDS = [
    'apiReference', 'business', 'categories', 'community', 'compatibility', 'contract',
    'dependencies', 'distribution', 'documentation', 'editorial', 'examples', 'identity',
    'links', 'media', 'overview', 'packageSize', 'release', 'security', 'support', 'tags', 'versions'
];
const SHA = /^[a-f0-9]{64}$/;
const PATH = /^(docs|assets)\/[A-Za-z0-9._/-]{1,208}$/;
const MAX_PROFILE = 256 * 1024;
const MAX_DOCUMENT = 512 * 1024;
const MAX_IMAGE = 2 * 1024 * 1024;
const MAX_TOTAL = 10 * 1024 * 1024;
const MAX_SELECTED = 128;
const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);
const asObject = (value: unknown): Record<string, unknown> => {
    if (!isObject(value)) throw new Error('Invalid FIT draft structure.');
    return value;
};
const isText = (v: unknown): v is string => typeof v === 'string' && v.length <= 50_000;
const stringList = (v: unknown, max = 250): v is string[] =>
    Array.isArray(v) && v.length <= max && v.every(isText);
const sameKeys = (value: Record<string, unknown>, expected: string[]): boolean =>
    Object.keys(value).length === expected.length && expected.every(k => Object.prototype.hasOwnProperty.call(value, k));
const invalid = (message: string): never => { throw new Error(message); };

/** Browser-local preview is opt-in on loopback only; the public Store never serves drafts. */
export function localFitPreviewEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname.toLowerCase();
    return (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') &&
        new URLSearchParams(window.location.search).get('fitPreview') === 'local';
}

function safePath(path: string, docs: boolean): boolean {
    if (!PATH.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) return false;
    return docs ? path.startsWith('docs/') && /\.(md|txt)$/.test(path)
        : path.startsWith('assets/') && /\.(png|jpe?g|webp)$/.test(path);
}
function safeLinks(value: unknown): boolean {
    if (!Array.isArray(value) || value.length > 40) return false;
    return value.every(entry => {
        if (!isObject(entry) || !isText(entry.label) || !isText(entry.kind) ||
            !isText(entry.url) || entry.url.length > 2048 || /[\\\s]/.test(entry.url)) return false;
        try {
            const url = new URL(entry.url);
            return url.protocol === 'https:' && !url.username && !url.password &&
                url.hostname.includes('.') && url.hostname !== 'localhost' &&
                !url.hostname.endsWith('.local') && !/^[0-9.]+$/.test(url.hostname) &&
                (!url.port || url.port === '443');
        } catch { return false; }
    });
}
function assetDescriptor(value: unknown, type: 'docs' | 'assets'):
        { path: string; sha256: string; bytes: number } {
    const entry = asObject(value);
    if (!sameKeys(entry, ['path', 'sha256', 'bytes']) || typeof entry.path !== 'string' ||
        !safePath(entry.path, type === 'docs') || typeof entry.sha256 !== 'string' ||
        !SHA.test(entry.sha256) || !Number.isInteger(entry.bytes) ||
        (entry.bytes as number) < 1 || (entry.bytes as number) >
        (type === 'docs' ? MAX_DOCUMENT : MAX_IMAGE)) invalid('Unsafe or invalid FIT document/image descriptor.');
    return entry as { path: string; sha256: string; bytes: number };
}
function bytesHex(bytes: ArrayBuffer): string {
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

/** Only reads explicitly chosen browser File objects. No fetch, no filesystem paths, no upload. */
export async function loadLocalFitEditorialPreview(
    chosen: FileList | readonly File[], product: FitStoreProduct
): Promise<LocalFitEditorialPreview> {
    const files = Array.from(chosen);
    if (!files.length || files.length > MAX_SELECTED) invalid('Choose one small editorial candidate folder.');
    const selected = new Map<string, File>();
    let folder: string | null = null;
    for (const file of files) {
        const rawPath = file.webkitRelativePath;
        const parts = rawPath.split('/');
        if (parts.length < 2 || parts.some(p => !p || p === '.' || p === '..' || p.includes('\\'))) {
            invalid('Choose the folder containing fit-product.json and docs/.');
        }
        if (folder === null) folder = parts[0];
        if (parts[0] !== folder) invalid('Only one editorial folder may be selected.');
        const name = parts.slice(1).join('/');
        // Ignore unrelated FIT binaries and temporary files without reading them.
        if (name !== 'fit-product.json' && !name.startsWith('docs/') && !name.startsWith('assets/')) continue;
        if (selected.has(name)) invalid('Duplicate editorial asset path.');
        selected.set(name, file);
    }
    const profileFile = selected.get('fit-product.json');
    if (!profileFile || profileFile.size < 1 || profileFile.size > MAX_PROFILE) invalid('Missing/oversized fit-product.json.');
    let input: unknown;
    try { input = JSON.parse(await profileFile.text()); }
    catch { return invalid('The local FIT draft is not valid JSON.'); }
    const p = asObject(input);
    if (!sameKeys(p, FIELDS) || p.contract !== 'blackwhi.fit.product.profile.v2')
        invalid('The local file is not a canonical 19-section FIT v2 draft.');
    const editorial = asObject(p.editorial);
    const rights = asObject(editorial.rightsReview);
    const statuses = asObject(editorial.fieldStatus);
    if (!sameKeys(editorial, ['state', 'rightsReview', 'fieldStatus']) ||
        editorial.state !== 'review-required' ||
        !sameKeys(rights, ['reviewer', 'reviewedDate', 'publisherAuthorized',
            'licenseTextReviewed', 'redistributionRightsConfirmed']) ||
        rights.reviewer !== null || rights.reviewedDate !== null ||
        rights.publisherAuthorized !== false || rights.licenseTextReviewed !== false ||
        rights.redistributionRightsConfirmed !== false ||
        !sameKeys(statuses, ['publisher', 'links', 'support', 'license', 'icon']) ||
        !Object.values(statuses).every(v => ['provided', 'not-provided', 'not-applicable'].includes(String(v))))
        invalid('This is not an unapproved, review-required editorial candidate.');

    const release = asObject(p.release);
    if (release.packageId !== product.productId ||
        release.version !== product.registryRelease.version ||
        release.artifactSha256 !== product.registryRelease.sha256 ||
        !SHA.test(String(release.artifactSha256))) invalid('Draft does not match this exact Registry release SHA-256.');
    const identity = asObject(p.identity);
    if (!isText(identity.displayName) || !identity.displayName.trim() ||
        !isText(identity.publisherName) || !identity.publisherName.trim() ||
        typeof identity.publisherNamespace !== 'string' ||
        !product.productId.startsWith(`${identity.publisherNamespace}.`) ||
        identity.productType !== 'fit-application') invalid('FIT draft identity mismatch.');
    const overview = asObject(p.overview);
    const categories = asObject(p.categories);
    const packageSize = asObject(p.packageSize);
    const docs = asObject(p.documentation);
    const api = asObject(p.apiReference);
    const compatibility = asObject(p.compatibility);
    const engine = asObject(compatibility.engine);
    const security = asObject(p.security);
    const versions = asObject(p.versions);
    const distribution = asObject(p.distribution);
    const media = asObject(p.media);
    const community = asObject(p.community);
    const support = asObject(p.support);
    const business = asObject(p.business);
    if (!isText(overview.summary) || !isText(overview.description) || !stringList(overview.features) ||
        !isText(categories.primary) || !isText(categories.taxonomyContract) ||
        !(categories.subcategory === null || isText(categories.subcategory)) ||
        !stringList(categories.secondary) || !stringList(p.tags) ||
        !Array.isArray(api.functions) || api.functions.length > 250 ||
        !api.functions.every(f => isObject(f) && isText(f.module) && isText(f.symbol) &&
            isText(f.summary) && isText(f.returns) && Array.isArray(f.parameters) &&
            f.parameters.length <= 50 && f.parameters.every(param => isObject(param) &&
                isText(param.name) && isText(param.type) && isText(param.description))) ||
        !Array.isArray(p.examples) || p.examples.length > 250 ||
        !p.examples.every(e => isObject(e) && isText(e.title) && isText(e.description) &&
            isText(e.module) && isText(e.symbol)) ||
        !Array.isArray(p.dependencies) || p.dependencies.length > 128 ||
        !p.dependencies.every(dep => isObject(dep) && isText(dep.id) && isText(dep.version) &&
            typeof dep.manifestSha256 === 'string' && SHA.test(dep.manifestSha256)) ||
        !isText(engine.id) || !isText(engine.starlarkVersion) || !isText(engine.registryVersion) ||
        !Number.isInteger(engine.protocol) || !stringList(compatibility.platforms) ||
        security.authority !== 'blackwhi-registry' || !Array.isArray(security.declaredCapabilities) ||
        !stringList(security.requestedPermissions) ||
        distribution.channel !== 'blackwhi-registry' || !isText(distribution.filename) ||
        !isText(community.contributions) || typeof community.reviewsManagedByStore !== 'boolean' ||
        !isText(support.model) || !safeLinks(support.contactLinks) ||
        !isText(business.model) || !isText(business.distribution) ||
        !isText(business.licenseExpression) || !safeLinks(business.externalServices) ||
        !safeLinks(p.links) || !safeLinks(media.videos))
        invalid('Malformed or unsafe FIT editorial content.');

    const requiredAssets = new Map<string, { path: string; sha256: string; bytes: number }>();
    const requireAsset = (raw: unknown, kind: 'docs' | 'assets'): void => {
        const descriptor = assetDescriptor(raw, kind);
        const existing = requiredAssets.get(descriptor.path);
        if (existing && (existing.sha256 !== descriptor.sha256 || existing.bytes !== descriptor.bytes))
            invalid('Conflicting FIT asset descriptors.');
        requiredAssets.set(descriptor.path, descriptor);
    };
    for (const name of ['readme', 'quickStart', 'changelog', 'licenseText']) requireAsset(docs[name], 'docs');
    if (docs.apiGuide !== null && docs.apiGuide !== undefined) requireAsset(docs.apiGuide, 'docs');
    requireAsset(versions.releaseNotes, 'docs');
    requireAsset(business.licenseDocument, 'docs');
    if (media.icon !== null) requireAsset(media.icon, 'assets');
    if (media.cover !== null) requireAsset(media.cover, 'assets');
    for (const key of ['screenshots', 'diagrams']) {
        if (!Array.isArray(media[key]) || media[key].length > 12) invalid('Invalid FIT media gallery.');
        for (const asset of media[key]) requireAsset(asset, 'assets');
    }
    const licenseA = assetDescriptor(docs.licenseText, 'docs');
    const licenseB = assetDescriptor(business.licenseDocument, 'docs');
    if (licenseA.path !== licenseB.path || licenseA.sha256 !== licenseB.sha256 || licenseA.bytes !== licenseB.bytes)
        invalid('License resource mismatch.');
    const expected: Record<string, boolean> = {
        publisher: true, license: true, links: (p.links as unknown[]).length > 0,
        support: support.model !== 'none', icon: media.icon !== null
    };
    if (!Object.entries(expected).every(([key, supplied]) =>
        statuses[key] === 'provided' ? supplied : !supplied)) invalid('Misleading editorial field status.');

    const documents: Record<string, string> = {};
    const verified: Array<{ path: string; bytes: Uint8Array }> = [];
    let sum = 0; let docBytes = 0;
    for (const descriptor of requiredAssets.values()) {
        const file = selected.get(descriptor.path);
        if (!file || file.size !== descriptor.bytes) invalid(`Missing or changed editorial asset: ${descriptor.path}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        sum += bytes.byteLength;
        if (sum > MAX_TOTAL) invalid('FIT editorial assets exceed the preview size limit.');
        const digest = bytesHex(await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource));
        if (digest !== descriptor.sha256) invalid(`SHA-256 mismatch for ${descriptor.path}`);
        if (descriptor.path.startsWith('docs/')) {
            docBytes += bytes.byteLength;
            try { documents[descriptor.path] = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
            catch { return invalid(`Invalid UTF-8 documentation: ${descriptor.path}`); }
        }
        verified.push({ path: descriptor.path, bytes });
    }
    if (!Number.isInteger(packageSize.downloadBytes) || (packageSize.downloadBytes as number) < 1 ||
        packageSize.documentationBytes !== docBytes || packageSize.mediaBytes !== sum - docBytes ||
        packageSize.contentFootprintBytes !== (packageSize.downloadBytes as number) + sum ||
        !Number.isInteger(packageSize.unpackedBytes) || !Number.isInteger(packageSize.entryCount))
        invalid('Editorial asset size totals do not match the signed release profile.');
    const assetUrls: Record<string, string> = {};
    try {
        for (const item of verified) {
            const ext = item.path.toLowerCase();
            const mime = ext.endsWith('.png') ? 'image/png' : ext.endsWith('.jpg') || ext.endsWith('.jpeg')
                ? 'image/jpeg' : ext.endsWith('.webp') ? 'image/webp' : 'text/plain;charset=UTF-8';
            assetUrls[item.path] = URL.createObjectURL(new Blob([item.bytes as BlobPart], { type: mime }));
        }
    } catch (error) {
        for (const url of Object.values(assetUrls)) URL.revokeObjectURL(url);
        throw error;
    }
    return { profile: p as unknown as FitProfile, documents, assetUrls };
}

export function releaseLocalFitPreview(preview: LocalFitEditorialPreview): void {
    for (const url of Object.values(preview.assetUrls)) URL.revokeObjectURL(url);
}
