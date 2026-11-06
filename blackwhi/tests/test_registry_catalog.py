# SPDX-License-Identifier: EPL-2.0
"""Offline STORE-00.3 security/compatibility contract tests."""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from blackwhi.integration.registry_catalog import (
    ALLOWED_ORIGIN, CATALOG_URL, CONTRACT, ContractDenied,
    fetch_preview_catalog, release_refs, validate_catalog,
)

FIXTURE = Path(__file__).resolve().parents[1] / 'fixtures' / 'catalog.valid.json'


def fixture():
    return json.loads(FIXTURE.read_text(encoding='utf-8'))


def serialize(obj):
    return json.dumps(obj, separators=(',', ':')).encode()


class PublicCatalogContractTests(TestCase):
    def test_accepts_real_nestjs_wire_shape(self):
        releases = validate_catalog(serialize(fixture()))
        self.assertEqual(len(releases), 1)
        self.assertEqual(releases[0]['id'], 'org.blackwhi.examples.strength')

    def test_projects_legacy_package_id_without_claiming_signature_approval(self):
        refs = release_refs(validate_catalog(serialize(fixture())))
        self.assertEqual(refs[0]['packageId'], fixture()['releases'][0]['id'])
        self.assertEqual(refs[0]['contract'], CONTRACT)
        self.assertNotIn('trusted', refs[0])
        self.assertNotIn('publisherNamespace', refs[0])
        self.assertNotIn('installApproved', refs[0])

    def test_rejects_wrong_contract(self):
        obj = fixture(); obj['contract'] = 'blackwhi.fit.registry.catalog.v2'
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))

    def test_rejects_extra_private_fields(self):
        obj = fixture(); obj['releases'][0]['publisherToken'] = 'secret'
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))

    def test_rejects_duplicate_json_keys(self):
        with self.assertRaises(ContractDenied):
            validate_catalog(b'{"contract":1,"contract":2,"readOnly":true,"releases":[]}')

    def test_rejects_false_read_only(self):
        obj = fixture(); obj['readOnly'] = False
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))

    def test_rejects_duplicate_release(self):
        obj = fixture(); obj['releases'].append(deepcopy(obj['releases'][0]))
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))

    def test_rejects_bad_digest(self):
        obj = fixture(); obj['releases'][0]['sha256'] = 'f' * 63
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))

    def test_rejects_unauthorized_state(self):
        obj = fixture(); obj['releases'][0]['state'] = 'yanked'
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))

    def test_rejects_missing_datetime_zone(self):
        obj = fixture(); obj['releases'][0]['publishedAt'] = '2026-11-06T12:00:00'
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))

    def test_rejects_more_than_50_results(self):
        obj = fixture(); obj['releases'] = [dict(obj['releases'][0], id=f'org.blackwhi.p{x}') for x in range(51)]
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))

    def test_rejects_payload_over_limit(self):
        with self.assertRaises(ContractDenied): validate_catalog(b'{' + b'a' * 100_000)

    def test_refuses_network_outside_fixed_local_preview(self):
        for origin in ('https://open-vsx.org', 'http://127.0.0.1:43182',
                       'http://localhost:43181', 'http://127.0.0.1:43181/other'):
            with self.subTest(origin=origin), self.assertRaises(ContractDenied):
                fetch_preview_catalog(origin)

    def test_catalog_uri_is_only_public_read_endpoint(self):
        self.assertEqual(CATALOG_URL, ALLOWED_ORIGIN + '/fit-registry/v1/catalog')

    def test_schema_matches_actual_wire_contract(self):
        root = Path(__file__).resolve().parents[1]
        wire = json.loads((root / 'contracts' / 'registry-public-wire.v1.schema.json').read_text())
        release = wire['properties']['releases']['items']
        self.assertEqual(set(wire['required']), {'contract', 'readOnly', 'releases'})
        self.assertEqual(set(release['required']), {'id', 'version', 'title', 'state', 'sha256', 'publishedAt'})
        self.assertEqual(wire['properties']['contract']['const'], CONTRACT)

class PreviewProbeTests(TestCase):
    class Response:
        def __init__(self, status=200, content_type='application/json', raw=None):
            self.status = status
            self.headers = {'Content-Type': content_type}
            self.raw = raw or serialize(fixture())
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def getcode(self): return self.status
        def read(self, size): return self.raw[:size]

    def test_local_preview_get_is_public_and_read_only(self):
        class Opener:
            def open(self, request, timeout):
                assert timeout == 3
                assert request.full_url == CATALOG_URL
                assert request.get_method() == 'GET'
                assert not request.has_header('Authorization')
                return PreviewProbeTests.Response()
        with patch('blackwhi.integration.registry_catalog.build_opener', return_value=Opener()):
            refs = fetch_preview_catalog()
        self.assertEqual(len(refs), 1)

    def test_fails_closed_on_non_json_response(self):
        class Opener:
            def open(self, request, timeout):
                return PreviewProbeTests.Response(content_type='text/html')
        with patch('blackwhi.integration.registry_catalog.build_opener', return_value=Opener()):
            with self.assertRaises(ContractDenied): fetch_preview_catalog()

    def test_fails_closed_on_non_200_response(self):
        class Opener:
            def open(self, request, timeout):
                return PreviewProbeTests.Response(status=307)
        with patch('blackwhi.integration.registry_catalog.build_opener', return_value=Opener()):
            with self.assertRaises(ContractDenied): fetch_preview_catalog()

    def test_rejects_control_characters_in_title(self):
        obj = fixture(); obj['releases'][0]['title'] = 'evil\nHeader: injected'
        with self.assertRaises(ContractDenied): validate_catalog(serialize(obj))
