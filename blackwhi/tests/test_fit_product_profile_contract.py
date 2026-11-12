"""FIT-01 read-side schema tests. Does not imply a deployed profile endpoint."""
from __future__ import annotations
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
CONTRACTS=ROOT/'blackwhi/contracts'
SECTIONS={'identity','overview','categories','tags','packageSize','documentation',
          'apiReference','examples','dependencies','compatibility','security',
          'versions','distribution','media','links','community','support','business'}

class FitProductProfileSchemaTests(unittest.TestCase):
    def test_18_sections_required(self):
        schema=json.loads((CONTRACTS/'fit-product-profile.v1.schema.json').read_text())
        self.assertEqual(set(schema['required'])-{'contract','release'}, SECTIONS)
        self.assertEqual(schema['properties']['contract']['const'],'blackwhi.fit.product.profile.v1')
        self.assertFalse(schema['additionalProperties'])
        self.assertIn('artifactSha256',schema['properties']['release']['required'])
    def test_security_has_no_issuer_or_verification_claims(self):
        schema=json.loads((CONTRACTS/'fit-product-profile.v1.schema.json').read_text())
        security=schema['properties']['security']
        self.assertFalse(security['additionalProperties'])
        self.assertEqual(security['properties']['authority']['const'],'blackwhi-registry')
        self.assertNotIn('verified',security['properties'])
        self.assertNotIn('signer',security['properties'])
    def test_taxonomy_keys_unique_and_versioned(self):
        data=json.loads((CONTRACTS/'fit-taxonomy.v1.json').read_text())
        self.assertEqual(data['contract'],'blackwhi.fit.taxonomy.v1')
        ids=[item['id'] for item in data['categories']]
        self.assertEqual(len(ids),len(set(ids)))
        self.assertIn('health-fitness',ids)
        fitness=next(x for x in data['categories'] if x['id']=='health-fitness')
        self.assertIn('strength-training',[x['id'] for x in fitness['subcategories']])
    def test_existing_openvsx_contract_unchanged(self):
        old=json.loads((CONTRACTS/'store-product.v1.schema.json').read_text())
        self.assertEqual(old['properties']['contract']['const'],'blackwhi.store.catalog.product.v1')
        self.assertEqual(old['properties']['artifactType']['const'],'fit-package')
    def test_schema_is_well_formed_if_optional_validator_is_installed(self):
        try: import jsonschema
        except ImportError: self.skipTest('Optional schema validation tool unavailable')
        jsonschema.Draft202012Validator.check_schema(
            json.loads((CONTRACTS/'fit-product-profile.v1.schema.json').read_text()))

if __name__=='__main__':unittest.main()
