# SPDX-License-Identifier: EPL-2.0
"""Offline invariant checks for the local-only BlackWhi staging environment."""
import ast
import re
import unittest
from pathlib import Path

STAGING = Path(__file__).resolve().parents[1]


class StagingSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.compose = (STAGING / 'compose.yml').read_text()
        cls.application = (STAGING / 'application.yml').read_text()
        cls.cli = (STAGING / 'stage.py').read_text()

    def test_isolated_compose_uses_fork_revision_for_both_images(self):
        self.assertEqual(self.compose.count('image: blackwhi-store/server:git-${BLACKWHI_STORE_IMAGE_REVISION:'), 2)
        self.assertIn('image: blackwhi-store/webui:git-${BLACKWHI_STORE_IMAGE_REVISION:', self.compose)
        self.assertNotIn('eclipse-openvsx/openvsx-server', self.compose)
        self.assertNotIn('git clone', self.compose)

    def test_localhost_ui_only_and_no_published_database_or_backend(self):
        self.assertRegex(self.compose, r'127\.0\.0\.1:\$\{BLACKWHI_STORE_PUBLIC_PORT')
        self.assertNotRegex(self.compose, r'^\s+- ["\']?5432:5432', re.MULTILINE)
        self.assertNotIn('8080:8080', self.compose)
        self.assertIn('internal: true', self.compose)

    def test_database_and_package_data_persist_without_volumes_down(self):
        self.assertIn('postgres_data:/var/lib/postgresql/data', self.compose)
        self.assertIn('package_storage:/home/openvsx/storage', self.compose)
        self.assertIn('service_completed_successfully', self.compose)
        self.assertIn("docker_compose('down', '--remove-orphans')", self.cli)
        self.assertNotIn("docker_compose('down', '--volumes')", self.cli)
        self.assertNotIn("'down', '-v'", self.cli)

    def test_external_config_disables_unconfigured_search_dependencies(self):
        self.assertIn('jdbc:postgresql://db:5432/blackwhi_store', self.application)
        self.assertIn('password: ${BLACKWHI_STORE_DB_PASSWORD}', self.application)
        self.assertIn('databasesearch:\n    enabled: true', self.application)
        self.assertIn('elasticsearch:\n    enabled: false', self.application)
        self.assertIn('redis:\n    enabled: false', self.application)
        self.assertIn('directory: /home/openvsx/storage', self.application)

    def test_launcher_pins_local_provenance_and_private_env(self):
        ast.parse(self.cli)
        self.assertIn('os.O_EXCL, 0o600', self.cli)
        self.assertIn('org.opencontainers.image.revision', self.cli)
        self.assertIn('org.opencontainers.image.source', self.cli)
        self.assertIn('image_id', self.cli)
        self.assertIn("'merge-base', '--is-ancestor'", self.cli)
        self.assertIn("docker_compose('config', '--quiet'", self.cli)
        self.assertIn("'/api/-/search?query=blackwhi&size=1'", self.cli)


if __name__ == '__main__':
    unittest.main()
