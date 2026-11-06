"""STORE-01.1 contract/structural verification without server or database."""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / 'server/src/main/java/org/eclipse/openvsx/blackwhi/catalog'


class NativeFitProductModelTests(unittest.TestCase):
    def test_existing_registry_catalog_contract_remains_intact(self):
        wire = json.loads((ROOT / 'blackwhi/contracts/registry-public-wire.v1.schema.json').read_text())
        self.assertEqual(wire['properties']['contract']['const'], 'blackwhi.fit.registry.catalog.v1')
        self.assertEqual(wire['properties']['readOnly']['const'], True)
        self.assertEqual(set(wire['required']), {'contract', 'readOnly', 'releases'})

    def test_original_store_product_contract_remains_intact(self):
        product = json.loads((ROOT / 'blackwhi/contracts/store-product.v1.schema.json').read_text())
        self.assertEqual(product['properties']['artifactType']['const'], 'fit-package')
        self.assertEqual(product['properties']['contract']['const'], 'blackwhi.store.catalog.product.v1')

    def test_native_model_contains_no_authorization_claim(self):
        sources = '\n'.join(p.read_text() for p in MODEL.glob('*.java'))
        self.assertIn('NOT an install permit', sources)
        self.assertIn('DISPLAY GROUPINGS', sources)
        self.assertNotIn('verifySignature(', sources)
        self.assertNotIn('@RestController', sources)
        self.assertNotIn('@Entity', sources)

    def test_original_vsix_processor_remains_present(self):
        path = ROOT / 'server/src/main/java/org/eclipse/openvsx/ExtensionProcessor.java'
        self.assertTrue(path.is_file())
        text = path.read_text()
        self.assertIn('extension.vsixmanifest', text)
        self.assertIn('extension/package.json', text)

    def test_fixture_is_exact_v1_wire_shape(self):
        document = json.loads((ROOT / 'blackwhi/fixtures/catalog.versions.valid.json').read_text())
        self.assertEqual(set(document), {'contract', 'readOnly', 'releases'})
        self.assertIs(document['readOnly'], True)
        self.assertEqual(len(document['releases']), 2)
        fields = {'id', 'version', 'title', 'state', 'sha256', 'publishedAt'}
        for release in document['releases']:
            self.assertEqual(set(release), fields)
            self.assertTrue(re.fullmatch('[a-f0-9]{64}', release['sha256']))

    def test_java_unit_tests_present(self):
        test = ROOT / 'server/src/test/java/org/eclipse/openvsx/blackwhi/catalog/RegistryCatalogProjectionTest.java'
        self.assertIn('@Test', test.read_text())
        self.assertTrue((ROOT / 'blackwhi/tests/java/NativeCatalogSmoke.java').is_file())


if __name__ == '__main__':
    unittest.main()
