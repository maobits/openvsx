/* BlackWhi Store - STORE-02: real FIT product profile, never an install/verification claim.
 * SPDX-License-Identifier: EPL-2.0
 */
import { useEffect, useMemo, useState } from 'react';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { FitCatalogError } from './live-catalog';
import {
    fetchFitProductDetail,
    fetchFitTextResource,
    fitResourceEndpoint,
    type FitAsset,
    type FitLink,
    type FitProfile,
    type FitProductDetail
} from './product-detail';
import './fit-catalog.css';
import './fit-product-page.css';

type State = { kind: 'loading' } | { kind: 'error'; code: string } | { kind: 'success'; value: FitProductDetail };
type DocTab = 'readme' | 'quickStart' | 'changelog' | 'licenseText' | 'apiGuide';
const md = new MarkdownIt({ html: false, linkify: false, breaks: true });
const docTabs: DocTab[] = ['readme', 'quickStart', 'changelog', 'licenseText', 'apiGuide'];
const labels: Record<DocTab, string> = {
    readme: 'README',
    quickStart: 'Quick Start',
    changelog: 'Changelog',
    licenseText: 'License',
    apiGuide: 'API Guide'
};
const sectionTitles = [
    'Overview',
    'Categories',
    'Tags',
    'Package Size',
    'Documentation',
    'API Reference',
    'Examples',
    'Dependencies',
    'Compatibility',
    'Security',
    'Versions',
    'Distribution',
    'Media Gallery',
    'Useful Links',
    'Community',
    'Support',
    'Business Model & Licensing'
];
const size = (bytes: number) =>
    bytes < 1024
        ? `${bytes} B`
        : bytes < 1048576
          ? `${(bytes / 1024).toFixed(1)} KiB`
          : `${(bytes / 1048576).toFixed(2)} MiB`;
const cap = (value: string) => value.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const documentationTabs = (profile: FitProfile) => docTabs.filter(tab => !!profile.documentation[tab]);

