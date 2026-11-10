"""STORE-02: integration verification against real FIT-01 canonical sample package.
No Registry writes, no published products, no fake authorization claims.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

V2 = Path(os.environ.get('BLACKWHI_V2_ROOT', str(
    Path.home()/'Documentos/ingenieria/proyectos/blackwhi/blackwhi-v2')))
HERE = Path(__file__).resolve().parents[1]
IMPORTER = HERE/'scripts/import_fit_product_profile_v1.py'
FIT01_FIXTURE = V2/'tools/fit/tests/test_fit_product_profile_v1.py'

@unittest.skipUnless(FIT01_FIXTURE.is_file(), 'FIT-01 fixture not available; set BLACKWHI_V2_ROOT')
class ProfileImportTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('blackwhi_fit01_fixture_for_import', FIT01_FIXTURE)
        self.assertIsNotNone(spec)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.fixture = module.ProfileTests(methodName='test_real_canonical_artifact_and_18_section_profile')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.data = tempfile.TemporaryDirectory(prefix='blackwhi-store02-import-')
        self.addCleanup(self.data.cleanup)
        self.store = Path(self.data.name)/'store-profiles'

    def call(self, operation):
        return subprocess.run([sys.executable, '-B', str(IMPORTER), '--' + operation,
            '--v2-root', str(V2), '--workspace', str(self.fixture.root),
            '--profile', self.fixture.profile_file, '--package', self.fixture.package,
            '--store-data', str(self.store)], capture_output=True, text=True)

    def test_real_archive_import_verify_idempotence_rollback(self):
        self.assertEqual(self.call('diagnose').returncode, 0)
        self.assertFalse(self.store.exists())
        applied = self.call('apply')
        self.assertEqual(applied.returncode, 0, applied.stderr)
        profile = self.fixture.profile
        target = self.store/profile['release']['packageId']/profile['release']['version']
        self.assertTrue((target/'profile.json').is_file())
        self.assertTrue((target/'docs/README.md').is_file())
        self.assertEqual(self.call('verify').returncode, 0)
        self.assertEqual(self.call('apply').returncode, 0)
        self.assertEqual(self.call('rollback').returncode, 0)
        self.assertFalse(target.exists())

    def test_reject_tampered_document_without_touching_store(self):
        (self.fixture.root/'docs/README.md').write_text('a tampered document', encoding='utf-8')
        proc = self.call('apply')
        self.assertNotEqual(proc.returncode, 0)
        self.assertFalse(self.store.exists())

    def test_refuse_rollback_if_operator_modified_store(self):
        self.assertEqual(self.call('apply').returncode, 0)
        target = self.store/self.fixture.profile['release']['packageId']/self.fixture.profile['release']['version']
        (target/'docs/README.md').write_text('operator modified this file', encoding='utf-8')
        result = self.call('rollback')
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(target.exists())

if __name__ == '__main__': unittest.main()
