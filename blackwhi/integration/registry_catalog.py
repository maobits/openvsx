#!/usr/bin/env python3
# SPDX-License-Identifier: EPL-2.0
"""STORE-00.3: preview-only, read-only contract boundary to BlackWhi FIT Registry.

This is a diagnostic adapter for contract assurance, NOT a production Store
backend. The Open VSX Spring application does not call this helper at runtime.
No tokens, package download, installation, side effects, database writes,
redirections, FIT execution, or authorization decisions are performed here.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import json
import re
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

CONTRACT = 'blackwhi.fit.registry.catalog.v1'
ALLOWED_ORIGIN = 'http://127.0.0.1:43181'
CATALOG_URL = f'{ALLOWED_ORIGIN}/fit-registry/v1/catalog'
MAX_BYTES = 96 * 1024
ID = re.compile(r'^[a-z][a-z0-9.-]{1,120}$')
VER = re.compile(r'^[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}(?:-[0-9A-Za-z.-]{1,40})?$')
SHA = re.compile(r'^[a-f0-9]{64}$')
ROOT_FIELDS = {'contract', 'releases', 'readOnly'}
RELEASE_FIELDS = {'id', 'version', 'title', 'state', 'sha256', 'publishedAt'}


class ContractDenied(ValueError):
    """Fail-closed response. Do not print raw remote content or exception text."""


def _fail() -> None:
    raise ContractDenied('FIT_STORE_REGISTRY_CONTRACT_DENIED')


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            _fail()
        result[key] = value
    return result


def _timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not (20 <= len(value) <= 40):
        return False
    if not (value.endswith('Z') or re.search(r'[+-]\d{2}:\d{2}$', value)):
        return False
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.tzinfo is not None and parsed.utcoffset() is not None
    except ValueError:
        return False


def validate_catalog(raw: bytes) -> list[dict[str, Any]]:
    """Parse the exact public release contract; reject extensions and duplicates."""
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        _fail()
    try:
        document = json.loads(raw.decode('utf-8'), object_pairs_hook=_unique_object)
    except (ValueError, UnicodeDecodeError, TypeError):
        _fail()
    if not isinstance(document, dict) or set(document) != ROOT_FIELDS:
        _fail()
    if document['contract'] != CONTRACT or document['readOnly'] is not True:
        _fail()
    releases = document['releases']
    if not isinstance(releases, list) or len(releases) > 50:
        _fail()
    checked = []
    seen = set()
    for item in releases:
        if not isinstance(item, dict) or set(item) != RELEASE_FIELDS:
            _fail()
        pkg_id, ver, title, state, digest, published = (item[x] for x in
            ('id', 'version', 'title', 'state', 'sha256', 'publishedAt'))
        if (not isinstance(pkg_id, str) or not ID.fullmatch(pkg_id) or '..' in pkg_id or
            not isinstance(ver, str) or not VER.fullmatch(ver) or
            not isinstance(title, str) or not 1 <= len(title) <= 160 or
            any(ord(character) < 32 or ord(character) == 127 for character in title) or
            state not in ('published', 'deprecated') or
            not isinstance(digest, str) or not SHA.fullmatch(digest) or
            not _timestamp(published)):
            _fail()
        if (pkg_id, ver) in seen:
            _fail()
        seen.add((pkg_id, ver))
        checked.append(dict(item))
    return checked


def release_refs(releases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Project only public references, not security approvals or publishers."""
    return [{
        'contract': CONTRACT,
        'packageId': release['id'],
        'version': release['version'],
        'sha256': release['sha256'],
        'state': release['state'],
        'publishedAt': release['publishedAt'],
    } for release in releases]


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request: Request, fp: Any, code: int,
                         msg: str, headers: Any, newurl: str) -> None:
        return None


def fetch_preview_catalog(origin: str = ALLOWED_ORIGIN) -> list[dict[str, Any]]:
    """Read only a fixed loopback origin and route; no implicit proxy or redirects."""
    if origin != ALLOWED_ORIGIN:
        _fail()
    request = Request(CATALOG_URL, headers={'Accept': 'application/json'}, method='GET')
    # Disable ambient http_proxy and redirects to prevent a local probe being
    # forwarded to a different host through user shell configuration.
    from urllib.request import ProxyHandler
    opener = build_opener(ProxyHandler({}), _NoRedirect())
    try:
        with opener.open(request, timeout=3) as response:
            if response.getcode() != 200:
                _fail()
            content_type = response.headers.get('Content-Type', '').split(';', 1)[0].strip().lower()
            if content_type != 'application/json':
                _fail()
            raw = response.read(MAX_BYTES + 1)
    except (HTTPError, URLError, TimeoutError, OSError):
        _fail()
    return release_refs(validate_catalog(raw))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Read-only local Registry catalog compatibility probe')
    parser.add_argument('--probe-local', action='store_true', help='Probe fixed http://127.0.0.1:43181')
    args = parser.parse_args(argv)
    if not args.probe_local:
        parser.print_help()
        return 0
    try:
        refs = fetch_preview_catalog()
    except ContractDenied:
        print(json.dumps({'status': 'DENIED', 'code': 'FIT_STORE_REGISTRY_CONTRACT_DENIED'}))
        return 7
    # Expose no secret, binary or private field.
    print(json.dumps({'status': 'PASS', 'contract': CONTRACT, 'count': len(refs),
                      'releaseRefs': refs}, separators=(',', ':')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
