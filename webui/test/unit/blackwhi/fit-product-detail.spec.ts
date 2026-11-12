/* SPDX-License-Identifier: EPL-2.0 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeFitProductDetail, fetchFitProductDetail, fitDetailPath,
    fitResourceEndpoint } from '../../../src/blackwhi/fit/product-detail';

const id = 'org.blackwhi.examples.packaged.volume';
const version = '1.0.0';
const sha = 'a'.repeat(64);
const product = { contract: 'blackwhi.store.catalog.product.v1', productId: id,
    artifactType: 'fit-package', displayName: 'Volume', publisherNamespace: 'org.blackwhi',
    registryRelease: { contract: 'blackwhi.fit.registry.catalog.v1', packageId: id,
        version, sha256: sha, state: 'published', publishedAt: '2026-11-09T02:00:00Z' }
};
const minimum = { contract: 'blackwhi.store.fit.product.detail.v1', readOnly: true,
    coverage: 'latest-50-releases', product, profileStatus: 'not-provided', profile: {} };
// The v2 BFF resolves an exact published release, not the legacy 50-release window.
const exact = { ...minimum, contract: 'blackwhi.store.fit.product.detail.v2',
    coverage: 'exact-release' };
const asset = (path: string) => ({ path, sha256: 'b'.repeat(64), bytes: 128 });
const complete = { ...minimum, profileStatus: 'complete', profile: {
    contract: 'blackwhi.fit.product.profile.v1',
    release: { packageId: id, version, artifactSha256: sha },
    identity: { displayName: 'Volume', publisherName: 'BlackWhi', publisherNamespace: 'org.blackwhi', productType: 'fit-application' },
    overview: { summary: 'Real release', description: 'Actual documentation only.', features: ['Calculates volume'] },
    categories: { primary: 'development-tools', subcategory: null, secondary: [], taxonomyContract: 'blackwhi.fit.taxonomy.v1' },
    tags: ['volume'], packageSize: { downloadBytes: 500, unpackedBytes: 900, entryCount: 3,
        documentationBytes: 500, mediaBytes: 128, contentFootprintBytes: 1128 },
    documentation: { readme: asset('docs/README.md'), quickStart: asset('docs/QUICKSTART.md'),
        changelog: asset('docs/CHANGELOG.md'), licenseText: asset('docs/LICENSE.md') },
    apiReference: { functions: [], notApplicableReason: 'Not applicable here' }, examples: [], dependencies: [],
    compatibility: { engine: { id: 'rust', starlarkVersion: 'v1', protocol: 1, registryVersion: 'v1' }, platforms: ['blackwhi-cli'] },
    security: { authority: 'blackwhi-registry', declaredCapabilities: [], requestedPermissions: [] },
    versions: { releaseNotes: asset('docs/CHANGELOG.md') }, distribution: { channel: 'blackwhi-registry', filename: id + '-1.0.0.fitpkg' },
    media: { icon: asset('assets/icon.png'), cover: null, screenshots: [], diagrams: [], videos: [] },
    links: [], community: { contributions: 'closed', reviewsManagedByStore: true },
    support: { model: 'community', contactLinks: [] },
    business: { model: 'educational', distribution: 'free', licenseExpression: 'MIT',
        licenseDocument: asset('docs/LICENSE.md'), externalServices: [] }
} };

describe('STORE-02 FIT detail transport', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('uses a same-origin API and validates IDs before building routes', () => {
        expect(fitDetailPath(id, version)).toBe(`/fit-package/${id}/versions/${version}`);
        expect(fitResourceEndpoint(id, version, 'docs/README.md')).toContain('/api/blackwhi/fit/v2/products/');
        expect(fitResourceEndpoint(id, version, 'docs/README.md')).toContain('?path=docs%2FREADME.md');
        expect(() => fitDetailPath('../secret', version)).toThrow();
        expect(() => fitResourceEndpoint(id, version, 'docs/../secret.md')).toThrow();
        expect(() => fitResourceEndpoint(id, version, 'assets/evil.svg')).toThrow();
    });
    it('decodes the legacy v1 envelope only for compatibility, not as exact v2 coverage', () => {
        expect(decodeFitProductDetail(minimum, id, version).coverage).toBe('latest-50-releases');
        expect(decodeFitProductDetail(exact, id, version).coverage).toBe('exact-release');
        expect(() => decodeFitProductDetail({ ...minimum, coverage: 'exact-release' }, id, version)).toThrow();
    });
    it('accepts Registry release with no editorial profile; never fabricates a profile', () => {
        expect(decodeFitProductDetail(minimum, id, version).profileStatus).toBe('not-provided');
        expect(() => decodeFitProductDetail({ ...minimum, profile: { verified: true } }, id, version)).toThrow();
    });
    it('accepts digest-bound 18-section profile', () => {
        expect(decodeFitProductDetail(complete, id, version).profileStatus).toBe('complete');
    });
    it('rejects profile bound to another artifact and claims added to profile', () => {
        expect(() => decodeFitProductDetail({ ...complete, profile: { ...complete.profile,
            release: { ...complete.profile.release, artifactSha256: 'c'.repeat(64) } } }, id, version)).toThrow();
        expect(() => decodeFitProductDetail({ ...complete, profile: { ...complete.profile,
            verified: true } }, id, version)).toThrow();
        expect(() => decodeFitProductDetail({ ...complete, profile: { ...complete.profile,
            links: [{ kind: 'support', label: 'Unsafe', url: 'javascript:alert(1)' }] } }, id, version)).toThrow();
        expect(() => decodeFitProductDetail({ ...complete, profile: { ...complete.profile,
            documentation: { ...complete.profile.documentation, readme: asset('docs/../key.md') } } }, id, version)).toThrow();
    });
    it('fetches only through the Store Spring BFF with no credentials', async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(exact),
            { status: 200, headers: { 'content-type': 'application/json' } }));
        vi.stubGlobal('fetch', fetcher);
        await expect(fetchFitProductDetail(id, version)).resolves.toMatchObject({
            contract: 'blackwhi.store.fit.product.detail.v2', coverage: 'exact-release',
            profileStatus: 'not-provided'
        });
        expect(fetcher).toHaveBeenCalledWith(`/api/blackwhi/fit/v2/products/${id}/versions/${version}`,
            expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'error',
                cache: 'no-store', headers: { Accept: 'application/json' } }));
    });
    it('rejects a legacy limited-window payload returned by the exact v2 transport', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(minimum),
            { status: 200, headers: { 'content-type': 'application/json' } })));
        await expect(fetchFitProductDetail(id, version)).rejects.toMatchObject({ code: 'STORE_DETAIL_INVALID' });
    });
    it('refuses HTML errors and invalid JSON from upstream', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad</html>',
            { status: 500, headers: { 'content-type': 'text/html' } })));
        await expect(fetchFitProductDetail(id, version)).rejects.toMatchObject({ code: 'STORE_DETAIL_INVALID' });
    });
});

describe('STORE-03.3 FIT v2 compatibility (native Open VSX)', () => {
    const v2 = {
        ...complete,
        profile: {
            ...complete.profile,
            contract: 'blackwhi.fit.product.profile.v2',
            media: { ...complete.profile.media, icon: null },
            links: [],
            support: { model: 'none', contactLinks: [] },
            editorial: {
                state: 'approved',
                fieldStatus: { publisher: 'provided', links: 'not-provided', support: 'not-applicable',
                    license: 'provided', icon: 'not-provided' },
                rightsReview: { reviewer: 'Fixture operator', reviewedDate: '2026-11-09',
                    publisherAuthorized: true, licenseTextReviewed: true, redistributionRightsConfirmed: true }
            }
        }
    };
    it('accepts approved v2 without optional icon or support links', () => {
        expect(decodeFitProductDetail(v2, id, version).profileStatus).toBe('complete');
    });
    it('blocks draft, revoked rights and misleading missing-field status', () => {
        expect(() => decodeFitProductDetail({ ...v2, profile: { ...v2.profile,
            editorial: { ...v2.profile.editorial, state: 'review-required' } } }, id, version)).toThrow();
        expect(() => decodeFitProductDetail({ ...v2, profile: { ...v2.profile,
            editorial: { ...v2.profile.editorial,
                rightsReview: { ...v2.profile.editorial.rightsReview, redistributionRightsConfirmed: false } } } }, id, version)).toThrow();
        expect(() => decodeFitProductDetail({ ...v2, profile: { ...v2.profile,
            editorial: { ...v2.profile.editorial,
                fieldStatus: { ...v2.profile.editorial.fieldStatus, icon: 'provided' } } } }, id, version)).toThrow();
    });
});
