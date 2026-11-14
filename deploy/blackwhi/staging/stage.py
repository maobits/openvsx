#!/usr/bin/env python3
# SPDX-License-Identifier: EPL-2.0
"""Isolated BlackWhi Store stage; uses locally built, revision-verified fork images.

No source builds, pushes, DB resets, public ingress or automatic migrations
outside the application's existing Spring Boot startup logic.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STAGE = Path(__file__).resolve().parent
COMPOSE = STAGE / "compose.yml"
REDIS_COMPOSE = STAGE / "redis.override.yml"
ELASTIC_COMPOSE = STAGE / "elasticsearch.override.yml"
FIT_PREVIEW_COMPOSE = STAGE / "fit-preview.override.yml"
COMPOSE_FILES = (COMPOSE, REDIS_COMPOSE, ELASTIC_COMPOSE, FIT_PREVIEW_COMPOSE)
ENVFILE = Path.home() / ".config/blackwhi-store/staging.env"
MANIFESTS = Path.home() / ".local/state/blackwhi-store/deploy-01"
PROJECT = "blackwhi-store-staging"
SOURCE = "https://github.com/maobits/openvsx"
SHORT_REV = re.compile(r"^[0-9a-f]{12}$")
FULL_REV = re.compile(r"^[0-9a-f]{40}$")
HEX_SECRET = re.compile(r"^[a-f0-9]{64}$")


class StageError(RuntimeError):
    """Operation refused without changing existing services."""


def run(args: list[str], *, capture: bool = True) -> str:
    result = subprocess.run(args, cwd=ROOT, check=True,
                            text=capture, capture_output=capture)
    return result.stdout.strip() if capture else ""


def verify_layout() -> None:
    for path in (*COMPOSE_FILES, STAGE / "application.yml"):
        if not path.is_file():
            raise StageError(f"Missing staging file: {path}")
    if run(["git", "rev-parse", "--show-toplevel"]) != str(ROOT):
        raise StageError(f"Wrong Git repository: {ROOT}")
    if "maobits/openvsx" not in run(["git", "remote", "get-url", "origin"]):
        raise StageError("Origin must be the BlackWhi Store fork")
    raw = COMPOSE.read_text()
    if '127.0.0.1:${BLACKWHI_STORE_PUBLIC_PORT' not in raw:
        raise StageError("Public listener is not restricted to localhost")
    if any(token in raw for token in ('5432:5432', '8080:8080', 'eclipse-openvsx/openvsx-server')):
        raise StageError("Forbidden published backend port or upstream image")


def manifests() -> list[dict]:
    if not MANIFESTS.exists():
        raise StageError("No deploy-01 manifests; build both images first")
    found = []
    for path in sorted(MANIFESTS.glob('build-*.json'),
                       key=lambda item: item.stat().st_mtime, reverse=True):
        try:
            value = json.loads(path.read_text())
        except (ValueError, OSError):
            continue
        if value.get('source') != SOURCE or not FULL_REV.fullmatch(str(value.get('revision', ''))):
            continue
        if len(value.get('images', [])) != 2:
            continue
        names = {item.get('image'): item for item in value['images']}
        revision = value['revision']
        if all(f'blackwhi-store/{name}:git-{revision[:12]}' in names for name in ('server', 'webui')):
            found.append(value)
    if not found:
        raise StageError("No complete two-image provenance manifest found")
    return found


def check_images(manifest: dict) -> str:
    revision = manifest['revision']
    if subprocess.run(['git', 'merge-base', '--is-ancestor', revision, 'HEAD'],
                      cwd=ROOT, check=False).returncode != 0:
        raise StageError(f'Image revision {revision} not contained in current branch')
    by_name = {item['image']: item for item in manifest['images']}
    for name in ('server', 'webui'):
        image = f'blackwhi-store/{name}:git-{revision[:12]}'
        raw = json.loads(run(['docker', 'image', 'inspect', image]))[0]
        labels = raw.get('Config', {}).get('Labels') or {}
        if labels.get('org.opencontainers.image.revision') != revision:
            raise StageError(f'OCI revision label mismatch: {image}')
        if labels.get('org.opencontainers.image.source') != SOURCE:
            raise StageError(f'OCI source label mismatch: {image}')
        if raw.get('Id') != by_name[image].get('image_id'):
            raise StageError(f'Image ID changed since provenance was recorded: {image}')
        print(f'[PASS] Provenance: {image}')
    return revision


def parse_env() -> dict[str, str]:
    if not ENVFILE.is_file() or ENVFILE.is_symlink():
        raise StageError(f'Private staging env file absent/unsafe: {ENVFILE}. Run --prepare')
    if ENVFILE.stat().st_mode & 0o077:
        raise StageError('Private staging env file permissions must be 0600')
    values: dict[str, str] = {}
    for line in ENVFILE.read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            raise StageError('Malformed staging env file')
        key, value = line.split('=', 1)
        if key in values:
            raise StageError(f'Duplicate staging env key: {key}')
        values[key] = value
    expected = {'BLACKWHI_STORE_DB_PASSWORD', 'BLACKWHI_STORE_IMAGE_REVISION',
                'BLACKWHI_STORE_PUBLIC_PORT'}
    if set(values) != expected:
        raise StageError('Staging env file contains missing or unexpected keys')
    if not HEX_SECRET.fullmatch(values['BLACKWHI_STORE_DB_PASSWORD']):
        raise StageError('Staging password is not a 64-char generated hex value')
    if not SHORT_REV.fullmatch(values['BLACKWHI_STORE_IMAGE_REVISION']):
        raise StageError('Invalid image revision in stage env')
    if not values['BLACKWHI_STORE_PUBLIC_PORT'].isdigit() or not (1024 <= int(values['BLACKWHI_STORE_PUBLIC_PORT']) <= 65535):
        raise StageError('Invalid stage port')
    return values


def manifest_for_env(values: dict[str, str]) -> dict:
    matches = [m for m in manifests() if m['revision'][:12] == values['BLACKWHI_STORE_IMAGE_REVISION']]
    if len(matches) != 1:
        raise StageError('Manifest for staged images is missing or ambiguous')
    return matches[0]


def compose_command(*args: str) -> list[str]:
    command = ['docker', 'compose', '--project-name', PROJECT,
               '--env-file', str(ENVFILE)]
    for config in COMPOSE_FILES:
        command += ['--file', str(config)]
    return [*command, *args]


def docker_compose(*args: str, capture: bool = False) -> str:
    return run(compose_command(*args), capture=capture)


def validate_docker() -> None:
    run(['docker', 'info', '--format', '{{.ServerVersion}}'])
    run(['docker', 'compose', 'version'])


def prepare(port: int) -> None:
    verify_layout()
    validate_docker()
    latest = manifests()[0]
    revision = check_images(latest)
    if ENVFILE.exists() or ENVFILE.is_symlink():
        values = parse_env()
        if values['BLACKWHI_STORE_IMAGE_REVISION'] != revision[:12]:
            raise StageError('Existing env pins other images; preserved unchanged. Manually review before upgrading')
        if int(values['BLACKWHI_STORE_PUBLIC_PORT']) != port:
            raise StageError('Existing env pins another port; preserved unchanged')
        print(f'[PASS] Reusing private staging configuration ({ENVFILE})')
    else:
        ENVFILE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(ENVFILE.parent, 0o700)
        env = (f'BLACKWHI_STORE_DB_PASSWORD={secrets.token_hex(32)}\n'
               f'BLACKWHI_STORE_IMAGE_REVISION={revision[:12]}\n'
               f'BLACKWHI_STORE_PUBLIC_PORT={port}\n')
        fd = os.open(ENVFILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write(env)
        print(f'[PASS] Generated private configuration ({ENVFILE}; mode 0600)')
    docker_compose('config', '--quiet', capture=True)
    print('[PASS] Compose configuration accepted (no containers started)')
    print(f'[INFO] Staging browser URL: http://127.0.0.1:{port}')


def context() -> dict[str, str]:
    verify_layout()
    validate_docker()
    values = parse_env()
    check_images(manifest_for_env(values))
    docker_compose('config', '--quiet', capture=True)
    return values


def fit_network_namespace(service: str) -> str:
    ids = docker_compose('ps', '-q', service, capture=True).splitlines()
    if len(ids) != 1:
        raise StageError(f'{service}: expected exactly one running container')
    return run(['docker', 'exec', ids[0], 'readlink', '/proc/self/ns/net'])


def verify_fit_network_namespace() -> bool:
    spring = fit_network_namespace('server')
    ids = docker_compose('ps', '-q', 'fit-loopback', capture=True).splitlines()
    if len(ids) != 1:
        return False
    loopback = run(['docker', 'exec', ids[0], 'readlink', '/proc/self/ns/net'])
    return spring == loopback


def repair_fit_loopback() -> None:
    # Only the read-only sidecar may be recreated: never replace the Spring server,
    # database, Registry, package volumes, or private credentials.
    if verify_fit_network_namespace():
        print('[PASS] FIT loopback shares the active Spring network namespace')
        return
    ids = docker_compose('ps', '-q', 'fit-loopback', capture=True).splitlines()
    if ids:
        print('[WARN] FIT loopback namespace stale; recreating sidecar only')
        docker_compose('up', '--detach', '--no-deps', '--force-recreate',
                       '--wait', '--wait-timeout', '90', 'fit-loopback')
    else:
        print('[INFO] Starting FIT loopback sidecar for active Spring namespace')
        docker_compose('up', '--detach', '--no-deps',
                       '--wait', '--wait-timeout', '90', 'fit-loopback')
    if not verify_fit_network_namespace():
        raise StageError('FIT loopback did not rejoin the current Spring network')
    print('[PASS] FIT loopback network namespace repaired')


def up() -> None:
    values = context()
    print('[INFO] Creating isolated staging project; no ports other than loopback WebUI')
    try:
        docker_compose('up', '--detach', '--wait', '--wait-timeout', '300',
                       'db', 'redis', 'elasticsearch', 'fit-upstream', 'server', 'webui')
    except subprocess.CalledProcessError:
        print('[BLOCK] Startup failed; recent server/database/UI logs follow', file=sys.stderr)
        subprocess.run(compose_command('logs', '--tail', '65', '--no-color',
                        'db', 'redis', 'elasticsearch', 'fit-upstream',
                        'fit-loopback', 'server', 'webui'),
                       cwd=ROOT, check=False)
        raise
    repair_fit_loopback()
    print(f"[PASS] Stage containers started. Visit http://127.0.0.1:{values['BLACKWHI_STORE_PUBLIC_PORT']}")


def fetch(url: str, expected: str, json_expected: bool = False) -> None:
    request = urllib.request.Request(url, headers={'User-Agent': 'BlackWhi-Stage-Smoke/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            status = response.status
            content_type = response.headers.get('Content-Type', '')
            body = response.read(512 * 1024)
    except urllib.error.HTTPError as exc:
        raise StageError(f'{url}: HTTP {exc.code}') from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise StageError(f'{url}: {exc}') from exc
    if status != 200:
        raise StageError(f'{url}: expected 200, got {status}')
    if json_expected:
        if 'json' not in content_type.lower():
            raise StageError(f'{url}: backend did not return JSON ({content_type})')
        try:
            obj = json.loads(body)
        except json.JSONDecodeError as exc:
            raise StageError(f'{url}: invalid JSON response') from exc
        if not isinstance(obj, dict) or 'error' in obj:
            raise StageError(f'{url}: unexpected JSON API response')
    elif '<html' not in body.decode(errors='ignore').lower():
        raise StageError(f'{url}: native SPA HTML missing')
    print(f'[PASS] {expected}: HTTP {status}')


def verify_fit_catalog() -> None:
    import json as _json
    values = parse_env()
    url = ('http://127.0.0.1:' + values['BLACKWHI_STORE_PUBLIC_PORT']
           + '/api/blackwhi/fit/v1/products/page?limit=25')
    request = urllib.request.Request(url,
        headers={'Accept': 'application/json', 'User-Agent': 'BlackWhi-Stage-FIT/1.0'})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            status, body = response.status, response.read(65537)
            ctype = response.headers.get('Content-Type', '')
    except (urllib.error.URLError, TimeoutError) as exc:
        raise StageError(f'FIT Registry bridge unreachable: {exc}') from exc
    if status != 200 or len(body) > 65536 or 'application/json' not in ctype.lower():
        raise StageError(f'FIT catalog invalid HTTP response: {status}')
    try:
        obj = _json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise StageError('FIT catalog invalid JSON') from exc
    if (not isinstance(obj, dict) or
        obj.get('contract') != 'blackwhi.store.fit.products.page.v1' or
        obj.get('sourceContract') != 'blackwhi.fit.registry.catalog.page.v1' or
        obj.get('readOnly') is not True or
        not isinstance(obj.get('products'), list) or
        type(obj.get('returnedCount')) is not int or
        obj['returnedCount'] != len(obj['products'])):
        raise StageError('FIT Registry contract validation failed')
    print(f"[PASS] FIT catalog via Store: HTTP 200, releases={obj['returnedCount']}")


def verify() -> None:
    values = context()
    if not verify_fit_network_namespace():
        raise StageError('FIT loopback stale; run stage.py --repair-fit')
    port = values['BLACKWHI_STORE_PUBLIC_PORT']
    origin = f'http://127.0.0.1:{port}'
    fetch(origin + '/', 'native WebUI')
    fetch(origin + '/search?category=FIT%20Packages', 'native FIT category route')
    fetch(origin + '/fit-package/org.maobits.my-first-training-app', 'FIT package detail SPA route')
    fetch(origin + '/api/-/search?query=blackwhi&size=1', 'same-origin Registry API', True)
    verify_fit_catalog()
    print('[PASS] Local staging HTTP smoke passed. Does NOT certify login, upload or production readiness.')


def down() -> None:
    context()
    docker_compose('down', '--remove-orphans')
    print('[PASS] Staging stopped; persistent volumes and private env retained')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    for name in ('diagnose', 'prepare', 'up', 'verify', 'repair-fit', 'ps', 'logs', 'down'):
        group.add_argument(f'--{name}', action='store_true')
    parser.add_argument('--port', type=int, default=43180,
                        help='localhost staging port; only for first --prepare (default 43180)')
    args = parser.parse_args()
    try:
        if args.diagnose:
            verify_layout()
            print(f'[PASS] Repository and stage layout verified: {ROOT}')
            print(f'[INFO] Private env present: {ENVFILE.exists()}')
            print('[INFO] No containers or Git files changed')
        elif args.prepare:
            if not 1024 <= args.port <= 65535:
                raise StageError('Port must be between 1024 and 65535')
            prepare(args.port)
        elif args.up:
            up()
        elif args.verify:
            verify()
        elif args.repair_fit:
            context()
            repair_fit_loopback()
            verify_fit_catalog()
        elif args.ps:
            context()
            docker_compose('ps')
        elif args.logs:
            context()
            docker_compose('logs', '--tail', '90', '--no-color')
        elif args.down:
            down()
        return 0
    except (StageError, OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(f'[BLOCK] {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