function Links({ entries }: { entries: FitLink[] }) {
    return (
        <div className='bw-fit-links'>
            {entries.map(item => (
                <a key={`${item.kind}:${item.url}`} href={item.url} target='_blank' rel='noopener noreferrer nofollow'>
                    <span>{item.label}</span>
                    <small>{cap(item.kind)} ↗</small>
                </a>
            ))}
        </div>
    );
}
function MarkdownDocument({ profile, id, version }: { profile: FitProfile; id: string; version: string }) {
    const [tab, setTab] = useState<DocTab>('readme');
    const [text, setText] = useState('');
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const asset = profile.documentation[tab] as FitAsset | undefined | null;
    useEffect(() => {
        if (!asset) return;
        const controller = new AbortController();
        setStatus('loading');
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
        return () => controller.abort();
    }, [id, version, asset?.path]);
    const sanitized = useMemo(() => DOMPurify.sanitize(md.render(text)), [text]);
    return (
        <>
            <div className='bw-fit-doc-tabs' role='tablist' aria-label='Documentation'>
                {documentationTabs(profile).map(key => (
                    <button
                        key={key}
                        type='button'
                        role='tab'
                        aria-selected={tab === key}
                        className={tab === key ? 'active' : ''}
                        onClick={() => setTab(key)}>
                        {labels[key]}
                    </button>
                ))}
            </div>
            {status === 'loading' ? (
                <p role='status'>Loading verified document…</p>
            ) : status === 'error' ? (
                <p role='alert'>Document integrity could not be verified.</p>
            ) : (
                <article className='bw-fit-markdown' dangerouslySetInnerHTML={{ __html: sanitized }} />
            )}
        </>
    );
}
function Panel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <section id={id} className='bw-fit-panel'>
            <h2>{title}</h2>
            {children}
        </section>
    );
}
export function BlackWhiFitProductPage({ packageId, version }: { packageId: string; version: string }) {
    const [state, setState] = useState<State>({ kind: 'loading' });
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [refresh, setRefresh] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setState({ kind: 'loading' });
        fetchFitProductDetail(packageId, version, controller.signal).then(
            value => {
                if (!controller.signal.aborted) setState({ kind: 'success', value });
            },
            error => {
                if (!controller.signal.aborted)
                    setState({
                        kind: 'error',
                        code: error instanceof FitCatalogError ? error.code : 'STORE_API_ERROR'
                    });
            }
        );
        return () => controller.abort();
    }, [packageId, version, refresh]);

    const detail = state.kind === 'success' ? state.value : null;
    const product = detail?.product;
    const profile = detail?.profileStatus === 'complete' ? (detail.profile as FitProfile) : null;
    const resource = (asset: FitAsset) => fitResourceEndpoint(packageId, version, asset.path);
    return (
        <div className={`blackwhi-fit-page blackwhi-fit-${theme} bw-fit-product-page`}>
            <header className='blackwhi-fit-header'>
                <a href='/blackwhi/fit' className='blackwhi-fit-wordmark' aria-label='BlackWhi Store catalogue'>
                    <img src={`/blackwhi/brand/blackwhi-${theme === 'dark' ? 'white' : 'black'}.png`} alt='BlackWhi' />
                    <strong>STORE</strong>
                </a>
                <nav aria-label='Navigation'>
                    <a className='bw-fit-back' href='/blackwhi/fit'>
                        ← Catalogue
                    </a>
                    <button
                        type='button'
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label='Toggle theme'>
                        {theme === 'dark' ? '☼' : '◐'}
                    </button>
                </nav>
            </header>
            <main className='blackwhi-fit-container'>
                {state.kind === 'loading' && (
                    <p className='blackwhi-fit-message' role='status'>
                        Loading real FIT release…
                    </p>
                )}
                {state.kind === 'error' && (
                    <div className='blackwhi-fit-message blackwhi-fit-error' role='alert'>
                        <h1>Product detail unavailable</h1>
                        <p>The Registry or content profile could not be verified.</p>
                        <code>{state.code}</code>
                        <button type='button' onClick={() => setRefresh(n => n + 1)}>
                            Retry
                        </button>
                    </div>
                )}
                {product && detail && (
                    <>
                        <div className='blackwhi-fit-overline'>
                            BLACKWHI FIT / {product.registryRelease.state.toUpperCase()}
                        </div>
                        <div className='bw-fit-product-hero'>
                            {profile?.media.icon && (
                                <img
                                    className='bw-fit-product-icon'
                                    src={resource(profile.media.icon)}
                                    alt={`Icon for ${profile.identity.displayName}`}
                                />
                            )}
                            <div className='bw-fit-hero-text'>
                                <h1>{profile?.identity.displayName ?? product.displayName}</h1>
                                <p className='bw-fit-hero-publisher'>
                                    {profile?.identity.publisherName ?? product.publisherNamespace}
                                    {' · '}v{product.registryRelease.version}
                                </p>
                                <p>
                                    {profile?.overview.summary ??
                                        'Published FIT release. A complete product profile has not been supplied yet.'}
                                </p>
                                {profile && (
                                    <div className='bw-fit-chips'>
                                        <span>{cap(profile.categories.primary)}</span>
                                        {profile.categories.subcategory && (
                                            <span>{cap(profile.categories.subcategory)}</span>
                                        )}
                                        <span>{cap(profile.identity.productType)}</span>
                                        <span>{size(profile.packageSize.downloadBytes)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className='bw-fit-trust-note' role='note'>
                            This page displays public Registry information and optional digest-bound documentation. It
                            is <strong>not</strong> an execution approval, signature verification or installation
                            permission.
                        </div>
                        {!profile ? (
                            <section className='blackwhi-fit-message' aria-label='Missing product content'>
                                <h2>Professional content not yet available</h2>
                                <p>
                                    The release is in the public Registry window, but its FIT-01 product profile has not
                                    been imported.
                                </p>
                                <p>
                                    No documentation, license, category, image, size or review status has been invented.
                                </p>
                                <dl className='bw-fit-facts'>
                                    <dt>Package</dt>
                                    <dd>{product.productId}</dd>
                                    <dt>Version</dt>
                                    <dd>{product.registryRelease.version}</dd>
                                    <dt>Registry state</dt>
                                    <dd>{product.registryRelease.state}</dd>
                                    <dt>Artifact digest</dt>
                                    <dd className='blackwhi-fit-hash'>{product.registryRelease.sha256}</dd>
                                </dl>
                            </section>
                        ) : (
                            <div className='bw-fit-product-layout'>
                                <nav className='bw-fit-product-sections' aria-label='Product sections'>
                                    {sectionTitles.map((title, i) => (
                                        <a href={`#fit-section-${i}`} key={title}>
                                            {title}
                                        </a>
                                    ))}
                                </nav>
                                <div className='bw-fit-product-content'>
                                    <Panel id='fit-section-0' title='Overview'>
                                        <p>{profile.overview.description}</p>
                                        <h3>Features</h3>
                                        <ul>
                                            {profile.overview.features.map(item => (
                                                <li key={item}>{item}</li>
                                            ))}
                                        </ul>
                                    </Panel>
                                    <Panel id='fit-section-1' title='Categories'>
                                        <p>
                                            <strong>{cap(profile.categories.primary)}</strong>
                                            {profile.categories.subcategory &&
                                                ` / ${cap(profile.categories.subcategory)}`}
                                        </p>
                                        {profile.categories.secondary.map(item => (
                                            <span key={item} className='bw-fit-tag'>
                                                {cap(item)}
                                            </span>
                                        ))}
                                    </Panel>
                                    <Panel id='fit-section-2' title='Tags'>
                                        <div className='bw-fit-chips'>
                                            {profile.tags.map(item => (
                                                <span key={item}>#{item}</span>
                                            ))}
                                        </div>
                                    </Panel>
                                    <Panel id='fit-section-3' title='Package Size'>
                                        <dl className='bw-fit-facts'>
                                            <dt>Download</dt>
                                            <dd>{size(profile.packageSize.downloadBytes)}</dd>
                                            <dt>Unpacked</dt>
                                            <dd>{size(profile.packageSize.unpackedBytes)}</dd>
                                            <dt>Archive entries</dt>
                                            <dd>{profile.packageSize.entryCount}</dd>
                                            <dt>Documentation</dt>
                                            <dd>{size(profile.packageSize.documentationBytes)}</dd>
                                            <dt>Media</dt>
                                            <dd>{size(profile.packageSize.mediaBytes)}</dd>
                                            <dt>Content footprint</dt>
                                            <dd>{size(profile.packageSize.contentFootprintBytes)}</dd>
                                        </dl>
                                    </Panel>
                                    <Panel id='fit-section-4' title='Documentation'>
                                        <MarkdownDocument profile={profile} id={packageId} version={version} />
                                    </Panel>
                                    <Panel id='fit-section-5' title='API Reference'>
                                        {profile.apiReference.functions.length ? (
                                            profile.apiReference.functions.map(fn => (
                                                <article className='bw-fit-function' key={`${fn.module}:${fn.symbol}`}>
                                                    <h3>
                                                        <code>{fn.symbol}()</code>
                                                    </h3>
                                                    <p>{fn.summary}</p>
                                                    <small>{fn.module}</small>
                                                    <dl className='bw-fit-facts'>
                                                        {fn.parameters.map(param => (
                                                            <div key={param.name}>
                                                                <dt>
                                                                    <code>{param.name}</code> · {param.type}
                                                                </dt>
                                                                <dd>{param.description}</dd>
                                                            </div>
                                                        ))}
                                                        <dt>Returns</dt>
                                                        <dd>{fn.returns}</dd>
                                                    </dl>
                                                </article>
                                            ))
                                        ) : (
                                            <p>{profile.apiReference.notApplicableReason}</p>
                                        )}
                                    </Panel>
                                    <Panel id='fit-section-6' title='Examples'>
                                        <div className='bw-fit-stack'>
                                            {profile.examples.map(item => (
                                                <article key={`${item.module}:${item.symbol}:${item.title}`}>
                                                    <h3>{item.title}</h3>
                                                    <p>{item.description}</p>
                                                    <code>
                                                        {item.module} → {item.symbol}()
                                                    </code>
                                                </article>
                                            ))}
                                        </div>
                                    </Panel>
                                    <Panel id='fit-section-7' title='Dependencies'>
                                        {profile.dependencies.length ? (
                                            <ul>
                                                {profile.dependencies.map(dep => (
                                                    <li key={dep.id}>
                                                        <strong>{dep.id}</strong> v{dep.version}
                                                        <small className='bw-fit-hash'>{dep.manifestSha256}</small>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p>No external FIT libraries are declared in this release.</p>
                                        )}
                                    </Panel>
                                    <Panel id='fit-section-8' title='Compatibility'>
                                        <dl className='bw-fit-facts'>
                                            <dt>Engine</dt>
                                            <dd>{profile.compatibility.engine.id}</dd>
                                            <dt>Protocol</dt>
                                            <dd>{profile.compatibility.engine.protocol}</dd>
                                            <dt>Starlark</dt>
                                            <dd>{profile.compatibility.engine.starlarkVersion}</dd>
                                            <dt>Platforms with documented support</dt>
                                            <dd>{profile.compatibility.platforms.map(cap).join(', ')}</dd>
                                        </dl>
                                    </Panel>
                                    <Panel id='fit-section-9' title='Security'>
                                        <p>Registry authority: {profile.security.authority}.</p>
                                        <dl className='bw-fit-facts'>
                                            <dt>Artifact SHA-256</dt>
                                            <dd className='blackwhi-fit-hash'>{product.registryRelease.sha256}</dd>
                                            <dt>Release state (Registry)</dt>
                                            <dd>{product.registryRelease.state}</dd>
                                            <dt>Declared capabilities</dt>
                                            <dd>{profile.security.declaredCapabilities.length}</dd>
                                            <dt>Requested permissions</dt>
                                            <dd>
                                                {profile.security.requestedPermissions.join(', ') || 'None declared'}
                                            </dd>
                                        </dl>
                                        <p className='blackwhi-fit-hint'>
                                            Publication is not proof that this browser validated a cryptographic
                                            signature.
                                        </p>
                                    </Panel>
                                    <Panel id='fit-section-10' title='Versions'>
                                        <p>
                                            Current release: <strong>{version}</strong>
                                        </p>
                                        <p>
                                            Published: {new Date(product.registryRelease.publishedAt).toLocaleString()}
                                        </p>
                                        <p>
                                            Version history will be supplied by a paginated Registry contract, not
                                            fabricated.
                                        </p>
                                        <p>
                                            Release notes:{' '}
                                            <a
                                                href={resource(profile.versions.releaseNotes)}
                                                target='_blank'
                                                rel='noopener noreferrer'>
                                                View source document ↗
                                            </a>
                                        </p>
                                    </Panel>
                                    <Panel id='fit-section-11' title='Distribution'>
                                        <dl className='bw-fit-facts'>
                                            <dt>Registry channel</dt>
                                            <dd>{profile.distribution.channel}</dd>
                                            <dt>Artifact filename</dt>
                                            <dd>{profile.distribution.filename}</dd>
                                            <dt>Release</dt>
                                            <dd>{product.registryRelease.version}</dd>
                                        </dl>
                                        <p className='blackwhi-fit-hint'>
                                            Secure download and installation require a separate, verified distribution
                                            contract.
                                        </p>
                                    </Panel>
                                    <Panel id='fit-section-12' title='Media Gallery'>
                                        {profile.media.cover && (
                                            <img
                                                className='bw-fit-cover'
                                                src={resource(profile.media.cover)}
                                                alt='Product cover'
                                            />
                                        )}
                                        <div className='bw-fit-gallery'>
                                            {[...profile.media.screenshots, ...profile.media.diagrams].map(asset => (
                                                <a
                                                    key={asset.path}
                                                    href={resource(asset)}
                                                    target='_blank'
                                                    rel='noopener noreferrer'>
                                                    <img
                                                        src={resource(asset)}
                                                        alt={`Product resource ${asset.path}`}
                                                        loading='lazy'
                                                    />
                                                </a>
                                            ))}
                                        </div>
                                        {profile.media.videos.length > 0 && <Links entries={profile.media.videos} />}
                                        {!profile.media.cover &&
                                            !profile.media.screenshots.length &&
                                            !profile.media.diagrams.length &&
                                            !profile.media.videos.length && <p>No additional media supplied.</p>}
                                    </Panel>
                                    <Panel id='fit-section-13' title='Useful Links'>
                                        <Links entries={profile.links} />
                                    </Panel>
                                    <Panel id='fit-section-14' title='Community'>
                                        <dl className='bw-fit-facts'>
                                            <dt>Contribution policy</dt>
                                            <dd>{cap(profile.community.contributions)}</dd>
                                            <dt>Reviews</dt>
                                            <dd>Managed by Store; no reviews are inferred.</dd>
                                        </dl>
                                    </Panel>
                                    <Panel id='fit-section-15' title='Support'>
                                        <p>{cap(profile.support.model)} support</p>
                                        <Links entries={profile.support.contactLinks} />
                                    </Panel>
                                    <Panel id='fit-section-16' title='Business Model & Licensing'>
                                        <dl className='bw-fit-facts'>
                                            <dt>Model</dt>
                                            <dd>{cap(profile.business.model)}</dd>
                                            <dt>Distribution terms</dt>
                                            <dd>{cap(profile.business.distribution)}</dd>
                                            <dt>License expression</dt>
                                            <dd>{profile.business.licenseExpression}</dd>
                                        </dl>
                                        <p>
                                            <a
                                                href={resource(profile.business.licenseDocument)}
                                                target='_blank'
                                                rel='noopener noreferrer'>
                                                Read the declared license document ↗
                                            </a>
                                        </p>
                                        <Links entries={profile.business.externalServices} />
                                        <p className='blackwhi-fit-hint'>
                                            Rights depend on the actual license, not the author&apos;s metadata alone.
                                        </p>
                                    </Panel>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
            <footer className='blackwhi-fit-footer'>
                BlackWhi Store · FIT editorial profile v1 · Eclipse Open VSX fork (EPL-2.0)
            </footer>
        </div>
    );
}
