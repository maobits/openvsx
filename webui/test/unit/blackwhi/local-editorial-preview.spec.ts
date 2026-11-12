/* Copyright (c) 2026 Contributors to the Eclipse Foundation. SPDX-License-Identifier: EPL-2.0 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { File } from 'node:buffer';
import {
    loadLocalFitEditorialPreview,
    releaseLocalFitPreview
} from '../../../src/blackwhi/fit/local-editorial-preview';
import type { FitStoreProduct } from '../../../src/blackwhi/fit/live-catalog';

const ID = 'com.blackwhi.std.validation.core';
const VERSION = '0.1.0';
const PACKAGE_SHA = 'a'.repeat(64);
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
const docs = {
    'docs/README.md': '# Validation Core',
    'docs/QUICKSTART.md': 'Run the package',
    'docs/RELEASE_NOTES.md': 'Release 0.1.0',
    'docs/LICENSE.md': 'Apache License'
};
const documentAsset = (path: keyof typeof docs) => ({
    path,
    sha256: digest(docs[path]),
    bytes: Buffer.byteLength(docs[path])
});
const sizeOfDocs = Object.values(docs).reduce((n, value) => n + Buffer.byteLength(value), 0);
const product = {
    contract: 'blackwhi.store.catalog.product.v1',
    productId: ID,
    artifactType: 'fit-package',
    publisherNamespace: 'com.blackwhi',
    displayName: 'Validation Core',
    registryRelease: {
        contract: 'blackwhi.fit.registry.catalog.v1',
        packageId: ID,
        version: VERSION,
        sha256: PACKAGE_SHA,
        state: 'published',
        publishedAt: '2026-11-12T01:00:00Z'
    }
} as FitStoreProduct;

function draft() {
    return {
        contract: 'blackwhi.fit.product.profile.v2',
        release: { packageId: ID, version: VERSION, artifactSha256: PACKAGE_SHA },
        editorial: {
            state: 'review-required',
            fieldStatus: {
                publisher: 'provided',
                links: 'not-provided',
                support: 'not-applicable',
                license: 'provided',
                icon: 'not-provided'
            },
            rightsReview: {
                reviewer: null,
                reviewedDate: null,
                publisherAuthorized: false,
                licenseTextReviewed: false,
                redistributionRightsConfirmed: false
            }
        },
        identity: {
            displayName: 'Validation Core',
            publisherName: 'BlackWhi / Maobits',
            publisherNamespace: 'com.blackwhi',
            productType: 'fit-application'
        },
        overview: { summary: 'Twelve predicates', description: 'Validates FIT types.', features: ['Twelve functions'] },
        categories: {
            primary: 'development-tools',
            subcategory: 'software-libraries',
            secondary: [],
            taxonomyContract: 'blackwhi.fit.taxonomy.v1'
        },
        tags: ['fit'],
        packageSize: {
            downloadBytes: 6886,
            unpackedBytes: 6160,
            entryCount: 5,
            documentationBytes: sizeOfDocs,
            mediaBytes: 0,
            contentFootprintBytes: 6886 + sizeOfDocs
        },
        documentation: {
            readme: documentAsset('docs/README.md'),
            quickStart: documentAsset('docs/QUICKSTART.md'),
            changelog: documentAsset('docs/RELEASE_NOTES.md'),
            licenseText: documentAsset('docs/LICENSE.md'),
            apiGuide: null
        },
        apiReference: { functions: [], notApplicableReason: 'No API' },
        examples: [],
        dependencies: [],
        compatibility: {
            engine: { id: 'starlark-rust', starlarkVersion: '0.14.2', registryVersion: '0.4.8', protocol: 1 },
            platforms: ['blackwhi-cli']
        },
        security: { authority: 'blackwhi-registry', declaredCapabilities: [], requestedPermissions: [] },
        versions: { releaseNotes: documentAsset('docs/RELEASE_NOTES.md') },
        distribution: { channel: 'blackwhi-registry', filename: `${ID}-${VERSION}.fitpkg` },
        media: { icon: null, cover: null, screenshots: [], diagrams: [], videos: [] },
        links: [],
        community: { contributions: 'not-provided', reviewsManagedByStore: true },
        support: { model: 'none', contactLinks: [] },
        business: {
            model: 'free-open-source',
            distribution: 'free',
            licenseExpression: 'Apache-2.0',
            licenseDocument: documentAsset('docs/LICENSE.md'),
            externalServices: []
        }
    };
}
function chosenFiles(profile: object, overrides: Record<string, string> = {}, skip: string[] = []): globalThis.File[] {
    const input = { 'fit-product.json': JSON.stringify(profile), ...docs, ...overrides };
    return Object.entries(input)
        .filter(([name]) => !skip.includes(name))
        .map(([name, content]) => {
            const file = new File([content], name.split('/').at(-1)!, { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: `editorial-candidate/${name}` });
            return file as unknown as globalThis.File;
        });
}

beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: vi.fn((_blob: Blob) => `blob:local-${Math.random()}`)
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe('STORE-03 local-only FIT editorial preview (no public approval)', () => {
    it('renders a matching unapproved draft only after checking local document digests', async () => {
        const preview = await loadLocalFitEditorialPreview(chosenFiles(draft()), product);
        expect(preview.profile.identity.displayName).toBe('Validation Core');
        expect(preview.documents['docs/LICENSE.md']).toBe('Apache License');
        expect(Object.keys(preview.assetUrls)).toHaveLength(4);
        expect(preview.profile.editorial?.state).toBe('review-required');
        releaseLocalFitPreview(preview);
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(4);
    });
    it('rejects a profile bound to a different Registry release artifact', async () => {
        const modified = draft();
        modified.release.artifactSha256 = 'b'.repeat(64);
        await expect(loadLocalFitEditorialPreview(chosenFiles(modified), product)).rejects.toThrow(/SHA-256/);
    });
    it('rejects altered documentation even when the draft metadata is unchanged', async () => {
        await expect(
            loadLocalFitEditorialPreview(
                chosenFiles(draft(), {
                    'docs/README.md': '# Tampered and changed'
                }),
                product
            )
        ).rejects.toThrow(/asset|SHA-256/i);
    });
    it('rejects missing license text', async () => {
        await expect(
            loadLocalFitEditorialPreview(chosenFiles(draft(), {}, ['docs/LICENSE.md']), product)
        ).rejects.toThrow(/Missing or changed/);
    });
    it('rejects a claimed approval instead of transporting it as public content', async () => {
        const modified = draft();
        modified.editorial.state = 'approved';
        await expect(loadLocalFitEditorialPreview(chosenFiles(modified), product)).rejects.toThrow(/review-required/);
    });
    it('rejects a draft pretending that redistribution has been approved', async () => {
        const modified = draft();
        modified.editorial.rightsReview.redistributionRightsConfirmed = true;
        await expect(loadLocalFitEditorialPreview(chosenFiles(modified), product)).rejects.toThrow(/review-required/);
    });
});
