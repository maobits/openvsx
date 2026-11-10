"""STORE-03.3: additive FIT product-profile v2 schema contract, v1 immutable."""
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
CONTRACTS=ROOT/'blackwhi/contracts'

class SchemaV2Tests(unittest.TestCase):
    def test_new_v2_contract_retains_18_sections_plus_editorial_control(self):
        schema=json.loads((CONTRACTS/'fit-product-profile.v2.schema.json').read_text())
        v1=json.loads((CONTRACTS/'fit-product-profile.v1.schema.json').read_text())
        self.assertEqual(schema['properties']['contract']['const'],'blackwhi.fit.product.profile.v2')
        self.assertEqual(schema['required'],v1['required']+['editorial'])
        self.assertFalse(schema['additionalProperties'])
    def test_optional_metadata_not_mandatory_but_rights_still_mandatory_when_approved(self):
        p=json.loads((CONTRACTS/'fit-product-profile.v2.schema.json').read_text())['properties']
        self.assertEqual(p['links']['minItems'],0)
        self.assertEqual(p['support']['properties']['contactLinks']['minItems'],0)
        self.assertIn('none',p['support']['properties']['model']['enum'])
        self.assertIn('approved',p['editorial']['properties']['state']['enum'])
        self.assertEqual(p['editorial']['properties']['rightsReview']['properties']['redistributionRightsConfirmed']['type'],'boolean')
    def test_jsonschema_is_valid_and_approval_gate_defined(self):
        try: import jsonschema
        except ImportError: self.skipTest('optional jsonschema not installed')
        schema=json.loads((CONTRACTS/'fit-product-profile.v2.schema.json').read_text())
        jsonschema.Draft202012Validator.check_schema(schema)
        self.assertTrue(schema['allOf'])
if __name__=='__main__':unittest.main()
