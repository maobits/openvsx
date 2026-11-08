/* BlackWhi Store - FIT catalog transport and strict browser-side contract.
 * SPDX-License-Identifier: EPL-2.0
 * No static products, local fixtures, installation, or direct Registry credentials.
 */
export const FIT_STORE_API = '/api/blackwhi/fit/v1/products';

export interface FitStoreRelease {
    contract: 'blackwhi.fit.registry.catalog.v1';
    packageId: string;
    version: string;
    sha256: string;
    state: 'published' | 'deprecated';
    publishedAt: string;
}

export interface FitStoreProduct {
    contract: 'blackwhi.store.catalog.product.v1';
    productId: string;
    artifactType: 'fit-package';
    displayName: string;
    publisherNamespace: string;
    registryRelease: FitStoreRelease;
}

export interface FitStoreCatalog {
    contract: 'blackwhi.store.fit.products.v1';
    readOnly: true;
    sourceContract: 'blackwhi.fit.registry.catalog.v1';
    coverage: 'latest-50-releases';
    returnedCount: number;
    products: FitStoreProduct[];
}

export class FitCatalogError extends Error {
    public readonly code: string;
    public readonly status: number;
    constructor(code: string, status: number) {
        super(code);
        this.code = code;
        this.status = status;
    }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const ID = /^[a-z][a-z0-9.-]{1,120}$/;
const VERSION = /^[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function decodeFitCatalog(input: unknown): FitStoreCatalog {
    if (!isObject(input) || input.contract !== 'blackwhi.store.fit.products.v1' ||
        input.readOnly !== true || input.sourceContract !== 'blackwhi.fit.registry.catalog.v1' ||
        input.coverage !== 'latest-50-releases' || !Array.isArray(input.products) ||
        !Number.isInteger(input.returnedCount) || input.returnedCount !== input.products.length ||
        input.products.length > 50) {
        throw new FitCatalogError('STORE_RESPONSE_INVALID', 502);
    }
    for (const entry of input.products) {
        if (!isObject(entry) || entry.contract !== 'blackwhi.store.catalog.product.v1' ||
            !isString(entry.productId) || !ID.test(entry.productId) ||
            entry.artifactType !== 'fit-package' || !isString(entry.displayName) ||
            !entry.displayName.trim() || entry.displayName.length > 160 ||
            !isString(entry.publisherNamespace) || !entry.publisherNamespace ||
            !entry.productId.startsWith(entry.publisherNamespace) ||
            !isObject(entry.registryRelease)) {
            throw new FitCatalogError('STORE_RESPONSE_INVALID', 502);
        }
        const release = entry.registryRelease;
        if (release.contract !== 'blackwhi.fit.registry.catalog.v1' ||
            release.packageId !== entry.productId || !isString(release.version) ||
            !VERSION.test(release.version) || !isString(release.sha256) ||
            !SHA256.test(release.sha256) ||
            (release.state !== 'published' && release.state !== 'deprecated') ||
            !isString(release.publishedAt) || !Number.isFinite(Date.parse(release.publishedAt))) {
            throw new FitCatalogError('STORE_RESPONSE_INVALID', 502);
        }
    }
    return input as unknown as FitStoreCatalog;
}

export async function fetchLiveFitCatalog(signal?: AbortSignal): Promise<FitStoreCatalog> {
    let response: Response;
    try {
        response = await fetch(FIT_STORE_API, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new FitCatalogError('STORE_API_UNREACHABLE', 0);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
        throw new FitCatalogError('STORE_RESPONSE_INVALID', response.status);
    }
    // A bounded public endpoint. Read as text to limit the response even for faulty proxies.
    const body = await response.text();
    if (body.length > 90_000) throw new FitCatalogError('STORE_RESPONSE_INVALID', response.status);
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        throw new FitCatalogError('STORE_RESPONSE_INVALID', response.status);
    }
    if (!response.ok) {
        const code = isObject(parsed) && parsed.contract === 'blackwhi.store.fit.error.v1' &&
            isString(parsed.code) && /^[A-Z_]{3,64}$/.test(parsed.code)
            ? parsed.code : 'STORE_API_ERROR';
        throw new FitCatalogError(code, response.status);
    }
    return decodeFitCatalog(parsed);
}
