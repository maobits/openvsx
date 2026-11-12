#!/usr/bin/env python3
"""STORE-01.5.2 acceptance probe: compares LIVE NestJS Registry and LIVE Store Spring BFF.

No fixtures, fake services, seeded objects, writes, database access or local mocks.
A catalog with zero public releases cannot establish a functional positive E2E.
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from urllib import request, error

REGISTRY_CONTRACT = 'blackwhi.fit.registry.catalog.v1'
STORE_CONTRACT = 'blackwhi.store.fit.products.v1'

class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, hdrs, newurl):
        return None


def check_origin(value: str) -> str:
    match = re.fullmatch(r'http://127\.0\.0\.1:([1-9][0-9]{1,4})', value)
    if not match or int(match.group(1)) > 65535:
        raise ValueError('Solo se admite http://127.0.0.1:<puerto> para validación local')
    return value


def live_get(origin: str, path: str) -> dict:
    req = request.Request(origin + path, method='GET', headers={
        'Accept': 'application/json', 'Accept-Encoding': 'identity', 'User-Agent': 'BlackWhi-Store-E2E/1.0'
    })
    opener = request.build_opener(NoRedirect, request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=7) as res:
            assert res.status == 200, f'HTTP {res.status}'
            if not res.headers.get('Content-Type', '').lower().startswith('application/json'):
                raise ValueError('La respuesta no es application/json')
            raw = res.read(90_001)
            if len(raw) > 90_000:
                raise ValueError('Respuesta demasiado grande')
            value = json.loads(raw)
            if not isinstance(value, dict):
                raise ValueError('Contrato JSON inválido')
            return value
    except error.HTTPError as exc:
        raise RuntimeError(f'{path}: HTTP {exc.code}') from None
    except error.URLError as exc:
        raise RuntimeError(f'{path}: servicio no disponible ({exc.reason.__class__.__name__})') from None


def semver_key(text: str):
    left, sep, right = text.partition('-')
    core = tuple(map(int, left.split('.')))
    pre = []
    for item in right.split('.') if sep else []:
        pre.append((0, int(item)) if item.isdigit() else (1, item))
    return (core, (1,) if not sep else (0, tuple(pre)))


def verify(registry: dict, store: dict) -> tuple[int, int]:
    if set(registry) != {'contract', 'readOnly', 'releases'} or registry.get('contract') != REGISTRY_CONTRACT \
            or registry.get('readOnly') is not True or not isinstance(registry.get('releases'), list):
        raise ValueError('Contrato Registry inesperado')
    if len(registry['releases']) > 50:
        raise ValueError('Límite Registry excedido')
    if store.get('contract') != STORE_CONTRACT or store.get('readOnly') is not True \
            or store.get('sourceContract') != REGISTRY_CONTRACT or store.get('coverage') != 'latest-50-releases' \
            or not isinstance(store.get('products'), list) or store.get('returnedCount') != len(store['products']):
        raise ValueError('Contrato Store inesperado')
    best = {}
    for release in registry['releases']:
        if not isinstance(release, dict) or set(release) != {'id','version','title','state','sha256','publishedAt'}:
            raise ValueError('Release Registry inválido')
        key = release['id']
        if key in best and semver_key(release['version']) == semver_key(best[key]['version']):
            raise ValueError('Releases con precedencia duplicada')
        if key not in best or semver_key(release['version']) > semver_key(best[key]['version']):
            best[key] = release
    if len(best) != len(store['products']):
        raise ValueError(f'Número de productos no coincide: Registry {len(best)}, Store {len(store["products"])}')
    observed = set()
    for product in store['products']:
        if not isinstance(product, dict) or product.get('contract') != 'blackwhi.store.catalog.product.v1' \
                or product.get('artifactType') != 'fit-package':
            raise ValueError('Producto Store inválido')
        key = product.get('productId')
        if key in observed or key not in best:
            raise ValueError('Producto sin release público correspondiente o duplicado')
        observed.add(key)
        release = best[key]
        upstream = product.get('registryRelease')
        if not isinstance(upstream, dict) or upstream != {
                'contract': REGISTRY_CONTRACT,
                'packageId': key, 'version': release['version'], 'sha256': release['sha256'],
                'state': release['state'], 'publishedAt': release['publishedAt']}:
            raise ValueError(f'Release desalineado entre Registry y Store: {key}')
        if product.get('displayName') != release['title']:
            raise ValueError(f'Título distinto: {key}')
        grouping = key.rsplit('.', 1)[0] if '.' in key else key
        if product.get('publisherNamespace') != grouping:
            raise ValueError(f'Agrupación inconsistente: {key}')
        if set(product) != {'contract','artifactType','productId','displayName','publisherNamespace','registryRelease'}:
            raise ValueError(f'Campos extra en producto: {key}')
    return len(registry['releases']), len(store['products'])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registry', type=check_origin, default='http://127.0.0.1:43181')
    parser.add_argument('--store', type=check_origin, default='http://127.0.0.1:43182')
    args = parser.parse_args()
    try:
        registry = live_get(args.registry, '/fit-registry/v1/catalog')
        store = live_get(args.store, '/api/blackwhi/fit/v1/products')
        releases, products = verify(registry, store)
    except (ValueError, RuntimeError, AssertionError, TypeError, KeyError) as exc:
        print(f'FAIL — integración real no acreditada: {exc}', file=sys.stderr)
        return 1
    if products == 0:
        print('INCONCLUSO — ambos servicios responden, pero hay 0 releases públicos reales. '
              'No se otorga PASS E2E con un catálogo vacío.', file=sys.stderr)
        return 2
    print(f'PASS E2E REAL — {releases} releases del Registry, {products} productos proyectados en Store; '
          'identidad, versión, título, estado, SHA-256 y fecha coinciden.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
