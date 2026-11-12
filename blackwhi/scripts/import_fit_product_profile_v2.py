#!/usr/bin/env python3
"""STORE-03.3: operator-reviewed, immutable FIT-02 profile import (no Registry writes).

Requires BlackWhi v2 FIT-02 validator and detached operator review evidence. The operator must supply a workspace
containing fit-product.json, a canonical .fitpkg, docs/, assets/, and taxonomy.
No user-generated data is published by this command without FIT-01 verification.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

MAX_PROFILE = 256 * 1024
MAX_PACKAGE = 2 * 1024 * 1024
DEFAULT_V2 = Path.home() / 'Documentos/ingenieria/proyectos/blackwhi/blackwhi-v2'
DEFAULT_STORE = Path.home() / '.local/state/blackwhi-store/fit-profiles-v1'

class ImportErrorSafe(Exception):
    """Public error-code only, no credentials or arbitrary exceptions."""

def deny(code: str):
    raise ImportErrorSafe(code)

def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def regular_under(root: Path, relative: str, maximum: int) -> bytes:
    if not relative or relative.startswith('/') or '\\' in relative or any(
            part in ('', '.', '..') for part in relative.split('/')):
        deny('UNSAFE_RELATIVE_PATH')
    file = root / relative
    current = root
    for part in relative.split('/'):
        current = current / part
        if current.is_symlink(): deny('SYMLINK_FORBIDDEN')
    if not file.is_file() or file.stat().st_size > maximum:
        deny('FILE_MISSING_OR_OVERSIZED')
    raw = file.read_bytes()
    if len(raw) > maximum: deny('FILE_OVERSIZED')
    return raw

def assets_in(profile: dict) -> dict[str, dict]:
    found: dict[str, dict] = {}
    def walk(value):
        if isinstance(value, dict):
            if set(value) == {'path', 'sha256', 'bytes'}:
                path = value['path']
                if not isinstance(path, str) or not re.fullmatch(
                        r'(?:docs|assets)/[A-Za-z0-9._/-]{1,208}', path):
                    deny('ASSET_PATH_INVALID')
                if path in found and found[path] != value: deny('ASSET_CONFLICT')
                found[path] = value
            else:
                for sub in value.values(): walk(sub)
        elif isinstance(value, list):
            for sub in value: walk(sub)
    walk(profile)
    return found

def load_validator(root: Path):
    path = root / 'tools/fit/fit_product_profile_v2.py'
    if not path.is_file(): deny('FIT02_VALIDATOR_MISSING')
    spec = importlib.util.spec_from_file_location('blackwhi_fit02_store03_import', path)
    if spec is None or spec.loader is None: deny('FIT02_VALIDATOR_MISSING')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def unique_json(pairs):
    result = {}
    for key, value in pairs:
        if key in result: deny('REVIEW_DUPLICATE_KEY')
        result[key] = value
    return result


def validate_detached_review(args, workspace, profile, profile_raw):
    # Self-written profile flags are not sufficient for local ingestion.
    # This separate, privileged operator checkpoint is an attestation, NOT a cryptographic signature.
    path = args.review_file
    if path is None: deny('DETACHED_REVIEW_FILE_REQUIRED')
    if not path.is_absolute(): deny('REVIEW_FILE_MUST_BE_ABSOLUTE')
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 16000:
        deny('REVIEW_FILE_INVALID')
    real = path.resolve(strict=True)
    if workspace == real or workspace in real.parents or args.v2_root.resolve() in real.parents:
        deny('REVIEW_FILE_MUST_BE_SEPARATE')
    try:
        review = json.loads(real.read_bytes(), object_pairs_hook=unique_json)
    except (UnicodeError, ValueError, OSError):
        deny('REVIEW_FILE_INVALID')
    mandatory = {'contract','packageId','version','artifactSha256','profileSha256',
                 'reviewer','reviewedDate','publisherAuthorized','licenseTextReviewed',
                 'redistributionRightsConfirmed','evidenceReferences'}
    if not isinstance(review,dict) or set(review)!=mandatory or \
        review['contract']!='blackwhi.fit.operator-review.v1' or \
        review['packageId']!=profile['release']['packageId'] or \
        review['version']!=profile['release']['version'] or \
        review['artifactSha256']!=profile['release']['artifactSha256'] or \
        review['profileSha256']!=sha(profile_raw) or \
        review['reviewer']!=profile['editorial']['rightsReview']['reviewer'] or \
        review['reviewedDate']!=profile['editorial']['rightsReview']['reviewedDate'] or \
        not all(review[f] is True for f in ('publisherAuthorized','licenseTextReviewed',
                                            'redistributionRightsConfirmed')) or \
        not isinstance(review['evidenceReferences'],list) or not review['evidenceReferences'] or \
        not all(isinstance(v,str) and 8<=len(v)<=400 and '\x00' not in v
                for v in review['evidenceReferences']):
        deny('DETACHED_REVIEW_NOT_AUTHORIZED_OR_UNBOUND')


def prepare(args):
    workspace = args.workspace.expanduser().resolve(strict=True)
    if not workspace.is_dir() or workspace.is_symlink(): deny('INVALID_WORKSPACE')
    root = args.v2_root.expanduser().resolve(strict=True)
    if not root.is_dir(): deny('BLACKWHI_V2_ROOT_MISSING')
    validator = load_validator(root)
    try:
        result = validator.verify(args.profile, args.package, str(workspace))
    except (validator.ProfileError, OSError, ValueError):
        deny('FIT02_VALIDATION_FAILED')
    if result.get('contract') != 'blackwhi.fit.product.profile.v2' or \
            result.get('editorialState') != 'approved' or result.get('profileComplete') is not True:
        deny('APPROVED_EDITORIAL_PROFILE_REQUIRED')
    profile_raw = regular_under(workspace, args.profile, MAX_PROFILE)
    package_raw = regular_under(workspace, args.package, MAX_PACKAGE)
    profile = json.loads(profile_raw)
    validate_detached_review(args, workspace, profile, profile_raw)
    if sha(package_raw) != result['artifactSha256']:
        deny('PACKAGE_CHANGED_AFTER_VALIDATION')
    assets = assets_in(profile)
    contents = {'profile.json': profile_raw}
    total = 0
    for path, entry in assets.items():
        raw = regular_under(workspace, path, 2 * 1024 * 1024)
        if sha(raw) != entry['sha256'] or len(raw) != entry['bytes']:
            deny('ASSET_CHANGED_AFTER_VALIDATION')
        total += len(raw)
        if total > 10 * 1024 * 1024: deny('SIDECAR_EXCEEDS_BUDGET')
        contents[path] = raw
    return result, contents

def target_directory(args, result):
    root = args.store_data.expanduser()
    if not root.is_absolute(): deny('STORE_DATA_MUST_BE_ABSOLUTE')
    root = root.resolve()
    return root / result['packageId'] / result['version']

def matches(path: Path, contents: dict[str, bytes]) -> bool:
    if path.is_symlink() or not path.is_dir(): return False
    actual = {}
    for item in path.rglob('*'):
        if item.is_symlink(): return False
        if item.is_file():
            actual[str(item.relative_to(path))] = item
    if set(actual) != set(contents): return False
    return all(actual[key].stat().st_size == len(content) and
               sha(actual[key].read_bytes()) == sha(content)
               for key, content in contents.items())

def execute(args):
    result, files = prepare(args)
    target = target_directory(args, result)
    print('STORE-03.3 — REVIEWED FIT-02 PROFILE IMPORT')
    print('PACKAGE:', result['packageId'])
    print('VERSION:', result['version'])
    print('ARTIFACT SHA-256:', result['artifactSha256'])
    print('PROFILE FILES:', len(files))
    if target.exists() or target.is_symlink():
        if not matches(target, files): deny('EXISTING_PROFILE_CONFLICT')
        print('ALREADY_INSTALLED: PASS')
        return
    if args.diagnose:
        print('DIAGNOSIS: READY (approved profile + detached operator review, no writes)')
        return
    if args.verify or args.rollback:
        deny('PROFILE_NOT_INSTALLED')
    if not args.confirm_operator_review:
        deny('EXPLICIT_OPERATOR_REVIEW_CONFIRMATION_REQUIRED')
    root = args.store_data.expanduser().resolve()
    # The target root must remain outside the software repositories.
    if args.v2_root.expanduser().resolve() in root.parents or args.workspace.expanduser().resolve() in root.parents:
        deny('STORE_DATA_MUST_BE_EXTERNAL')
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.fit-profile-stage-', dir=target.parent) as folder:
        stage = Path(folder) / 'new'
        stage.mkdir()
        for name, data in files.items():
            dest = stage / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        if not matches(stage, files): deny('STAGING_VERIFICATION_FAILED')
        if target.exists(): deny('CONCURRENT_PROFILE_CONFLICT')
        stage.rename(target)
    print('IMPORT_APPLIED: PASS')
    print('SPRING PROFILE ROOT:', root)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    for name in ('diagnose', 'apply', 'verify', 'rollback'):
        mode.add_argument('--' + name, action='store_true')
    ap.add_argument('--v2-root', type=Path, default=DEFAULT_V2)
    ap.add_argument('--workspace', type=Path, required=True)
    ap.add_argument('--profile', default='fit-product.json')
    ap.add_argument('--package', required=True)
    ap.add_argument('--store-data', type=Path, default=DEFAULT_STORE)
    ap.add_argument('--review-file', type=Path, help='Privileged detached review attestation outside workspace')
    ap.add_argument('--confirm-operator-review', action='store_true', help='Required for --apply; does not replace an actual rights review')
    args = ap.parse_args(argv)
    try:
        if args.rollback:
            result, contents = prepare(args)
            target = target_directory(args, result)
            if not matches(target, contents): deny('ROLLBACK_REFUSED_PROFILE_CHANGED')
            for key in contents:
                (target / key).unlink()
            for folder in sorted((d for d in target.rglob('*') if d.is_dir()), key=lambda x: len(x.parts), reverse=True):
                folder.rmdir()
            target.rmdir()
            print('PROFILE_ROLLBACK: PASS')
        elif args.verify:
            result, contents = prepare(args)
            if not matches(target_directory(args, result), contents): deny('PROFILE_INSTALLATION_NOT_VERIFIED')
            print('PROFILE_VERIFY: PASS')
        else:
            execute(args)
    except (ImportErrorSafe, OSError, ValueError) as exc:
        code = str(exc) if isinstance(exc, ImportErrorSafe) else 'IMPORT_IO_ERROR'
        print('STORE03_IMPORT: BLOCKED · ' + code, file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
