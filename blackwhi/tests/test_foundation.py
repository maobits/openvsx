# Copyright (c) 2026 BlackWhi contributors.
# SPDX-License-Identifier: EPL-2.0
"""BlackWhi Store STORE-00.2: offline contract and provenance gate."""
import hashlib
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
BW = ROOT / 'blackwhi'


class FoundationTests(unittest.TestCase):
    def test_license_and_notice_remain(self):
        self.assertIn('Eclipse Public License', (ROOT / 'LICENSE').read_text(encoding='utf-8'))
        self.assertIn('Eclipse Open VSX', (ROOT / 'NOTICE.md').read_text(encoding='utf-8'))

    def test_upstream_components_exist(self):
        for name in ['server/build.gradle', 'webui/package.json', 'cli/package.json']:
            with self.subTest(name=name):
                self.assertTrue((ROOT / name).is_file())

    def test_provenance_has_valid_commit_and_unmodified_notices(self):
        doc = json.loads((BW / 'UPSTREAM_PROVENANCE.json').read_text(encoding='utf-8'))
        self.assertEqual(doc['contract'], 'blackwhi.store.fork.provenance.v1')
        self.assertRegex(doc['upstreamCommit'], r'^[0-9a-f]{40}$')
        for key in ['LICENSE', 'NOTICE.md']:
            digest = hashlib.sha256((ROOT / key).read_bytes()).hexdigest()
            self.assertEqual(doc['upstreamFileHashes'][key], digest)

    def test_store_product_schema_has_finite_known_artifact_type(self):
        schema = json.loads((BW / 'contracts/store-product.v1.schema.json').read_text(encoding='utf-8'))
        self.assertEqual(schema['properties']['artifactType']['const'], 'fit-package')
        self.assertEqual(schema['properties']['contract']['const'], 'blackwhi.store.catalog.product.v1')
        self.assertFalse(schema['additionalProperties'])
        self.assertIn('registryRelease', schema['required'])

    def test_release_ref_is_not_authorization(self):
        schema = json.loads((BW / 'contracts/registry-release-ref.v1.schema.json').read_text(encoding='utf-8'))
        self.assertFalse(schema['additionalProperties'])
        self.assertEqual(schema['properties']['contract']['const'], 'blackwhi.fit.registry.catalog.v1')
        self.assertNotIn('canExecute', schema['properties'])
        self.assertNotIn('installToken', schema['properties'])


if __name__ == '__main__':
    unittest.main()
