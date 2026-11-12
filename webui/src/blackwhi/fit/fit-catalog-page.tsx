/* BlackWhi Store - real FIT catalog page (STORE-01.5.2).
 * SPDX-License-Identifier: EPL-2.0
 * No simulated products, account, purchase, installation, or permissions.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FitCatalogError, fetchLiveFitCatalog, type FitStoreCatalog } from './live-catalog';
import { fitDetailPath } from './product-detail';
import './fit-catalog.css';

type Language = 'es' | 'en';
type Theme = 'dark' | 'light';
type LoadState =
    | { kind: 'loading' }
    | { kind: 'success'; catalog: FitStoreCatalog }
    | { kind: 'error'; code: string; status: number };

const copy = {
    es: {
        label: 'BLACKWHI STORE',
        subtitle: 'Catálogo público FIT · Integración real de desarrollo',
        heading: 'Programas FIT publicados',
        description:
            'Productos consultados a BlackWhi v2 mediante Spring y el FIT Registry. Esta vista no instala ni ejecuta paquetes.',
        search: 'Buscar por título o identificador',
        refresh: 'Actualizar desde el Registry',
        all: 'Todos',
        published: 'Publicado',
        deprecated: 'Obsoleto',
        loading: 'Consultando el FIT Registry…',
        empty: 'No hay releases públicos en esta ventana del Registry.',
        noMatch: 'Ningún producto coincide con la búsqueda.',
        failed: 'No se pudo obtener un catálogo verificado.',
        retry: 'Reintentar',
        version: 'Versión',
        publishedAt: 'Publicado el',
        digest: 'SHA-256 del artefacto',
        group: 'Agrupación visible (no certifica identidad del publicador)',
        limited: 'Cobertura actual: últimos 50 releases; no representa necesariamente el catálogo completo.',
        trust: 'La ficha es informativa: no acredita una firma válida, autorización de instalación ni ejecución segura.',
        footer: 'Versión de integración en desarrollo. Instalación, compra y publicación deshabilitadas hasta las validaciones pertinentes.',
        disconnected: 'Sin conexión con la API de Store.',
        disabled: 'La conexión del FIT Registry no está configurada.',
        invalid: 'La respuesta del Registry no satisface el contrato.',
        outage: 'El FIT Registry no está disponible.'
    },
    en: {
        label: 'BLACKWHI STORE',
        subtitle: 'Public FIT catalog · Real development integration',
        heading: 'Published FIT programs',
        description:
            'Products retrieved from BlackWhi v2 through Spring and the FIT Registry. This view cannot install or execute packages.',
        search: 'Search by title or identifier',
        refresh: 'Refresh from Registry',
        all: 'All',
        published: 'Published',
        deprecated: 'Deprecated',
        loading: 'Contacting FIT Registry…',
        empty: 'No public releases in this Registry window.',
        noMatch: 'No products match your search.',
        failed: 'Unable to retrieve a verified catalog.',
        retry: 'Retry',
        version: 'Version',
        publishedAt: 'Published at',
        digest: 'Artifact SHA-256',
        group: 'Display grouping (does not verify publisher identity)',
        limited: 'Coverage: latest 50 releases; this may not include the full catalog.',
        trust: 'This listing is informational: it does not certify a valid signature, installation permission, or safe execution.',
        footer: 'Development integration. Installation, purchase and publishing disabled until the necessary checks pass.',
        disconnected: 'Store API connection failed.',
        disabled: 'FIT Registry connection is not configured.',
        invalid: 'Registry response failed contract validation.',
        outage: 'FIT Registry is unavailable.'
    }
} as const;

function errorMessage(code: string, lang: Language): string {
    const t = copy[lang];
    switch (code) {
        case 'FIT_REGISTRY_NOT_CONFIGURED':
            return t.disabled;
        case 'FIT_REGISTRY_INVALID_RESPONSE':
        case 'STORE_RESPONSE_INVALID':
            return t.invalid;
        case 'FIT_REGISTRY_UNAVAILABLE':
            return t.outage;
        default:
            return t.disconnected;
    }
}

export function BlackWhiFitCatalogPage() {
    const [language, setLanguage] = useState<Language>('es');
    const [theme, setTheme] = useState<Theme>('dark');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'deprecated'>('all');
    const [refresh, setRefresh] = useState(0);
    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const t = copy[language];
    const retry = useCallback(() => setRefresh(value => value + 1), []);

    useEffect(() => {
        const controller = new AbortController();
        setState({ kind: 'loading' });
        fetchLiveFitCatalog(controller.signal).then(
            catalog => {
                if (!controller.signal.aborted) setState({ kind: 'success', catalog });
            },
            error => {
                if (!controller.signal.aborted)
                    setState({
                        kind: 'error',
                        code: error instanceof FitCatalogError ? error.code : 'STORE_API_ERROR',
                        status: error instanceof FitCatalogError ? error.status : 0
                    });
            }
        );
        return () => controller.abort();
    }, [refresh]);

    const displayed = useMemo(() => {
        if (state.kind !== 'success') return [];
        const term = search.trim().toLocaleLowerCase();
        return state.catalog.products.filter(
            item =>
                (statusFilter === 'all' || item.registryRelease.state === statusFilter) &&
                (!term || `${item.displayName} ${item.productId}`.toLocaleLowerCase().includes(term))
        );
    }, [state, search, statusFilter]);

    return (
        <div className={`blackwhi-fit-page blackwhi-fit-${theme}`}>
            <header className='blackwhi-fit-header'>
                <a href='/blackwhi/fit' className='blackwhi-fit-wordmark' aria-label='BlackWhi Store'>
                    <img src={`/blackwhi/brand/blackwhi-${theme === 'dark' ? 'white' : 'black'}.png`} alt='BlackWhi' />
                    <strong>STORE</strong>
                </a>
                <nav aria-label='Language and appearance'>
                    <button
                        type='button'
                        onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
                        aria-label={language === 'es' ? 'Switch to English' : 'Cambiar a español'}>
                        {language.toUpperCase()}
                    </button>
                    <button
                        type='button'
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
                        {theme === 'dark' ? '☼' : '◐'}
                    </button>
                </nav>
            </header>
            <main className='blackwhi-fit-container'>
                <div className='blackwhi-fit-overline'>{t.subtitle}</div>
                <div className='blackwhi-fit-title-row'>
                    <div>
                        <h1>{t.heading}</h1>
                        <p>{t.description}</p>
                    </div>
                    <div className='blackwhi-fit-emblem' aria-hidden='true'>
                        <img src={`/blackwhi/brand/fit-${theme === 'dark' ? 'white' : 'black'}.png`} alt='' />
                    </div>
                </div>
                <div className='blackwhi-fit-toolbar'>
                    <label className='blackwhi-fit-search'>
                        <span className='sr-only'>{t.search}</span>
                        <input
                            value={search}
                            onChange={event => setSearch(event.target.value)}
                            placeholder={t.search}
                            type='search'
                        />
                    </label>
                    <label className='blackwhi-fit-filter'>
                        <span className='sr-only'>Status</span>
                        <select
                            value={statusFilter}
                            onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
                            <option value='all'>{t.all}</option>
                            <option value='published'>{t.published}</option>
                            <option value='deprecated'>{t.deprecated}</option>
                        </select>
                    </label>
                    <button type='button' className='blackwhi-fit-refresh' onClick={retry}>
                        ↻ {t.refresh}
                    </button>
                </div>
                {state.kind === 'loading' && (
                    <p role='status' className='blackwhi-fit-message'>
                        {t.loading}
                    </p>
                )}
                {state.kind === 'error' && (
                    <section role='alert' className='blackwhi-fit-message blackwhi-fit-error'>
                        <strong>{t.failed}</strong>
                        <p>{errorMessage(state.code, language)}</p>
                        <code>
                            {state.code}
                            {state.status ? ` · HTTP ${state.status}` : ''}
                        </code>
                        <button type='button' onClick={retry}>
                            {t.retry}
                        </button>
                    </section>
                )}
                {state.kind === 'success' && (
                    <>
                        <p className='blackwhi-fit-hint' role='status'>
                            {t.limited}
                        </p>
                        {state.catalog.products.length === 0 ? (
                            <p className='blackwhi-fit-message'>{t.empty}</p>
                        ) : displayed.length === 0 ? (
                            <p className='blackwhi-fit-message'>{t.noMatch}</p>
                        ) : (
                            <div className='blackwhi-fit-grid'>
                                {displayed.map(product => {
                                    const release = product.registryRelease;
                                    return (
                                        <article className='blackwhi-fit-card' key={product.productId}>
                                            <span className={`blackwhi-fit-status ${release.state}`}>
                                                {release.state === 'published' ? t.published : t.deprecated}
                                            </span>
                                            <h2>
                                                <a
                                                    className='bw-fit-card-link'
                                                    href={fitDetailPath(product.productId, release.version)}>
                                                    {product.displayName} ↗
                                                </a>
                                            </h2>
                                            <p className='blackwhi-fit-id'>{product.productId}</p>
                                            <dl>
                                                <dt>{t.version}</dt>
                                                <dd>{release.version}</dd>
                                                <dt>{t.publishedAt}</dt>
                                                <dd>{new Date(release.publishedAt).toLocaleDateString(language)}</dd>
                                                <dt>{t.group}</dt>
                                                <dd>{product.publisherNamespace}</dd>
                                                <dt>{t.digest}</dt>
                                                <dd className='blackwhi-fit-hash'>{release.sha256}</dd>
                                            </dl>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                        <p className='blackwhi-fit-hint'>{t.trust}</p>
                    </>
                )}
            </main>
            <footer className='blackwhi-fit-footer'>
                {t.footer}
                <br />© BlackWhi · Eclipse Open VSX fork (EPL-2.0)
            </footer>
        </div>
    );
}
