/* BlackWhi Store - native FIT legal evidence contract regression tests.
 * SPDX-License-Identifier: EPL-2.0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeRegistryLegalManifest, fetchRegistryLegalManifest, registryLegalDocumentEndpoint } from '../../../../src/blackwhi/fit/registry-legal-evidence';

const ID = 'org.maobits.my-first-training-app';
const VERSION = '1.0.1';
const SHA = 'a'.repeat(64);
const legal = () => ({
    contract: 'blackwhi.store.fit.legal.public.v1',
    source: 'blackwhi-fit-registry',
    readOnly: true,
    id: ID,
    version: VERSION,
    artifactSha256: SHA,
    manifestSha256: 'b'.repeat(64),
    licenseExpression: 'MIT',
    businessModel: 'free-open-source',
    distribution: 'free',
    publisherOrigin: 'third-party',
    independentlyRightsReviewed: true,
    documents: [
        { key: 'application-license', sha256: 'c'.repeat(64), bytes: 123 },
        { key: 'third-party-notices', sha256: 'd'.repeat(64), bytes: 567 }
    ]
});

afterEach(() => vi.unstubAllGlobals());
describe('Registry-reviewed legal evidence on native FIT product pages', () => {
    it('accepts a bounded exact-release public sidecar', () => {
        expect(decodeRegistryLegalManifest(legal(), ID, VERSION, SHA).licenseExpression).toBe('MIT');
    });
    it('accepts explicit publisher self-review but never invents independent review', () => {
        expect(decodeRegistryLegalManifest({ ...legal(), independentlyRightsReviewed: false,
            reviewMode: 'single-maintainer' }, ID, VERSION, SHA))
            .toMatchObject({ independentlyRightsReviewed: false, reviewMode: 'single-maintainer' });
        expect(() => decodeRegistryLegalManifest({ ...legal(), independentlyRightsReviewed: true,
            reviewMode: 'single-maintainer' }, ID, VERSION, SHA)).toThrow();
    });
    it('rejects an artifact SHA mismatch', () => {
        expect(() => decodeRegistryLegalManifest({ ...legal(), artifactSha256: 'e'.repeat(64) }, ID, VERSION, SHA)).toThrow();
    });
    it('rejects unreviewed or extra-field claims', () => {
        expect(() => decodeRegistryLegalManifest({ ...legal(), independentlyRightsReviewed: false }, ID, VERSION, SHA)).toThrow();
        expect(() => decodeRegistryLegalManifest({ ...legal(), approvedForInstall: true }, ID, VERSION, SHA)).toThrow();
    });
    it('rejects missing, reordered or repeated documents', () => {
        const doc = legal().documents;
        expect(() => decodeRegistryLegalManifest({ ...legal(), documents: doc.slice(0, 1) }, ID, VERSION, SHA)).toThrow();
        expect(() => decodeRegistryLegalManifest({ ...legal(), documents: [...doc].reverse() }, ID, VERSION, SHA)).toThrow();
        expect(() => decodeRegistryLegalManifest({ ...legal(), documents: [doc[0], doc[0], doc[1]] }, ID, VERSION, SHA)).toThrow();
    });
    it('rejects path injection, oversized content and invalid SHA', () => {
        expect(() => registryLegalDocumentEndpoint(ID, VERSION, '../secret')).toThrow();
        expect(() => decodeRegistryLegalManifest({ ...legal(), documents: [
            { ...legal().documents[0], bytes: 65536 }, legal().documents[1]
        ] }, ID, VERSION, SHA)).toThrow();
        expect(() => decodeRegistryLegalManifest({ ...legal(), manifestSha256: 'not-a-sha' }, ID, VERSION, SHA)).toThrow();
    });
    it('encodes dependency document keys without moving away from native same-origin routes', () => {
        const url = registryLegalDocumentEndpoint(ID, VERSION, 'dependency-license:org.blackwhi.math@1.0.0');
        expect(url).toMatch(/^\/api\/blackwhi\/fit\/v2\/products\//);
        expect(url).toContain('dependency-license%3Aorg.blackwhi.math%401.0.0');
    });
    it('treats 404 as absence, not approved evidence', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
        expect(await fetchRegistryLegalManifest(ID, VERSION, SHA)).toBeNull();
    });
    it('fails closed on errors or corrupt responses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('service unavailable', { status: 503 })));
        await expect(fetchRegistryLegalManifest(ID, VERSION, SHA)).rejects.toThrow();
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...legal(), artifactSha256: 'b'.repeat(64) }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        })));
        await expect(fetchRegistryLegalManifest(ID, VERSION, SHA)).rejects.toThrow();
    });
});
